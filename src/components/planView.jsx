import { useEffect, useMemo, useState } from "react";
import {
  usePlanStore,
  computeStats,
  getDoctorMap,
  validatePlanForSubmission,
  getWorkingDays,
  getPlanToday,
  formatDateLong,
  formatDateShort,
  addDaysStr,
  dayName,
  PLAN_MONTH_KEY,
  PLAN_MONTH_LABEL,
} from "./planData.js";
import {
  StatusBadge,
  PriorityBadge,
  PlanStatusBadge,
  HealthPill,
  ProgressBar,
  SummaryCards,
  DoctorMiniCard,
} from "./PlanBits.jsx";
import {
  CreatePlanModal,
  VisitReportModal,
  RescheduleModal,
  ScheduleDoctorModal,
  ApprovalReasonModal,
  DayDetailModal,
} from "./PlanModals.jsx";
import "./Plan.css";

/* ─────────────────────────────────────────────────────────
   Convert a real API doctor (from useSalesData) into the
   shape planView components expect.
───────────────────────────────────────────────────────── */
function adaptDoctor(doc, index) {
  if (!doc) return null;
  return {
    id:           doc.id,
    doctorCode:   `DOC${String(doc.id).padStart(4, "0")}`,
    name:         doc.name ?? "Dr. Unknown",
    specialization: doc.specializations?.split(",")[0]?.trim() ?? "General Physician",
    hospital:     "—",            // not in DB schema but we have qualification
    qualification: doc.qualification ?? "",
    city:         doc.city ?? "—",
    location:     doc.pincode ?? "—",
    phone:        doc.phone ?? "—",
    priority:     index < 10 ? "High" : index < 25 ? "Medium" : "Low",
    manager:      "Manager",
    assignedDate: `${PLAN_MONTH_KEY}-01`,
    pincode:      doc.pincode ?? "",
    rating:       doc.rating ?? null,
    verificationStatus: doc.verification_status ?? "",
    isActive:     doc.is_active === "Yes" || doc.is_active === true,
  };
}

