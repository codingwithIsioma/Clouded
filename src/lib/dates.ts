import type { Availability, Deadline, Step } from "../types";

export const DAY = 86_400_000;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0);
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
export const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();
export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const fromDayKey = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export function fmtDate(iso: string | Date, opts: { time?: boolean } = {}) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const base = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return opts.time ? `${base}, ${fmtTime(d)}` : base;
}
export function fmtTime(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).replace(" ", "").toLowerCase();
}
export function relative(iso: string, now = new Date()) {
  const d = new Date(iso);
  const days = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / DAY);
  if (days === 0) return d < now ? `today, was ${fmtTime(d)}` : `today, ${fmtTime(d)}`;
  if (days === 1) return `tomorrow, ${fmtTime(d)}`;
  if (days === -1) return "yesterday";
  if (days < 0) return `${-days} days ago`;
  if (days < 7) return `${d.toLocaleDateString(undefined, { weekday: "long" })}, ${fmtTime(d)}`;
  return fmtDate(d);
}
export function timeAgo(iso: string, now = new Date()) {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
}

/* ---------------- Quick-add parsing ---------------- */

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const wdRe = "(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|sday|urday|rsday)?";
const monRe = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";

const wdIndex = (s: string) => WEEKDAYS.findIndex((w) => w.startsWith(s.slice(0, 3)));
const monIndex = (s: string) => MONTHS.findIndex((m) => m.startsWith(s.slice(0, 3)));

export type Parsed = { title: string; due: Date | null; hasTime: boolean };

/** Turns "Terraform lab due Friday 11:59pm" into { title: "Terraform lab", due: <Fri 23:59> }. */
export function parseQuickAdd(input: string, now = new Date()): Parsed {
  let text = ` ${input.trim()} `;
  let date: Date | null = null;
  let hour: number | null = null;
  let minute = 0;

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = text.match(re);
    if (m && fn(m) !== false) text = text.replace(m[0], " ");
  };

  // time
  take(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i, (m) => {
    let h = Number(m[1]) % 12;
    if (m[3].toLowerCase() === "pm") h += 12;
    hour = h;
    minute = Number(m[2] ?? 0);
  });
  if (hour === null)
    take(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/, (m) => {
      hour = Number(m[1]);
      minute = Number(m[2]);
    });
  if (hour === null) take(/\b(?:at\s+)?noon\b/i, () => void ((hour = 12), (minute = 0)));
  if (hour === null) take(/\b(?:at\s+)?midnight\b/i, () => void ((hour = 23), (minute = 59)));
  if (hour === null) take(/\b(?:end of day|eod)\b/i, () => void ((hour = 23), (minute = 59)));

  // dates
  const today = startOfDay(now);
  take(/\b(\d{4})-(\d{2})-(\d{2})\b/, (m) => void (date = new Date(+m[1], +m[2] - 1, +m[3])));
  if (!date)
    take(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, (m) => {
      const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : today.getFullYear();
      date = new Date(y, +m[2] - 1, +m[1]); // day/month
      if (!m[3] && date.getTime() < today.getTime() - 60 * DAY) date.setFullYear(y + 1);
    });
  if (!date)
    take(new RegExp(`\\b${monRe}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "i"), (m) => {
      const y = m[3] ? +m[3] : today.getFullYear();
      date = new Date(y, monIndex(m[1].toLowerCase()), +m[2]);
      if (!m[3] && date.getTime() < today.getTime() - 60 * DAY) date.setFullYear(y + 1);
    });
  if (!date)
    take(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${monRe}(?:\\s+(\\d{4}))?\\b`, "i"), (m) => {
      const y = m[3] ? +m[3] : today.getFullYear();
      date = new Date(y, monIndex(m[2].toLowerCase()), +m[1]);
      if (!m[3] && date.getTime() < today.getTime() - 60 * DAY) date.setFullYear(y + 1);
    });
  if (!date) take(/\b(today|tonight)\b/i, () => void (date = today));
  if (!date) take(/\b(tomorrow|tmrw?|tmr)\b/i, () => void (date = addDays(today, 1)));
  if (!date)
    take(/\bin\s+(\d+|a|an|one|two|three)\s+(day|week)s?\b/i, (m) => {
      const n = ({ a: 1, an: 1, one: 1, two: 2, three: 3 } as Record<string, number>)[m[1].toLowerCase()] ?? Number(m[1]);
      date = addDays(today, n * (m[2].toLowerCase() === "week" ? 7 : 1));
    });
  if (!date) take(/\bnext\s+week\b/i, () => void (date = addDays(today, 7)));
  if (!date) take(/\b(?:end of (?:the )?week|this weekend)\b/i, () => void (date = addDays(today, (7 - today.getDay()) % 7)));
  if (!date)
    take(new RegExp(`\\b(next\\s+|this\\s+)?${wdRe}\\b`, "i"), (m) => {
      const target = wdIndex(m[2].toLowerCase());
      if (target < 0) return false;
      let diff = (target - today.getDay() + 7) % 7;
      if (m[1]?.toLowerCase().startsWith("next") && diff === 0) diff = 7;
      date = addDays(today, diff);
    });

  const hasTime = hour !== null;
  let due: Date | null = null;
  if (date || hasTime) {
    const d: Date = date ?? today;
    due = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour ?? 23, hour === null ? 59 : minute);
    // "Friday" said on a Friday after the time has passed → next week
    if (!date && due < now) due = addDays(due, 1);
  }

  const title = text
    .replace(/\s+/g, " ")
    .replace(/\b(due|by|on|at|before|until)\s*$/i, "")
    .replace(/\s+(due|by|on|at|before)(\s+(due|by|on|at|before))*\s*$/i, "")
    .replace(/[\s,.:;-]+$/, "")
    .trim();
  return { title: title || input.trim(), due, hasTime };
}

