/* ─────────────────────────────────────────────────────────
   MONTHLY PLAN + DAILY TASK MODULE — DATA LAYER (v2)

   Architecture:
   - usePlanStore(execId, monthKey)  →  the main hook consumed by planView.jsx
   - Writes go to the FastAPI backend immediately
   - localStorage acts as an optimistic cache so the UI never flickers
   - Falls back to seeded demo data if the API is unreachable
   - Helper functions (date, stats, validation) are all exported and
     unchanged from the original so PlanBits/PlanModals stay compatible
───────────────────────────────────────────────────────── */
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "../api.js";

/* ────────────────────────────── constants ───────────────────────────── */
export const PLAN_YEAR        = 2026;
export const PLAN_MONTH_INDEX = 8;           // September (0-based)
export const PLAN_MONTH_KEY   = "2026-09";
export const PLAN_MONTH_LABEL = "September 2026";
export const MANAGER_NAME     = "Suresh Kumar";

export const TASK_STATUSES = [
  "Planned","Scheduled","In Progress","Completed","Rescheduled","Cancelled","Missed",
];
export const PLAN_STATUSES = [
  "Draft","Submitted","Under Review","Approved","Rejected","In Progress","Completed",
];
export const RESCHEDULE_REASONS = [
  "Doctor unavailable","Emergency","Travel issue","Clinic closed","Other",
];

const VISIT_TIMES = [
  "9:00 AM","10:00 AM","11:00 AM","12:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM",
];
export const VISIT_TIME_OPTIONS = VISIT_TIMES;