/* ─────────────────────────────────────────────────────────
   TASK ACTIONS
───────────────────────────────────────────────────────── */
function TaskActions({ task, onStart, onComplete, onReschedule, onCancel }) {
  if (task.status === "Completed") {
    return <span className="doc-muted" style={{ fontSize: ".72rem" }}>Report submitted</span>;
  }
  if (task.status === "Cancelled") {
    return <span className="doc-muted" style={{ fontSize: ".72rem" }}>Cancelled</span>;
  }
  return (
    <div className="pln-action-row">
      {task.status !== "In Progress" ? (
        <button type="button" className="rpt-btn-sm rpt-btn-outline" onClick={onStart}>
          Start Visit
        </button>
      ) : (
        <button type="button" className="rpt-btn-sm rpt-btn-post" onClick={onComplete}>
          Complete Visit
        </button>
      )}
      <button type="button" className="rpt-btn-sm rpt-btn-outline" onClick={onReschedule}>
        Reschedule
      </button>
      <button type="button" className="rpt-btn-sm rpt-btn-edit" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   OVERVIEW TAB
───────────────────────────────────────────────────────── */
function OverviewTab({ store, stats, execName, onCreatePlan, onResetEmpty, onResetDemo, isExecutive }) {
  const { monthlyPlan, assignedDoctors } = store;

  if (!monthlyPlan) {
    return (
      <div className="panel pln-empty-panel">
        <div className="pln-empty-icon">🗓</div>
        <h3>No monthly plan for {PLAN_MONTH_LABEL}</h3>
        <p>
          <strong>{assignedDoctors.length} doctors</strong> are available in your territory for
          this month.
        </p>
        {isExecutive ? (
          <button
            type="button"
            className="zzc-btn zzc-btn-primary"
            onClick={onCreatePlan}
            style={{ marginTop: 12 }}
          >
            + Create Monthly Plan
          </button>
        ) : (
          <p className="pln-hint" style={{ marginTop: 12 }}>
            The assigned sales executive has not created a plan for this month yet.
          </p>
        )}
        <p className="pln-hint" style={{ marginTop: 14 }}>
          Executive: <strong>{execName}</strong>
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="pln-overview-head">
        <div>
          <h3 style={{ margin: 0 }}>
            {PLAN_MONTH_LABEL} — {execName}
          </h3>
          <p className="pln-hint" style={{ margin: "2px 0 0" }}>
            Working days: {monthlyPlan.workingDays} · Daily target:{" "}
            {monthlyPlan.dailyTarget} doctors/day
          </p>
        </div>
        <div className="pln-overview-head-right">
          <PlanStatusBadge status={monthlyPlan.status} />
          <HealthPill health={stats.planHealth} />
        </div>
      </div>

      <SummaryCards stats={stats} />

      <div className="two-columns">
        <div className="panel">
          <div className="panel-title">
            <h2>
              Monthly Target — {stats.totalAssigned} Doctors
            </h2>
          </div>
          <ProgressBar pct={stats.completionPct} />
          <p className="pln-hint" style={{ marginTop: 8 }}>
            <strong>{stats.completed}</strong> / {stats.totalAssigned} completed ·{" "}
            <strong>{stats.pending}</strong> remaining
            {stats.missed > 0 && (
              <>
                {" "}
                · <strong>{stats.missed}</strong> missed
              </>
            )}
          </p>
          {stats.expectedPct > 0 && (
            <p className="pln-hint" style={{ marginTop: 4 }}>
              Expected progress by today:{" "}
              <strong>{stats.expectedPct}%</strong> · Actual:{" "}
              <strong>{stats.completionPct}%</strong>
            </p>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">
            <h2>Plan Details</h2>
          </div>
          <div className="pln-detail-list">
            <div>
              <span>Planning Method</span>
              <strong>
                {monthlyPlan.planningMethod === "auto" ? "Auto Generated" : "Manual"}
              </strong>
            </div>
            <div>
              <span>Created</span>
              <strong>{formatDateLong(monthlyPlan.createdAt)}</strong>
            </div>
            <div>
              <span>Submitted</span>
              <strong>
                {monthlyPlan.submittedAt ? formatDateLong(monthlyPlan.submittedAt) : "—"}
              </strong>
            </div>
            <div>
              <span>Approved</span>
              <strong>
                {monthlyPlan.approvedAt ? formatDateLong(monthlyPlan.approvedAt) : "—"}
              </strong>
            </div>
            {monthlyPlan.approvedBy && (
              <div>
                <span>Approved By</span>
                <strong>{monthlyPlan.approvedBy}</strong>
              </div>
            )}
            {monthlyPlan.rejectionReason && (
              <div>
                <span>Manager Comments</span>
                <strong style={{ color: "var(--destructive)" }}>
                  {monthlyPlan.rejectionReason}
                </strong>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="pln-overview-footer">
        <button type="button" className="rpt-btn-outline" onClick={onResetEmpty}>
          Start New Plan
        </button>
        <button type="button" className="rpt-btn-outline" onClick={onResetDemo}>
          Load Demo Snapshot
        </button>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   ASSIGNED DOCTORS TAB
   Uses real API doctors passed via assignedDoctors
───────────────────────────────────────────────────────── */
function AssignedDoctorsTab({ store, planDoctorMap }) {
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scheduling, setScheduling] = useState(null);

  const { assignedDoctors } = store;

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return assignedDoctors.filter((d) => {
      const matchSearch =
        !term ||
        d.name?.toLowerCase().includes(term) ||
        d.specialization?.toLowerCase().includes(term) ||
        d.location?.toLowerCase().includes(term) ||
        d.doctorCode?.toLowerCase().includes(term) ||
        String(d.pincode ?? "").includes(term);
      const matchPriority =
        priorityFilter === "all" || d.priority === priorityFilter;
      const task = planDoctorMap.get(d.id);
      const visitStatus = task ? task.status : "Unplanned";
      const matchStatus =
        statusFilter === "all" || visitStatus === statusFilter;
      return matchSearch && matchPriority && matchStatus;
    });
  }, [assignedDoctors, search, priorityFilter, statusFilter, planDoctorMap]);

  return (
    <div className="doc-view-wrap">
      {/* ── Filters ── */}
      <div className="panel doc-view-filters">
        <div className="rpt-search-wrap" style={{ flex: 1, minWidth: 220 }}>
          <label>Search</label>
          <div className="rpt-search-input-wrap">
            <input
              type="text"
              placeholder="Doctor name, specialization, pin code, ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="rpt-search-icon">🔍</span>
          </div>
        </div>
        <div className="rpt-field">
          <label>Priority</label>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </div>
        <div className="rpt-field">
          <label>Visit Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="Unplanned">Unplanned</option>
            <option>Planned</option>
            <option>Scheduled</option>
            <option>In Progress</option>
            <option>Completed</option>
            <option>Rescheduled</option>
            <option>Missed</option>
            <option>Cancelled</option>
          </select>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="panel table-panel doc-table-panel">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Doctor Name</th>
              <th>ID</th>
              <th>Specialization</th>
              <th>Qualification</th>
              <th>Pin Code</th>
              <th>Phone</th>
              <th>Rating</th>
              <th>Priority</th>
              <th>Scheduled Date</th>
              <th>Visit Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="rpt-empty-td">
                  No doctors match your filter.
                </td>
              </tr>
            ) : (
              rows.map((d, i) => {
                const task = planDoctorMap.get(d.id);
                const isActive = d.isActive !== false;
                return (
                  <tr key={d.id}>
                    <td className="doc-row-num">{i + 1}</td>
                    <td>
                      <div className="doc-name-cell">
                        <div className="doc-avatar">
                          {d.name?.charAt(4)?.toUpperCase() ?? "D"}
                        </div>
                        <div>
                          <span className="doc-name-text">{d.name}</span>
                          {d.verificationStatus && (
                            <div>
                              <span
                                className={
                                  "doc-verify-badge doc-verify-" +
                                  d.verificationStatus
                                }
                              >
                                {d.verificationStatus}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="doc-muted">{d.doctorCode}</td>
                    <td>{d.specialization}</td>
                    <td className="doc-muted">{d.qualification || "—"}</td>
                    <td>
                      <span className="doc-pincode-badge">{d.location}</span>
                    </td>
                    <td className="doc-muted">{d.phone}</td>
                    <td>
                      {d.rating != null ? (
                        <span className="doc-stars">
                          {"★".repeat(Math.round(d.rating))}
                          {"☆".repeat(5 - Math.round(d.rating))}
                        </span>
                      ) : (
                        <span className="doc-muted">—</span>
                      )}
                    </td>
                    <td>
                      <PriorityBadge priority={d.priority} />
                    </td>
                    <td className="doc-muted">
                      {task ? formatDateShort(task.scheduledDate) : "—"}
                    </td>
                    <td>
                      {task ? (
                        <StatusBadge status={task.status} />
                      ) : (
                        <span className="doc-status-badge inactive">
                          Unplanned
                        </span>
                      )}
                    </td>
                    <td>
                      {!task && store.monthlyPlan && (
                        <button
                          type="button"
                          className="rpt-btn-sm"
                          onClick={() => setScheduling(d)}
                        >
                          Schedule
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <div className="doc-table-footer">
          Showing <strong>{rows.length}</strong> of{" "}
          <strong>{assignedDoctors.length}</strong> assigned doctors
        </div>
      </div>

      {scheduling && (
        <ScheduleDoctorModal
          doctor={scheduling}
          onClose={() => setScheduling(null)}
          onSchedule={(date, time) => {
            store.scheduleDoctor(scheduling.id, date, time);
            setScheduling(null);
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   CALENDAR TAB
───────────────────────────────────────────────────────── */
function CalendarTab({ store, doctorMap, openTaskReport, openReschedule }) {
  const [selectedDate, setSelectedDate] = useState(null);
  const workingDays = getWorkingDays();
  const today = getPlanToday();

  const byDate = useMemo(() => {
    const map = new Map();
    store.planDoctors.forEach((pd) => {
      if (!map.has(pd.scheduledDate)) map.set(pd.scheduledDate, []);
      map.get(pd.scheduledDate).push(pd);
    });
    return map;
  }, [store.planDoctors]);

  const allDaysInMonth = useMemo(() => {
    if (!workingDays.length) return [];
    const [y, m] = workingDays[0].split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return Array.from({ length: last }, (_, i) => {
      const d = i + 1;
      const dt = new Date(y, m - 1, d);
      return {
        iso: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        dow: dt.getDay(),
      };
    });
  }, [workingDays]);

  const leadingBlanks = allDaysInMonth.length ? allDaysInMonth[0].dow : 0;

  return (
    <div className="panel pln-calendar-panel">
      <div className="panel-title">
        <h2>Monthly Calendar — {PLAN_MONTH_LABEL}</h2>
      </div>
      <div className="pln-cal-legend">
        <span>
          <i className="pln-dot pln-dot-green" /> Completed
        </span>
        <span>
          <i className="pln-dot pln-dot-yellow" /> Planned
        </span>
        <span>
          <i className="pln-dot pln-dot-blue" /> Scheduled
        </span>
        <span>
          <i className="pln-dot pln-dot-red" /> Missed
        </span>
      </div>
      <div className="pln-cal-weekdays">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="pln-cal-grid">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={"b" + i} className="pln-cal-cell pln-cal-cell-blank" />
        ))}
        {allDaysInMonth.map(({ iso, dow }) => {
          const tasks = byDate.get(iso) || [];
          const isSunday = dow === 0;
          const isToday = iso === today;
          const completed = tasks.filter((t) => t.status === "Completed").length;
          const missed = tasks.filter((t) => t.status === "Missed").length;
          const pending = tasks.length - completed;
          let dot = null;
          if (tasks.length) {
            if (missed > 0) dot = "red";
            else if (completed === tasks.length) dot = "green";
            else if (tasks.some((t) => t.status === "Scheduled")) dot = "blue";
            else dot = "yellow";
          }
          return (
            <button
              type="button"
              key={iso}
              className={
                "pln-cal-cell" +
                (isSunday ? " pln-cal-cell-off" : "") +
                (isToday ? " pln-cal-cell-today" : "") +
                (tasks.length ? " pln-cal-cell-has-tasks" : "")
              }
              onClick={() => tasks.length && setSelectedDate(iso)}
              disabled={!tasks.length}
            >
              <span className="pln-cal-date">{Number(iso.slice(-2))}</span>
              {tasks.length > 0 && (
                <span className="pln-cal-info">
                  <span className={"pln-dot pln-dot-" + dot} /> {tasks.length} ·{" "}
                  {completed}✓ {pending}⏳
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <DayDetailModal
          date={selectedDate}
          tasks={byDate.get(selectedDate) || []}
          doctorMap={doctorMap}
          onClose={() => setSelectedDate(null)}
          renderActions={(t, doctor) => (
            <TaskActions
              task={t}
              onStart={() => store.updateTaskStatus(t.doctorId, "In Progress")}
              onComplete={() => openTaskReport(t, doctor)}
              onReschedule={() => openReschedule(t, doctor)}
              onCancel={() => store.cancelTask(t.doctorId)}
            />
          )}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   DAILY TASKS TAB
───────────────────────────────────────────────────────── */
function DailyTasksTab({ store, doctorMap, openTaskReport, openReschedule }) {
  const today = getPlanToday();
  const tomorrow = addDaysStr(today, 1);
  const weekEnd = addDaysStr(today, 6);
  const [filter, setFilter] = useState("today");

  const tasksWithDoctor = useMemo(
    () =>
      store.planDoctors
        .filter((t) => t.status !== "Cancelled")
        .map((t) => ({ ...t, doctor: doctorMap.get(t.doctorId) }))
        .sort(
          (a, b) =>
            (a.scheduledDate + a.visitTime).localeCompare(
              b.scheduledDate + b.visitTime
            )
        ),
    [store.planDoctors, doctorMap]
  );

  const buckets = useMemo(() => {
    const todays = tasksWithDoctor.filter((t) => t.scheduledDate === today);
    const tomorrows = tasksWithDoctor.filter(
      (t) => t.scheduledDate === tomorrow
    );
    const week = tasksWithDoctor.filter(
      (t) => t.scheduledDate >= today && t.scheduledDate <= weekEnd
    );
    const overdue = tasksWithDoctor.filter(
      (t) => t.scheduledDate < today && t.status !== "Completed"
    );
    const completed = tasksWithDoctor.filter((t) => t.status === "Completed");
    const pending = tasksWithDoctor.filter((t) => t.status !== "Completed");
    return { today: todays, tomorrow: tomorrows, week, overdue, completed, pending };
  }, [tasksWithDoctor, today, tomorrow, weekEnd]);

  const list = buckets[filter] || [];

  const filters = [
    { key: "today",     label: "Today",      count: buckets.today.length },
    { key: "tomorrow",  label: "Tomorrow",   count: buckets.tomorrow.length },
    { key: "week",      label: "This Week",  count: buckets.week.length },
    { key: "overdue",   label: "Overdue",    count: buckets.overdue.length },
    { key: "completed", label: "Completed",  count: buckets.completed.length },
    { key: "pending",   label: "Pending",    count: buckets.pending.length },
  ];

  return (
    <div>
      <div className="crm-page-title">
        <span className="crm-page-back">✓</span>
        <h2>
          Daily Tasks —{" "}
          {filter === "today"
            ? `Today (${formatDateLong(today)})`
            : filters.find((f) => f.key === filter)?.label}
        </h2>
      </div>

      <div className="pln-filter-chips">
        {filters.map((f) => (
          <button
            type="button"
            key={f.key}
            className={"pln-chip" + (filter === f.key ? " pln-chip-active" : "")}
            onClick={() => setFilter(f.key)}
          >
            {f.label}{" "}
            <span className="pln-chip-count">{f.count}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="panel rpt-empty-state">No tasks in this view.</div>
      ) : (
        <div className="pln-task-list">
          {list.map((t) => (
            <div className="panel pln-task-card" key={t.id}>
              <div className="pln-task-card-main">
                <DoctorMiniCard doctor={t.doctor} />
                <div className="pln-task-card-meta">
                  <span className="doc-muted">
                    {formatDateShort(t.scheduledDate)} · {t.visitTime}
                  </span>
                  <PriorityBadge priority={t.doctor?.priority} />
                  <StatusBadge status={t.status} />
                </div>
              </div>
              {t.doctor && (
                <div className="doc-muted pln-task-card-sub">
                  {t.doctor.hospital !== "—" ? t.doctor.hospital + ", " : ""}
                  {t.doctor.location} · {t.doctor.phone}
                </div>
              )}
              {t.rescheduleReason && (
                <div className="pln-hint" style={{ marginTop: 4 }}>
                  Rescheduled from {formatDateShort(t.rescheduledFrom)} —{" "}
                  {t.rescheduleReason}
                </div>
              )}
              <TaskActions
                task={t}
                onStart={() => store.updateTaskStatus(t.doctorId, "In Progress")}
                onComplete={() => openTaskReport(t, t.doctor)}
                onReschedule={() => openReschedule(t, t.doctor)}
                onCancel={() => store.cancelTask(t.doctorId)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   PLAN TABLE TAB
───────────────────────────────────────────────────────── */
function PlanTableTab({
  store,
  doctorMap,
  openTaskReport,
  openReschedule,
  onSubmitPlan,
}) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [validationErrors, setValidationErrors] = useState([]);
  const [showSubmitted, setShowSubmitted] = useState(false);

  const rows = useMemo(
    () =>
      [...store.planDoctors]
        .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
        .filter((t) => statusFilter === "all" || t.status === statusFilter)
        .map((t) => ({ ...t, doctor: doctorMap.get(t.doctorId) })),
    [store.planDoctors, statusFilter, doctorMap]
  );

  function handleSubmit() {
    const errors = validatePlanForSubmission(
      store.assignedDoctors,
      store.planDoctors
    );
    setValidationErrors(errors);
    if (errors.length === 0) {
      onSubmitPlan();
      setShowSubmitted(true);
    }
  }

  return (
    <div>
      <div
        className="panel doc-view-filters"
        style={{ justifyContent: "space-between" }}
      >
        <div className="rpt-field">
          <label>Task Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option>Planned</option>
            <option>Scheduled</option>
            <option>In Progress</option>
            <option>Completed</option>
            <option>Rescheduled</option>
            <option>Missed</option>
            <option>Cancelled</option>
          </select>
        </div>
        {store.monthlyPlan?.status === "Draft" && (
          <button
            type="button"
            className="zzc-btn zzc-btn-primary"
            onClick={handleSubmit}
          >
            Submit Monthly Plan
          </button>
        )}
      </div>

      {validationErrors.length > 0 && (
        <div className="dash-error" style={{ marginBottom: 12 }}>
          {validationErrors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}
      {showSubmitted && validationErrors.length === 0 && (
        <div
          className="rpt-submit-toast"
          style={{ position: "static", marginBottom: 12, width: "100%" }}
        >
          <div className="rpt-submit-toast-icon">✓</div>
          <div>
            <strong>Monthly plan submitted</strong>
            <p>Your plan is now awaiting manager approval.</p>
          </div>
        </div>
      )}

      <div className="panel table-panel doc-table-panel">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Day</th>
              <th>Doctor</th>
              <th>Specialization</th>
              <th>Pin Code</th>
              <th>Priority</th>
              <th>Visit Time</th>
              <th>Task Status</th>
              <th>Visit Report</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="rpt-empty-td">
                  No visits match this filter.
                </td>
              </tr>
            ) : (
              rows.map((t) => (
                <tr key={t.id}>
                  <td className="doc-muted">
                    {formatDateShort(t.scheduledDate)}
                  </td>
                  <td className="doc-muted">{dayName(t.scheduledDate)}</td>
                  <td>
                    <div className="doc-name-cell">
                      <div className="doc-avatar">
                        {t.doctor?.name?.charAt(4)?.toUpperCase() ?? "D"}
                      </div>
                      <span className="doc-name-text">
                        {t.doctor?.name ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td className="doc-muted">
                    {t.doctor?.specialization ?? "—"}
                  </td>
                  <td>
                    {t.doctor?.location ? (
                      <span className="doc-pincode-badge">
                        {t.doctor.location}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <PriorityBadge priority={t.doctor?.priority} />
                  </td>
                  <td className="doc-muted">{t.visitTime}</td>
                  <td>
                    <StatusBadge status={t.status} />
                  </td>
                  <td>
                    {t.status === "Completed" ? (
                      <span className="rpt-status-badge reported">
                        Submitted
                      </span>
                    ) : (
                      <span className="rpt-status-badge not-reported">
                        Pending
                      </span>
                    )}
                  </td>
                  <td>
                    <TaskActions
                      task={t}
                      onStart={() =>
                        store.updateTaskStatus(t.doctorId, "In Progress")
                      }
                      onComplete={() => openTaskReport(t, t.doctor)}
                      onReschedule={() => openReschedule(t, t.doctor)}
                      onCancel={() => store.cancelTask(t.doctorId)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="doc-table-footer">
          Showing <strong>{rows.length}</strong> of{" "}
          <strong>{store.planDoctors.length}</strong> scheduled visits
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   APPROVALS TAB
───────────────────────────────────────────────────────── */
function ApprovalCard({ exec, monthKey, assignedDoctors }) {
  const store = usePlanStore(exec.id, monthKey, assignedDoctors);
  const [action, setAction] = useState(null);
  const stats = computeStats(store.assignedDoctors, store.planDoctors);
  const plan = store.monthlyPlan;

  return (
    <div className="panel">
      <div className="panel-title">
        <h2>{exec.name}</h2>
        {plan ? (
          <PlanStatusBadge status={plan.status} />
        ) : (
          <span className="doc-status-badge inactive">No Plan</span>
        )}
      </div>

      {store.loading && (
        <p className="doc-muted" style={{ fontSize: ".75rem" }}>
          Loading…
        </p>
      )}
      {!store.loading && !plan && (
        <p className="doc-muted">
          No monthly plan submitted yet for {PLAN_MONTH_LABEL}.
        </p>
      )}
      {!store.loading && plan && (
        <>
          <div className="pln-detail-list">
            <div>
              <span>Month</span>
              <strong>{plan.monthLabel}</strong>
            </div>
            <div>
              <span>Total Doctors</span>
              <strong>{plan.totalDoctors || stats.totalAssigned}</strong>
            </div>
            <div>
              <span>Planned Visits</span>
              <strong>{stats.planned}</strong>
            </div>
            <div>
              <span>Daily Distribution</span>
              <strong>
                {plan.dailyTarget} / day across {plan.workingDays} days
              </strong>
            </div>
            <div>
              <span>Progress</span>
              <strong>
                {stats.completed}/{stats.totalAssigned} ({stats.completionPct}%)
              </strong>
            </div>
          </div>
          <ProgressBar pct={stats.completionPct} />

          {(plan.status === "Submitted" || plan.status === "Under Review") && (
            <div className="pln-action-row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="rpt-btn-primary"
                onClick={() => store.approvePlan()}
              >
                Approve
              </button>
              <button
                type="button"
                className="rpt-btn-danger"
                onClick={() => setAction("reject")}
              >
                Reject
              </button>
              <button
                type="button"
                className="rpt-btn-outline"
                onClick={() => setAction("changes")}
              >
                Request Changes
              </button>
            </div>
          )}
          {plan.status === "Approved" && (
            <div className="pln-action-row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="rpt-btn-danger"
                onClick={() => setAction("reject")}
              >
                Reject
              </button>
              <button
                type="button"
                className="rpt-btn-outline"
                onClick={() => setAction("changes")}
              >
                Request Changes
              </button>
            </div>
          )}
          {plan.rejectionReason && (
            <p
              className="pln-hint"
              style={{ marginTop: 8, color: "var(--destructive)" }}
            >
              Last comment: {plan.rejectionReason}
            </p>
          )}
        </>
      )}

      {action === "reject" && (
        <ApprovalReasonModal
          title={`Reject Plan — ${exec.name}`}
          actionLabel="Reject Plan"
          onClose={() => setAction(null)}
          onConfirm={(reason) => {
            store.rejectPlan(reason);
            setAction(null);
          }}
        />
      )}
      {action === "changes" && (
        <ApprovalReasonModal
          title={`Request Changes — ${exec.name}`}
          actionLabel="Send Back to Draft"
          onClose={() => setAction(null)}
          onConfirm={(reason) => {
            store.requestChanges(reason);
            setAction(null);
          }}
        />
      )}
    </div>
  );
}

function ApprovalsTab({ currentExecId, allExecutives, monthKey, assignedDoctors }) {
  // Show the current executive + up to 2 others from the team
  const others = allExecutives
    .filter((e) => e.id !== currentExecId)
    .slice(0, 2);
  const current = allExecutives.find((e) => e.id === currentExecId) ||
    allExecutives[0];

  if (!current) {
    return (
      <div className="panel rpt-empty-state">No executives found.</div>
    );
  }

  return (
    <div className="pln-approvals-grid">
      <ApprovalCard exec={current} monthKey={monthKey} assignedDoctors={assignedDoctors} />
      {others.map((exec) => (
        <ApprovalCard key={exec.id} exec={exec} monthKey={monthKey} assignedDoctors={[]} />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   MAIN PLAN VIEW
   data           — from useSalesData() in SalesCrm.jsx
   execId         — numeric ID of the selected executive
   role           — "executive" | "manager" | "regional"
   onStatsChange  — callback(stats) called when plan stats change
───────────────────────────────────────────────────────── */
export default function PlanView({ data, execId, role, onStatsChange }) {
  const monthKey = PLAN_MONTH_KEY;
  const isManager = role === "manager" || role === "regional";

  // ── Derive the "assigned doctors" for this exec from the live API data
  const myPincodes = useMemo(() => {
    if (!execId || !data?.coverage?.length) return new Set();
    return new Set(
      data.coverage
        .filter((c) => c.executive_id === execId)
        .map((c) => c.pincode)
    );
  }, [data?.coverage, execId]);

  // Adapt live API doctors to the shape planView components expect
  const assignedDoctors = useMemo(() => {
    if (!data?.doctors?.length) return [];
    return data.doctors
      .filter((d) => myPincodes.has(d.pincode))
      .map(adaptDoctor);
  }, [data?.doctors, myPincodes]);

  // ── Store (API-backed, falls back to cache / demo)
  const store = usePlanStore(execId, monthKey, assignedDoctors);

  // ── Derived
  const [tab, setTab] = useState("overview");
  const [creating, setCreating] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);

  const doctorMap = useMemo(
    () => getDoctorMap(store.assignedDoctors),
    [store.assignedDoctors]
  );
  const planDoctorMap = useMemo(() => {
    const map = new Map();
    store.planDoctors.forEach((pd) => map.set(pd.doctorId, pd));
    return map;
  }, [store.planDoctors]);
  const stats = useMemo(
    () => computeStats(store.assignedDoctors, store.planDoctors),
    [store.assignedDoctors, store.planDoctors]
  );

  // Notify parent whenever stats change (used by dashboard stat cards)
  useEffect(() => {
    if (onStatsChange) onStatsChange(stats, store.monthlyPlan);
  }, [stats, store.monthlyPlan, onStatsChange]);

  const workingDays = getWorkingDays();
  const exec = data?.executives?.find((e) => e.id === execId) ||
    data?.executives?.[0] || { name: "Sales Executive" };

  const tabs = [
    { key: "overview",  label: "Overview" },
    { key: "doctors",   label: "Assigned Doctors" },
    { key: "calendar",  label: "Calendar" },
    { key: "tasks",     label: "Daily Tasks" },
    { key: "table",     label: "Plan Table" },
    ...(isManager ? [{ key: "approvals", label: "Approvals" }] : []),
  ];

  function openTaskReport(task, doctor) {
    setReportTarget({ task, doctor });
  }
  function openReschedule(task, doctor) {
    setRescheduleTarget({ task, doctor });
  }

  // ── Loading / Error state
  if (store.loading && !store.monthlyPlan) {
    return (
      <div className="pln-wrap">
        <div className="panel rpt-empty-state" style={{ padding: "2rem" }}>
          Loading plan data…
        </div>
      </div>
    );
  }

  return (
    <div className="pln-wrap">
      {/* ── Error banner (non-blocking if we have cached data) ── */}
      {store.error && (
        <div className="dash-error">
          ⚠ Backend unavailable — showing cached data. ({store.error})
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="rpt-tabs-bar panel" style={{ padding: ".45rem .75rem" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={"rpt-tab" + (tab === t.key ? " active" : "")}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
        {!isManager && !store.monthlyPlan && (
          <button
            className="zzc-btn zzc-btn-primary"
            style={{ marginLeft: "auto" }}
            onClick={() => setCreating(true)}
          >
            + Create Monthly Plan
          </button>
        )}
        {store.monthlyPlan && (
          <button
            className="rpt-btn-outline"
            style={{ marginLeft: "auto", height: 32, fontSize: ".75rem" }}
            onClick={() => store.reload()}
          >
            ↺ Refresh
          </button>
        )}
      </div>

      {/* ── Tab content ── */}
      {tab === "overview" && (
        <OverviewTab
          store={store}
          stats={stats}
          execName={exec.name}
          isExecutive={!isManager}
          onCreatePlan={() => setCreating(true)}
          onResetEmpty={store.resetToEmpty}
          onResetDemo={store.resetToDemo}
        />
      )}

      {tab === "doctors" && (
        <AssignedDoctorsTab store={store} planDoctorMap={planDoctorMap} />
      )}

      {tab === "calendar" &&
        (store.monthlyPlan ? (
          <CalendarTab
            store={store}
            doctorMap={doctorMap}
            openTaskReport={openTaskReport}
            openReschedule={openReschedule}
          />
        ) : (
          <div className="panel rpt-empty-state">
            Create a monthly plan to see the calendar view.
          </div>
        ))}

      {tab === "tasks" &&
        (store.monthlyPlan ? (
          <DailyTasksTab
            store={store}
            doctorMap={doctorMap}
            openTaskReport={openTaskReport}
            openReschedule={openReschedule}
          />
        ) : (
          <div className="panel rpt-empty-state">
            Create a monthly plan to generate daily tasks.
          </div>
        ))}

      {tab === "table" &&
        (store.monthlyPlan ? (
          <PlanTableTab
            store={store}
            doctorMap={doctorMap}
            openTaskReport={openTaskReport}
            openReschedule={openReschedule}
            onSubmitPlan={store.submitMonthlyPlan}
          />
        ) : (
          <div className="panel rpt-empty-state">
            Create a monthly plan to see the schedule table.
          </div>
        ))}

      {tab === "approvals" && isManager && (
        <ApprovalsTab
          currentExecId={execId}
          allExecutives={data?.executives ?? []}
          monthKey={monthKey}
          assignedDoctors={assignedDoctors}
        />
      )}

      {/* ── Modals ── */}
      {creating && (
        <CreatePlanModal
          totalAssigned={store.assignedDoctors.length}
          workingDaysCount={workingDays.length}
          onClose={() => setCreating(false)}
          onCreate={(method) => {
            store.createPlan(method);
            setCreating(false);
          }}
        />
      )}
      {reportTarget && (
        <VisitReportModal
          doctor={reportTarget.doctor}
          task={reportTarget.task}
          existingReport={store.visitReports[reportTarget.task.doctorId]}
          onClose={() => setReportTarget(null)}
          onSubmit={(report, asDraft) => {
            store.submitVisitReport(
              reportTarget.task.doctorId,
              report,
              asDraft
            );
            setReportTarget(null);
          }}
        />
      )}
      {rescheduleTarget && (
        <RescheduleModal
          doctor={rescheduleTarget.doctor}
          task={rescheduleTarget.task}
          onClose={() => setRescheduleTarget(null)}
          onReschedule={(date, reason) => {
            store.rescheduleDoctor(
              rescheduleTarget.task.doctorId,
              date,
              reason
            );
            setRescheduleTarget(null);
          }}
        />
      )}
    </div>
  );
}
