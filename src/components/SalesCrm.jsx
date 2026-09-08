import { useState, useEffect, useCallback, useMemo } from "react";
import {
  fetchList,
  TABLE_CONFIG,
  coerceFieldValue,
  displayFieldValue,
  buildRecordPayload,
  updateRecord,
} from "../api.js";
import logo from "../assets/zenve-zippy-logo.png";
import "./SalesCRM.css";
import PlanView from "./planView.jsx";
import { usePlanStats, PLAN_MONTH_KEY, PLAN_MONTH_LABEL } from "./planData.js";

/* ─────────────────────────────────────────────────────────
   ROLE → TABLE KEY MAP
───────────────────────────────────────────────────────── */
const ROLE_TABLE_KEY = {
  executive: "sales_executives",
  manager: "sales_managers",
  regional: "regional_managers",
};

/* ─────────────────────────────────────────────────────────
   SMALL SHARED UI COMPONENTS
───────────────────────────────────────────────────────── */
function Stat({ icon, title, value, text, type }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${type}`}>{icon}</div>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{text}</small>
      </div>
    </div>
  );
}

function Chart({ title, categories, targets, achieved }) {
  const max = Math.max(1, ...targets, ...achieved);
  return (
    <div className="panel">
      <div className="panel-title">
        <h2>{title}</h2>
        <div className="legend">
          <span><i className="blue-dot" />Target</span>
          <span><i className="green-dot" />Achieved</span>
        </div>
      </div>
      <div className="chart">
        {categories.map((cat, i) => (
          <div className="month" key={cat}>
            <div className="bars">
              <div className="bar target" style={{ height: `${(targets[i] / max) * 145}px` }} />
              <div className="bar achieved" style={{ height: `${(achieved[i] / max) * 145}px` }} />
            </div>
            <small>{cat}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function Achievement({ percentage, achieved, progress, pending }) {
  return (
    <div className="panel">
      <div className="panel-title"><h2>Achievement Overview</h2></div>
      <div className="achievement">
        <div className="donut">
          <div>
            <strong>{percentage}</strong>
            <span>Achieved</span>
          </div>
        </div>
        <div className="achievement-list">
          <div><span><i className="green-dot" />Achieved</span><strong>{achieved}</strong></div>
          <div><span><i className="orange-dot" />In Progress</span><strong>{progress}</strong></div>
          <div><span><i className="red-dot" />Pending</span><strong>{pending}</strong></div>
        </div>
      </div>
    </div>
  );
}

function Performers({ title, people }) {
  return (
    <div className="panel">
      <div className="panel-title"><h2>{title}</h2></div>
      {people.length === 0 ? (
        <p style={{ color: "#7f8b98", fontSize: 13 }}>No data yet.</p>
      ) : (
        people.map((person, index) => (
          <div className="performer" key={person[0]}>
            <div className="rank">{index + 1}</div>
            <div className="person-avatar">{person[0].charAt(0)}</div>
            <div className="person">
              <strong>{person[0]}</strong>
              <small>{person[1]}</small>
            </div>
            <div className="performance">
              <div className="progress"><div style={{ width: person[2] }} /></div>
              <strong>{person[2]}</strong>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function DashTable({ title, headers, rows }) {
  return (
    <div className="panel table-panel">
      <div className="panel-title"><h2>{title}</h2></div>
      <table>
        <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} style={{ color: "#7f8b98" }}>No data yet</td></tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatusList({ title, rows }) {
  return (
    <div className="panel">
      <div className="panel-title"><h2>{title}</h2></div>
      {rows.map((r) => (
        <div className="lead-row" key={r[0]}>
          <strong>{r[0]}</strong>
          <div className="lead-progress"><div style={{ width: r[2] }} /></div>
          <span>{r[1]}</span>
        </div>
      ))}
    </div>
  );
}

function UpcomingList({ title, rows }) {
  return (
    <div className="panel">
      <div className="panel-title"><h2>{title}</h2></div>
      {rows.length === 0 ? (
        <p style={{ color: "#7f8b98", fontSize: 13 }}>Nothing coming up.</p>
      ) : (
        rows.map((r, i) => (
          <div className="followup" key={i}>
            <div className="person-avatar">{r[0].charAt(0)}</div>
            <div className="followup-info">
              <strong>{r[0]}</strong>
              <small>{r[1]}</small>
            </div>
            <span>{r[2]}</span>
          </div>
        ))
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   DATA HOOK
───────────────────────────────────────────────────────── */
function useSalesData() {
  const [state, setState] = useState({ loading: true, error: null });
  const [executives, setExecutives] = useState([]);
  const [salesManagers, setSalesManagers] = useState([]);
  const [regionalManagers, setRegionalManagers] = useState([]);
  const [coverage, setCoverage] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [products, setProducts] = useState([]);

  const load = useCallback(() => {
    setState({ loading: true, error: null });
    Promise.all([
      fetchList("sales_executives"),
      fetchList("sales_managers").catch(() => []),
      fetchList("regional_managers").catch(() => []),
      fetchList("pincode_coverage"),
      fetchList("executive_tasks"),
      fetchList("executive_alerts").catch(() => []),
      fetchList("doctors"),
      fetchList("products"),
    ])
      .then(([execs, mgrs, regs, cov, tsk, alr, docs, prods]) => {
        setExecutives(execs);
        setSalesManagers(mgrs);
        setRegionalManagers(regs);
        setCoverage(cov);
        setTasks(tsk);
        setAlerts(alr);
        setDoctors(docs);
        setProducts(prods);
        setState({ loading: false, error: null });
      })
      .catch((err) => setState({ loading: false, error: err.message || "Failed to load data" }));
  }, []);

  useEffect(() => { load(); }, [load]);

  return { ...state, executives, salesManagers, regionalManagers, coverage, tasks, alerts, doctors, products, reload: load };
}

/* ─────────────────────────────────────────────────────────
   PROFILE MODAL
───────────────────────────────────────────────────────── */
function ProfileModal({ tableKey, record, onClose, onSaved }) {
  const config = TABLE_CONFIG[tableKey];
  const fields = config.fields;
  const [values, setValues] = useState(() => {
    const init = {};
    fields.forEach((f) => { init[f.key] = displayFieldValue(f, record); });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function handleChange(key, value) {
    setValues((p) => ({ ...p, [key]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const changes = {};
      fields.forEach((f) => {
        if (f.readOnly) return;
        changes[f.key] = coerceFieldValue(f, values[f.key]);
      });
      const payload = buildRecordPayload(tableKey, record, changes);
      await updateRecord(tableKey, record.id, payload);
      if (onSaved) await onSaved();
      onClose();
    } catch (err) {
      setError(err.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  function renderInput(field) {
    const value = values[field.key];
    const id = "pf_" + field.key;
    if (field.readOnly) return <input id={id} value={value ?? ""} disabled />;
    if (field.type === "bool") return <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => handleChange(field.key, e.target.checked)} />;
    if (field.type === "yesno") return (
      <select id={id} value={value === true || value === "Yes" ? "Yes" : "No"} onChange={(e) => handleChange(field.key, e.target.value)}>
        <option value="Yes">Yes</option><option value="No">No</option>
      </select>
    );
    if (field.type === "number") return <input id={id} type="number" step="any" value={value ?? ""} required={field.required} onChange={(e) => handleChange(field.key, e.target.value)} />;
    if (field.type === "date") return <input id={id} type="date" value={value ?? ""} required={field.required} onChange={(e) => handleChange(field.key, e.target.value)} />;
    return <input id={id} value={value ?? ""} required={field.required} onChange={(e) => handleChange(field.key, e.target.value)} />;
  }

  return (
    <div className="zzc-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="zzc-modal">
        <h2>{record.name || "Profile"}</h2>
        {error && <div className="rpt-call-error">{error}</div>}
        <form id="profileForm" className="zzc-modal-form" onSubmit={handleSave}>
          {fields.map((field) => (
            <div className="zzc-field" key={field.key}>
              <label htmlFor={"pf_" + field.key}>{field.label || field.key}{field.required ? " *" : ""}</label>
              {renderInput(field)}
            </div>
          ))}
        </form>
        <div className="zzc-modal-actions">
          <button type="button" className="zzc-btn zzc-btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="profileForm" className="zzc-btn zzc-btn-primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   PRE-CALL MODAL
───────────────────────────────────────────────────────── */
function PreCallModal({ visit, onClose, onSave }) {
  const [brands, setBrands] = useState(visit.brands === "—" ? "" : visit.brands);
  const [campaign, setCampaign] = useState(visit.campaign === "—" ? "" : visit.campaign);
  const [objective, setObjective] = useState(visit.preCallObjective || "");
  const [notes, setNotes] = useState(visit.preCallNotes || "");

  function handleSave(e) {
    e.preventDefault();
    onSave({ ...visit, brands: brands || "—", campaign: campaign || "—", preCallObjective: objective, preCallNotes: notes });
    onClose();
  }

  return (
    <div className="zzc-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="zzc-modal rpt-call-modal">
        <div className="rpt-call-modal-header">
          <div>
            <h2>Pre Call — {visit.doctorName}</h2>
            <p className="rpt-call-modal-sub">Sno: {visit.advaitNo} · <span className="rpt-doc-tag">{visit.tag}</span></p>
            <p className="rpt-call-modal-sub">
              Phone: {visit.phone || "—"} · City: {visit.city || "—"} · Pin: {visit.pincode || "—"} · Specialization: {visit.tag || "—"}
            </p>
          </div>
          <button className="rpt-call-close" onClick={onClose} type="button">✕</button>
        </div>

        <form id="preCallForm" className="rpt-call-form" onSubmit={handleSave}>
          <div className="rpt-call-row">
            <div className="rpt-call-field">
              <label>Product</label>
              <input
                value={brands}
                onChange={(e) => setBrands(e.target.value)}
                placeholder="e.g. Nebicard, Losar"
                required
              />
            </div>
            <div className="rpt-call-field">
              <label>Campaign / Sales Activity</label>
              <input
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                placeholder="e.g. HeartBeat 2026"
              />
            </div>
          </div>
          <div className="rpt-call-field rpt-call-field-full">
            <label>Call Objective</label>
            <input
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="What do you plan to discuss?"
            />
          </div>
          <div className="rpt-call-field rpt-call-field-full">
            <label>Pre-Call Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Doctor background, previous prescriptions, talking points…"
            />
          </div>
        </form>

        <div className="rpt-call-modal-footer">
          <button type="button" className="rpt-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" form="preCallForm" className="rpt-btn-primary">Save Pre Call</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   POST-CALL MODAL
───────────────────────────────────────────────────────── */
function PostCallModal({ visit, onClose, onSave }) {
  const [brands, setBrands] = useState(visit.brands === "—" ? "" : visit.brands);
  const [campaign, setCampaign] = useState(visit.campaign === "—" ? "" : visit.campaign);
  const [outcome, setOutcome] = useState(visit.callOutcome || "Interested");
  const [prescriptions, setPrescriptions] = useState(visit.prescriptions || "");
  const [feedback, setFeedback] = useState(visit.feedback || "");
  const [nextVisit, setNextVisit] = useState(visit.nextVisitDate || "");

  function handleSave(e) {
    e.preventDefault();
    onSave({
      ...visit,
      brands: brands || "—",
      campaign: campaign || "—",
      callOutcome: outcome,
      prescriptions,
      feedback,
      nextVisitDate: nextVisit,
      status: "Reported",
    });
    onClose();
  }

  return (
    <div className="zzc-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="zzc-modal rpt-call-modal">
        <div className="rpt-call-modal-header">
          <div>
            <h2>Post Call — {visit.doctorName}</h2>
            <p className="rpt-call-modal-sub">Sno: {visit.advaitNo} · <span className="rpt-doc-tag">{visit.tag}</span></p>
            <p className="rpt-call-modal-sub">
              Phone: {visit.phone || "—"} · City: {visit.city || "—"} · Pin: {visit.pincode || "—"} · Specialization: {visit.tag || "—"}
            </p>
          </div>
          <button className="rpt-call-close" onClick={onClose} type="button">✕</button>
        </div>

        <form id="postCallForm" className="rpt-call-form" onSubmit={handleSave}>
          <div className="rpt-call-row">
            <div className="rpt-call-field">
              <label>Product</label>
              <input
                value={brands}
                onChange={(e) => setBrands(e.target.value)}
                placeholder="e.g. Nebicard, Losar"
                required
              />
            </div>
            <div className="rpt-call-field">
              <label>Campaign / Sales Activity</label>
              <input
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                placeholder="e.g. HeartBeat 2026"
              />
            </div>
          </div>
          <div className="rpt-call-row">
            <div className="rpt-call-field">
              <label>Call Outcome *</label>
              <select value={outcome} onChange={(e) => setOutcome(e.target.value)} required>
                <option>Interested</option>
                <option>Prescribed</option>
                <option>Needs Follow-up</option>
                <option>Not Available</option>
                <option>Rejected</option>
              </select>
            </div>
            <div className="rpt-call-field">
              <label>Next Visit Date</label>
              <input type="date" value={nextVisit} onChange={(e) => setNextVisit(e.target.value)} />
            </div>
          </div>
          <div className="rpt-call-field rpt-call-field-full">
            <label>Prescriptions / Products Discussed</label>
            <input
              value={prescriptions}
              onChange={(e) => setPrescriptions(e.target.value)}
              placeholder="e.g. Nebicard 5mg — 10 strips/month"
            />
          </div>
          <div className="rpt-call-field rpt-call-field-full">
            <label>Doctor Feedback / Observations</label>
            <textarea
              rows={3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What did the doctor say? Any objections or requests?"
            />
          </div>
        </form>

        <div className="rpt-call-modal-footer">
          <button type="button" className="rpt-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" form="postCallForm" className="rpt-btn-primary rpt-btn-post-submit">
            ✓ Mark as Reported
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   EDIT CALL MODAL (same shape as post call but pre-filled)
───────────────────────────────────────────────────────── */
function EditCallModal({ visit, onClose, onSave }) {
  return <PostCallModal visit={visit} onClose={onClose} onSave={onSave} />;
}

/* ─────────────────────────────────────────────────────────
   VIEW REPORTED CALLS MODAL
───────────────────────────────────────────────────────── */
function ReportedCallsModal({ visits, onClose }) {
  const reported = visits.filter((v) => v.status === "Reported");
  return (
    <div className="zzc-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="zzc-modal rpt-reported-modal">
        <div className="rpt-call-modal-header">
          <h2>Reported Calls ({reported.length})</h2>
          <button className="rpt-call-close" onClick={onClose} type="button">✕</button>
        </div>
        <div className="rpt-reported-body">
          {reported.length === 0 ? (
            <p style={{ color: "var(--muted-foreground)", textAlign: "center", padding: "1.5rem 0" }}>No reported calls yet.</p>
          ) : (
            <div className="table-panel" style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".75rem" }}>
                <thead>
                  <tr>
                    <th>Sno</th>
                    <th>Doctor</th>
                    <th>Phone</th>
                    <th>City</th>
                    <th>Product</th>
                    <th>Discussed</th>
                    <th>Outcome</th>
                    <th>Next Visit</th>
                  </tr>
                </thead>
                <tbody>
                  {reported.map((v) => (
                    <tr key={v.id}>
                      <td>{v.advaitNo}</td>
                      <td>
                        <div className="rpt-doc-cell">
                          <strong>{v.doctorName}</strong>
                          <span className="rpt-doc-tag">{v.tag}</span>
                        </div>
                      </td>
                      <td>{v.phone || "—"}</td>
                      <td>{v.city || "—"}</td>
                      <td style={{ color: "var(--primary)" }}>{v.brands}</td>
                      <td style={{ color: "oklch(52% .14 165)" }}>{v.campaign}</td>
                      <td>
                        {v.callOutcome ? (
                          <span className="rpt-outcome-badge">{v.callOutcome}</span>
                        ) : "—"}
                      </td>
                      <td>{v.nextVisitDate || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="rpt-call-modal-footer">
          <button className="rpt-btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   SUBMIT TOAST
───────────────────────────────────────────────────────── */
function SubmitToast({ reportDate, reportingType, reported, total, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="rpt-submit-toast">
      <div className="rpt-submit-toast-icon">✓</div>
      <div>
        <strong>Report Submitted Successfully!</strong>
        <p>{reportingType} · {reportDate} · {reported}/{total} visits reported</p>
      </div>
      <button className="rpt-call-close" onClick={onClose} type="button">✕</button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   REPORTS VIEW
   - Seeded from real API doctors in the exec's territory
   - Full Pre Call / Post Call / Edit Call modal flow
   - View Reported Calls modal
   - Final Submit with toast confirmation
───────────────────────────────────────────────────────── */
function ReportsView({ data, execId }) {
  const today = new Date().toISOString().slice(0, 10);
  const [reportingType, setReportingType] = useState("Field");
  const [reportDate, setReportDate] = useState(today);
  const [visitTab, setVisitTab] = useState("planned");
  const [doctorSearch, setDoctorSearch] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modal states
  const [preCallVisit, setPreCallVisit] = useState(null);
  const [postCallVisit, setPostCallVisit] = useState(null);
  const [editCallVisit, setEditCallVisit] = useState(null);
  const [showReported, setShowReported] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // The visits list — seeded from real API doctors in the exec's territory
  const exec = data.executives.find((e) => e.id === execId) || data.executives[0];

  const myPincodes = useMemo(
    () => new Set(data.coverage.filter((c) => c.executive_id === exec?.id).map((c) => c.pincode)),
    [data.coverage, exec]
  );

  const territoryDoctors = useMemo(
    () => data.doctors.filter((d) => myPincodes.has(d.pincode)),
    [data.doctors, myPincodes]
  );

  // Build initial visits from live territory doctors
  const [visits, setVisits] = useState([]);

  // Re-seed whenever the exec / territory doctors change
  useEffect(() => {
    if (territoryDoctors.length === 0) return;
    setVisits(
      territoryDoctors.map((doc) => ({
        id: doc.id,
        advaitNo: String(doc.id),
        doctorName: doc.name?.toUpperCase() ?? "UNKNOWN",
        tag: doc.specializations
          ? doc.specializations.split(",")[0].trim().toUpperCase().slice(0, 6)
          : "GEN",
        qualification: doc.qualification || "",
        pincode: doc.pincode,
        phone: doc.phone || "—",
        city: doc.city || "—",
        brands: "—",
        campaign: "—",
        status: "Not Reported",
        preCallObjective: "",
        preCallNotes: "",
        callOutcome: "",
        prescriptions: "",
        feedback: "",
        nextVisitDate: "",
      }))
    );
    setSubmitted(false);
  }, [territoryDoctors]);

  // Dropdown search — doctors not yet in the visit list
  const addableDoctors = useMemo(() => {
    const inList = new Set(visits.map((v) => v.id));
    return territoryDoctors.filter((d) => !inList.has(d.id));
  }, [territoryDoctors, visits]);

  function handleAddDoctor() {
    if (!selectedDoctor) return;
    const doc = territoryDoctors.find((d) => String(d.id) === selectedDoctor);
    if (!doc) return;
    setVisits((prev) => [
      ...prev,
      {
        id: doc.id,
        advaitNo: String(doc.id),
        doctorName: doc.name?.toUpperCase() ?? "UNKNOWN",
        tag: doc.specializations
          ? doc.specializations.split(",")[0].trim().toUpperCase().slice(0, 6)
          : "GEN",
        qualification: doc.qualification || "",
        pincode: doc.pincode,
        phone: doc.phone || "—",
        city: doc.city || "—",
        brands: "—",
        campaign: "—",
        status: "Not Reported",
        preCallObjective: "",
        preCallNotes: "",
        callOutcome: "",
        prescriptions: "",
        feedback: "",
        nextVisitDate: "",
      },
    ]);
    setSelectedDoctor("");
  }

  function handleRemoveUnreported() {
    setVisits((prev) => prev.filter((v) => v.status !== "Not Reported"));
  }

  function handleUpdateVisit(updated) {
    setVisits((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
  }

  function handleFinalSubmit() {
    const reportedCount = visits.filter((v) => v.status === "Reported").length;
    if (reportedCount === 0) {
      alert("Please report at least one visit before submitting.");
      return;
    }
    setSubmitted(true);
    setShowToast(true);
  }

  // Filtered display
  const filteredVisits = useMemo(() => {
    const term = doctorSearch.trim().toLowerCase();
    return visits.filter((v) => {
      const matchSearch =
        !term ||
        v.doctorName.toLowerCase().includes(term) ||
        v.advaitNo.includes(term) ||
        v.tag.toLowerCase().includes(term);
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "reported" && v.status === "Reported") ||
        (statusFilter === "not_reported" && v.status === "Not Reported");
      return matchSearch && matchStatus;
    });
  }, [visits, doctorSearch, statusFilter]);

  const reportedCount = visits.filter((v) => v.status === "Reported").length;
  const pendingCount = visits.length - reportedCount;

  const isLoading = data.loading;
  const noTerritory = !isLoading && myPincodes.size === 0;
  const noDoctors = !isLoading && myPincodes.size > 0 && territoryDoctors.length === 0;

  return (
    <div className="rpt-wrap">

      {/* ── TOAST ── */}
      {showToast && (
        <SubmitToast
          reportDate={reportDate}
          reportingType={reportingType}
          reported={reportedCount}
          total={visits.length}
          onClose={() => setShowToast(false)}
        />
      )}

      {/* ── TOP CONTROLS ── */}
      <div className="panel rpt-controls">
        <div className="rpt-control-row">
          <div className="rpt-field">
            <label>Reporting Type *</label>
            <select value={reportingType} onChange={(e) => setReportingType(e.target.value)}>
              <option>Field</option>
              <option>Office</option>
              <option>Virtual</option>
            </select>
          </div>
          <div className="rpt-field">
            <label>Report Date *</label>
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
          </div>
          <div className="rpt-control-actions">
            <button
              className="rpt-btn-primary"
              onClick={() => setStatusFilter("all")}
            >
              Proceed
            </button>
            <button
              className="rpt-btn-outline"
              onClick={() => setShowReported(true)}
            >
              View Reported Calls ({reportedCount})
            </button>
          </div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="panel rpt-tabs-bar">
        <button
          className={"rpt-tab" + (visitTab === "planned" ? " active" : "")}
          onClick={() => setVisitTab("planned")}
        >
          Planned Visit
        </button>
        <button
          className={"rpt-tab" + (visitTab === "unplanned" ? " active" : "")}
          onClick={() => setVisitTab("unplanned")}
        >
          Unplanned Visit
        </button>
      </div>

      {/* ── ADD DOCTOR ROW ── */}
      <div className="panel rpt-add-row">
        <div className="rpt-search-wrap">
          <label>Search Doctor</label>
          <div className="rpt-search-input-wrap">
            <input
              type="text"
              placeholder="Type name, S No., or speciality…"
              value={doctorSearch}
              onChange={(e) => setDoctorSearch(e.target.value)}
            />
            <span className="rpt-search-icon">🔍</span>
          </div>
        </div>

        <div className="rpt-select-wrap">
          <label>Select Doctor</label>
          <select value={selectedDoctor} onChange={(e) => setSelectedDoctor(e.target.value)}>
            <option value="">— Choose Doctor from Region —</option>
            {addableDoctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}{d.specializations ? ` · ${d.specializations.split(",")[0].trim()}` : ""}
              </option>
            ))}
          </select>
        </div>

        <button className="rpt-btn-primary" onClick={handleAddDoctor}> Add</button>
        <button className="rpt-btn-danger" onClick={handleRemoveUnreported}> Remove Visit Details</button>
      </div>

      {/* ── INDICATION / STATUS FILTER ROW ── */}
      <div className="panel rpt-filter-row">
        <div className="rpt-status-filter">
          <span>Reporting Status:</span>
          <label>
            <input type="radio" name="rptStatus" checked={statusFilter === "all"} onChange={() => setStatusFilter("all")} />
            All
          </label>
          <label>
            <input type="radio" name="rptStatus" checked={statusFilter === "reported"} onChange={() => setStatusFilter("reported")} />
            Reported
          </label>
          <label>
            <input type="radio" name="rptStatus" checked={statusFilter === "not_reported"} onChange={() => setStatusFilter("not_reported")} />
            Not Reported
          </label>
        </div>
      </div>

      {/* ── VISITS TABLE ── */}
      <div className="panel table-panel rpt-table-panel">
        {isLoading ? (
          <p className="rpt-empty-state">Loading doctors from your territory…</p>
        ) : noTerritory ? (
          <p className="rpt-empty-state">No pin codes assigned to this executive yet.</p>
        ) : noDoctors ? (
          <p className="rpt-empty-state">No doctors found in your assigned pin codes.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}><input type="checkbox" /></th>
                <th>Sno</th>
                <th>Doctor Name</th>
                <th>Product</th>
                <th>Discussed</th>
                <th>Status</th>
                <th>Option</th>
              </tr>
            </thead>
            <tbody>
              {filteredVisits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="rpt-empty-td">No visits match your filter.</td>
                </tr>
              ) : (
                filteredVisits.map((v) => (
                  <tr key={v.id}>
                    <td><input type="checkbox" /></td>
                    <td className="rpt-advait-no">{v.advaitNo}</td>
                    <td>
                      <div className="rpt-doc-cell">
                        <div className="rpt-doc-avatar">{v.doctorName.charAt(0)}</div>
                        <div>
                          <strong>{v.doctorName}</strong>
                          <div style={{ marginTop: 2 }}>
                            <span className="rpt-doc-tag">{v.tag}</span>
                            {v.pincode && (
                              <span className="rpt-doc-pin"> {v.pincode}</span>
                            )}
                          </div>
                          <div className="rpt-doc-pin" style={{ marginTop: 2 }}>
                            {v.phone || "—"} · {v.city || "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {v.brands === "—"
                        ? <span style={{ color: "var(--muted-foreground)" }}>—</span>
                        : <span className="rpt-brands">{v.brands}</span>
                      }
                    </td>
                    <td>
                      {v.campaign === "—"
                        ? <span style={{ color: "var(--muted-foreground)" }}>—</span>
                        : <span className="rpt-campaign">{v.campaign}</span>
                      }
                    </td>
                    <td>
                      <span className={"rpt-status-badge" + (v.status === "Reported" ? " reported" : " not-reported")}>
                        {v.status}
                      </span>
                    </td>
                    <td>
                      <div className="rpt-options">
                        <button
                          className="rpt-btn-sm rpt-btn-outline"
                          onClick={() => setPreCallVisit(v)}
                          title="Fill pre-call details"
                        >
                          Pre Call
                        </button>
                        {v.status === "Reported" ? (
                          <button
                            className="rpt-btn-sm rpt-btn-edit"
                            onClick={() => setEditCallVisit(v)}
                            title="Edit reported call"
                          >
                            Edit Call
                          </button>
                        ) : (
                          <button
                            className="rpt-btn-sm rpt-btn-post"
                            onClick={() => setPostCallVisit(v)}
                            title="Mark as reported"
                          >
                            Post Call
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── FOOTER ── */}
      <div className="rpt-footer">
        <span className="rpt-summary">
          Total Visits in List: <strong>{visits.length}</strong>&nbsp;|&nbsp;
          Reported: <strong>{reportedCount}</strong>&nbsp;|&nbsp;
          Pending: <strong>{pendingCount}</strong>
        </span>
        <button
          className={"rpt-btn-final" + (submitted ? " rpt-btn-final-done" : "")}
          onClick={handleFinalSubmit}
          disabled={submitted}
        >
          {submitted ? "✓ Submitted" : "FINAL SUBMIT"}
        </button>
      </div>


      {/* ── MODALS ── */}
      {preCallVisit && (
        <PreCallModal
          visit={preCallVisit}
          onClose={() => setPreCallVisit(null)}
          onSave={(updated) => { handleUpdateVisit(updated); setPreCallVisit(null); }}
        />
      )}
      {postCallVisit && (
        <PostCallModal
          visit={postCallVisit}
          onClose={() => setPostCallVisit(null)}
          onSave={(updated) => { handleUpdateVisit(updated); setPostCallVisit(null); }}
        />
      )}
      {editCallVisit && (
        <EditCallModal
          visit={editCallVisit}
          onClose={() => setEditCallVisit(null)}
          onSave={(updated) => { handleUpdateVisit(updated); setEditCallVisit(null); }}
        />
      )}
      {showReported && (
        <ReportedCallsModal visits={visits} onClose={() => setShowReported(false)} />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   DOCTORS VIEW
   - Real-time doctors from API filtered by exec's pincodes
   - Proper heading matching Reports page style
   - Consistent CSS classes
───────────────────────────────────────────────────────── */
function DoctorsView({ data, execId }) {
  const [search, setSearch] = useState("");
  const [filterPincode, setFilterPincode] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const exec = data.executives.find((e) => e.id === execId) || data.executives[0];

  const myPincodes = useMemo(
    () => new Set(data.coverage.filter((c) => c.executive_id === exec?.id).map((c) => c.pincode)),
    [data.coverage, exec]
  );

  const myDoctors = useMemo(
    () => data.doctors.filter((d) => myPincodes.has(d.pincode)),
    [data.doctors, myPincodes]
  );

  const pincodeList = useMemo(() => [...myPincodes].sort(), [myPincodes]);

  const activeCount = myDoctors.filter(
    (d) => d.is_active === "Yes" || d.is_active === true
  ).length;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return myDoctors.filter((d) => {
      const matchSearch =
        !term ||
        d.name?.toLowerCase().includes(term) ||
        d.qualification?.toLowerCase().includes(term) ||
        d.specializations?.toLowerCase().includes(term) ||
        String(d.experience_years ?? "").includes(term) ||
        d.phone?.toLowerCase().includes(term) ||
        d.city?.toLowerCase().includes(term) ||
        String(d.pincode ?? "").includes(term);
      const matchPin = filterPincode === "all" || String(d.pincode) === filterPincode;
      const isActive = d.is_active === "Yes" || d.is_active === true;
      const matchStatus =
        filterStatus === "all" ||
        (filterStatus === "active" && isActive) ||
        (filterStatus === "inactive" && !isActive);
      return matchSearch && matchPin && matchStatus;
    });
  }, [myDoctors, search, filterPincode, filterStatus]);

  return (
    <div className="doc-view-wrap">

      {/* ── PAGE TITLE — same pattern as Reports ── */}
      <div className="crm-page-title">
        <h2>Doctors in My Region</h2>
      </div>

      {/* ── STAT PILLS ── */}
      <div className="doc-stat-row">
        <div className="doc-stat-card">
          <div className="stat-icon orange">⊞</div>
          <div>
            <span>Pin Codes</span>
            <strong>{myPincodes.size}</strong>
            <small>Assigned coverage</small>
          </div>
        </div>
        <div className="doc-stat-card">
          <div className="stat-icon blue">₹</div>
          <div>
            <span>Total Doctors</span>
            <strong>{myDoctors.length}</strong>
            <small>In my Region</small>
          </div>
        </div>
        <div className="doc-stat-card">
          <div className="stat-icon green">✓</div>
          <div>
            <span>Active</span>
            <strong>{activeCount}</strong>
            <small>Available for visits</small>
          </div>
        </div>
        <div className="doc-stat-card">
          <div className="stat-icon red">○</div>
          <div>
            <span>Inactive</span>
            <strong>{myDoctors.length - activeCount}</strong>
            <small>Not currently active</small>
          </div>
        </div>
      </div>

      {/* ── FILTERS ── */}
      <div className="panel doc-view-filters">
        <div className="rpt-search-wrap" style={{ flex: 1, minWidth: 220 }}>
          <label>Search</label>
          <div className="rpt-search-input-wrap">
            <input
              type="text"
              placeholder="Name, qualification, specialization, experience, phone, city, pin code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="rpt-search-icon">🔍</span>
          </div>
        </div>
        <div className="rpt-field">
          <label>Pin Code</label>
          <select value={filterPincode} onChange={(e) => setFilterPincode(e.target.value)}>
            <option value="all">All Pin Codes</option>
            {pincodeList.map((pc) => (
              <option key={pc} value={pc}>{pc}</option>
            ))}
          </select>
        </div>
        <div className="rpt-field">
          <label>Status</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* ── TABLE ── */}
      {data.loading ? (
        <div className="panel rpt-empty-state">Loading doctors…</div>
      ) : myPincodes.size === 0 ? (
        <div className="panel rpt-empty-state">No pin codes assigned to this executive yet.</div>
      ) : filtered.length === 0 ? (
        <div className="panel rpt-empty-state">No doctors match your search.</div>
      ) : (
        <div className="panel table-panel doc-table-panel">
          <table>
            <thead>
              <tr>
                <th>Sno</th>
                <th>Doctor Name</th>
                <th>Qualification</th>
                <th>Specialization</th>
                <th>Experience</th>
                <th>Phone</th>
                <th>City</th>
                <th>Pin Code</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc, i) => {
                const isActive = doc.is_active === "Yes" || doc.is_active === true;
                return (
                  <tr key={doc.id}>
                    <td className="doc-row-num">{i + 1}</td>
                    <td>
                      <div className="doc-name-cell">
                        <div className="doc-avatar">{doc.name?.charAt(0).toUpperCase() ?? "?"}</div>
                        <div>
                          <span className="doc-name-text">{doc.name || "—"}</span>
                          {doc.verification_status && (
                            <div>
                              <span className={"doc-verify-badge doc-verify-" + doc.verification_status}>
                                {doc.verification_status}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="doc-muted">{doc.qualification || "—"}</td>
                    <td>
                      {doc.specializations
                        ? doc.specializations.split(",").map((s, si) => (
                          <span key={si} className="rpt-doc-tag" style={{ marginRight: 3, marginBottom: 2, display: "inline-block" }}>
                            {s.trim()}
                          </span>
                        ))
                        : <span className="doc-muted">—</span>
                      }
                    </td>
                    <td className="doc-muted">
                      {doc.experience_years != null ? `${doc.experience_years} yrs` : "—"}
                    </td>
                    <td className="doc-muted">{doc.phone || "—"}</td>
                    <td className="doc-muted">{doc.city || "—"}</td>
                    <td><span className="doc-pincode-badge">{doc.pincode || "—"}</span></td>
                    <td>
                      <span className={"doc-status-badge" + (isActive ? " active" : " inactive")}>
                        {isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="doc-table-footer">
            Showing <strong>{filtered.length}</strong> of <strong>{myDoctors.length}</strong> doctors
            across <strong>{myPincodes.size}</strong> pin code{myPincodes.size !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   PLAN TARGET PANEL
   Shown on both Executive and Team dashboards whenever a
   monthly plan exists for the current period.
───────────────────────────────────────────────────────── */
function PlanTargetPanel({ planStats, onGoToPlan }) {
  if (!planStats || !planStats.has_plan) {
    return (
      <div className="panel pln-target-empty">
        <div className="pln-target-empty-icon">🗓</div>
        <div>
          <strong>No monthly plan for {PLAN_MONTH_LABEL}</strong>
          <p className="pln-hint" style={{ marginTop: 3 }}>
            Go to the Plan section to create and manage the monthly visit schedule.
          </p>
        </div>
        {onGoToPlan && (
          <button className="rpt-btn-outline pln-target-btn" onClick={onGoToPlan}>
            Go to Plan →
          </button>
        )}
      </div>
    );
  }

  const {
    total_doctors   = 0,
    completed       = 0,
    pending         = 0,
    planned_visits  = 0,
    daily_target    = 0,
    working_days    = 0,
    completion_pct  = 0,
    plan_status     = "—",
  } = planStats;

  const statusCls = {
    Approved:    "pln-planstatus-approved",
    Submitted:   "pln-planstatus-submitted",
    Draft:       "pln-planstatus-draft",
    Rejected:    "pln-planstatus-rejected",
    "In Progress": "pln-planstatus-in-progress",
    Completed:   "pln-planstatus-completed",
  }[plan_status] ?? "pln-planstatus-draft";

  const barColor = completion_pct >= 80
    ? "var(--chart-1)"
    : completion_pct >= 50
    ? "oklch(70% .16 75)"
    : "var(--destructive)";

  return (
    <div className="panel pln-target-panel">
      {/* ── header row ── */}
      <div className="pln-target-header">
        <div>
          <h2 className="pln-target-title">
            Monthly Visit Target — {PLAN_MONTH_LABEL}
          </h2>
          <p className="pln-hint">
            {daily_target} doctors/day · {working_days} working days
          </p>
        </div>
        <div className="pln-target-header-right">
          <span className={"pln-planstatus " + statusCls}>{plan_status}</span>
          {onGoToPlan && (
            <button className="rpt-btn-outline pln-target-btn" onClick={onGoToPlan}>
              View Plan
            </button>
          )}
        </div>
      </div>

      {/* ── stat pills ── */}
      <div className="pln-target-pills">
        <div className="pln-target-pill">
          <strong>{total_doctors}</strong>
          <span>Target</span>
        </div>
        <div className="pln-target-pill pln-target-pill-green">
          <strong>{completed}</strong>
          <span>Completed</span>
        </div>
        <div className="pln-target-pill pln-target-pill-orange">
          <strong>{pending}</strong>
          <span>Pending</span>
        </div>
        <div className="pln-target-pill">
          <strong>{planned_visits}</strong>
          <span>Scheduled</span>
        </div>
      </div>

      {/* ── progress bar ── */}
      <div className="pln-target-progress-row">
        <div className="pln-target-progress-track">
          <div
            className="pln-target-progress-fill"
            style={{ width: `${Math.min(100, completion_pct)}%`, background: barColor }}
          />
        </div>
        <span className="pln-target-pct">{completion_pct}%</span>
      </div>
      <p className="pln-hint" style={{ marginTop: 5 }}>
        <strong>{completed}</strong> of <strong>{total_doctors}</strong> doctors
        visited this month
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   EXECUTIVE DASHBOARD
───────────────────────────────────────────────────────── */
function ExecutiveDashboard({ data, execId, planStats, onGoToPlan }) {
  const { executives, coverage, tasks, doctors, products } = data;
  const exec = executives.find((e) => e.id === execId) || executives[0];
  const myPincodes = new Set(coverage.filter((c) => c.executive_id === exec?.id).map((c) => c.pincode));
  const myTasks = tasks.filter((t) => !t.pincode || myPincodes.has(t.pincode));
  const done = myTasks.filter((t) => t.status === "done").length;
  const inProgress = myTasks.filter((t) => t.status === "in progress").length;
  const open = myTasks.length - done - inProgress;
  const donePct = myTasks.length > 0 ? Math.round((done / myTasks.length) * 100) : 0;
  const PRIORITIES = ["low", "medium", "high"];
  const totals = PRIORITIES.map((p) => myTasks.filter((t) => String(t.priority || "").toLowerCase() === p).length);
  const doneByPriority = PRIORITIES.map((p) => myTasks.filter((t) => String(t.priority || "").toLowerCase() === p && t.status === "done").length);
  const pincodeRows = [...myPincodes].map((pc) => ({
    pc,
    doctorCount: doctors.filter((d) => d.pincode === pc).length,
    productCount: products.filter((p) => p.pincode === pc).length,
  }));
  const maxScore = Math.max(1, ...pincodeRows.map((r) => r.doctorCount + r.productCount));
  const topPincodes = [...pincodeRows]
    .sort((a, b) => b.doctorCount + b.productCount - (a.doctorCount + a.productCount))
    .slice(0, 3)
    .map((r) => [r.pc, `${r.doctorCount} doctors · ${r.productCount} products`, `${Math.round(((r.doctorCount + r.productCount) / maxScore) * 100)}%`]);
  const statusRows = [
    ["Open", open, myTasks.length ? `${Math.round((open / myTasks.length) * 100)}%` : "0%"],
    ["In Progress", inProgress, myTasks.length ? `${Math.round((inProgress / myTasks.length) * 100)}%` : "0%"],
    ["Done", done, myTasks.length ? `${Math.round((done / myTasks.length) * 100)}%` : "0%"],
  ];
  const upcoming = myTasks
    .filter((t) => t.status !== "done" && t.due_date)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
    .slice(0, 4)
    .map((t) => [t.title, `pin ${t.pincode || "—"} · ${String(t.priority || "").toUpperCase()}`, t.due_date]);
  return (
    <>
      {/* ── Plan Target Panel ── */}
      <PlanTargetPanel planStats={planStats} onGoToPlan={onGoToPlan} />

      {/* ── Stat cards — plan completion replaces the generic "% done" card ── */}
      <div className="stats">
        <Stat icon="◎" title="My Tasks" value={myTasks.length} text={`${open} open`} type="blue" />
        <Stat icon="✓" title="Tasks Done" value={done} text={`${donePct}% complete`} type="green" />
        <Stat
          icon="🗓"
          title="Plan Target"
          value={planStats?.has_plan ? `${planStats.completion_pct ?? 0}%` : "—"}
          text={planStats?.has_plan
            ? `${planStats.completed ?? 0} / ${planStats.total_doctors ?? 0} visits`
            : "No plan yet"}
          type="orange"
        />
        <Stat icon="⚕" title="Doctors In Area" value={pincodeRows.reduce((s, r) => s + r.doctorCount, 0)} text="Across my pin codes" type="red" />
      </div>
      <div className="two-columns">
        <Chart title="My Tasks by Priority" categories={["Low", "Medium", "High"]} targets={totals} achieved={doneByPriority} />
        <Achievement percentage={`${donePct}%`} achieved={done} progress={inProgress} pending={open} />
      </div>
      <div className="two-columns">
        <Performers title="Top Pin Codes in My Area" people={topPincodes} />
        <StatusList title="My Task Status" rows={statusRows} />
      </div>
      <div className="two-columns">
        <UpcomingList title="Upcoming Tasks" rows={upcoming} />
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   TEAM DASHBOARD
───────────────────────────────────────────────────────── */
function TeamDashboard({ data, region, scopeLabel, planStats, onGoToPlan }) {
  const { executives, coverage, tasks, doctors } = data;
  const execsInScope = region ? executives.filter((e) => e.region === region) : executives;
  const execStats = execsInScope.map((exec) => {
    const pincodes = new Set(coverage.filter((c) => c.executive_id === exec.id).map((c) => c.pincode));
    const myTasks = tasks.filter((t) => t.pincode && pincodes.has(t.pincode));
    const done = myTasks.filter((t) => t.status === "done").length;
    const pct = myTasks.length > 0 ? Math.round((done / myTasks.length) * 100) : 0;
    return { exec, pincodes, taskCount: myTasks.length, done, pct };
  });
  const scopePincodes = [...new Set(coverage.filter((c) => execsInScope.some((e) => e.id === c.executive_id)).map((c) => c.pincode))];
  const scopeTasks = tasks.filter((t) => !t.pincode || scopePincodes.includes(t.pincode));
  const totalDone = scopeTasks.filter((t) => t.status === "done").length;
  const totalOpen = scopeTasks.length - totalDone;
  const overallPct = scopeTasks.length > 0 ? Math.round((totalDone / scopeTasks.length) * 100) : 0;
  const scopeDoctors = doctors.filter((d) => scopePincodes.includes(d.pincode)).length;
  const topExecutives = [...execStats].sort((a, b) => b.pct - a.pct).slice(0, 3).map((r) => [r.exec.name, r.exec.region || r.exec.city || "—", `${r.pct}%`]);
  const tableRows = execStats.slice(0, 6).map((r) => [r.exec.name, r.taskCount, r.done, `${r.pct}%`]);
  const categories = execStats.slice(0, 6).map((r) => r.exec.name);
  const targets = execStats.slice(0, 6).map((r) => r.taskCount);
  const achieved = execStats.slice(0, 6).map((r) => r.done);
  return (
    <>
      {/* ── Plan Target Panel ── */}
      <PlanTargetPanel planStats={planStats} onGoToPlan={onGoToPlan} />

      <div className="stats">
        <Stat icon="♙" title="My Executives" value={execsInScope.length} text={scopeLabel} type="blue" />
        <Stat icon="◎" title="Total Tasks" value={scopeTasks.length} text="This period" type="green" />
        <Stat
          icon="🗓"
          title="Plan Completion"
          value={planStats?.has_plan ? `${planStats.completion_pct ?? 0}%` : "—"}
          text={planStats?.has_plan
            ? `${planStats.completed ?? 0} / ${planStats.total_doctors ?? 0} visits`
            : "No plan yet"}
          type="orange"
        />
        <Stat icon="₹" title="Task Completion" value={`${overallPct}%`} text={`${scopeDoctors} doctors in scope`} type="red" />
      </div>
      <div className="two-columns">
        <Chart title="Team Target vs Achievement" categories={categories.length ? categories : ["—"]} targets={targets.length ? targets : [0]} achieved={achieved.length ? achieved : [0]} />
        <Achievement percentage={`${overallPct}%`} achieved={totalDone} progress={0} pending={totalOpen} />
      </div>
      <div className="two-columns">
        <Performers title="Top Performing Executives" people={topExecutives} />
        <DashTable title="Executive Performance" headers={["Executive", "Tasks", "Done", "%"]} rows={tableRows} />
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   SHELL
───────────────────────────────────────────────────────── */
const ROLES = {
  EXECUTIVE: "executive",
  MANAGER: "manager",
  REGIONAL: "regional",
};

const ROLE_TITLES = {
  executive: "Sales Executive",
  manager: "Sales Manager",
  regional: "Regional Manager",
};

const SECTION_TITLES = {
  dashboard: "Dashboard",
  doctors: "Doctors",
  plan: "Plan",
  reports: "Reports",
};

export default function SalesCrm({ role, onSwitchRole, onExit }) {
  const data = useSalesData();
  const [execId, setExecId] = useState(null);
  const [managerId, setManagerId] = useState(null);
  const [regionalId, setRegionalId] = useState(null);
  const [region, setRegion] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("dashboard");

  useEffect(() => {
    if (!execId && data.executives.length) setExecId(data.executives[0].id);
  }, [data.executives, execId]);

  useEffect(() => {
    if (!managerId && data.salesManagers.length) setManagerId(data.salesManagers[0].id);
  }, [data.salesManagers, managerId]);

  useEffect(() => {
    if (!regionalId && data.regionalManagers.length) setRegionalId(data.regionalManagers[0].id);
  }, [data.regionalManagers, regionalId]);

  // ── Plan stats for the active executive (shown on the dashboard)
  // usePlanStats is a lightweight hook: just one GET /plan-stats/{id} call
  const { stats: planStats } = usePlanStats(execId, PLAN_MONTH_KEY);

  const regions = useMemo(
    () => [...new Set(data.executives.map((e) => e.region).filter(Boolean))],
    [data.executives]
  );

  const currentTableKey = ROLE_TABLE_KEY[role];
  const currentRecord =
    role === ROLES.EXECUTIVE
      ? data.executives.find((e) => e.id === execId)
      : role === ROLES.MANAGER
      ? data.salesManagers.find((m) => m.id === managerId)
      : data.regionalManagers.find((r) => r.id === regionalId);

  function initialsOf(name) {
    if (!name) return "?";
    return name.trim().charAt(0).toUpperCase();
  }

  function handleSwitchRole(newRole) {
    setActiveSection("dashboard");
    onSwitchRole(newRole);
  }

  const pageTitle = `${ROLE_TITLES[role]} — ${SECTION_TITLES[activeSection] ?? "Dashboard"}`;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo"><img src={logo} alt="Zenve Zippy" /></div>
          <div>
            <div className="brand-name">Zenve Zippy CRM</div>
            <div className="brand-sub">Sales CRM</div>
          </div>
        </div>

        <nav>
          <button
            className={"nav-item" + (activeSection === "dashboard" ? " active" : "")}
            onClick={() => setActiveSection("dashboard")}
          >
           Dashboard
          </button>
          <button
            className={"nav-item" + (activeSection === "doctors" ? " active" : "")}
            onClick={() => setActiveSection("doctors")}
          >
             Doctors
          </button>
          <button
            className={"nav-item" + (activeSection === "plan" ? " active" : "")}
            onClick={() => setActiveSection("plan")}
          >
             Plan
          </button>
          <button
            className={"nav-item" + (activeSection === "reports" ? " active" : "")}
            onClick={() => setActiveSection("reports")}
          >
            Reports
          </button>

          <div className="nav-heading">SALES CRM</div>
          <button className={"nav-item" + (role === ROLES.REGIONAL ? " active" : "")} onClick={() => handleSwitchRole(ROLES.REGIONAL)}>
            Regional Managers
          </button>
          <button className={"nav-item" + (role === ROLES.MANAGER ? " active" : "")} onClick={() => handleSwitchRole(ROLES.MANAGER)}>
            Sales Managers
          </button>
          <button className={"nav-item" + (role === ROLES.EXECUTIVE ? " active" : "")} onClick={() => handleSwitchRole(ROLES.EXECUTIVE)}>
            Sales Executives
          </button>
          <button className="nav-item" onClick={onExit}>Admin CRM</button>
        </nav>
      </aside>

      <main className="main">
        <header className="header">
          <div className="title-section">
            <div>
              <h1>{pageTitle}</h1>
              <p>Track Performance • Manage Leads • Achieve Targets</p>
            </div>
          </div>

          <div className="header-right">
            <div className="role-switch">
              <label>View As</label>
              <select value={role} onChange={(e) => handleSwitchRole(e.target.value)}>
                <option value={ROLES.REGIONAL}>Regional Manager</option>
                <option value={ROLES.MANAGER}>Sales Manager</option>
                <option value={ROLES.EXECUTIVE}>Sales Executive</option>
              </select>
            </div>

            {role === ROLES.EXECUTIVE && data.executives.length > 0 && (
              <div className="role-switch">
                <label>Executive</label>
                <select value={execId ?? ""} onChange={(e) => setExecId(Number(e.target.value))}>
                  {data.executives.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
            )}

            {role === ROLES.MANAGER && data.salesManagers.length > 0 && (
              <div className="role-switch">
                <label>Manager</label>
                <select value={managerId ?? ""} onChange={(e) => setManagerId(Number(e.target.value))}>
                  {data.salesManagers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            )}

            {role === ROLES.REGIONAL && data.regionalManagers.length > 0 && (
              <div className="role-switch">
                <label>Regional Manager</label>
                <select value={regionalId ?? ""} onChange={(e) => setRegionalId(Number(e.target.value))}>
                  {data.regionalManagers.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}

            {(role === ROLES.MANAGER || role === ROLES.REGIONAL) && (
              <div className="role-switch">
                <label>Region filter</label>
                <select value={region} onChange={(e) => setRegion(e.target.value)}>
                  <option value="">All</option>
                  {regions.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              className="profile-avatar-btn"
              title={currentRecord ? `${currentRecord.name} — view profile` : "No profile selected"}
              onClick={() => currentRecord && setProfileOpen(true)}
              disabled={!currentRecord}
            >
              {initialsOf(currentRecord?.name)}
            </button>
          </div>
        </header>

        <section className="content">
          {activeSection === "dashboard" && (
            <>
              {data.loading && <p style={{ color: "#7f8b98" }}>Loading dashboard…</p>}
              {data.error && <div className="dash-error">{data.error}</div>}
              {!data.loading && !data.error && role === ROLES.EXECUTIVE && (
                <ExecutiveDashboard
                  data={data}
                  execId={execId}
                  planStats={planStats}
                  onGoToPlan={() => setActiveSection("plan")}
                />
              )}
              {!data.loading && !data.error && role === ROLES.MANAGER && (
                <TeamDashboard
                  data={data}
                  region={region || null}
                  scopeLabel="Active team members"
                  planStats={planStats}
                  onGoToPlan={() => setActiveSection("plan")}
                />
              )}
              {!data.loading && !data.error && role === ROLES.REGIONAL && (
                <TeamDashboard
                  data={data}
                  region={region || null}
                  scopeLabel="Across all regions"
                  planStats={planStats}
                  onGoToPlan={() => setActiveSection("plan")}
                />
              )}
            </>
          )}

          {activeSection === "reports" && (
            <ReportsView data={data} execId={execId} />
          )}

          {activeSection === "doctors" && (
            <DoctorsView data={data} execId={execId} />
          )}

          {activeSection === "plan" && (
           <PlanView data={data} execId={execId} role={role} />
          )}
        </section>
      </main>

      {profileOpen && currentRecord && (
        <ProfileModal
          tableKey={currentTableKey}
          record={currentRecord}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </div>
  );
}