/* ────────────────────────────── date helpers ────────────────────────── */
function pad(n) { return String(n).padStart(2, "0"); }
function dateStr(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

export function addDaysStr(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return dateStr(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

export function dayName(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "long" });
}

export function formatDateLong(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateShort(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function getPlanToday() {
  const real = new Date();
  const y = real.getFullYear(), m = real.getMonth(), d = real.getDate();
  if (y === PLAN_YEAR && m === PLAN_MONTH_INDEX) return dateStr(y, m, d);
  return "2026-09-08";
}

export function getWorkingDays(year = PLAN_YEAR, monthIndex = PLAN_MONTH_INDEX) {
  const days = [];
  const last = new Date(year, monthIndex + 1, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const dt = new Date(year, monthIndex, d);
    if (dt.getDay() !== 0) days.push(dateStr(year, monthIndex, d));
  }
  return days;
}

/* ────────────────────────────── derived stats ───────────────────────── */
export function computeStats(assignedDoctors, planDoctors) {
  const totalAssigned  = assignedDoctors.length;
  const planned        = planDoctors.length;
  const completed      = planDoctors.filter((p) => p.status === "Completed").length;
  const cancelled      = planDoctors.filter((p) => p.status === "Cancelled").length;
  const missed         = planDoctors.filter((p) => p.status === "Missed").length;
  const pending        = Math.max(0, planned - completed - cancelled);
  const completionPct  = totalAssigned > 0 ? Math.round((completed / totalAssigned) * 100) : 0;
  const unplanned      = totalAssigned - planned;

  const workingDays    = getWorkingDays();
  const today          = getPlanToday();
  const daysPassed     = workingDays.filter((d) => d <= today).length;
  const expectedPct    = workingDays.length > 0 ? Math.round((daysPassed / workingDays.length) * 100) : 0;

  let planHealth = "On Track";
  if (completionPct < expectedPct - 20) planHealth = "Behind Plan";
  else if (completionPct < expectedPct - 5)  planHealth = "Needs Attention";

  return {
    totalAssigned, planned, completed, pending,
    missed, cancelled, unplanned,
    completionPct, expectedPct, planHealth,
  };
}

export function getDoctorMap(assignedDoctors) {
  const map = new Map();
  assignedDoctors.forEach((d) => map.set(d.id, d));
  return map;
}

export function validatePlanForSubmission(assignedDoctors, planDoctors) {
  const errors = [];
  const scheduledIds = new Set(planDoctors.map((p) => p.doctorId ?? p.doctor_id));
  const unplanned = assignedDoctors.filter((d) => !scheduledIds.has(d.id));
  if (unplanned.length > 0)
    errors.push(`${unplanned.length} doctor${unplanned.length > 1 ? "s are" : " is"} still unplanned. Please schedule all assigned doctors before submitting.`);
  const seen = new Set();
  let dups = 0;
  planDoctors.forEach((p) => {
    const id = p.doctorId ?? p.doctor_id;
    if (seen.has(id)) dups++;
    seen.add(id);
  });
  if (dups > 0) errors.push(`${dups} duplicate doctor visit${dups > 1 ? "s" : ""} found in the plan.`);
  const outOfMonth = planDoctors.filter((p) => !(p.scheduledDate ?? p.scheduled_date)?.startsWith(PLAN_MONTH_KEY));
  if (outOfMonth.length > 0)
    errors.push(`${outOfMonth.length} visit${outOfMonth.length > 1 ? "s are" : " is"} scheduled outside ${PLAN_MONTH_LABEL}.`);
  return errors;
}

/* ────────────────────────────── API helpers ─────────────────────────── */
async function apiFetch(path, opts = {}) {
  const url = API_BASE + path;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error ${res.status}`);
  }
  return res.json();
}

/* ────────────────────────────── localStorage cache ─────────────────── */
const CACHE_PREFIX = "zzc_plan_v2_";

function cacheLoad(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function cacheSave(key, data) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data)); } catch { /**/ }
}

/* ────────────────────────────── demo seed helpers ───────────────────── */
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260901);
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
function pickN(arr, n) {
  const copy = [...arr]; const out = [];
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  return out;
}

const PURPOSES   = ["Product Detailing","Follow-up Visit","New Product Launch","Relationship Building","Sample Distribution"];
const PRODUCTS   = ["Nebicard 5mg","Losar-H","Metfor 500","Pantocid DSR","Rosuvas 10mg","Glycomet GP","Azithral 500","Shelcal 500","Ecosprin 75","Telma 40"];
const FEEDBACKS  = [
  "Positive response, willing to prescribe going forward.",
  "Requested more clinical data before prescribing.",
  "Satisfied with product efficacy in recent cases.",
  "Asked for sample kits to trial with patients.",
  "Neutral response, will consider for future patients.",
];
const NEXT_ACTS  = ["Schedule follow-up in 30 days","Send additional literature","Arrange CME session","Provide sample kit","No further action needed"];

function genReport(doctorId, planVisitId, execId, date, time) {
  const products = pickN(PRODUCTS, 2);
  return {
    plan_visit_id: planVisitId,
    executive_id: execId,
    doctor_id: doctorId,
    visit_date: date,
    visit_time: time,
    location: "—",
    purpose: pick(PURPOSES),
    products_discussed: products.join(", "),
    notes: `Discussed ${products[0]}. Doctor showed interest in patient outcome data.`,
    doctor_feedback: pick(FEEDBACKS),
    next_followup_date: addDaysStr(date, 30),
    next_action: pick(NEXT_ACTS),
    remarks: "",
    follow_up_required: true,
    status: "Submitted",
  };
}

/* ─── normalise a raw API visit row into the camelCase shape planView expects ─── */
function normVisit(v) {
  return {
    id:              v.id,
    planId:          v.plan_id,
    doctorId:        v.doctor_id,
    executiveId:     v.executive_id,
    scheduledDate:   v.scheduled_date,
    visitTime:       v.visit_time   ?? "10:00 AM",
    status:          v.status       ?? "Planned",
    rescheduleReason: v.reschedule_reason ?? null,
    rescheduledFrom: v.rescheduled_from  ?? null,
  };
}

/* ─── normalise a raw API report row ─── */
function normReport(r) {
  return {
    id:               r.id,
    planVisitId:      r.plan_visit_id,
    executiveId:      r.executive_id,
    doctorId:         r.doctor_id,
    visitDate:        r.visit_date,
    visitTime:        r.visit_time,
    location:         r.location,
    purpose:          r.purpose,
    productsDiscussed: r.products_discussed,
    notes:            r.notes,
    doctorFeedback:   r.doctor_feedback,
    nextFollowupDate: r.next_followup_date,
    nextAction:       r.next_action,
    remarks:          r.remarks,
    followUpRequired: r.follow_up_required,
    status:           r.status,
    submittedAt:      r.submitted_at,
  };
}

/* ─── normalise a plan row ─── */
function normPlan(p) {
  return {
    id:             p.id,
    executiveId:    p.executive_id,
    monthKey:       p.month_key,
    monthLabel:     p.month_label,
    workingDays:    p.working_days,
    dailyTarget:    p.daily_target,
    totalDoctors:   p.total_doctors,
    planningMethod: p.planning_method,
    status:         p.status,
    createdAt:      p.created_at,
    submittedAt:    p.submitted_at,
    approvedAt:     p.approved_at,
    approvedBy:     p.approved_by,
    rejectionReason: p.rejection_reason,
  };
}

/* ────────────────────────────────────────────────────────────────────────
   AUTO-SCHEDULE  (pure, no side effects)
──────────────────────────────────────────────────────────────────────── */
function buildAutoSchedule(doctorIds, workingDays) {
  const n = doctorIds.length;
  const d = workingDays.length;
  if (d === 0) return [];
  const base = Math.floor(n / d);
  const rem  = n % d;
  let idx = 0;
  const result = [];
  workingDays.forEach((date, i) => {
    const count = base + (i < rem ? 1 : 0);
    for (let k = 0; k < count && idx < n; k++) {
      result.push({ doctorId: doctorIds[idx], scheduledDate: date });
      idx++;
    }
  });
  return result;
}

/* ────────────────────────────────────────────────────────────────────────
   SHAPE passed to UI — all fields are camelCase
   planDoctors items carry .doctorId (not .doctor_id) for compatibility
   with existing planView.jsx / PlanBits / PlanModals code
──────────────────────────────────────────────────────────────────────── */
const EMPTY_STORE = {
  loading:         true,
  error:           null,
  monthlyPlan:     null,   // normalised plan object | null
  planDoctors:     [],     // normalised visit rows
  visitReports:    {},     // { [doctorId]: normReport }
  assignedDoctors: [],     // doctor objects injected from useSalesData
};

/* ════════════════════════════════════════════════════════════════════════
   usePlanStore(execId, monthKey, assignedDoctors)

   execId          — numeric sales_executive.id from the API
   monthKey        — "2026-09"
   assignedDoctors — array of doctor objects from useSalesData (already
                     filtered to this executive's pincodes)
════════════════════════════════════════════════════════════════════════ */
export function usePlanStore(execId, monthKey, assignedDoctors = []) {
  const cacheKey = `exec_${execId}_${monthKey}`;
  const [store, setStore] = useState(() => {
    const cached = cacheLoad(cacheKey);
    return cached ? { ...EMPTY_STORE, loading: false, ...cached, assignedDoctors } : { ...EMPTY_STORE, assignedDoctors };
  });

  // Always keep assignedDoctors in sync with live API data from parent
  const prevAssigned = useRef(assignedDoctors);
  useEffect(() => {
    if (prevAssigned.current !== assignedDoctors) {
      prevAssigned.current = assignedDoctors;
      setStore((s) => ({ ...s, assignedDoctors }));
    }
  }, [assignedDoctors]);

  // ── initial fetch from backend ──────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!execId) return;
    setStore((s) => ({ ...s, loading: true, error: null }));
    try {
      // 1. Monthly plan
      const plans = await apiFetch(`/monthly-plans?executive_id=${execId}&month_key=${monthKey}`);
      const rawPlan = plans.length ? plans[0] : null;
      const monthlyPlan = rawPlan ? normPlan(rawPlan) : null;
      const planId = rawPlan?.id ?? null;

      // 2. Plan visits (only if a plan exists)
      let planDoctors = [];
      let visitReports = {};
      if (planId) {
        const [visitsRaw, reportsRaw] = await Promise.all([
          apiFetch(`/plan-visits?plan_id=${planId}`),
          apiFetch(`/visit-reports?executive_id=${execId}`),
        ]);
        planDoctors  = visitsRaw.map(normVisit);
        // key visit reports by doctorId for fast lookup
        reportsRaw.forEach((r) => {
          visitReports[r.doctor_id] = normReport(r);
        });
      }

      const next = { loading: false, error: null, monthlyPlan, planDoctors, visitReports, assignedDoctors };
      setStore((s) => ({ ...s, ...next }));
      cacheSave(cacheKey, { monthlyPlan, planDoctors, visitReports });
    } catch (err) {
      // API offline — fall back to cache, surface error only if cache empty
      const cached = cacheLoad(cacheKey);
      if (cached) {
        setStore((s) => ({
          ...s,
          loading: false,
          error: null,        // silent — we have cached data
          ...cached,
          assignedDoctors,
        }));
      } else {
        setStore((s) => ({ ...s, loading: false, error: err.message }));
      }
    }
  }, [execId, monthKey, assignedDoctors, cacheKey]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── helpers ──────────────────────────────────────────────────────────
  function patchStore(patch) {
    setStore((s) => {
      const next = { ...s, ...patch };
      cacheSave(cacheKey, {
        monthlyPlan:  next.monthlyPlan,
        planDoctors:  next.planDoctors,
        visitReports: next.visitReports,
      });
      return next;
    });
  }

  function patchVisit(doctorId, changes) {
    setStore((s) => {
      const planDoctors = s.planDoctors.map((v) =>
        (v.doctorId === doctorId) ? { ...v, ...changes } : v
      );
      cacheSave(cacheKey, { monthlyPlan: s.monthlyPlan, planDoctors, visitReports: s.visitReports });
      return { ...s, planDoctors };
    });
  }

  // ── actions ──────────────────────────────────────────────────────────

  const resetToEmpty = useCallback(() => {
    patchStore({ monthlyPlan: null, planDoctors: [], visitReports: {} });
  }, []); // eslint-disable-line

  const resetToDemo = useCallback(() => {
    const workingDays = getWorkingDays();
    const doctors = store.assignedDoctors;
    const schedule = buildAutoSchedule(doctors.map((d) => d.id), workingDays);
    const today = getPlanToday();
    const COMPLETED_COUNT = Math.min(32, Math.floor(schedule.length * 0.6));

    const planDoctors = schedule.map((s, idx) => ({
      id:             `demo-${s.doctorId}`,
      planId:         -1,
      doctorId:       s.doctorId,
      executiveId:    execId,
      scheduledDate:  s.scheduledDate,
      visitTime:      VISIT_TIMES[idx % VISIT_TIMES.length],
      status:         idx < COMPLETED_COUNT ? "Completed" : "Planned",
      rescheduleReason: null,
      rescheduledFrom: null,
    }));

    // Sprinkle realistic statuses on the pending bucket
    const pendingIdx = planDoctors.map((_, i) => i).filter((i) => i >= COMPLETED_COUNT);
    const tomorrow = addDaysStr(today, 1);
    const overdueDate = addDaysStr(today, -3);
    if (pendingIdx[0] != null) { planDoctors[pendingIdx[0]].scheduledDate = today;       planDoctors[pendingIdx[0]].status = "Planned"; }
    if (pendingIdx[1] != null) { planDoctors[pendingIdx[1]].scheduledDate = today;       planDoctors[pendingIdx[1]].status = "Scheduled"; }
    if (pendingIdx[2] != null) { planDoctors[pendingIdx[2]].scheduledDate = tomorrow;    planDoctors[pendingIdx[2]].status = "Scheduled"; }
    if (pendingIdx[3] != null) { planDoctors[pendingIdx[3]].scheduledDate = overdueDate; planDoctors[pendingIdx[3]].status = "Missed"; }
    if (pendingIdx[4] != null) {
      planDoctors[pendingIdx[4]].scheduledDate = today;
      planDoctors[pendingIdx[4]].status = "Rescheduled";
      planDoctors[pendingIdx[4]].rescheduledFrom = addDaysStr(today, -4);
      planDoctors[pendingIdx[4]].rescheduleReason = "Doctor unavailable";
    }

    const visitReports = {};
    planDoctors.filter((v) => v.status === "Completed").forEach((v) => {
      visitReports[v.doctorId] = genReport(v.doctorId, v.id, execId, v.scheduledDate, v.visitTime);
    });

    const monthlyPlan = {
      id: -1,
      executiveId: execId,
      monthKey: PLAN_MONTH_KEY,
      monthLabel: PLAN_MONTH_LABEL,
      workingDays: workingDays.length,
      dailyTarget: Math.ceil(doctors.length / Math.max(1, workingDays.length)),
      totalDoctors: doctors.length,
      planningMethod: "auto",
      status: "Approved",
      createdAt: dateStr(PLAN_YEAR, PLAN_MONTH_INDEX, 1),
      submittedAt: dateStr(PLAN_YEAR, PLAN_MONTH_INDEX, 1),
      approvedAt: dateStr(PLAN_YEAR, PLAN_MONTH_INDEX, 2),
      approvedBy: MANAGER_NAME,
      rejectionReason: null,
    };

    patchStore({ monthlyPlan, planDoctors, visitReports });
  }, [store.assignedDoctors, execId]); // eslint-disable-line

  const createPlan = useCallback(async (method) => {
    const workingDays = getWorkingDays();
    const totalDoctors = store.assignedDoctors.length;
    const dailyTarget  = Math.ceil(totalDoctors / Math.max(1, workingDays.length));

    // 1. Create the plan record
    let newPlan;
    try {
      newPlan = normPlan(await apiFetch("/monthly-plans", {
        method: "POST",
        body: JSON.stringify({
          executive_id:    execId,
          month_key:       monthKey,
          month_label:     PLAN_MONTH_LABEL,
          working_days:    workingDays.length,
          daily_target:    dailyTarget,
          total_doctors:   totalDoctors,
          planning_method: method,
          status:          "Draft",
        }),
      }));
    } catch (err) {
      // Conflict (plan already exists) → re-fetch
      if (err.message.includes("409") || err.message.toLowerCase().includes("already exists")) {
        await fetchAll();
        return;
      }
      throw err;
    }

    // 2. Auto-generate visit rows
    let planDoctors = [];
    if (method === "auto") {
      const alreadyScheduled = new Set(store.planDoctors.map((v) => v.doctorId));
      const unplanned = store.assignedDoctors
        .filter((d) => !alreadyScheduled.has(d.id))
        .map((d) => d.id);
      const schedule = buildAutoSchedule(unplanned, workingDays);
      const payload = schedule.map((s, i) => ({
        plan_id:        newPlan.id,
        executive_id:   execId,
        doctor_id:      s.doctorId,
        scheduled_date: s.scheduledDate,
        visit_time:     VISIT_TIMES[i % VISIT_TIMES.length],
        status:         "Planned",
      }));
      try {
        const rows = await apiFetch("/plan-visits/bulk", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        planDoctors = rows.map(normVisit);
      } catch {
        // Bulk failed — fall back to optimistic local rows
        planDoctors = schedule.map((s, i) => ({
          id: `local-${s.doctorId}`,
          planId: newPlan.id,
          doctorId: s.doctorId,
          executiveId: execId,
          scheduledDate: s.scheduledDate,
          visitTime: VISIT_TIMES[i % VISIT_TIMES.length],
          status: "Planned",
          rescheduleReason: null,
          rescheduledFrom: null,
        }));
      }
    }

    patchStore({ monthlyPlan: newPlan, planDoctors: [...store.planDoctors, ...planDoctors] });
  }, [execId, monthKey, store.assignedDoctors, store.planDoctors, fetchAll]); // eslint-disable-line

  const scheduleDoctor = useCallback(async (doctorId, date, time) => {
    if (store.planDoctors.some((v) => v.doctorId === doctorId)) return;
    const planId = store.monthlyPlan?.id;

    // Optimistic update first
    const localRow = {
      id: `local-${doctorId}`,
      planId,
      doctorId,
      executiveId: execId,
      scheduledDate: date,
      visitTime: time || "10:00 AM",
      status: "Planned",
      rescheduleReason: null,
      rescheduledFrom: null,
    };
    patchStore({ planDoctors: [...store.planDoctors, localRow] });

    // Persist to API
    try {
      const saved = normVisit(await apiFetch("/plan-visits", {
        method: "POST",
        body: JSON.stringify({
          plan_id:        planId,
          executive_id:   execId,
          doctor_id:      doctorId,
          scheduled_date: date,
          visit_time:     time || "10:00 AM",
          status:         "Planned",
        }),
      }));
      // Replace optimistic row with the real one
      setStore((s) => {
        const planDoctors = s.planDoctors.map((v) => v.id === localRow.id ? saved : v);
        cacheSave(cacheKey, { monthlyPlan: s.monthlyPlan, planDoctors, visitReports: s.visitReports });
        return { ...s, planDoctors };
      });
    } catch { /* keep optimistic row */ }
  }, [store.planDoctors, store.monthlyPlan, execId, cacheKey]); // eslint-disable-line

  const updateTaskStatus = useCallback(async (doctorId, status) => {
    const visit = store.planDoctors.find((v) => v.doctorId === doctorId);
    if (!visit) return;
    patchVisit(doctorId, { status });           // optimistic
    if (typeof visit.id === "number") {
      apiFetch(`/plan-visits/${visit.id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      }).catch(() => {});
    }
  }, [store.planDoctors]); // eslint-disable-line

  const rescheduleDoctor = useCallback(async (doctorId, newDate, reason) => {
    const visit = store.planDoctors.find((v) => v.doctorId === doctorId);
    if (!visit) return;
    const changes = {
      rescheduledFrom: visit.scheduledDate,
      scheduledDate: newDate,
      status: "Rescheduled",
      rescheduleReason: reason,
    };
    patchVisit(doctorId, changes);             // optimistic
    if (typeof visit.id === "number") {
      apiFetch(`/plan-visits/${visit.id}`, {
        method: "PUT",
        body: JSON.stringify({
          rescheduled_from:  visit.scheduledDate,
          scheduled_date:    newDate,
          status:            "Rescheduled",
          reschedule_reason: reason,
        }),
      }).catch(() => {});
    }
  }, [store.planDoctors]); // eslint-disable-line

  const updateScheduledDate = useCallback(async (doctorId, newDate) => {
    const visit = store.planDoctors.find((v) => v.doctorId === doctorId);
    if (!visit || visit.status === "Completed") return;
    patchVisit(doctorId, { scheduledDate: newDate });
    if (typeof visit.id === "number") {
      apiFetch(`/plan-visits/${visit.id}`, {
        method: "PUT",
        body: JSON.stringify({ scheduled_date: newDate }),
      }).catch(() => {});
    }
  }, [store.planDoctors]); // eslint-disable-line

  const cancelTask = useCallback(async (doctorId) => {
    const visit = store.planDoctors.find((v) => v.doctorId === doctorId);
    if (!visit) return;
    patchVisit(doctorId, { status: "Cancelled" });
    if (typeof visit.id === "number") {
      apiFetch(`/plan-visits/${visit.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: "Cancelled" }),
      }).catch(() => {});
    }
  }, [store.planDoctors]); // eslint-disable-line

  const submitVisitReport = useCallback(async (doctorId, report, asDraft) => {
    const status    = asDraft ? "Draft" : "Submitted";
    const visit     = store.planDoctors.find((v) => v.doctorId === doctorId);
    const planVisitId = typeof visit?.id === "number" ? visit.id : null;
    const existing  = store.visitReports[doctorId];

    // Optimistic local update
    const normLocal = {
      ...(existing ?? {}),
      ...report,
      doctorId,
      executiveId: execId,
      planVisitId,
      status,
    };
    setStore((s) => {
      const visitReports = { ...s.visitReports, [doctorId]: normLocal };
      const planDoctors  = asDraft
        ? s.planDoctors
        : s.planDoctors.map((v) => v.doctorId === doctorId ? { ...v, status: "Completed" } : v);
      cacheSave(cacheKey, { monthlyPlan: s.monthlyPlan, planDoctors, visitReports });
      return { ...s, planDoctors, visitReports };
    });

    // Persist to API
    try {
      const payload = {
        plan_visit_id:       planVisitId,
        executive_id:        execId,
        doctor_id:           doctorId,
        visit_date:          report.visitDate,
        visit_time:          report.visitTime,
        location:            report.location,
        purpose:             report.purpose,
        products_discussed:  report.productsDiscussed,
        notes:               report.notes,
        doctor_feedback:     report.doctorFeedback,
        next_followup_date:  report.nextFollowupDate || null,
        next_action:         report.nextAction,
        remarks:             report.remarks,
        follow_up_required:  report.followUpRequired ?? true,
        status,
        submitted_at: status === "Submitted" ? new Date().toISOString() : null,
      };
      let saved;
      if (existing?.id && typeof existing.id === "number") {
        saved = normReport(await apiFetch(`/visit-reports/${existing.id}`, {
          method: "PUT", body: JSON.stringify(payload),
        }));
      } else {
        saved = normReport(await apiFetch("/visit-reports", {
          method: "POST", body: JSON.stringify(payload),
        }));
      }
      setStore((s) => {
        const visitReports = { ...s.visitReports, [doctorId]: saved };
        cacheSave(cacheKey, { monthlyPlan: s.monthlyPlan, planDoctors: s.planDoctors, visitReports });
        return { ...s, visitReports };
      });
    } catch { /* keep optimistic */ }
  }, [store.planDoctors, store.visitReports, execId, cacheKey]); // eslint-disable-line

  const submitMonthlyPlan = useCallback(async () => {
    if (!store.monthlyPlan) return;
    const optimistic = { ...store.monthlyPlan, status: "Submitted", submittedAt: new Date().toISOString() };
    patchStore({ monthlyPlan: optimistic });
    try {
      if (typeof store.monthlyPlan.id === "number") {
        const updated = normPlan(await apiFetch(`/monthly-plans/${store.monthlyPlan.id}/submit`, { method: "POST" }));
        patchStore({ monthlyPlan: updated });
      }
    } catch { /* keep optimistic */ }
  }, [store.monthlyPlan]); // eslint-disable-line

  const approvePlan = useCallback(async () => {
    if (!store.monthlyPlan) return;
    const optimistic = { ...store.monthlyPlan, status: "Approved", approvedAt: new Date().toISOString(), approvedBy: MANAGER_NAME };
    patchStore({ monthlyPlan: optimistic });
    try {
      if (typeof store.monthlyPlan.id === "number") {
        const updated = normPlan(await apiFetch(`/monthly-plans/${store.monthlyPlan.id}/approve?approved_by=${encodeURIComponent(MANAGER_NAME)}`, { method: "POST" }));
        patchStore({ monthlyPlan: updated });
      }
    } catch { /* keep optimistic */ }
  }, [store.monthlyPlan]); // eslint-disable-line

  const rejectPlan = useCallback(async (reason) => {
    if (!store.monthlyPlan) return;
    const optimistic = { ...store.monthlyPlan, status: "Rejected", rejectionReason: reason };
    patchStore({ monthlyPlan: optimistic });
    try {
      if (typeof store.monthlyPlan.id === "number") {
        const updated = normPlan(await apiFetch(`/monthly-plans/${store.monthlyPlan.id}/reject`, {
          method: "POST",
          body: JSON.stringify({ reason, request_changes: false }),
        }));
        patchStore({ monthlyPlan: updated });
      }
    } catch { /* keep optimistic */ }
  }, [store.monthlyPlan]); // eslint-disable-line

  const requestChanges = useCallback(async (reason) => {
    if (!store.monthlyPlan) return;
    const optimistic = { ...store.monthlyPlan, status: "Draft", rejectionReason: reason };
    patchStore({ monthlyPlan: optimistic });
    try {
      if (typeof store.monthlyPlan.id === "number") {
        const updated = normPlan(await apiFetch(`/monthly-plans/${store.monthlyPlan.id}/reject`, {
          method: "POST",
          body: JSON.stringify({ reason, request_changes: true }),
        }));
        patchStore({ monthlyPlan: updated });
      }
    } catch { /* keep optimistic */ }
  }, [store.monthlyPlan]); // eslint-disable-line

  return {
    /* state */
    loading:          store.loading,
    error:            store.error,
    monthlyPlan:      store.monthlyPlan,
    planDoctors:      store.planDoctors,
    visitReports:     store.visitReports,
    assignedDoctors:  store.assignedDoctors,
    /* actions */
    reload:           fetchAll,
    resetToEmpty,
    resetToDemo,
    createPlan,
    scheduleDoctor,
    updateTaskStatus,
    rescheduleDoctor,
    updateScheduledDate,
    cancelTask,
    submitVisitReport,
    submitMonthlyPlan,
    approvePlan,
    rejectPlan,
    requestChanges,
  };
}

/* ════════════════════════════════════════════════════════════════════════
   usePlanStats(execId, monthKey)
   Lightweight hook used by the Dashboard to show plan completion
   without mounting the full PlanView. Calls GET /plan-stats/{execId}.
════════════════════════════════════════════════════════════════════════ */
export function usePlanStats(execId, monthKey) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!execId) return;
    let cancelled = false;
    setLoading(true);
    apiFetch(`/plan-stats/${execId}?month_key=${monthKey || PLAN_MONTH_KEY}`)
      .then((data) => { if (!cancelled) { setStats(data); setLoading(false); } })
      .catch(() => {
        // Try reading from the plan cache as a fallback
        const cacheKey = `exec_${execId}_${monthKey || PLAN_MONTH_KEY}`;
        const cached = cacheLoad(cacheKey);
        if (!cancelled && cached?.planDoctors) {
          const total     = cached.planDoctors.length;
          const completed = cached.planDoctors.filter((v) => v.status === "Completed").length;
          const pending   = total - completed;
          const pct       = total > 0 ? Math.round((completed / total) * 100) : 0;
          setStats({
            has_plan:       !!cached.monthlyPlan,
            plan_status:    cached.monthlyPlan?.status ?? null,
            total_doctors:  cached.monthlyPlan?.totalDoctors ?? 0,
            working_days:   cached.monthlyPlan?.workingDays  ?? 0,
            daily_target:   cached.monthlyPlan?.dailyTarget  ?? 0,
            planned_visits: total,
            completed,
            pending,
            completion_pct: pct,
          });
        }
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [execId, monthKey]);

  return { stats, loading };
}
