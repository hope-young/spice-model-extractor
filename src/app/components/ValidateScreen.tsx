// ValidateScreen.tsx - 验证
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { CheckCircle2, AlertTriangle, XCircle, RotateCcw, Activity } from "lucide-react";
import { Card, CardHeader, Button, Badge } from "./ui";

interface ConsistencyCheck {
  pass: boolean;
  warn?: boolean;
  label: string;
  detail: string;
}

const checks: ConsistencyCheck[] = [
  { pass: true, label: "Qg computed vs measured", detail: "Δ 5.2% (target < 10%)" },
  { pass: true, label: "Eoss computed vs measured", detail: "Δ 8.1% (target < 15%)" },
  { pass: true, label: "Rds(on) temperature coefficient", detail: "+1.86 (positive, SGT characteristic)" },
  { pass: true, label: "Vth temperature coefficient", detail: "-9.32 mV/°C (typical)" },
  { pass: true, label: "VTH0 physical range", detail: "2.94 V ∈ [0.1, 5]" },
  { pass: true, label: "U0 physical range", detail: "412 cm²/Vs ∈ [100, 1500]" },
  { pass: true, label: "Coss nonlinearity vs Crss Miller", detail: "Positions consistent" },
  { pass: true, label: "Corner coverage", detail: "-40 / 25 / 150 °C all converge" },
  { pass: true, label: "LTspice DC convergence", detail: "All sweeps converged" },
  { pass: false, warn: true, label: "Switching transient (unfitted)", detail: "Not validated (Qg + C-V only)" },
];

// Mock transient waveform
const transientData = Array.from({ length: 100 }, (_, i) => {
  const t = i / 99 * 1e-6; // 0~1us
  return {
    t: t * 1e9, // ns
    vds_meas: t < 0.4e-6 ? 100 : 0.1,
    vds_fit: t < 0.45e-6 ? 100 : 0.15,
  };
});

export function ValidateScreen() {
  const passed = checks.filter((c) => c.pass).length;
  const warnings = checks.filter((c) => c.warn).length;
  const failed = checks.filter((c) => !c.pass && !c.warn).length;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Validation</h1>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            Cross-check fitted model against un-fitted data
          </div>
        </div>
        <Button variant="outline">
          <RotateCcw size={13} style={{ marginRight: 5 }} />Re-validate
        </Button>
        <Button variant="primary">
          <Activity size={13} style={{ marginRight: 5 }} />Run transient check
        </Button>
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={20} color="var(--success)" />
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>PASSED</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--success)", fontFamily: "'JetBrains Mono', monospace" }}>{passed}</div>
            </div>
          </div>
        </Card>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={20} color="var(--warning)" />
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>WARNINGS</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--warning)", fontFamily: "'JetBrains Mono', monospace" }}>{warnings}</div>
            </div>
          </div>
        </Card>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <XCircle size={20} color="var(--error)" />
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>FAILED</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--error)", fontFamily: "'JetBrains Mono', monospace" }}>{failed}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Detailed checks */}
      <Card style={{ marginBottom: 20 }}>
        <CardHeader title="Consistency Checks" subtitle={`${checks.length} total  ·  ${passed} passed`} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {checks.map((c, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "8px 12px",
                backgroundColor: c.pass ? "transparent" : c.warn ? "#fff9e6" : "#ffe6e6",
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              {c.pass ? (
                <CheckCircle2 size={14} color="var(--success)" style={{ marginTop: 2 }} />
              ) : c.warn ? (
                <AlertTriangle size={14} color="var(--warning)" style={{ marginTop: 2 }} />
              ) : (
                <XCircle size={14} color="var(--error)" style={{ marginTop: 2 }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ color: "var(--text)", fontWeight: 500 }}>{c.label}</div>
                <div style={{ color: "var(--muted)", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{c.detail}</div>
              </div>
              <Badge variant={c.pass ? "success" : c.warn ? "warning" : "error"}>
                {c.pass ? "PASS" : c.warn ? "WARN" : "FAIL"}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* Switching transient preview */}
      <Card>
        <CardHeader title="Switching Transient (turn-off)" subtitle="Vds: measured vs fitted" />
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={transientData} margin={{ top: 4, right: 20, bottom: 16, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="t" tick={{ fontSize: 10, fill: "var(--muted)" }}
              label={{ value: "Time (ns)", position: "insideBottom", offset: -8, style: { fontSize: 11, fill: "var(--muted)" } }} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }}
              label={{ value: "Vds (V)", angle: -90, position: "insideLeft", offset: 8, style: { fontSize: 11, fill: "var(--muted)" } }} />
            <Tooltip contentStyle={{ fontSize: 11, border: "1px solid var(--border)", borderRadius: 5 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="vds_meas" name="Measured" stroke="var(--success)" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="vds_fit" name="Fitted" stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
