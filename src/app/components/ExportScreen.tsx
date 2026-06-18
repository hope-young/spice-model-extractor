// ExportScreen.tsx - 导出 .lib / .subckt
import { useState } from "react";
import { Download, FileText, Copy, CheckCircle2, Package, Copy as CopyIcon } from "lucide-react";
import { Card, CardHeader, Button, Badge, Input, Select } from "./ui";

export function ExportScreen() {
  const [format, setFormat] = useState<"subckt" | "bsim3">("subckt");
  const [subcktName, setSubcktName] = useState("SDH10N2P1");
  const [includeDiode, setIncludeDiode] = useState(true);
  const [rgOhm, setRgOhm] = useState("1.6");
  const [copied, setCopied] = useState(false);

  const libPreview = format === "subckt"
    ? `* SpiceBuilder Export - SDH10N2P1WC-AA
* Date: 2026-06-18
* Format: B (subckt wrapper, recommended)

.SUBCKT ${subcktName} D G S
M1 D_int G_int S S BSIM3_core L=1u W=1u
Rg G G_int ${rgOhm}
Rd D D_int 9.225e-05
Rs S_int S 9.225e-05
${includeDiode ? "Dbody S D Dbody_diode\n.MODEL Dbody_diode D (IS=8.69e-10 N=1.5 BV=104 IBV=1e-3)" : "* Dbody omitted"}
.ENDS

.MODEL BSIM3_core NMOS LEVEL=49
+VTH0=2.94
+K1=0.5
+K2=0
+U0=412
+VSAT=8.5e4
+PCLM=0.5
+CGSO=5.1e-10
+CGDO=8.4e-11
+MJ=0.482
+...
.END`
    : `* SpiceBuilder Export - SDH10N2P1WC-AA
* Format: A (pure BSIM3 .model)

.MODEL nmos1 NMOS LEVEL=49
+VTH0=2.94
+K1=0.5
+U0=412
+VSAT=8.5e4
+...
.END`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(libPreview).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Export SPICE Model</h1>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
          Export fitted BSIM3 model as .lib or subckt file
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
        {/* Left: config */}
        <Card>
          <CardHeader title="Export Configuration" />

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Format</label>
              <div style={{ display: "flex", gap: 6 }}>
                <Button
                  variant={format === "subckt" ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setFormat("subckt")}
                  style={{ flex: 1 }}
                >
                  <Package size={12} style={{ marginRight: 4 }} />Subckt
                </Button>
                <Button
                  variant={format === "bsim3" ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setFormat("bsim3")}
                  style={{ flex: 1 }}
                >
                  <FileText size={12} style={{ marginRight: 4 }} />BSIM3
                </Button>
              </div>
            </div>

            {format === "subckt" && (
              <>
                <div>
                  <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Subckt Name</label>
                  <Input size="sm" value={subcktName} onChange={(e) => setSubcktName(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Gate Resistance (Ω)</label>
                  <Input size="sm" value={rgOhm} onChange={(e) => setRgOhm(e.target.value)} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                  <input type="checkbox" id="diode" checked={includeDiode} onChange={(e) => setIncludeDiode(e.target.checked)} />
                  <label htmlFor="diode" style={{ fontSize: 12, color: "var(--text)", cursor: "pointer" }}>Include body diode</label>
                </div>
              </>
            )}

            <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />

            <div>
              <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Output Path</label>
              <Input size="sm" defaultValue="C:/models/SDH10N2P1WC-AA.lib" />
            </div>

            <Button variant="primary" style={{ width: "100%" }}>
              <Download size={13} style={{ marginRight: 6 }} />Export to file
            </Button>
            <Button variant="outline" onClick={copyToClipboard} style={{ width: "100%" }}>
              {copied ? (
                <><CheckCircle2 size={13} style={{ marginRight: 6, color: "var(--success)" }} />Copied!</>
              ) : (
                <><CopyIcon size={13} style={{ marginRight: 6 }} />Copy to clipboard</>
              )}
            </Button>
          </div>
        </Card>

        {/* Right: preview */}
        <Card>
          <CardHeader
            title="Preview"
            subtitle={format === "subckt" ? "Subckt wrapper format" : "BSIM3 .model format"}
            action={
              <div style={{ display: "flex", gap: 6 }}>
                <Badge variant="primary">BSIM3v3</Badge>
                <Badge variant="success">49 params</Badge>
              </div>
            }
          />
          <pre
            style={{
              fontFamily: "'JetBrains Mono', Consolas, monospace",
              fontSize: 11,
              lineHeight: 1.6,
              padding: 12,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 5,
              overflow: "auto",
              maxHeight: 500,
              margin: 0,
              color: "var(--text)",
            }}
          >
            {libPreview}
          </pre>
        </Card>
      </div>
    </div>
  );
}
