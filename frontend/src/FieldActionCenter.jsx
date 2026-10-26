import { useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck, Download, Filter, CheckCircle2, Clock3, CircleAlert,
  Sprout, ScanSearch, Layers3, ArrowUpRight, RotateCcw,
} from "lucide-react";
import "./FieldActionCenter.css";

const STORAGE_KEY = "palm-ai-field-action-status-v1";
const statusOptions = ["OPEN", "IN REVIEW", "COMPLETED"];

function safeNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildTasks(datasets) {
  const tasks = [];
  const blocks = [...(datasets.multiRisk || [])]
    .filter((r) => ["HIGH", "MEDIUM"].includes(String(r.Multi_Source_Risk_Level || r.Risk_Level || "").toUpperCase()))
    .sort((a, b) => (safeNumber(b.Multi_Source_Risk_Score ?? b.Risk_Score) ?? -1) - (safeNumber(a.Multi_Source_Risk_Score ?? a.Risk_Score) ?? -1))
    .slice(0, 12);
  blocks.forEach((r) => tasks.push({
    id: `block-${r.Block_ID}`,
    source: "ALM historical",
    type: "Block review",
    target: r.Block_ID,
    priority: String(r.Multi_Source_Risk_Level || r.Risk_Level).toUpperCase(),
    signal: `${r.Main_Contributing_Indicators || r.Nutrient_Concern || "Historical productivity / nutrient indicators"}`,
    metric: safeNumber(r.Multi_Source_Risk_Score ?? r.Risk_Score),
    metricLabel: "Screening score",
    recommendation: r.Recommended_Action || "Review block-level yield and available nutrient diagnostics.",
    provenance: "Historical block-level evidence. Not a disease diagnosis.",
  }));

  const drone = [...(datasets.droneImages || [])]
    .filter((r) => r.is_outlier || String(r.health_category || "").toUpperCase() === "LOW" || (safeNumber(r.drone_health_score) ?? 100) < 60)
    .sort((a, b) => (safeNumber(a.drone_health_score) ?? 100) - (safeNumber(b.drone_health_score) ?? 100))
    .slice(0, 10);
  drone.forEach((r) => tasks.push({
    id: `drone-${r.image_filename || r.image_id}`,
    source: "RGB UAV benchmark",
    type: "Image review",
    target: r.image_filename || r.image_id || "UAV image",
    priority: (safeNumber(r.drone_health_score) ?? 100) < 40 ? "HIGH" : "MEDIUM",
    signal: r.outlier_categories || `${r.non_healthy_palm_percentage ?? "N/A"}% non-healthy-class detections`,
    metric: safeNumber(r.drone_health_score),
    metricLabel: "Image health indicator",
    recommendation: "Review the annotated image and verify the flagged crowns during a field survey before taking action.",
    provenance: "Research benchmark image; not linked to an ALM plantation block.",
  }));

  const spectral = [...(datasets.multispectralTiles || [])]
    .filter((r) => /moderate|depressed|background/i.test(String(r.vigour_category || "")) || (safeNumber(r.multispectral_health_score) ?? 100) < 80)
    .sort((a, b) => (safeNumber(a.multispectral_health_score) ?? 100) - (safeNumber(b.multispectral_health_score) ?? 100))
    .slice(0, 10);
  spectral.forEach((r) => tasks.push({
    id: `spectral-${r.tile_id}`,
    source: "Multispectral benchmark",
    type: "Tile review",
    target: r.tile_id ? `Tile ${r.tile_id}` : (r.filename || "GeoTIFF tile"),
    priority: (safeNumber(r.multispectral_health_score) ?? 100) < 60 ? "HIGH" : "MEDIUM",
    signal: `${r.vigour_category || "Vigour flag"}; NDVI ${r.canopy_ndvi_mean ?? "N/A"}; NDRE ${r.canopy_ndre_mean ?? "N/A"}`,
    metric: safeNumber(r.multispectral_health_score),
    metricLabel: "Spectral health indicator",
    recommendation: "Inspect the tile and verify band calibration, canopy mask and vegetation conditions before interpreting stress.",
    provenance: "Research benchmark tile; not linked to an ALM plantation block.",
  }));
  return tasks;
}

