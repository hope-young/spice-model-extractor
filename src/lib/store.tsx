// store.ts - 全局项目状态 (Context)

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { SpiceDataSet, BSIM3Model, FittingResult } from "./types";
import * as api from "./api";

export interface AppState {
  // 项目
  projectId: string | null;
  dataset: (SpiceDataSet & { project_id?: string }) | null;
  model: BSIM3Model | null;
  fitResult: FittingResult | null;
  // Backend
  backendRunning: boolean;
  logs: Array<{ ts: string; level: string; msg: string }>;
}

export interface AppActions {
  loadProject: (filepath: string) => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  runFit: (useLtspice?: boolean) => Promise<void>;
  exportLib: (outputPath: string, format?: string) => Promise<string>;
  refreshBackend: () => Promise<void>;
  startBackend: () => Promise<void>;
  setLog: (level: string, msg: string) => void;
}

const AppContext = createContext<(AppState & AppActions) | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [dataset, setDataset] = useState<SpiceDataSet | null>(null);
  const [model, setModel] = useState<BSIM3Model | null>(null);
  const [fitResult, setFitResult] = useState<FittingResult | null>(null);
  const [backendRunning, setBackendRunning] = useState(false);
  const [logs, setLogs] = useState<Array<{ ts: string; level: string; msg: string }>>([]);

  const setLog = useCallback((level: string, msg: string) => {
    const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
    setLogs((prev) => [...prev.slice(-200), { ts, level, msg }]);
  }, []);

  const refreshBackend = useCallback(async () => {
    const running = await api.checkBackend();
    setBackendRunning(running);
    if (running) setLog("info", "Python backend connected");
    else setLog("warn", "Python backend NOT running");
  }, [setLog]);

  const startBackend = useCallback(async () => {
    setLog("info", "Starting Python backend...");
    const ok = await api.startBackend();
    setBackendRunning(ok);
    setLog(ok ? "success" : "error", ok ? "Python backend started" : "Backend start failed");
  }, [setLog]);

  const loadProject = useCallback(async (filepath: string) => {
    setLog("info", `Loading ${filepath}...`);
    try {
      const ds = await api.loadData(filepath);
      const pid = (ds as any).project_id;
      setProjectId(pid);
      setDataset(ds);
      setLog("success", `Loaded project ${pid?.slice(0, 8)}: ${ds.device_info.part_number}`);
      // 拉取初始 model
      if (pid) {
        const m = await api.getModel(pid);
        setModel(m);
        setLog("info", `Initialized ${Object.keys(m.params || {}).length} BSIM3 params`);
      }
    } catch (e: any) {
      setLog("error", `Load failed: ${e.message}`);
      throw e;
    }
  }, [setLog]);

  const selectProject = useCallback(async (pid: string) => {
    setLog("info", `Switching to project ${pid.slice(0, 8)}...`);
    try {
      setProjectId(pid);
      const m = await api.getModel(pid);
      setModel(m);
      setFitResult(null);
      // dataset 只有 device_info 需要重建（轻量）
      const ds: any = {
        device_info: (m as any).device_info || {},
        key_params: (m as any).key_params || {},
        idvg_vds5: [], idvg_vds05: [], idvd: [], cv_vds: [], body_diode: [],
        project_id: pid,
        curve_counts: (m as any).curve_counts || {},
      };
      setDataset(ds);
      setLog("success", `Project ${pid.slice(0, 8)} selected`);
    } catch (e: any) {
      setLog("error", `Select failed: ${e.message}`);
    }
  }, [setLog]);

  const runFit = useCallback(async (useLtspice: boolean = false) => {
    if (!projectId) {
      setLog("error", "No project loaded");
      return;
    }
    setLog("info", `Starting fit (ltspice=${useLtspice})...`);
    try {
      const r = await api.runFitting(projectId, useLtspice);
      setFitResult(r);
      setLog(r.success ? "success" : "error",
              `Fit ${r.success ? "done" : "failed"}: total RMS = ${r.total_rms.toFixed(3)}`);
      // 拉取更新后的 model
      const m = await api.getModel(projectId);
      setModel(m);
    } catch (e: any) {
      setLog("error", `Fit failed: ${e.message}`);
      throw e;
    }
  }, [projectId, setLog]);

  const exportLib = useCallback(async (outputPath: string, format: string = "subckt") => {
    if (!projectId) throw new Error("No project loaded");
    setLog("info", `Exporting .lib to ${outputPath}...`);
    const path = await api.exportLib(projectId, outputPath, format);
    setLog("success", `Exported .lib: ${path}`);
    return path;
  }, [projectId, setLog]);

  return (
    <AppContext.Provider value={{
      projectId, dataset, model, fitResult, backendRunning, logs,
      loadProject, selectProject, runFit, exportLib, refreshBackend, startBackend, setLog,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be inside AppProvider");
  return ctx;
}