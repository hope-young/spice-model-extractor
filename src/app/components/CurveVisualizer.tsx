// CurveVisualizer.tsx - 曲线可视化器（核心屏幕）
import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { TrendingUp, Search, Download, Eye, EyeOff } from "lucide-react";
import { Card, CardHeader, Button, Badge, Input, Select } from "./ui";

type CurveType = "idvg" | "idvd" | "cv" | "qg" | "diode";

interface Curve {
  name: string;
  type: CurveType;
  color: string;
  visible: boolean;
  fit?: boolean;
}

const allCurves: Curve[] = [
  { name: "Id-Vg @Vds=5V, T=25°C", type: "idvg", color: "#0d99ff", visible: true, fit: true },
  { name: "Id-Vg @Vds=5V, T=150°C", type: "idvg", color: "#f24822", visible: true },
  { name: "Id-Vg @Vds=0.5V, T=25°C", type: "idvg", color: "#14ae5c", visible: false },
  { name: "Id-Vd @Vgs=10V", type: "idvd", color: "#0d99ff", visible: true, fit: true },
  { name: "Id-Vd @Vgs=8V", type: "idvd", color: "#9b59b6", visible: true },
  { name: "Coss @25V", type: "cv", color: "#0d99ff", visible: true, fit: true },
  { name: "Crss @25V", type: "cv", color: "#f24822", visible: true },
  { name: "Qg @20V", type: "qg", color: "#0d99ff", visible: true },
  { name: "Body Diode @25°C", type: "diode", color: "#14ae5c", visible: false },
];

// 生成 mock 数据
function generateMockData(type: CurveType, fit: boolean = false) {
  const points: { x: number; y: number; yfit?: number }[] = [];
  let n = 50;
  let xMax = 5;
  if (type === "idvg") { n = 60; xMax = 5.5; }
  else if (type === "idvd") { n = 40; xMax = 10; }
  else if (type === "cv") { n = 30; xMax = 50; }
  else if (type === "qg") { n = 40; xMax = 10; }
  else if (type === "diode") { n = 30; xMax = 1.2; }

  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * xMax;
    let y = 0;
    if (type === "idvg") {
      // MOSFET Id-Vg: subthreshold + linear
      const vth = 3.0;
      if (x < vth) y = 1e-7 * Math.exp((x - vth) * 8);
      else y = 10 * (x - vth) * (x - vth) + 0.5;
    } else if (type === "idvd") {
      // Id-Vd: linear then saturation
      y = 100 * (1 - Math.exp(-x / 2)) + (x > 1 ? (x - 1) * 10 : 0);
    } else if (type === "cv") {
      // C-V: decrease with Vds
      y = 1e4 / Math.sqrt(x + 0.5) + 100;
    } else if (type === "qg") {
      // Qg: monotonic increasing
      y = 20 * x + 5;
    } else if (type === "diode") {
      // Diode: exponential
      y = 1e-9 * (Math.exp(x * 30) - 1);
    }
    if (fit) {
      const yfit = y * (1 + (Math.random() - 0.5) * 0.05);
      points.push({ x, y, yfit });
    } else {
      points.push({ x, y });
    }
  }
  return points;
}

