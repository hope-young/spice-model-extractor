// SettingsScreen.tsx - 设置
import { useState } from "react";
import { FolderOpen, RefreshCw, Save, Cpu, Folder, Zap } from "lucide-react";
import { Card, CardHeader, Button, Badge, Input, Select } from "./ui";

export function SettingsScreen() {
  const [ltspicePath, setLtspicePath] = useState("ltspice (PATH)");
  const [pythonPath, setPythonPath] = useState("python");
  const [defaultOptimizer, setDefaultOptimizer] = useState("trf");
  const [eps1, setEps1] = useState("0.001");
  const [eps2, setEps2] = useState("0.001");
  const [eps3, setEps3] = useState("0.001");
  const [parallelJobs, setParallelJobs] = useState("4");

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Settings</h1>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Configure SpiceBuilder preferences</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
        {/* Toolchain */}
        <Card>
          <CardHeader title="Toolchain" subtitle="External tool paths" />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field
              label="LTspice Executable"
              hint="Leave as 'ltspice' to use PATH. Supports -b batch mode (no GUI)."
            >
              <div style={{ display: "flex", gap: 6 }}>
                <Input
                  size="sm"
                  value={ltspicePath}
                  onChange={(e) => setLtspicePath(e.target.value)}
                  style={{ flex: 1 }}
                />
                <Button variant="outline" size="sm">
                  <FolderOpen size={12} />
                </Button>
                <Button variant="outline" size="sm">
                  <RefreshCw size={12} />
                </Button>
              </div>
            </Field>

            <Field
              label="Python Executable"
              hint="Python 3.10+ with spicebuilder installed"
            >
              <Input size="sm" value={pythonPath} onChange={(e) => setPythonPath(e.target.value)} />
            </Field>
          </div>
        </Card>

        {/* Optimizer defaults */}
        <Card>
          <CardHeader title="Optimizer Defaults" subtitle="Default scipy.optimize settings" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Algorithm">
              <Select size="sm" value={defaultOptimizer} onChange={(e) => setDefaultOptimizer(e.target.value)}>
                <option value="trf">Trust Region Reflective (default)</option>
                <option value="lm">Levenberg-Marquardt</option>
                <option value="dogbox">Dogbox</option>
                <option value="l-bfgs-b">L-BFGS-B</option>
                <option value="differential_evolution">Differential Evolution</option>
                <option value="bayesian">Bayesian Optimization</option>
              </Select>
            </Field>

            <Field label="Max Iterations">
              <Input size="sm" defaultValue="1000" />
            </Field>

            <Field label="eps1 (ftol)">
              <Input size="sm" value={eps1} onChange={(e) => setEps1(e.target.value)} />
            </Field>

            <Field label="eps2 (xtol)">
              <Input size="sm" value={eps2} onChange={(e) => setEps2(e.target.value)} />
            </Field>

            <Field label="eps3 (gtol)">
              <Input size="sm" value={eps3} onChange={(e) => setEps3(e.target.value)} />
            </Field>

            <Field label="Parallel Jobs">
              <Input size="sm" value={parallelJobs} onChange={(e) => setParallelJobs(e.target.value)} />
            </Field>
          </div>
        </Card>

        {/* Paths */}
        <Card>
          <CardHeader title="Project Paths" subtitle="Default directories" />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Default Project Directory">
              <Input size="sm" defaultValue="C:/spicebuilder/projects" />
            </Field>
            <Field label="Default Output Directory">
              <Input size="sm" defaultValue="C:/spicebuilder/output" />
            </Field>
          </div>
        </Card>

        {/* Status */}
        <Card>
          <CardHeader title="System Status" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <StatusRow label="LTspice" status="connected" detail="ltspice via PATH (v26.0.2)" />
            <StatusRow label="Python Backend" status="connected" detail="python 3.11.9, spicebuilder v0.1.0" />
            <StatusRow label="spicebuilder Library" status="connected" detail="49 BSIM3 params, 6 stages" />
          </div>
        </Card>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="outline">Cancel</Button>
          <Button variant="primary">
            <Save size={13} style={{ marginRight: 5 }} />Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: "var(--text)", display: "block", marginBottom: 4, fontWeight: 500 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function StatusRow({ label, status, detail }: { label: string; status: "connected" | "warning" | "error"; detail: string }) {
  const colors = { connected: "var(--success)", warning: "var(--warning)", error: "var(--error)" };
  const labels = { connected: "已连接", warning: "警告", error: "错误" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors[status] }} />
      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text)", minWidth: 160 }}>{label}</span>
      <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "'JetBrains Mono', monospace", flex: 1 }}>{detail}</span>
      <Badge variant={status === "connected" ? "success" : status === "warning" ? "warning" : "error"}>
        {labels[status]}
      </Badge>
    </div>
  );
}
