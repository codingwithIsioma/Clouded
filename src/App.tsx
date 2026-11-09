import { useEffect, useRef } from "react";
import type { Deadline } from "./types";
import { BookMarked, Brain, Bug, CalendarClock, Cloud, HardDrive, Home, SquareTerminal } from "lucide-react";
import { useStore } from "./store";
import { Toasts, toast, useRoute } from "./ui";
import { agenda, autoReschedule, bucketOf } from "./lib/dates";
import { dueReminders, notify } from "./lib/reminders";
import { todaysCards } from "./lib/srs";
import Today from "./pages/Today";
import Deadlines from "./pages/Deadlines";
import Errors from "./pages/Errors";
import Explain from "./pages/Explain";
import Vault from "./pages/Vault";
import Cards from "./pages/Cards";
import Data from "./pages/Data";

const NAV = [
  { id: "today", label: "Today", icon: Home },
  { id: "deadlines", label: "Deadlines", icon: CalendarClock },
  { id: "errors", label: "Error Journal", short: "Errors", icon: Bug },
  { id: "explain", label: "Explain-It-Back", short: "Explain", icon: Brain },
  { id: "vault", label: "Resource Vault", short: "Vault", icon: BookMarked },
  { id: "cards", label: "CommandCards", short: "Cards", icon: SquareTerminal },
];

export default function App() {
  const { state, update, ready } = useStore();
  const route = useRoute();

  const latest = useRef(state);
  latest.current = state;

  // Shift missed steps forward so the plan still fits before each due date.
  useEffect(() => {
    if (!ready) return;
    const run = () => {
      const changed = new Map<string, Deadline>();
      for (const d of latest.current.deadlines) {
        const r = autoReschedule(d);
        if (r) {
          changed.set(d.id, r);
          toast(`Rescheduled “${d.title}”`, r.rescheduleWarning);
        }
      }
      if (changed.size) update((s) => void (s.deadlines = s.deadlines.map((d) => changed.get(d.id) ?? d)));
    };
    run();
    const t = window.setInterval(run, 3_600_000);
    return () => window.clearInterval(t);
  }, [ready, update]);

  // Reminders: browser notification (or in-app toast) while the app is open.
  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      const due = dueReminders(latest.current);
      if (!due.length) return;
      for (const r of due) if (!notify(r.title, r.body)) toast(r.title, r.body);
      const keys = due.map((r) => r.key);
      update((s) => void (s.firedReminders = [...s.firedReminders, ...keys].slice(-500)));
    };
    tick();
    const t = window.setInterval(tick, 30_000);
    return () => window.clearInterval(t);
  }, [ready, update]);

  const pending = agenda(state.deadlines).filter((a) => ["overdue", "today"].includes(bucketOf(a.due))).length;
  const counts: Record<string, number> = {
    deadlines: pending,
    errors: state.errors.filter((e) => e.status === "stuck").length,
    cards: todaysCards(state).length,
  };

  const page = route.page;
  const Page = { today: Today, deadlines: Deadlines, errors: Errors, explain: Explain, vault: Vault, cards: Cards, data: Data }[page] ?? Today;

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <span className="brand-mark">
            <Cloud size={14} strokeWidth={2.5} />
          </span>
          Clouded
        </div>
        {NAV.map((n) => (
          <a key={n.id} href={`#/${n.id}`} className={`nav-item ${page === n.id ? "on" : ""}`}>
            <n.icon size={16} />
            {n.label}
            {!!counts[n.id] && <span className="count">{counts[n.id]}</span>}
          </a>
        ))}
        <a href="#/data" className={`nav-item ${page === "data" ? "on" : ""}`} style={{ marginTop: "auto" }}>
          <HardDrive size={16} />
          Backup &amp; data
        </a>
      </aside>
      <main>{ready ? <Page params={route.params} /> : <div className="empty">Loading…</div>}</main>
      <nav className="mobile-nav">
        {NAV.map((n) => (
          <a key={n.id} href={`#/${n.id}`} className={page === n.id ? "on" : ""}>
            <n.icon size={19} />
            {n.short ?? n.label}
          </a>
        ))}
      </nav>
      <Toasts />
    </div>
  );
}