/* ---------------- Urgency buckets ---------------- */

export type Bucket = "overdue" | "today" | "week" | "later";
export function bucketOf(iso: string, now = new Date()): Bucket {
  const d = new Date(iso);
  if (d < now) return "overdue";
  if (sameDay(d, now)) return "today";
  if (d.getTime() < startOfDay(now).getTime() + 8 * DAY) return "week";
  return "later";
}

export type AgendaItem = {
  key: string;
  deadline: Deadline;
  step?: Step;
  stepIndex?: number;
  due: string;
  label: string;
};

/** Every open thing with a date: plain deadlines, each open step, and the final submission of planned assignments. */
export function agenda(deadlines: Deadline[]): AgendaItem[] {
  const out: AgendaItem[] = [];
  for (const d of deadlines) {
    if (d.done) continue;
    if (d.steps.length) {
      d.steps.forEach((s, i) => {
        if (!s.done) out.push({ key: s.id, deadline: d, step: s, stepIndex: i, due: s.due, label: s.title });
      });
      out.push({ key: d.id, deadline: d, due: d.due, label: `${d.title} (final submission)` });
    } else out.push({ key: d.id, deadline: d, due: d.due, label: d.title });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

/* ---------------- Step scheduling ---------------- */

const availableDays = (from: Date, due: Date, av: Availability) => {
  const days: Date[] = [];
  for (let d = startOfDay(from); d <= due; d = addDays(d, 1)) {
    if (av.days.length === 0 || av.days.includes(d.getDay())) days.push(d);
  }
  if (!days.length) days.push(startOfDay(due));
  return days;
};

/**
 * Gives each step a mini-deadline by spreading its effort over the student's available days
 * between `from` and the due date, leaving some buffer at the end. Returns a warning when
 * the work needs more hours than are available.
 */
export function scheduleSteps<T extends { effortHours: number; due?: string }>(
  steps: T[],
  from: Date,
  due: Date,
  av: Availability,
): { steps: (T & { due: string })[]; warning?: string } {
  const days = availableDays(from, due, av);
  const capacity = days.length * av.hoursPerDay;
  const total = steps.reduce((s, x) => s + Math.max(0.5, x.effortHours || 1), 0) || 1;
  const span = capacity >= total ? Math.max(total, capacity * 0.85) : capacity;
  let cum = 0;
  const scheduled = steps.map((s) => {
    cum += Math.max(0.5, s.effortHours || 1);
    const target = (cum / total) * span;
    const idx = Math.min(days.length - 1, Math.max(0, Math.ceil(target / av.hoursPerDay) - 1));
    let stepDue = endOfDay(days[idx]);
    if (stepDue > due) stepDue = due;
    return { ...s, due: stepDue.toISOString() };
  });
  const warning =
    capacity < total
      ? `Time is tight: about ${Math.round(total)}h of work left but only ~${Math.round(capacity)}h available before the due date.`
      : capacity < total * 1.2
        ? `Not much slack left: ~${Math.round(total)}h of work in ~${Math.round(capacity)}h available.`
        : undefined;
  return { steps: scheduled, warning };
}

/** If any open step's mini-deadline has passed, shift the remaining open steps to fit between today and the due date. */
export function autoReschedule(d: Deadline, now = new Date()): Deadline | null {
  if (d.done || !d.steps.length || !d.availability) return null;
  const open = d.steps.filter((s) => !s.done);
  if (!open.length) return null;
  const missed = open.some((s) => new Date(s.due) < startOfDay(now));
  if (!missed) return null;
  const due = new Date(d.due);
  if (due < now) return null; // whole assignment is overdue; nothing to fit into
  const { steps, warning } = scheduleSteps(open, now, due, d.availability);
  const byId = new Map(steps.map((s) => [s.id, s]));
  return {
    ...d,
    steps: d.steps.map((s) => byId.get(s.id) ?? s),
    rescheduleWarning: warning ?? "Missed a step, so the remaining steps were shifted to fit.",
  };
}
