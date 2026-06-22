// App.tsx - 主入口
import { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { DataBrowser } from "./components/DataBrowser";
import { CurveVisualizer } from "./components/CurveVisualizer";
import { ModelEditor } from "./components/ModelEditor";
import { FittingPipeline } from "./components/FittingPipeline";
import { ValidateScreen } from "./components/ValidateScreen";
import { ExportScreen } from "./components/ExportScreen";
import { SettingsScreen } from "./components/SettingsScreen";
import { AppProvider, useApp } from "../lib/store";
import type { NavSection } from "../lib/types";

function AppInner() {
  const [activeNav, setActiveNav] = useState<NavSection>("dashboard");
  const { refreshBackend } = useApp();
  // 启动时检查 backend
  useEffect(() => { refreshBackend(); }, [refreshBackend]);

  return (
    <div
      style={{
        display: "flex",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        backgroundColor: "var(--bg)",
        color: "var(--text)",
        fontSize: 13,
      }}
    >
      <Sidebar activeNav={activeNav} onNavChange={setActiveNav} />
      <main
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {activeNav === "dashboard" && <Dashboard />}
        {activeNav === "data" && <DataBrowser />}
        {activeNav === "curve" && <CurveVisualizer />}
        {activeNav === "model" && <ModelEditor />}
        {activeNav === "fitting" && <FittingPipeline />}
        {activeNav === "validate" && <ValidateScreen />}
        {activeNav === "export" && <ExportScreen />}
        {activeNav === "settings" && <SettingsScreen />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
