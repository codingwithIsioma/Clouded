import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "./store";
import { useUser } from "./auth";
import { SyncEngine, applyRows, type Meta, type Status } from "./lib/sync";
import { supabaseRemote } from "./lib/remote";
import { deleteFile, getFile, loadSyncMeta, saveSyncMeta, setRemoteFileSource } from "./lib/db";

type Ctx = { status: Status; syncNow: () => Promise<void>; engine: SyncEngine | null };
const SyncCtx = createContext<Ctx>({ status: { state: "idle", pending: 0 }, syncNow: async () => {}, engine: null });
export const useSync = () => useContext(SyncCtx);

const EVERY_MS = 60_000;

/** Keeps this device and your account in step while the app is open. */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { state, update, ready } = useStore();
  const user = useUser();
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const [status, setStatus] = useState<Status>({ state: "syncing", pending: 0 });
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    if (!ready) return;
    const e = new SyncEngine(user.id, {
      remote: supabaseRemote(user.id),
      loadMeta: () => loadSyncMeta<Meta>(),
      saveMeta: saveSyncMeta,
      getFile,
      deleteFile,
    });
    e.onStatus = setStatus;
    e.onRows = (rows) => update((s) => applyRows(s, rows));
    setRemoteFileSource((id) => e.download(id));
    e.start(latest.current).catch((err) => console.error("Sync start failed", err));
    setEngine(e);

    const onVisible = () => (document.visibilityState === "visible" ? e.sync() : e.flush());
    const onOnline = () => e.sync();
    const t = window.setInterval(() => document.visibilityState === "visible" && e.sync(), EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
      setRemoteFileSource(null);
      e.stop();
    };
  }, [ready, user.id, update]);

  useEffect(() => {
    engine?.localChange(state);
  }, [engine, state]);

  return <SyncCtx.Provider value={{ status, syncNow: () => engine?.sync() ?? Promise.resolve(), engine }}>{children}</SyncCtx.Provider>;
}

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

/** One quiet line: "Synced just now", "Syncing…", "Offline · 3 changes waiting". */
export function SyncStatus({ className = "" }: { className?: string }) {
  const { status } = useSync();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const waiting = status.pending ? ` · ${status.pending} change${status.pending === 1 ? "" : "s"} waiting` : "";
  const text =
    status.state === "syncing"
      ? "Syncing…"
      : status.state === "offline"
        ? `Offline${waiting || " · saved here"}`
        : status.state === "error"
          ? "Sync problem, will retry"
          : status.at
            ? `Synced ${ago(status.at)}`
            : "Synced";
  return (
    <span className={`sync-status ${status.state} ${className}`} title={status.message}>
      <span className="sync-dot" />
      {text}
    </span>
  );
}