function exportCsv(tasks, statuses) {
  const headers = ["Task ID", "Source", "Task Type", "Target", "Priority", "Signal", "Metric", "Status", "Recommended Action", "Data Provenance"];
  const quote = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const lines = [headers, ...tasks.map((t) => [t.id, t.source, t.type, t.target, t.priority, t.signal, t.metric ?? "", statuses[t.id] || "OPEN", t.recommendation, t.provenance])];
  const blob = new Blob([lines.map((row) => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "palm-ai-field-action-queue.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function FieldActionCenter({ datasets }) {
  const tasks = useMemo(() => buildTasks(datasets), [datasets]);
  const [statuses, setStatuses] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch { return {}; }
  });
  const [filter, setFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(statuses)); } catch { /* Demo can run without browser storage. */ }
  }, [statuses]);

  const filtered = tasks.filter((task) => (filter === "ALL" || (statuses[task.id] || "OPEN") === filter)
    && (sourceFilter === "ALL" || task.source === sourceFilter));
  const completed = tasks.filter((task) => (statuses[task.id] || "OPEN") === "COMPLETED").length;
  const inReview = tasks.filter((task) => (statuses[task.id] || "OPEN") === "IN REVIEW").length;
  const high = tasks.filter((task) => task.priority === "HIGH" && (statuses[task.id] || "OPEN") !== "COMPLETED").length;

  return (
    <div className="field-action-page">
      <section className="action-hero">
        <div className="action-hero-copy">
          <div className="action-kicker"><ClipboardCheck size={15} /> FROM ANALYSIS TO ACTION</div>
          <h2>Field Action Center</h2>
          <p>Turn available evidence into a review queue, record follow-up status, and export an inspection handoff for the field team.</p>
          <div className="action-hero-note"><CircleAlert size={15} /> Separate evidence queues are intentionally kept separate until verified block mapping is available.</div>
        </div>
        <div className="action-hero-mark"><ClipboardCheck size={46} strokeWidth={1.4} /></div>
      </section>

      <section className="action-metrics">
        <article className="action-metric"><span>Generated review items</span><strong>{tasks.length}</strong><small>Based on available saved outputs</small></article>
        <article className="action-metric urgent"><span>High-priority open</span><strong>{high}</strong><small>Review first; verify in field</small></article>
        <article className="action-metric"><span>In review</span><strong>{inReview}</strong><small>Local demo workflow status</small></article>
        <article className="action-metric done"><span>Completed</span><strong>{completed}</strong><small>Recorded in this browser</small></article>
      </section>

      <section className="action-toolbar">
        <div className="action-toolbar-title"><div className="action-section-icon"><Filter size={17} /></div><div><h3>Inspection & review queue</h3><p>Prioritised evidence review · no fabricated cross-source joins</p></div></div>
        <div className="action-controls">
          <label>Status <select value={filter} onChange={(e) => setFilter(e.target.value)}>{["ALL", ...statusOptions].map((s) => <option key={s} value={s}>{s === "ALL" ? "All statuses" : s}</option>)}</select></label>
          <label>Evidence <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}><option value="ALL">All sources</option><option>ALM historical</option><option>RGB UAV benchmark</option><option>Multispectral benchmark</option></select></label>
          <button className="action-export" onClick={() => exportCsv(tasks, statuses)}><Download size={15} /> Export CSV</button>
        </div>
      </section>

      {filtered.length ? <div className="action-task-list">{filtered.map((task) => {
        const status = statuses[task.id] || "OPEN";
        const Icon = task.source === "ALM historical" ? Sprout : task.source === "RGB UAV benchmark" ? ScanSearch : Layers3;
        return <article className="action-task" key={task.id}>
          <div className={`action-task-icon ${task.source === "ALM historical" ? "agronomic" : task.source === "RGB UAV benchmark" ? "rgb" : "spectral"}`}><Icon size={19} /></div>
          <div className="action-task-main">
            <div className="action-task-title-row"><div><span className="action-source-label">{task.source} · {task.type}</span><h4>{task.target}</h4></div><span className={`action-priority ${task.priority.toLowerCase()}`}>{task.priority}</span></div>
            <p className="action-signal">{task.signal}</p>
            <p className="action-recommendation"><strong>Suggested next step:</strong> {task.recommendation}</p>
            <p className="action-provenance">{task.provenance}</p>
          </div>
          <div className="action-task-side">
            <div className="action-metric-value">{task.metric == null ? "N/A" : task.metric.toFixed(1)}<small>{task.metricLabel}</small></div>
            <label className="action-status-label">Follow-up status<select value={status} onChange={(e) => setStatuses((prev) => ({ ...prev, [task.id]: e.target.value }))}>{statusOptions.map((s) => <option key={s}>{s}</option>)}</select></label>
            <button className="action-open-source" onClick={() => setStatuses((prev) => ({ ...prev, [task.id]: status === "OPEN" ? "IN REVIEW" : status }))}><ArrowUpRight size={14} /> {status === "OPEN" ? "Start review" : status === "COMPLETED" ? "Completed" : "Review in progress"}</button>
          </div>
        </article>;
      })}</div> : <div className="action-empty"><ClipboardCheck size={28} /><h3>No review items match these filters</h3><p>Try a different status or evidence source. The queue uses saved ALM, RGB and multispectral outputs.</p></div>}

      <section className="action-bottom-note"><div><CheckCircle2 size={18} /><strong>Decision support, not automatic diagnosis</strong></div><p>Risk scores and model-derived indicators are screening signals. Confirm suspected issues through qualified field inspection. Current RGB and multispectral benchmark data is not spatially mapped to ALM block IDs, so those tasks are not combined with block tasks.</p><button onClick={() => { setStatuses({}); setFilter("ALL"); setSourceFilter("ALL"); }}><RotateCcw size={14} /> Reset demo statuses</button></section>
    </div>
  );
}