export function CurveVisualizer() {
  const [curves, setCurves] = useState<Curve[]>(allCurves);
  const [activeType, setActiveType] = useState<CurveType>("idvg");
  const [logScale, setLogScale] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const visibleCurves = useMemo(
    () => curves.filter((c) => c.type === activeType && c.visible && c.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [curves, activeType, searchTerm]
  );

  const toggleVisibility = (name: string) => {
    setCurves((prev) => prev.map((c) => (c.name === name ? { ...c, visible: !c.visible } : c)));
  };

  return (
    <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Curve Visualizer</h1>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>
            {visibleCurves.length} of {curves.length} curves visible
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Badge variant={logScale ? "primary" : "default"} onClick={() => setLogScale(!logScale)} style={{ cursor: "pointer" }}>
            {logScale ? "LOG" : "LIN"}
          </Badge>
          <Button variant="outline" size="sm">
            <Download size={12} style={{ marginRight: 4 }} />Export PNG
          </Button>
        </div>
      </div>

      {/* Body: 3-pane */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left: curve tree */}
        <div style={{ width: 240, borderRight: "1px solid var(--border)", background: "var(--surface)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 8 }}>
            <Input
              size="sm"
              placeholder="Search curves..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div style={{ padding: "0 8px 4px", display: "flex", gap: 4, flexWrap: "wrap" }}>
            {(["idvg", "idvd", "cv", "qg", "diode"] as CurveType[]).map((t) => (
              <Badge
                key={t}
                variant={activeType === t ? "primary" : "default"}
                onClick={() => setActiveType(t)}
                style={{ cursor: "pointer" }}
              >
                {t.toUpperCase()}
              </Badge>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
            {curves
              .filter((c) => c.type === activeType)
              .map((c) => (
                <div
                  key={c.name}
                  onClick={() => toggleVisibility(c.name)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 8px",
                    borderRadius: 4,
                    cursor: "pointer",
                    backgroundColor: c.visible ? "var(--hover)" : "transparent",
                    fontSize: 11,
                  }}
                >
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: c.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                  {c.fit && <Badge variant="success">fit</Badge>}
                  {c.visible ? <Eye size={11} color="var(--muted)" /> : <EyeOff size={11} color="var(--muted)" />}
                </div>
              ))}
          </div>
        </div>

        {/* Center: plot */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 12, overflow: "hidden" }}>
          <Card style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart margin={{ top: 8, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="x"
                  type="number"
                  tick={{ fontSize: 10, fill: "var(--muted)" }}
                  stroke="var(--border)"
                  label={{ value: xAxisLabel(activeType), position: "insideBottom", offset: -8, style: { fontSize: 11, fill: "var(--muted)" } }}
                />
                <YAxis
                  scale={logScale ? "log" : "linear"}
                  domain={logScale ? ["auto", "auto"] : [0, "auto"]}
                  tick={{ fontSize: 10, fill: "var(--muted)" }}
                  stroke="var(--border)"
                  allowDataOverflow={logScale}
                  label={{ value: yAxisLabel(activeType), angle: -90, position: "insideLeft", offset: 8, style: { fontSize: 11, fill: "var(--muted)" } }}
                />
                <Tooltip
                  contentStyle={{
                    background: "#fff",
                    border: "1px solid var(--border)",
                    borderRadius: 5,
                    fontSize: 11,
                  }}
                  formatter={(v: number) => v.toExponential(2)}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                {visibleCurves.map((c) => {
                  const data = generateMockData(c.type, !!c.fit);
                  return (
                    <Line
                      key={c.name}
                      data={data}
                      type="monotone"
                      dataKey="y"
                      name={c.name}
                      stroke={c.color}
                      strokeWidth={1.5}
                      dot={false}
                      strokeDasharray={c.fit ? "5 3" : ""}
                    />
                  );
                })}
                {visibleCurves.some((c) => c.fit) &&
                  visibleCurves
                    .filter((c) => c.fit)
                    .flatMap((c) =>
                      generateMockData(c.type, true).map((d, i) => (
                        <Line
                          key={`${c.name}-fit-${i}`}
                          data={[d]}
                          type="monotone"
                          dataKey="yfit"
                          stroke={c.color}
                          strokeWidth={1.5}
                          strokeDasharray="5 3"
                          dot={false}
                          legendType="none"
                        />
                      ))
                    )}
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Right: metadata + FoM */}
        <div style={{ width: 300, borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--surface)" }}>
          <div style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Metadata</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <MetaRow label="Type" value={activeType.toUpperCase()} />
              <MetaRow label="Curves" value={String(visibleCurves.length)} />
              <MetaRow label="Temperature" value="25°C / 150°C" />
              <MetaRow label="Vds / Vgs" value="0.5V / 5V" />
              <MetaRow label="Source" value="datademo/SDH10N2P1WC-AA_SPICE_Data.xlsx" mono />
            </div>
          </div>

          <div style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Figure of Merit</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {activeType === "idvg" && (
                <>
                  <FoMRow label="Vth" value="2.94 V" method="Id=1e-7A" />
                  <FoMRow label="Ion" value="78.5 A" method="@Vg=10V" />
                  <FoMRow label="Ioff" value="3.2e-9 A" method="@Vg=0V" />
                  <FoMRow label="SS" value="320 mV/dec" />
                  <FoMRow label="Gm_max" value="255 S" />
                </>
              )}
              {activeType === "idvd" && (
                <>
                  <FoMRow label="Rds(on)" value="1.85 mΩ" method="@Vg=10V" />
                  <FoMRow label="Vsat" value="9.5e4 m/s" />
                  <FoMRow label="Ron @Vg=5V" value="3.5 mΩ" />
                </>
              )}
              {activeType === "cv" && (
                <>
                  <FoMRow label="Ciss @25V" value="13.1 nF" />
                  <FoMRow label="Coss @25V" value="4.75 nF" />
                  <FoMRow label="Crss @25V" value="174 pF" />
                  <FoMRow label="Eoss" value="9.5 µJ" />
                </>
              )}
              {activeType === "qg" && (
                <>
                  <FoMRow label="Qg" value="153.99 nC" />
                  <FoMRow label="Qgd" value="15.87 nC" />
                  <FoMRow label="Qgs" value="67.61 nC" />
                  <FoMRow label="Vgs(pl)" value="4.87 V" />
                </>
              )}
              {activeType === "diode" && (
                <>
                  <FoMRow label="Vsd@10A" value="0.9 V" />
                  <FoMRow label="Vf temp coef" value="-1.1 mV/°C" />
                </>
              )}
            </div>
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ padding: 10, borderTop: "1px solid var(--border)" }}>
            <Button variant="primary" size="sm" style={{ width: "100%" }}>
              <TrendingUp size={12} style={{ marginRight: 4 }} />Fit this curve
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function xAxisLabel(type: CurveType): string {
  return { idvg: "Vgs (V)", idvd: "Vds (V)", cv: "Vds (V)", qg: "Vgs (V)", diode: "Vsd (V)" }[type];
}

function yAxisLabel(type: CurveType): string {
  return { idvg: "Id (A)", idvd: "Id (A)", cv: "Capacitance (pF)", qg: "Qg (nC)", diode: "Is (A)" }[type];
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span style={{ color: "var(--text)", fontFamily: mono ? "'JetBrains Mono', Consolas, monospace" : "'Inter', sans-serif" }}>{value}</span>
    </div>
  );
}

function FoMRow({ label, value, method }: { label: string; value: string; method?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0" }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <div style={{ textAlign: "right" }}>
        <div style={{ color: "var(--text)", fontFamily: "'JetBrains Mono', Consolas, monospace", fontWeight: 500 }}>{value}</div>
        {method && <div style={{ color: "var(--muted)", fontSize: 9 }}>{method}</div>}
      </div>
    </div>
  );
}
