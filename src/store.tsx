import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { emptyState, type State } from "./types";
import { loadState, persistStorage, saveState } from "./lib/db";

type Ctx = { state: State; update: (fn: (s: State) => void) => void; replace: (s: State) => void; ready: boolean };
const StoreCtx = createContext<Ctx | null>(null);

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Older builds kept the state in localStorage; carry it over once. */
function legacyLocal(): Partial<State> | null {
  try {
    const raw = localStorage.getItem("clouded:state");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(emptyState);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    loadState<State>()
      .then((saved) => {
        const data = saved ?? legacyLocal();
        if (data) setState({ ...emptyState(), ...data });
        setReady(true);
        persistStorage();
      })
      // Never mark ready on a failed load: saving would overwrite your data with an empty state.
      .catch((e) => setLoadError(String(e?.message ?? e)));
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => saveState(state).catch((e) => console.error("Save failed", e)), 250);
  }, [state, ready]);

  // Save immediately when the tab is hidden or closed, so the last change isn't lost.
  useEffect(() => {
    if (!ready) return;
    const flush = () => {
      if (document.visibilityState === "hidden") {
        window.clearTimeout(timer.current);
        saveState(latest.current).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [ready]);

  const update = useCallback((fn: (s: State) => void) => {
    setState((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }, []);

  const replace = useCallback((s: State) => setState({ ...emptyState(), ...s }), []);

  if (loadError)
    return (
      <div className="empty" style={{ paddingTop: "30vh" }}>
        Couldn't open your saved data: {loadError}
        <br />
        <button style={{ marginTop: 12 }} onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );

  return <StoreCtx.Provider value={{ state, update, replace, ready }}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore outside provider");
  return ctx;
}
