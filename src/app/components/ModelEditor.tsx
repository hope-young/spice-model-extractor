// ModelEditor.tsx - BSIM3 参数编辑器
import { useState, useMemo } from "react";
import { Search, Save, RotateCcw, Copy, ChevronRight, ChevronDown, Download, Activity } from "lucide-react";
import { Card, CardHeader, Button, Badge, Input } from "./ui";
import { BSIM3_PARAMS } from "../../lib/constants";
import type { BSIM3ParamSpec } from "../../lib/types";

interface ParamCategory {
  name: string;
  params: BSIM3ParamSpec[];
  count: number;
}

const groupByCategory = (params: BSIM3ParamSpec[]): ParamCategory[] => {
  const map = new Map<string, BSIM3ParamSpec[]>();
  params.forEach((p) => {
    if (!map.has(p.category)) map.set(p.category, []);
    map.get(p.category)!.push(p);
  });
  return Array.from(map.entries()).map(([name, ps]) => ({ name, params: ps, count: ps.length }));
};

export function ModelEditor() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<"all" | "fitted" | "locked" | "oob">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["Threshold", "Mobility", "Saturation"]));
  const [params, setParams] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    BSIM3_PARAMS.forEach((p) => (initial[p.name] = p.default));
    return initial;
  });

  const categories = useMemo(() => groupByCategory(BSIM3_PARAMS), []);

  const toggleExpand = (cat: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const updateParam = (name: string, value: number) => {
    setParams((prev) => ({ ...prev, [name]: value }));
  };

  const resetParam = (name: string) => {
    const spec = BSIM3_PARAMS.find((p) => p.name === name);
    if (spec) updateParam(name, spec.default);
  };

  const oobCount = BSIM3_PARAMS.filter((p) => {
    const v = params[p.name];
    return v < p.lower || v > p.upper;
  }).length;

  return (
    <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>BSIM3 Model Editor</h1>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>
            {BSIM3_PARAMS.length} parameters  ·  {oobCount} out-of-bounds  ·  6 stages
          </div>
        </div>
        <Button variant="outline" size="sm">
          <Save size={12} style={{ marginRight: 4 }} />Save
        </Button>
        <Button variant="outline" size="sm">
          <RotateCcw size={12} style={{ marginRight: 4 }} />Reset
        </Button>
        <Button variant="primary" size="sm">
          <Download size={12} style={{ marginRight: 4 }} />Export .lib
        </Button>
      </div>

      {/* Body: 3 columns */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left: category tree */}
        <div style={{ width: 240, borderRight: "1px solid var(--border)", background: "var(--surface)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 8 }}>
            <Input
              size="sm"
              placeholder="Search params..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div style={{ padding: "0 8px 4px", display: "flex", gap: 4, flexWrap: "wrap" }}>
            {(["all", "fitted", "locked", "oob"] as const).map((f) => (
              <Badge
                key={f}
                variant={filter === f ? "primary" : "default"}
                onClick={() => setFilter(f)}
                style={{ cursor: "pointer" }}
              >
                {f.toUpperCase()}
              </Badge>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 4 }}>
            {categories.map((cat) => (
              <div key={cat.name}>
                <div
                  onClick={() => toggleExpand(cat.name)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "5px 8px",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text)",
                  }}
                >
                  {expanded.has(cat.name) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {cat.name}
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted)" }}>{cat.count}</span>
                </div>
                {expanded.has(cat.name) && cat.params.map((p) => {
                  const oob = params[p.name] < p.lower || params[p.name] > p.upper;
                  return (
                    <div
                      key={p.name}
                      onClick={() => {
                        // could scroll to this param
                      }}
                      style={{
                        padding: "3px 8px 3px 24px",
                        fontSize: 11,
                        fontFamily: "'JetBrains Mono', Consolas, monospace",
                        color: oob ? "var(--error)" : "var(--text)",
                        cursor: "pointer",
                        borderLeft: "2px solid transparent",
                      }}
                    >
                      {p.name}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Center: param table */}
        <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
          {categories.map((cat) =>
            expanded.has(cat.name) ? (
              <Card key={cat.name} style={{ marginBottom: 12 }}>
                <CardHeader title={cat.name} subtitle={`${cat.params.length} parameters`} />
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      {["Param", "Initial", "Current", "Fitted", "Lower", "Upper", "Unit", "Stage", "Δ"].map((h) => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cat.params.map((p) => {
                      const v = params[p.name];
                      const oob = v < p.lower || v > p.upper;
                      return (
                        <tr key={p.name} style={{ background: oob ? "#fff5f5" : "transparent" }}>
                          <td style={{ ...td, fontWeight: 600, color: oob ? "var(--error)" : "var(--text)" }}>{p.name}</td>
                          <td style={{ ...td, color: "var(--muted)" }}>{formatNum(p.default)}</td>
                          <td style={td}>
                            <Input
                              size="sm"
                              value={String(v)}
                              onChange={(e) => {
                                const newVal = parseFloat(e.target.value);
                                if (!isNaN(newVal)) updateParam(p.name, newVal);
                              }}
                              onDoubleClick={() => resetParam(p.name)}
                              style={{
                                width: 100,
                                background: "var(--bg)",
                                borderColor: oob ? "var(--error)" : "var(--border)",
                                color: oob ? "var(--error)" : "var(--text)",
                              }}
                            />
                          </td>
                          <td style={{ ...td, color: "var(--muted)" }}>—</td>
                          <td style={{ ...td, color: "var(--muted)" }}>{formatNum(p.lower)}</td>
                          <td style={{ ...td, color: "var(--muted)" }}>{formatNum(p.upper)}</td>
                          <td style={{ ...td, color: "var(--muted)" }}>{p.unit}</td>
                          <td style={td}><Badge variant="primary">{p.stage}</Badge></td>
                          <td style={{ ...td, color: "var(--muted)" }}>{Math.abs(v - p.default).toExponential(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            ) : null
          )}
        </div>

        {/* Right: diagnostics */}
        <div style={{ width: 300, borderLeft: "1px solid var(--border)", background: "var(--surface)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
            <CardHeader title="Physics Diagnostics" subtitle="Auto-checked" />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <DiagRow pass label="VTH0 in range" detail="3.0 V" />
              <DiagRow pass label="U0 in range" detail="100 cm²/Vs" />
              <DiagRow pass label="Rds temp coefficient" detail="+1.86 (positive, SGT)" />
              <DiagRow warn label="MJSW slightly high" detail="0.33 (typical 0.1-0.3)" />
              <DiagRow pass label="Qg vs ∫C-V" detail="Δ 5.2%" />
              <DiagRow pass label="Corner coverage" detail="-40 / 25 / 150 °C" />
            </div>
          </div>

          <div style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
            <CardHeader title="Quick Actions" />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Button variant="outline" size="sm" style={{ justifyContent: "flex-start" }}>
                <Activity size={12} style={{ marginRight: 6 }} />Sensitivity analysis
              </Button>
              <Button variant="outline" size="sm" style={{ justifyContent: "flex-start" }}>
                <Copy size={12} style={{ marginRight: 6 }} />Copy as JSON
              </Button>
              <Button variant="outline" size="sm" style={{ justifyContent: "flex-start" }}>
                <Download size={12} style={{ marginRight: 6 }} />Export .lib
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "5px 10px",
  color: "var(--muted)",
  fontWeight: 500,
  borderBottom: "1px solid var(--border)",
  fontSize: 10,
};
const td: React.CSSProperties = {
  padding: "4px 10px",
  color: "var(--text)",
  fontSize: 11,
};

function formatNum(n: number): string {
  if (n === 0) return "0";
  if (Math.abs(n) < 1e-3 || Math.abs(n) > 1e6) return n.toExponential(2);
  return n.toFixed(4).replace(/\.?0+$/, "");
}

function DiagRow({ pass, warn, label, detail }: { pass?: boolean; warn?: boolean; label: string; detail?: string }) {
  const status = pass ? "✓" : warn ? "⚠" : "✗";
  const color = pass ? "var(--success)" : warn ? "var(--warning)" : "var(--error)";
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "4px 0", fontSize: 11 }}>
      <span style={{ color, fontWeight: 600, minWidth: 12 }}>{status}</span>
      <div style={{ flex: 1 }}>
        <div style={{ color: "var(--text)" }}>{label}</div>
        {detail && <div style={{ color: "var(--muted)", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>{detail}</div>}
      </div>
    </div>
  );
}
