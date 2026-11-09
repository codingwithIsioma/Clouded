import type { State } from "../types";
import { fmtTime } from "./dates";

export type Due = { key: string; title: string; body: string };

/** Reminders whose time has come (within the last 12h) and haven't fired yet. */
export function dueReminders(state: State, now = new Date()): Due[] {
  const out: Due[] = [];
  const fired = new Set(state.firedReminders);
  const window = 12 * 3_600_000;
  const check = (key: string, at: Date, title: string, body: string) => {
    const t = at.getTime();
    if (t <= now.getTime() && now.getTime() - t < window && !fired.has(key)) out.push({ key, title, body });
  };
  for (const d of state.deadlines) {
    if (d.done) continue;
    const due = new Date(d.due);
    for (const m of d.reminders) {
      const label = m >= 1440 ? `${Math.round(m / 1440)} day${m >= 2880 ? "s" : ""}` : m >= 60 ? `${Math.round(m / 60)}h` : `${m} min`;
      check(`${d.id}:${m}:${d.due}`, new Date(due.getTime() - m * 60_000), d.title, `Due in ${label} — ${fmtTime(due)}`);
    }
    if (d.stepReminderTime) {
      const [h, mm] = d.stepReminderTime.split(":").map(Number);
      d.steps.forEach((s, i) => {
        if (s.done) return;
        const sd = new Date(s.due);
        const at = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate(), h, mm);
        check(`${s.id}:${s.due}`, at, `Today: Step ${i + 1}, ${s.title}`, d.title);
      });
    }
  }
  return out;
}

export function notify(title: string, body: string) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, tag: title });
      return true;
    }
  } catch {}
  return false;
}
