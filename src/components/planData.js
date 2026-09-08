/* ─────────────────────────────────────────────────────────
   MONTHLY PLAN + DAILY TASK MODULE — DATA LAYER
   Self-contained, localStorage-backed data model that powers
   the Plan section. Mirrors the relationship:
     Manager Assigned Doctors → Monthly Plan → Scheduled Visits
     → Daily Tasks → Doctor Visit → Visit Report → Progress
   No backend dependency: works fully offline with realistic
   seeded sample data so the workflow can be tried immediately.
───────────────────────────────────────────────────────── */
import { useCallback, useEffect, useState } from "react";

/* ---------- constants ---------- */
export const PLAN_YEAR = 2026;
export const PLAN_MONTH_INDEX = 8; // September (0-based)
export const PLAN_MONTH_KEY = "2026-09";
export const PLAN_MONTH_LABEL = "September 2026";
export const MANAGER_NAME = "Suresh Kumar";

export const TASK_STATUSES = [
  "Planned",
  "Scheduled",
  "In Progress",
  "Completed",
  "Rescheduled",
  "Cancelled",
  "Missed",
];

export const PLAN_STATUSES = [
  "Draft",
  "Submitted",
  "Under Review",
  "Approved",
  "Rejected",
  "In Progress",
  "Completed",
];

export const RESCHEDULE_REASONS = [
  "Doctor unavailable",
  "Emergency",
  "Travel issue",
  "Clinic closed",
  "Other",
];

const VISIT_TIMES = ["9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM"];

/* ---------- tiny seeded RNG so demo data is stable ---------- */
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
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  }
  return out;
}
function pad(n) { return String(n).padStart(2, "0"); }
function dateStr(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function addDaysStr(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return dateStr(dt.getFullYear(), dt.getMonth(), dt.getDate());
}
function dayName(iso) {
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

/* Real "today" clamped into the demo month so Daily Tasks always
   has something meaningful to show right now. */
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
    if (dt.getDay() !== 0) days.push(dateStr(year, monthIndex, d)); // exclude Sundays
  }
  return days;
}

/* ---------- doctor generation ---------- */
const FIRST_NAMES = [
  "Arun", "Priya", "Ravi", "Sunita", "Vikram", "Meera", "Karthik", "Anjali", "Suresh", "Divya",
  "Rajesh", "Kavya", "Manoj", "Sneha", "Prakash", "Lakshmi", "Ganesh", "Pooja", "Ashok", "Nithya",
  "Senthil", "Radha", "Mahesh", "Swathi", "Balaji", "Deepa", "Kiran", "Shalini", "Vijay", "Anitha",
  "Ramesh", "Geetha", "Sathish", "Priyanka", "Naveen", "Kavitha", "Dinesh", "Uma", "Karthikeyan", "Revathi",
  "Selvam", "Malathi", "Gopal", "Sowmya", "Harish", "Padma", "Elango", "Vidya", "Murali", "Jyothi",
  "Aravind", "Chitra",
];
const LAST_NAMES = [
  "Kumar", "Sharma", "Reddy", "Iyer", "Nair", "Menon", "Rao", "Pillai", "Krishnan", "Subramaniam",
  "Raman", "Gupta", "Verma", "Das", "Chandran", "Balan", "Mohan", "Prasad", "Nathan", "Varma",
];
const SPECIALIZATIONS = [
  "Cardiologist", "Gynecologist", "General Physician", "Orthopedic Surgeon", "Pediatrician",
  "Dermatologist", "ENT Specialist", "Neurologist", "Endocrinologist", "Pulmonologist",
  "Gastroenterologist", "Nephrologist", "Oncologist", "Psychiatrist", "Urologist",
  "Ophthalmologist", "Diabetologist", "Rheumatologist",
];
const HOSPITALS = [
  "Apollo Clinic", "City Hospital", "ABC Clinic", "Fortis Hospital", "Global Health Centre",
  "MedPlus Clinic", "Sunshine Hospital", "Care Multispeciality", "Lifeline Hospital", "Kauvery Hospital",
  "SRM Hospital", "Vijaya Hospital", "MIOT Hospital", "Sri Ramachandra Hospital", "Billroth Hospital",
  "Meenakshi Mission Hospital", "Rela Hospital", "Gleneagles Global", "Prashanth Hospital", "Frontier Lifeline",
];
const CHENNAI_LOCALITIES = [
  "Anna Nagar", "T Nagar", "Adyar", "Velachery", "Mylapore", "Nungambakkam",
  "Egmore", "Porur", "Tambaram", "OMR", "Guindy", "Kilpauk",
];
const OTHER_CITIES = ["Coimbatore", "Madurai", "Trichy", "Salem", "Vellore"];
const PRIORITIES = ["High", "High", "Medium", "Medium", "Medium", "Low"]; // weighted

