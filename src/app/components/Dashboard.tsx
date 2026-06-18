// Dashboard.tsx - 项目概览
import {
  Activity, FileText, Clock, TrendingUp, Zap, Cpu
} from "lucide-react";
import { Card, CardHeader, Badge } from "./ui";
import { MOCK_PROJECT } from "../../lib/constants";

export function Dashboard() {
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Dashboard</h1>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          Project: {MOCK_PROJECT.name}  ·  {MOCK_PROJECT.device}  ·  Last fitted 2 min ago
        </div>
      </div>

      {/* Key metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <MetricCard
          icon={<Activity size={14} color="var(--primary)" />}
          label="Overall RMS"
          value="2.35%"
          trend="↓ 0.12"
          trendUp={false}
          color="var(--success)"
        />
        <MetricCard
          icon={<FileText size={14} color="var(--primary)" />}
          label="Curves"
          value="5"
          sub="139 + 43 + 101 + 50 pts"
          color="var(--text)"
        />
        <MetricCard
          icon={<Cpu size={14} color="var(--primary)" />}
          label="BSIM3 Params"
          value="49"
          sub="6 stages · 5 done"
          color="var(--text)"
        />
        <MetricCard
          icon={<Clock size={14} color="var(--primary)" />}
          label="Last Fit"
          value="8.2s"
          sub="25 iterations"
          color="var(--text)"
        />
      </div>

      {/* Two columns */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 20 }}>
        {/* Device info */}
        <Card>
          <CardHeader
            title="Device Information"
            subtitle={MOCK_PROJECT.device}
            action={<Badge variant="primary">100V N-Ch SGT</Badge>}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px" }}>
            <InfoRow label="Part Number" value={MOCK_PROJECT.name} />
            <InfoRow label="Package" value={MOCK_PROJECT.package} />
            <InfoRow label="BVDSS" value={`${MOCK_PROJECT.bvdss} V`} />
            <InfoRow label="ID Rated" value={`${MOCK_PROJECT.id_a} A`} />
            <InfoRow label="RDSon (typ)" value={`${MOCK_PROJECT.rdson_mohm} mΩ`} />
            <InfoRow label="Vth (typ)" value={`${MOCK_PROJECT.vth_v} V`} />
            <InfoRow label="Lot" value={MOCK_PROJECT.lot} useMono />
            <InfoRow label="Test Date" value={MOCK_PROJECT.test_date} />
          </div>
        </Card>

        {/* Key SPICE params */}
        <Card>
          <CardHeader title="Key SPICE Parameters" subtitle="From datasheet" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <ParamRow name="Qg @ 20V" value="153.99 nC" />
            <ParamRow name="Qgd" value="15.87 nC" />
            <ParamRow name="Vgs(pl)" value="4.87 V" />
            <ParamRow name="Ciss @ 25V" value="13.12 nF" />
            <ParamRow name="Coss @ 25V" value="4.75 nF" />
            <ParamRow name="Crss @ 25V" value="174 pF" />
            <ParamRow name="dVth/dT" value="-9.32 mV/°C" useMono />
          </div>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader title="Recent Activity" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ActivityRow
            time="14:22:05"
            icon={<Zap size={11} color="var(--success)" />}
            text="Stage 5 — Output Resistance converged (iter=189, RMSE=4.73%)"
          />
          <ActivityRow
            time="14:21:38"
            icon={<Zap size={11} color="var(--success)" />}
            text="Stage 4 — Saturation Velocity converged (iter=134, RMSE=3.11%)"
          />
          <ActivityRow
            time="14:15:22"
            icon={<TrendingUp size={11} color="var(--primary)" />}
            text="Data cleaning complete — 527 outliers removed"
          />
          <ActivityRow
            time="14:10:33"
            icon={<Zap size={11} color="var(--success)" />}
            text="Stage 1 — Threshold Voltage converged (iter=48, RMSE=0.82%)"
          />
          <ActivityRow
            time="14:08:01"
            icon={<Activity size={11} color="var(--muted)" />}
            text="SpiceBuilder v0.1.0 started"
          />
        </div>
      </Card>
    </div>
  );
}

function MetricCard({
  icon, label, value, sub, trend, trendUp, color,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  trend?: string; trendUp?: boolean; color: string;
}) {
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'JetBrains Mono', Consolas, monospace" }}>{value}</span>
        {trend && (
          <span style={{ fontSize: 11, color: trendUp ? "var(--success)" : "var(--error)" }}>
            {trendUp ? "↑" : "↓"} {trend}
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}

function InfoRow({ label, value, useMono }: { label: string; value: string; useMono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 11, color: "var(--muted)" }}>{label}</span>
      <span
        style={{
          fontSize: 12,
          color: "var(--text)",
          fontFamily: useMono ? "'JetBrains Mono', Consolas, monospace" : "'Inter', 'Segoe UI', system-ui, sans-serif",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ParamRow({ name, value }: { name: string; value: string; useMono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
      <span style={{ fontSize: 12, color: "var(--muted)" }}>{name}</span>
      <span style={{ fontSize: 12, color: "var(--text)", fontFamily: "'JetBrains Mono', Consolas, monospace" }}>{value}</span>
    </div>
  );
}

function ActivityRow({ time, icon, text }: { time: string; icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
      <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'JetBrains Mono', Consolas, monospace", minWidth: 60 }}>{time}</span>
      {icon}
      <span style={{ fontSize: 12, color: "var(--text)" }}>{text}</span>
    </div>
  );
}
