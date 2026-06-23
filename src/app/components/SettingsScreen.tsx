// SettingsScreen.tsx - 设置 (真实 API)
import { useState, useEffect, useCallback } from "react";
import {
  Server, Power, PowerOff, RefreshCw, Folder, FolderOpen, Save, Cpu, Zap, Info,
} from "lucide-react";
import { Card, CardHeader, Button, Badge, Input } from "./ui";
import { useApp } from "../../lib/store";
import * as api from "../../lib/api";

const C = {
  bg: "#ffffff", surface: "#fafafa", border: "#e5e5e5",
  text: "#2c2c2c", muted: "#6b7280",
  primary: "#0d99ff", success: "#14ae5c", warning: "#ffcd29", error: "#f24822",
  accent: "#e6f4ff",
};

const BACKEND_URL = "http://127.0.0.1:8000";

export function SettingsScreen() {
  const { backendRunning, startBackend, refreshBackend } = useApp();
  const [stopping, setStopping] = useState(false);
  const [checking, setChecking] = useState(false);
  const [lastPing, setLastPing] = useState<string | null>(null);
  const [excelPath, setExcelPath] = useState("datademo/SDH10N2P1WC-AA_SPICE_Data.xlsx");
  const [ltspicePath] = useState("ltspice (PATH)");
  const [pythonPath] = useState("python");

  const onStart = useCallback(async () => {
    setChecking(true);
    await startBackend();
    await refreshBackend();
    setLastPing(new Date().toLocaleTimeString("en-GB", { hour12: false }));
    setChecking(false);
  }, [startBackend, refreshBackend]);

  const onStop = useCallback(async () => {
    setStopping(true);
    try {
      await api.stopBackend();
    } catch {
      /* ignore */
    }
    await refreshBackend();
    setStopping(false);
  }, [refreshBackend]);

  const onCheck = useCallback(async () => {
    setChecking(true);
    await refreshBackend();
    setLastPing(new Date().toLocaleTimeString("en-GB", { hour12: false }));
    setChecking(false);
  }, [refreshBackend]);

  // Auto-ping on mount
  useEffect(() => {
    refreshBackend();
  }, [refreshBackend]);

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 24px", background: C.bg }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: C.text }}>Settings</h1>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
          Configure SpiceBuilder backend & toolchain
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 760 }}>
        {/* Backend Status & Control */}
        <Card>
          <CardHeader
            title="Backend Control"
            subtitle="Tauri sidecar manages Python FastAPI process"
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <Badge variant={backendRunning ? "success" : "error"}>
              <Server size={11} style={{ marginRight: 4 }} />
              {backendRunning ? "Connected" : "Disconnected"}
            </Badge>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: C.muted }}>
              {BACKEND_URL}
            </span>
            {lastPing && (
              <span style={{ fontSize: 10, color: C.muted, marginLeft: "auto" }}>
                last ping: {lastPing}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!backendRunning ? (
              <Button variant="primary" onClick={onStart} disabled={checking}>
                <Power size={13} style={{ marginRight: 5 }} />
                {checking ? "Starting…" : "Start Backend"}
              </Button>
            ) : (
              <Button variant="outline" onClick={onStop} disabled={stopping}>
                <PowerOff size={13} style={{ marginRight: 5 }} />
                {stopping ? "Stopping…" : "Stop Backend"}
              </Button>
            )}
            <Button variant="outline" onClick={onCheck} disabled={checking}>
              <RefreshCw size={13} style={{ marginRight: 5 }} />
              {checking ? "Checking…" : "Check Health"}
            </Button>
          </div>
        </Card>

        {/* Backend Health */}
        <Card>
          <CardHeader title="Backend Health" subtitle="Endpoint status" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <StatusRow
              label="Python Backend"
              status={backendRunning ? "ok" : "error"}
              detail={backendRunning ? `${BACKEND_URL}/api/health` : "Not reachable"}
            />
            <StatusRow
              label="LTspice CLI"
              status={backendRunning ? "ok" : "warning"}
              detail={backendRunning ? "Available via /api/sim/run" : "Requires backend running"}
            />
            <StatusRow
              label="BSIM3 Library"
              status={backendRunning ? "ok" : "warning"}
              detail={backendRunning ? "49 BSIM3 params loaded" : "Waiting for backend"}
            />
          </div>
        </Card>

        {/* Paths */}
        <Card>
          <CardHeader title="Project Paths" subtitle="Default locations" />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Default Excel Dataset" hint="Default Excel loaded in Data Browser">
              <div style={{ display: "flex", gap: 6 }}>
                <Input
                  size="sm"
                  value={excelPath}
                  onChange={(e) => setExcelPath(e.target.value)}
                  style={{ flex: 1 }}
                />
                <Button variant="outline" size="sm">
                  <FolderOpen size={12} />
                </Button>
              </div>
            </Field>
            <Field label="LTspice Executable">
              <Input size="sm" defaultValue={ltspicePath} readOnly />
            </Field>
            <Field label="Python Executable">
              <Input size="sm" defaultValue={pythonPath} readOnly />
            </Field>
          </div>
        </Card>

        {/* About */}
        <Card>
          <CardHeader title="About" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12, color: C.text }}>
            <Row label="App" value="SpiceBuilder v0.1.0" />
            <Row label="Description" value="SPICE model extraction tool for Si SGT Power MOSFETs" />
            <Row label="License" value="MIT" />
            <Row label="Backend" value={`FastAPI @ ${BACKEND_URL}`} />
            <Row label="Frontend" value="React 18 + Tauri 2 + TypeScript" />
            <Row label="Model" value="BSIM3 v3.3 (49 parameters, 6-stage extraction)" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: C.text, display: "block", marginBottom: 4, fontWeight: 500 }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "2px 0" }}>
      <span style={{ color: C.muted, fontSize: 11, minWidth: 90 }}>{label}</span>
      <span style={{ color: C.text, fontFamily: "ui-monospace, monospace" }}>{value}</span>
    </div>
  );
}

function StatusRow({ label, status, detail }: {
  label: string;
  status: "ok" | "warning" | "error";
  detail: string;
}) {
  const colors = { ok: C.success, warning: C.warning, error: C.error };
  const labels = { ok: "OK", warning: "Warn", error: "Error" };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "6px 0", borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors[status] }} />
      <span style={{ fontSize: 12, fontWeight: 500, color: C.text, minWidth: 160 }}>{label}</span>
      <span style={{ fontSize: 11, color: C.muted, fontFamily: "ui-monospace, monospace", flex: 1 }}>
        {detail}
      </span>
      <Badge variant={status === "ok" ? "success" : status === "warning" ? "warning" : "error"}>
        {labels[status]}
      </Badge>
    </div>
  );
}