function generateDoctors(count = 50) {
  const usedNames = new Set();
  const doctors = [];
  for (let i = 1; i <= count; i++) {
    let name;
    do {
      name = `Dr. ${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    } while (usedNames.has(name));
    usedNames.add(name);

    const isChennai = rng() < 0.7;
    const city = isChennai ? "Chennai" : pick(OTHER_CITIES);
    const location = isChennai ? pick(CHENNAI_LOCALITIES) : city;
    const phone = `+91 9${Math.floor(100000000 + rng() * 899999999)}`;

    doctors.push({
      id: `doc-${pad(i)}`,
      doctorCode: `DOC${pad(i)}${pad(i)}`.slice(0, 6),
      name,
      specialization: pick(SPECIALIZATIONS),
      hospital: pick(HOSPITALS),
      city,
      location,
      phone,
      priority: pick(PRIORITIES),
      manager: MANAGER_NAME,
      assignedDate: dateStr(PLAN_YEAR, PLAN_MONTH_INDEX, 1),
    });
  }
  return doctors;
}

/* ---------- auto scheduling ---------- */
function buildAutoSchedule(doctorIds, workingDays) {
  const n = doctorIds.length;
  const d = workingDays.length;
  const base = Math.floor(n / d);
  const rem = n % d;
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

/* ---------- visit report generator (for pre-seeded completed visits) ---------- */
const PURPOSES = ["Product Detailing", "Follow-up Visit", "New Product Launch", "Relationship Building", "Sample Distribution"];
const PRODUCTS = ["Nebicard 5mg", "Losar-H", "Metfor 500", "Pantocid DSR", "Rosuvas 10mg", "Glycomet GP", "Azithral 500", "Shelcal 500", "Ecosprin 75", "Telma 40"];
const FEEDBACKS = [
  "Positive response, willing to prescribe going forward.",
  "Requested more clinical data before prescribing.",
  "Satisfied with product efficacy in recent cases.",
  "Asked for sample kits to trial with patients.",
  "Neutral response, will consider for future patients.",
];
const NEXT_ACTIONS = ["Schedule follow-up in 30 days", "Send additional literature", "Arrange CME session", "Provide sample kit", "No further action needed"];

function generateVisitReport(doctor, date, time) {
  const products = pickN(PRODUCTS, 2);
  return {
    doctorId: doctor.id,
    visitDate: date,
    visitTime: time,
    location: `${doctor.hospital}, ${doctor.location}`,
    purpose: pick(PURPOSES),
    productsDiscussed: products.join(", "),
    notes: `Discussed ${products[0]} with ${doctor.name}. Doctor showed interest in patient outcome data and asked follow-up questions about dosage.`,
    doctorFeedback: pick(FEEDBACKS),
    nextFollowupDate: addDaysStr(date, 30),
    nextAction: pick(NEXT_ACTIONS),
    remarks: "",
    status: "Submitted",
    submittedAt: date,
  };
}

/* ---------- fresh plan doctors from an assigned list ---------- */
function makePlanDoctorsFromSchedule(schedule) {
  return schedule.map((s, i) => ({
    id: `pd-${s.doctorId}`,
    doctorId: s.doctorId,
    scheduledDate: s.scheduledDate,
    visitTime: VISIT_TIMES[i % VISIT_TIMES.length],
    status: "Planned",
    rescheduleReason: null,
    rescheduledFrom: null,
  }));
}

/* ---------- rich default seed (approved plan, mid-month snapshot) ---------- */
function buildSeededDemoPlan(doctors) {
  const workingDays = getWorkingDays();
  const schedule = buildAutoSchedule(doctors.map((d) => d.id), workingDays);
  const planDoctors = makePlanDoctorsFromSchedule(schedule);
  const visitReports = {};

  const COMPLETED_COUNT = 32;
  planDoctors.forEach((pd, idx) => {
    if (idx < COMPLETED_COUNT) {
      pd.status = "Completed";
      const doctor = doctors.find((d) => d.id === pd.doctorId);
      visitReports[pd.doctorId] = generateVisitReport(doctor, pd.scheduledDate, pd.visitTime);
    }
  });

  // Curate the remaining 18 pending items so every filter bucket has
  // something real to show right now.
  const pendingIdx = planDoctors.map((_, i) => i).filter((i) => i >= COMPLETED_COUNT);
  const today = getPlanToday();
  const tomorrow = addDaysStr(today, 1);
  const overdueDate = addDaysStr(today, -3);
  const rescheduledFromDate = addDaysStr(today, -4);

  if (pendingIdx[0] != null) { planDoctors[pendingIdx[0]].scheduledDate = today; planDoctors[pendingIdx[0]].status = "Planned"; }
  if (pendingIdx[1] != null) { planDoctors[pendingIdx[1]].scheduledDate = today; planDoctors[pendingIdx[1]].status = "Planned"; }
  if (pendingIdx[2] != null) { planDoctors[pendingIdx[2]].scheduledDate = today; planDoctors[pendingIdx[2]].status = "Scheduled"; }
  if (pendingIdx[3] != null) { planDoctors[pendingIdx[3]].scheduledDate = tomorrow; planDoctors[pendingIdx[3]].status = "Scheduled"; }
  if (pendingIdx[4] != null) { planDoctors[pendingIdx[4]].scheduledDate = tomorrow; planDoctors[pendingIdx[4]].status = "Planned"; }
  if (pendingIdx[5] != null) { planDoctors[pendingIdx[5]].scheduledDate = overdueDate; planDoctors[pendingIdx[5]].status = "Missed"; }
  if (pendingIdx[6] != null) {
    planDoctors[pendingIdx[6]].scheduledDate = today;
    planDoctors[pendingIdx[6]].status = "Rescheduled";
    planDoctors[pendingIdx[6]].rescheduledFrom = rescheduledFromDate;
    planDoctors[pendingIdx[6]].rescheduleReason = "Doctor unavailable";
  }
  // the rest keep their natural (mostly future) working-day dates as "Planned"

  const monthlyPlan = {
    monthKey: PLAN_MONTH_KEY,
    monthLabel: PLAN_MONTH_LABEL,
    workingDays: workingDays.length,
    dailyTarget: Math.ceil(doctors.length / workingDays.length),
    planningMethod: "auto",
    status: "Approved",
    createdAt: dateStr(PLAN_YEAR, PLAN_MONTH_INDEX, 1),
    submittedAt: dateStr(PLAN_YEAR, PLAN_MONTH_INDEX, 1),
    approvedAt: dateStr(PLAN_YEAR, PLAN_MONTH_INDEX, 2),
    approvedBy: MANAGER_NAME,
    rejectionReason: null,
  };

  return { monthlyPlan, planDoctors, visitReports };
}

/* ---------- storage ---------- */
const STORAGE_PREFIX = "zzc_plan_v1_";

function loadFromStorage(key) {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function saveToStorage(key, value) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

function freshEmptyState(doctors) {
  return {
    assignedDoctors: doctors,
    monthlyPlan: null,
    planDoctors: [],
    visitReports: {},
  };
}

function freshSeededState() {
  const doctors = generateDoctors(50);
  const { monthlyPlan, planDoctors, visitReports } = buildSeededDemoPlan(doctors);
  return { assignedDoctors: doctors, monthlyPlan, planDoctors, visitReports };
}

/* ---------- public hook ---------- */
export function usePlanStore(storageKey, seeded = true) {
  const [store, setStore] = useState(() => {
    const existing = loadFromStorage(storageKey);
    if (existing) return existing;
    const initial = seeded ? freshSeededState() : freshEmptyState(generateDoctors(50));
    saveToStorage(storageKey, initial);
    return initial;
  });

  useEffect(() => { saveToStorage(storageKey, store); }, [storageKey, store]);

  const resetToEmpty = useCallback(() => {
    setStore((prev) => freshEmptyState(prev.assignedDoctors.length ? prev.assignedDoctors : generateDoctors(50)));
  }, []);

  const resetToDemo = useCallback(() => {
    setStore(freshSeededState());
  }, []);

  const createPlan = useCallback((method) => {
    setStore((prev) => {
      const workingDays = getWorkingDays();
      let planDoctors = prev.planDoctors;
      if (method === "auto") {
        const unplannedIds = prev.assignedDoctors
          .filter((d) => !prev.planDoctors.some((pd) => pd.doctorId === d.id))
          .map((d) => d.id);
        const schedule = buildAutoSchedule(unplannedIds, workingDays);
        planDoctors = [...prev.planDoctors, ...makePlanDoctorsFromSchedule(schedule)];
      }
      const monthlyPlan = {
        monthKey: PLAN_MONTH_KEY,
        monthLabel: PLAN_MONTH_LABEL,
        workingDays: workingDays.length,
        dailyTarget: Math.ceil(prev.assignedDoctors.length / workingDays.length),
        planningMethod: method,
        status: "Draft",
        createdAt: getPlanToday(),
        submittedAt: null,
        approvedAt: null,
        approvedBy: null,
        rejectionReason: null,
      };
      return { ...prev, monthlyPlan, planDoctors };
    });
  }, []);

  const scheduleDoctor = useCallback((doctorId, date, time) => {
    setStore((prev) => {
      if (prev.planDoctors.some((pd) => pd.doctorId === doctorId)) return prev;
      const pd = { id: `pd-${doctorId}`, doctorId, scheduledDate: date, visitTime: time || "10:00 AM", status: "Planned", rescheduleReason: null, rescheduledFrom: null };
      return { ...prev, planDoctors: [...prev.planDoctors, pd] };
    });
  }, []);

  const updateTaskStatus = useCallback((doctorId, status) => {
    setStore((prev) => ({
      ...prev,
      planDoctors: prev.planDoctors.map((pd) => (pd.doctorId === doctorId ? { ...pd, status } : pd)),
    }));
  }, []);

  const rescheduleDoctor = useCallback((doctorId, newDate, reason) => {
    setStore((prev) => ({
      ...prev,
      planDoctors: prev.planDoctors.map((pd) =>
        pd.doctorId === doctorId
          ? { ...pd, rescheduledFrom: pd.scheduledDate, scheduledDate: newDate, status: "Rescheduled", rescheduleReason: reason }
          : pd
      ),
    }));
  }, []);

  const updateScheduledDate = useCallback((doctorId, newDate) => {
    setStore((prev) => ({
      ...prev,
      planDoctors: prev.planDoctors.map((pd) =>
        pd.doctorId === doctorId && pd.status !== "Completed" ? { ...pd, scheduledDate: newDate } : pd
      ),
    }));
  }, []);

  const cancelTask = useCallback((doctorId) => {
    setStore((prev) => ({
      ...prev,
      planDoctors: prev.planDoctors.map((pd) => (pd.doctorId === doctorId ? { ...pd, status: "Cancelled" } : pd)),
    }));
  }, []);

  const submitVisitReport = useCallback((doctorId, report, asDraft) => {
    setStore((prev) => ({
      ...prev,
      visitReports: { ...prev.visitReports, [doctorId]: { ...report, status: asDraft ? "Draft" : "Submitted" } },
      planDoctors: asDraft
        ? prev.planDoctors
        : prev.planDoctors.map((pd) => (pd.doctorId === doctorId ? { ...pd, status: "Completed" } : pd)),
    }));
  }, []);

  const submitMonthlyPlan = useCallback(() => {
    setStore((prev) => (prev.monthlyPlan ? { ...prev, monthlyPlan: { ...prev.monthlyPlan, status: "Submitted", submittedAt: getPlanToday() } } : prev));
  }, []);

  const approvePlan = useCallback(() => {
    setStore((prev) => (prev.monthlyPlan ? { ...prev, monthlyPlan: { ...prev.monthlyPlan, status: "Approved", approvedAt: getPlanToday(), approvedBy: MANAGER_NAME, rejectionReason: null } } : prev));
  }, []);

  const rejectPlan = useCallback((reason) => {
    setStore((prev) => (prev.monthlyPlan ? { ...prev, monthlyPlan: { ...prev.monthlyPlan, status: "Rejected", rejectionReason: reason } } : prev));
  }, []);

  const requestChanges = useCallback((reason) => {
    setStore((prev) => (prev.monthlyPlan ? { ...prev, monthlyPlan: { ...prev.monthlyPlan, status: "Draft", rejectionReason: reason } } : prev));
  }, []);

  return {
    ...store,
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

/* ---------- derived stats ---------- */
export function computeStats(assignedDoctors, planDoctors) {
  const totalAssigned = assignedDoctors.length;
  const planned = planDoctors.length;
  const completed = planDoctors.filter((p) => p.status === "Completed").length;
  const cancelled = planDoctors.filter((p) => p.status === "Cancelled").length;
  const missed = planDoctors.filter((p) => p.status === "Missed").length;
  const pending = Math.max(0, planned - completed - cancelled);
  const completionPct = totalAssigned > 0 ? Math.round((completed / totalAssigned) * 100) : 0;
  const unplanned = totalAssigned - planned;

  const workingDays = getWorkingDays();
  const today = getPlanToday();
  const daysPassed = workingDays.filter((d) => d <= today).length;
  const expectedPct = workingDays.length > 0 ? Math.round((daysPassed / workingDays.length) * 100) : 0;

  let planHealth = "On Track";
  if (completionPct < expectedPct - 20) planHealth = "Behind Plan";
  else if (completionPct < expectedPct - 5) planHealth = "Needs Attention";

  return { totalAssigned, planned, completed, pending, missed, cancelled, unplanned, completionPct, expectedPct, planHealth };
}

export function getDoctorMap(assignedDoctors) {
  const map = new Map();
  assignedDoctors.forEach((d) => map.set(d.id, d));
  return map;
}

export function validatePlanForSubmission(assignedDoctors, planDoctors) {
  const errors = [];
  const scheduledIds = new Set(planDoctors.map((p) => p.doctorId));
  const unplanned = assignedDoctors.filter((d) => !scheduledIds.has(d.id));
  if (unplanned.length > 0) {
    errors.push(`${unplanned.length} doctor${unplanned.length > 1 ? "s are" : " is"} still unplanned. Please schedule all assigned doctors before submitting the monthly plan.`);
  }
  const seen = new Set();
  let duplicates = 0;
  planDoctors.forEach((p) => {
    if (seen.has(p.doctorId)) duplicates++;
    seen.add(p.doctorId);
  });
  if (duplicates > 0) errors.push(`${duplicates} duplicate doctor visit${duplicates > 1 ? "s" : ""} found in the plan.`);
  const outOfMonth = planDoctors.filter((p) => !p.scheduledDate?.startsWith(PLAN_MONTH_KEY));
  if (outOfMonth.length > 0) errors.push(`${outOfMonth.length} visit${outOfMonth.length > 1 ? "s are" : " is"} scheduled outside ${PLAN_MONTH_LABEL}.`);
  return errors;
}

export { dayName, addDaysStr };
export const VISIT_TIME_OPTIONS = VISIT_TIMES;
