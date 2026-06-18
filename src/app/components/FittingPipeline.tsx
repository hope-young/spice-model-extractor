// FittingPipeline.tsx - 6 阶段拟合 pipeline（核心屏幕）
import { useState, useRef, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  Play, Square, RotateCcw, ChevronRight, CheckCircle2,
  Loader, AlertCircle, Clock, Terminal, Settings2,
} from "lucide-react";
import { Button, Badge, Card, CardHeader } from "./ui";
import { SGT_STAGES } from "../../lib/constants";
import type { StageStatus } from "../../lib/types";

const C = {
  bg: "#ffffff", surface: "#fafafa", border: "#e5e5e5",
  text: "#2c2c2c", muted: "#6b7280",
  primary: "#0d99ff", success: "#14ae5c", warning: "#ffcd29", error: "#f24822",
  accent: "#e6f4ff", hover: "#f5f5f5",
};

interface LogEntry {
  ts: string;
  level: "info" | "success" | "error" | "stage";
  msg: string;
}

const initialLogs: LogEntry[] = [
  { ts: "14:22:05", level: "success", msg: "Stage 5 — Output Resistance converged (iter=189, RMSE=4.73%)" },
  { ts: "14:21:38", level: "success", msg: "Stage 4 — Saturation Velocity converged (iter=134, RMSE=3.11%)" },
  { ts: "14:19:11", level: "success", msg: "Stage 3 — Linear Mobility converged (iter=97, RMSE=2.44%)" },
  { ts: "14:17:54", level: "info", msg: "Data cleaning complete — 527 outliers removed" },
  { ts: "14:15:22", level: "success", msg: "Stage 2 — Subthreshold Slope converged (iter=62, RMSE=1.23%)" },
  { ts: "14:12:09", level: "info", msg: "Data loaded: SDH10N2P1WC-AA (139 + 43 + 101 + 50 pts)" },
  { ts: "14:10:33", level: "success", msg: "Stage 1 — Threshold Voltage converged (iter=48, RMSE=0.82%)" },
  { ts: "14:08:01", level: "info", msg: "SpiceBuilder v0.1.0 started" },
];

// Mock 收敛数据
function makeConvergence(finalRmse: number) {
  return Array.from({ length: 50 }, (_, i) => {
    const t = i / 49;
    const rmse = (finalRmse + 30) * Math.exp(-3.5 * t) + finalRmse * (1 + 0.08 * Math.sin(i * 0.8) * Math.exp(-t * 2));
    return { iter: Math.round(i * 100), rmse };
  });
}

