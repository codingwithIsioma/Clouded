import type { Deadline } from "../types";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => "\\" + m);

type Ev = { uid: string; title: string; due: Date; description: string; alarms: number[] };

function events(deadlines: Deadline[]): Ev[] {
  const out: Ev[] = [];
  for (const d of deadlines) {
    if (d.done) continue;
    out.push({ uid: d.id, title: d.title, due: new Date(d.due), description: d.notes || d.summary || "", alarms: d.reminders });
    d.steps.forEach((s, i) => {
      if (!s.done)
        out.push({
          uid: s.id,
          title: `Step ${i + 1} of ${d.steps.length}: ${d.title}: ${s.title}`,
          due: new Date(s.due),
          description: s.focus,
          alarms: [],
        });
    });
  }
  return out;
}

/** An .ics file that Google Calendar and Apple Calendar can both import. Each item is a 30-minute block ending at its due time. */
export function toICS(deadlines: Deadline[]) {
  const now = stamp(new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Clouded//Student Command Center//EN", "CALSCALE:GREGORIAN"];
  for (const e of events(deadlines)) {
    const start = new Date(e.due.getTime() - 30 * 60_000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@clouded`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(e.due)}`,
      `SUMMARY:${esc(e.title)}`,
      `DESCRIPTION:${esc(e.description)}`,
    );
    for (const m of e.alarms) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${m}M`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadICS(deadlines: Deadline[], name = "clouded-deadlines.ics") {
  const blob = new Blob([toICS(deadlines)], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function googleCalendarUrl(title: string, due: Date, details = "") {
  const start = new Date(due.getTime() - 30 * 60_000);
  const p = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${stamp(start)}/${stamp(due)}`, details });
  return `https://calendar.google.com/calendar/render?${p}`;
}
