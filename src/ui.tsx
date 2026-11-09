import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";

/* ---------- Router (hash based) ---------- */
export type Route = { page: string; params: URLSearchParams };
const parse = (): Route => {
  const h = location.hash.replace(/^#\/?/, "");
  const [page, qs] = h.split("?");
  return { page: page || "today", params: new URLSearchParams(qs ?? "") };
};
export function useRoute() {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => setR(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return r;
}
export const go = (page: string, params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  location.hash = `/${page}${qs}`;
};

/* ---------- Primitives ---------- */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Progress({ value, total }: { value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="progress" title={`${value} of ${total}`}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tags({ tags, onClick }: { tags: string[]; onClick?: (t: string) => void }) {
  if (!tags.length) return null;
  return (
    <span className="tags">
      {tags.map((t) => (
        <span key={t} className="tag" onClick={onClick ? (e) => (e.stopPropagation(), onClick(t)) : undefined} style={onClick ? { cursor: "pointer" } : undefined}>
          {t}
        </span>
      ))}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

/** <input type="datetime-local"> value from an ISO string, and back. */
export const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => new Date(v).toISOString();

/* ---------- Toasts ---------- */
type Toast = { id: number; text: string; sub?: string };
let push: (t: Omit<Toast, "id">) => void = () => {};
export const toast = (text: string, sub?: string) => push({ text, sub });
export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    push = (t) => {
      const id = Date.now() + Math.random();
      setList((l) => [...l, { ...t, id }]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 6000);
    };
  }, []);
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast" onClick={() => setList((l) => l.filter((x) => x.id !== t.id))}>
          <strong>{t.text}</strong>
          {t.sub && <span>{t.sub}</span>}
        </div>
      ))}
    </div>
  );
}

/** Renders `backtick` spans as inline code. */
export const md = (s: string) => s.split(/(`[^`]+`)/).map((part, i) => (part.startsWith("`") && part.length > 1 ? <code key={i}>{part.slice(1, -1)}</code> : part));