export function FittingPipeline() {
  const [statuses, setStatuses] = useState<StageStatus[]>(["done", "done", "done", "done", "done", "pending"]);
  const [activeStage, setActiveStage] = useState(5);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(100);
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs);
  const runRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0;
  }, [logs]);

  const addLog = (level: LogEntry["level"], msg: string) => {
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    setLogs((prev) => [{ ts, level, msg }, ...prev].slice(0, 200));
  };

  const handleRunAll = async () => {
    if (running) {
      runRef.current = false;
      setRunning(false);
      return;
    }
    runRef.current = true;
    setRunning(true);
    addLog("stage", "Starting full 6-stage extraction pipeline…");

    const startFrom = statuses.findIndex((s) => s !== "done");
    const from = startFrom === -1 ? 0 : startFrom;
    setStatuses((prev) => {
      const n = [...prev];
      for (let i = from; i < 6; i++) n[i] = "pending";
      return n;
    });

    for (let i = from; i < 6; i++) {
      if (!runRef.current) break;
      addLog("stage", `Stage ${i + 1} — ${SGT_STAGES[i].name} starting…`);
      setStatuses((prev) => { const n = [...prev]; n[i] = "running"; return n; });
      setActiveStage(i);
      setProgress(0);
      // Simulate fitting duration
      await new Promise<void>((resolve) => {
        const start = Date.now();
        const dur = 1500 + i * 800;
        const tick = () => {
          if (!runRef.current) { resolve(); return; }
          const elapsed = Date.now() - start;
          setProgress(Math.min(100, (elapsed / dur) * 100));
          if (elapsed < dur) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      if (!runRef.current) break;
      setStatuses((prev) => { const n = [...prev]; n[i] = "done"; return n; });
      addLog("success", `Stage ${i + 1} — ${SGT_STAGES[i].name} converged`);
    }
    setRunning(false);
    runRef.current = false;
    setProgress(100);
    addLog("success", "All stages complete.");
  };

  const handleReset = () => {
    runRef.current = false;
    setRunning(false);
    setStatuses(["pending", "pending", "pending", "pending", "pending", "pending"]);
    setActiveStage(0);
    setProgress(0);
    addLog("info", "Pipeline reset — all stages cleared");
  };

  const activeS = SGT_STAGES[activeStage];
  const doneCount = statuses.filter((s) => s === "done").length;
  const convergenceData = makeConvergence(parseFloat(activeS.rmse.replace("%", "")) || 2.0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: C.bg, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.text }}>Fitting Pipeline</h1>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>6-stage BSIM3v3 parameter extraction  ·  SDH10N2P1WC-AA</div>
        </div>
        <Button variant="outline" onClick={handleReset}>
          <RotateCcw size={13} style={{ marginRight: 5 }} />Reset
        </Button>
        <Button variant="outline">
          <Settings2 size={13} style={{ marginRight: 5 }} />Optimizer
        </Button>
        <Button
          variant={running ? "danger" : "primary"}
          onClick={handleRunAll}
        >
          {running ? (
            <><Square size={13} style={{ marginRight: 5 }} />Stop</>
          ) : (
            <><Play size={13} style={{ marginRight: 5 }} />{doneCount > 0 && doneCount < 6 ? "Resume" : "Run All"}</>
          )}
        </Button>
      </div>

      {/* Progress bar */}
      <div style={{ padding: "8px 20px", borderBottom: `1px solid ${C.border}`, backgroundColor: C.surface, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, height: 5, backgroundColor: C.border, borderRadius: 3, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              borderRadius: 3,
              width: `${(doneCount / 6) * 100 + (running ? progress / 6 : 0)}%`,
              backgroundColor: C.success,
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <span style={{ fontSize: 11, color: C.muted, fontFamily: "'JetBrains Mono', Consolas, monospace", whiteSpace: "nowrap" }}>{doneCount}/6 stages</span>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Stage list */}
        <div style={{ width: 260, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", backgroundColor: C.surface, overflowY: "auto" }}>
          {SGT_STAGES.map((stage, i) => {
            const status = statuses[i];
            const isActive = activeStage === i;
            return (
              <div
                key={stage.id}
                onClick={() => setActiveStage(i)}
                style={{
                  padding: "10px 14px",
                  borderBottom: `1px solid ${C.border}`,
                  backgroundColor: isActive ? C.accent : "transparent",
                  cursor: "pointer",
                  transition: "background-color 0.08s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <StageIcon status={status} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 10, color: C.muted, fontFamily: "'JetBrains Mono', monospace" }}>Stage {stage.id}</span>
                      <span
                        style={{
                          fontSize: 10,
                          backgroundColor: isActive ? C.primary : C.border,
                          color: isActive ? "#fff" : C.muted,
                          padding: "0 4px",
                          borderRadius: 2,
                        }}
                      >{stage.short}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: isActive ? C.primary : C.text, marginTop: 1 }}>{stage.name}</div>
                  </div>
                  {status === "running" && (
                    <div style={{ width: 30, height: 4, backgroundColor: C.border, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${progress}%`, height: "100%", backgroundColor: C.primary, transition: "width 0.1s" }} />
                    </div>
                  )}
                  {status === "done" && <span style={{ fontSize: 10, color: C.success, fontFamily: "'JetBrains Mono', monospace" }}>{stage.rmse}</span>}
                  {isActive && status !== "running" && <ChevronRight size={12} color={C.primary} />}
                </div>
                {status === "done" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 4, paddingLeft: 24, fontSize: 10, color: C.muted }}>
                    <span>{stage.iters} iter</span>
                    <span>·</span>
                    <span>{stage.duration}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {/* Stage detail */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "14px 16px", gap: 12 }}>
              {/* Stage header */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: C.muted, fontFamily: "'JetBrains Mono', monospace" }}>Stage {activeS.id}</span>
                    <Badge variant="primary">{activeS.short}</Badge>
                    <Badge>{activeS.optimizer}</Badge>
                  </div>
                  <h2 style={{ margin: "4px 0 2px", fontSize: 15, fontWeight: 600, color: C.text }}>{activeS.name}</h2>
                  <div style={{ fontSize: 12, color: C.muted }}>{activeS.description}</div>
                </div>
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: statuses[activeStage] === "done" ? C.success : C.muted, fontFamily: "'JetBrains Mono', monospace" }}>{activeS.rmse}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>RMSE</div>
                </div>
              </div>

              {/* Convergence chart */}
              <div style={{ flex: 1, backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: "10px 4px 8px", overflow: "hidden" }}>
                <div style={{ fontSize: 11, color: C.muted, paddingLeft: 18, marginBottom: 4 }}>Convergence — RMSE vs iteration</div>
                <ResponsiveContainer width="100%" height="85%">
                  <LineChart data={convergenceData} margin={{ top: 4, right: 20, bottom: 16, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="iter" tick={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", fill: C.muted }}
                      label={{ value: "Iteration", position: "insideBottom", offset: -10, style: { fontSize: 10, fill: C.muted } }} />
                    <YAxis tick={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", fill: C.muted }} tickFormatter={(v) => `${v.toFixed(1)}%`}
                      label={{ value: "RMSE (%)", angle: -90, position: "insideLeft", offset: 8, style: { fontSize: 10, fill: C.muted } }} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`, "RMSE"]}
                      contentStyle={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", border: `1px solid ${C.border}`, borderRadius: 5 }} />
                    <ReferenceLine y={parseFloat(activeS.rmse.replace("%", "")) || 2.0} stroke={C.success} strokeDasharray="4 2"
                      label={{ value: `Target ${activeS.rmse}`, fill: C.success, fontSize: 9, position: "right" }} />
                    <Line type="monotone" dataKey="rmse" stroke={C.primary} strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Parameter table */}
              <div style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, overflow: "hidden" }}>
                <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 600, color: C.text }}>
                  Extracted Parameters
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      {["Parameter", "Initial", "Fitted", "Bounds"].map((h) => (
                        <th key={h} style={{ padding: "5px 12px", textAlign: "left", color: C.muted, fontWeight: 500, borderBottom: `1px solid ${C.border}`, fontSize: 10 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeS.params.map((p) => (
                      <tr key={p.name} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: "5px 12px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: C.primary }}>{p.name}</td>
                        <td style={{ padding: "5px 12px", fontFamily: "'JetBrains Mono', monospace", color: C.muted }}>{p.init}</td>
                        <td style={{ padding: "5px 12px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: statuses[activeStage] === "done" ? C.text : C.muted }}>
                          {statuses[activeStage] === "done" ? p.init : "—"}
                        </td>
                        <td style={{ padding: "5px 12px", fontFamily: "'JetBrains Mono', monospace", color: C.muted, fontSize: 10 }}>{p.bounds}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Log panel */}
            <div style={{ width: 300, borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column", backgroundColor: "#1a1a1a" }}>
              <div style={{ padding: "8px 12px", borderBottom: "1px solid #333", display: "flex", alignItems: "center", gap: 6 }}>
                <Terminal size={12} color="#6b7280" />
                <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "'JetBrains Mono', monospace" }}>Extraction Log</span>
              </div>
              <div ref={logRef} style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
                {logs.map((log, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "2px 12px",
                      fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: log.level === "success" ? "#4ade80" :
                             log.level === "error" ? "#f87171" :
                             log.level === "stage" ? "#60a5fa" : "#9ca3af",
                    }}
                  >
                    [{log.ts}]  {log.msg}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StageIcon({ status }: { status: StageStatus }) {
  const size = 16;
  if (status === "done") return <CheckCircle2 size={size} color="var(--success)" />;
  if (status === "error") return <AlertCircle size={size} color="var(--error)" />;
  if (status === "running") {
    return (
      <div style={{ animation: "spin 1s linear infinite", display: "flex" }}>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        <Loader size={size} color="var(--primary)" />
      </div>
    );
  }
  return <Clock size={size} color="var(--border)" />;
}
