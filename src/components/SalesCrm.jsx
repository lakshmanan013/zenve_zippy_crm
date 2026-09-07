import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchList } from "../api.js";
import logo from "../assets/zenve-zippy-logo.png";
import "./SalesCRM.css";


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
          <span><i className="blue-dot"></i>Target</span>
          <span><i className="green-dot"></i>Achieved</span>
        </div>
      </div>

      <div className="chart">
        {categories.map((cat, index) => (
          <div className="month" key={cat}>
            <div className="bars">
              <div className="bar target" style={{ height: `${(targets[index] / max) * 145}px` }}></div>
              <div className="bar achieved" style={{ height: `${(achieved[index] / max) * 145}px` }}></div>
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
          <div><span><i className="green-dot"></i>Achieved</span><strong>{achieved}</strong></div>
          <div><span><i className="orange-dot"></i>In Progress</span><strong>{progress}</strong></div>
          <div><span><i className="red-dot"></i>Pending</span><strong>{pending}</strong></div>
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
              <div className="progress"><div style={{ width: person[2] }}></div></div>
              <strong>{person[2]}</strong>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Table({ title, headers, rows }) {
  return (
    <div className="panel table-panel">
      <div className="panel-title"><h2>{title}</h2></div>
      <table>
        <thead>
          <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
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
  // rows: [label, count, pct]
  return (
    <div className="panel">
      <div className="panel-title"><h2>{title}</h2></div>
      {rows.map((r) => (
        <div className="lead-row" key={r[0]}>
          <strong>{r[0]}</strong>
          <div className="lead-progress"><div style={{ width: r[2] }}></div></div>
          <span>{r[1]}</span>
        </div>
      ))}
    </div>
  );
}

function UpcomingList({ title, rows }) {
  // rows: [name, subtitle, when]
  return (
    <div className="panel">
      <div className="panel-title">
        <h2>{title}</h2>
      </div>
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

function useSalesData() {
  const [state, setState] = useState({ loading: true, error: null });
  const [executives, setExecutives] = useState([]);
  const [coverage, setCoverage] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [products, setProducts] = useState([]);

  const load = useCallback(() => {
    setState({ loading: true, error: null });
    Promise.all([
      fetchList("sales_executives"),
      fetchList("pincode_coverage"),
      fetchList("executive_tasks"),
      fetchList("executive_alerts").catch(() => []),
      fetchList("doctors"),
      fetchList("products"),
    ])
      .then(([execs, cov, tsk, alr, docs, prods]) => {
        setExecutives(execs);
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

  return { ...state, executives, coverage, tasks, alerts, doctors, products, reload: load };
}

/* =========================================================
   EXECUTIVE DASHBOARD (real data)
========================================================= */

function ExecutiveDashboard({ data, execId }) {
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
      <div className="stats">
        <Stat icon="◎" title="My Tasks" value={myTasks.length} text={`${open} open`} type="blue" />
        <Stat icon="✓" title="Completed" value={done} text={`${donePct}% done`} type="green" />
        <Stat icon="♙" title="Pin Codes Covered" value={myPincodes.size} text="Assigned coverage" type="orange" />
        <Stat icon="◎" title="Doctors In Area" value={pincodeRows.reduce((s, r) => s + r.doctorCount, 0)} text="Across my pin codes" type="red" />
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

/* =========================================================
   MANAGER / REGIONAL DASHBOARD (shared shape, scoped differently)
========================================================= */

function TeamDashboard({ data, region, scopeLabel }) {
  const { executives, coverage, tasks, doctors, products } = data;

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

  const topExecutives = [...execStats]
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3)
    .map((r) => [r.exec.name, r.exec.region || r.exec.city || "—", `${r.pct}%`]);

  const tableRows = execStats
    .slice(0, 6)
    .map((r) => [r.exec.name, r.taskCount, r.done, `${r.pct}%`]);

  const categories = execStats.slice(0, 6).map((r) => r.exec.name);
  const targets = execStats.slice(0, 6).map((r) => r.taskCount);
  const achieved = execStats.slice(0, 6).map((r) => r.done);

  return (
    <>
      <div className="stats">
        <Stat icon="♙" title="My Executives" value={execsInScope.length} text={scopeLabel} type="blue" />
        <Stat icon="◎" title="Total Tasks" value={scopeTasks.length} text="This period" type="green" />
        <Stat icon="▣" title="Pin Codes" value={scopePincodes.length} text="Covered" type="orange" />
        <Stat icon="₹" title="Completion" value={`${overallPct}%`} text={`${scopeDoctors} doctors in scope`} type="red" />
      </div>

      <div className="two-columns">
        <Chart title="Team Target vs Achievement" categories={categories.length ? categories : ["—"]} targets={targets.length ? targets : [0]} achieved={achieved.length ? achieved : [0]} />
        <Achievement percentage={`${overallPct}%`} achieved={totalDone} progress={0} pending={totalOpen} />
      </div>

      <div className="two-columns">
        <Performers title="Top Performing Executives" people={topExecutives} />
        <Table title="Executive Performance" headers={["Executive", "Tasks", "Done", "%"]} rows={tableRows} />
      </div>
    </>
  );
}

/* =========================================================
   SHELL — visual clone of the sales-crm sidebar + header
========================================================= */

const ROLES = {
  EXECUTIVE: "executive",
  MANAGER: "manager",
  REGIONAL: "regional",
};

const ROLE_TITLES = {
  executive: "Sales Executive Dashboard",
  manager: "Sales Manager Dashboard",
  regional: "Regional Manager Dashboard",
};

export default function SalesCrm({ role, onSwitchRole, onExit }) {
  const data = useSalesData();
  const [execId, setExecId] = useState(null);
  const [region, setRegion] = useState("");

  useEffect(() => {
    if (!execId && data.executives.length) setExecId(data.executives[0].id);
  }, [data.executives, execId]);

  const regions = useMemo(
    () => [...new Set(data.executives.map((e) => e.region).filter(Boolean))],
    [data.executives]
  );

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
          <button className="nav-item active">Dashboard</button>
          <button className="nav-item">Doctors</button>
          <button className="nav-item">Follow-ups</button>
          <button className="nav-item">Deals</button>
          <button className="nav-item">Targets</button>
          <button className="nav-item">Reports</button>

          <div className="nav-heading">SALES CRM</div>
          <button className={"nav-item" + (role === ROLES.REGIONAL ? " active" : "")} onClick={() => onSwitchRole(ROLES.REGIONAL)}>
            Regional Managers
          </button>
          <button className={"nav-item" + (role === ROLES.MANAGER ? " active" : "")} onClick={() => onSwitchRole(ROLES.MANAGER)}>
            Sales Managers
          </button>
          <button className={"nav-item" + (role === ROLES.EXECUTIVE ? " active" : "")} onClick={() => onSwitchRole(ROLES.EXECUTIVE)}>
          Sales Executives
          </button>
          <button className="nav-item" onClick={onExit}>Admin CRM</button>
        </nav>
      </aside>

      <main className="main">
        <header className="header">
          <div className="title-section">
            <div>
              <h1>{ROLE_TITLES[role]}</h1>
              <p>Track Performance • Manage Leads • Achieve Targets</p>
            </div>
          </div>

          <div className="header-right">
            <div className="role-switch">
              <label>View As</label>
              <select value={role} onChange={(e) => onSwitchRole(e.target.value)}>
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

            {(role === ROLES.MANAGER || role === ROLES.REGIONAL) && (
              <div className="role-switch">
                <label>Region</label>
                <select value={region} onChange={(e) => setRegion(e.target.value)}>
                  <option value="">All</option>
                  {regions.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            )}

            <button className="notification" onClick={data.reload}>↻</button>
          </div>
        </header>

        <section className="content">

          {data.loading && <p style={{ color: "#7f8b98" }}>Loading dashboard…</p>}
          {data.error && <div className="dash-error">{data.error}</div>}

          {!data.loading && !data.error && role === ROLES.EXECUTIVE && (
            <ExecutiveDashboard data={data} execId={execId} />
          )}
          {!data.loading && !data.error && role === ROLES.MANAGER && (
            <TeamDashboard data={data} region={region || null} scopeLabel="Active team members" />
          )}
          {!data.loading && !data.error && role === ROLES.REGIONAL && (
            <TeamDashboard data={data} region={region || null} scopeLabel="Across all regions" />
          )}
        </section>
      </main>
    </div>
  );
}
