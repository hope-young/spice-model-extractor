// DataBrowser.tsx - 数据浏览器
import { useState } from "react";
import { Upload, FileText, Trash2, Eye, Filter, ChevronDown, FolderOpen, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Card, CardHeader, Button, Badge } from "./ui";

interface DataFile {
  name: string;
  type: "idvg" | "idvd" | "cv" | "qg" | "diode";
  points: number;
  status: "loaded" | "cleaned" | "outliers";
  size: string;
}

const mockFiles: DataFile[] = [
  { name: "ID-VGS_5VDS", type: "idvg", points: 139, status: "cleaned", size: "8.2 KB" },
  { name: "ID-VGS_0.5VDS", type: "idvg", points: 202, status: "cleaned", size: "11.4 KB" },
  { name: "ID-VDS", type: "idvd", points: 261, status: "cleaned", size: "15.1 KB" },
  { name: "CissCossCrss-VDS", type: "cv", points: 103, status: "cleaned", size: "6.8 KB" },
  { name: "VGS-Qg", type: "qg", points: 171, status: "loaded", size: "10.5 KB" },
  { name: "IS-VSD", type: "diode", points: 142, status: "outliers", size: "9.0 KB" },
];

const typeLabels: Record<DataFile["type"], string> = {
  idvg: "Id-Vg",
  idvd: "Id-Vd",
  cv: "C-V",
  qg: "Qg",
  diode: "Diode",
};

const statusBadge: Record<DataFile["status"], { variant: "default" | "primary" | "success" | "warning" | "error"; label: string }> = {
  loaded: { variant: "warning", label: "未清洗" },
  cleaned: { variant: "success", label: "已清洗" },
  outliers: { variant: "error", label: "有异常" },
};

export function DataBrowser() {
  const [selected, setSelected] = useState<string | null>("ID-VGS_5VDS");

  return (
    <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Data Browser</h1>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>6 files  ·  1,018 total points  ·  5 cleaned</div>
        </div>
        <Button variant="outline">
          <RefreshCw size={13} style={{ marginRight: 5 }} />Re-scan
        </Button>
        <Button variant="primary">
          <Upload size={13} style={{ marginRight: 5 }} />Import Excel
        </Button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left: file tree */}
        <div style={{ width: 280, borderRight: "1px solid var(--border)", background: "var(--surface)", overflowY: "auto" }}>
          <div style={{ padding: "8px 10px", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Loaded Files
          </div>
          {mockFiles.map((f) => (
            <div
              key={f.name}
              onClick={() => setSelected(f.name)}
              style={{
                padding: "8px 10px",
                cursor: "pointer",
                backgroundColor: selected === f.name ? "var(--accent)" : "transparent",
                borderLeft: selected === f.name ? "3px solid var(--primary)" : "3px solid transparent",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                transition: "background-color 0.1s",
              }}
            >
              <FileText size={13} color={selected === f.name ? "var(--primary)" : "var(--muted)"} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "var(--text)", fontWeight: selected === f.name ? 500 : 400 }}>{f.name}</div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>{typeLabels[f.type]}  ·  {f.points} pts</div>
              </div>
              <Badge variant={statusBadge[f.status].variant}>{statusBadge[f.status].label}</Badge>
            </div>
          ))}
        </div>

        {/* Right: file detail */}
        <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
          {selected ? <FileDetail file={mockFiles.find((f) => f.name === selected)!} /> : <EmptyState />}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted)" }}>
      <FolderOpen size={48} style={{ marginBottom: 12, opacity: 0.4 }} />
      <div style={{ fontSize: 14 }}>Select a file from the left to view details</div>
    </div>
  );
}

function FileDetail({ file }: { file: DataFile }) {
  // Mock preview rows
  const previewRows = Array.from({ length: 8 }, (_, i) => ({
    v: (i * file.points / 10).toFixed(3),
    target: (Math.random() * 100).toFixed(2),
  }));

  return (
    <div>
      <Card>
        <CardHeader
          title={file.name}
          subtitle={`${typeLabels[file.type]}  ·  ${file.points} data points  ·  ${file.size}`}
          action={
            <div style={{ display: "flex", gap: 6 }}>
              <Button variant="outline" size="sm">
                <Eye size={12} style={{ marginRight: 4 }} />Preview
              </Button>
              <Button variant="outline" size="sm">
                <Filter size={12} style={{ marginRight: 4 }} />Filter
              </Button>
              <Button variant="ghost" size="sm">
                <Trash2 size={12} />
              </Button>
            </div>
          }
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 8 }}>
          <Stat label="Total points" value={String(file.points)} />
          <Stat label="Outliers" value={file.status === "outliers" ? "12" : "0"} color={file.status === "outliers" ? "var(--error)" : "var(--success)"} />
          <Stat label="NaN" value="0" color="var(--success)" />
          <Stat label="Duplicates" value="0" color="var(--success)" />
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <CardHeader title="Data Preview" subtitle="First 8 rows" />
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              <th style={th}>#</th>
              <th style={th}>ivar (V)</th>
              <th style={th}>dvar ({typeLabels[file.type].split("-")[1] || "value"})</th>
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={td}>{i + 1}</td>
                <td style={{ ...td, fontFamily: "'JetBrains Mono', Consolas, monospace" }}>{row.v}</td>
                <td style={{ ...td, fontFamily: "'JetBrains Mono', Consolas, monospace" }}>{row.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "5px 12px",
  color: "var(--muted)",
  fontWeight: 500,
  borderBottom: "1px solid var(--border)",
  fontSize: 10,
};
const td: React.CSSProperties = {
  padding: "5px 12px",
  color: "var(--text)",
  fontSize: 11,
};

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: "8px 10px", background: "var(--bg)", borderRadius: 5, border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: color || "var(--text)", fontFamily: "'JetBrains Mono', Consolas, monospace" }}>{value}</div>
    </div>
  );
}
