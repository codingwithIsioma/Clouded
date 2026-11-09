import { useEffect, useMemo, useState } from "react";
import { AlarmClock, Bell, CalendarPlus, Check, ChevronDown, ChevronRight, Download, FileText, Plus, Trash2 } from "lucide-react";
import { uid, useStore } from "../store";
import type { Deadline, ID } from "../types";
import { agenda, bucketOf, fmtDate, parseQuickAdd, relative, addDays, type AgendaItem, type Bucket } from "../lib/dates";
import { downloadICS, googleCalendarUrl } from "../lib/ics";
import { conceptMatches } from "../lib/text";
import { Empty, Field, Modal, PageHead, Progress, Tags, fromLocalInput, go, toLocalInput, toast } from "../ui";
import BreakdownModal from "./Breakdown";
import { ResLink } from "./Vault";

const BUCKETS: { id: Bucket; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "later", label: "Later" },
];

export function useDeadlineActions() {
  const { update } = useStore();
  return {
    toggle(item: { deadline: Deadline; step?: { id: ID } }) {
      update((s) => {
        const d = s.deadlines.find((x) => x.id === item.deadline.id)!;
        if (item.step) {
          const st = d.steps.find((x) => x.id === item.step!.id)!;
          st.done = !st.done;
        } else {
          d.done = !d.done;
          d.doneAt = d.done ? new Date().toISOString() : undefined;
        }
      });
    },
    snooze(item: { deadline: Deadline; step?: { id: ID } }, days = 1) {
      update((s) => {
        const d = s.deadlines.find((x) => x.id === item.deadline.id)!;
        const target = item.step ? d.steps.find((x) => x.id === item.step!.id)! : d;
        target.due = addDays(new Date(target.due), days).toISOString();
        if (item.step && new Date(target.due) > new Date(d.due)) target.due = d.due;
      });
      toast("Snoozed", `Pushed back ${days} day${days > 1 ? "s" : ""}`);
    },
  };
}

export function itemLabel(a: AgendaItem) {
  if (a.step) return `Step ${a.stepIndex! + 1} of ${a.deadline.steps.length}: ${a.deadline.title}: ${a.step.title}`;
  return a.label;
}

export function AgendaRow({ a, onOpen }: { a: AgendaItem; onOpen: () => void }) {
  const actions = useDeadlineActions();
  const doneSteps = a.deadline.steps.filter((s) => s.done).length;
  const bucket = bucketOf(a.due);
  return (
    <div className="item click" onClick={onOpen}>
      <button className="check" aria-label="Mark done" onClick={(e) => (e.stopPropagation(), actions.toggle(a))}>
        <Check size={11} strokeWidth={3} />
      </button>
      <div className="grow">
        <div className="item-title">{itemLabel(a)}</div>
        <div className="item-meta">
          <span style={bucket === "overdue" ? { color: "var(--red)" } : undefined}>{bucket === "overdue" ? `was due ${fmtDate(a.due)}` : `due ${relative(a.due)}`}</span>
          {!a.step && a.deadline.steps.length > 0 && (
            <span className="row" style={{ gap: 6 }}>
              <Progress value={doneSteps} total={a.deadline.steps.length} />
              {doneSteps} of {a.deadline.steps.length} steps
            </span>
          )}
          {a.deadline.reminders.length > 0 && !a.step && <Bell size={12} />}
        </div>
      </div>
      <button className="ghost sm" title="Snooze 1 day" onClick={(e) => (e.stopPropagation(), actions.snooze(a))}>
        <AlarmClock size={14} />
        <span className="hide-sm">Snooze</span>
      </button>
    </div>
  );
}

export default function Deadlines({ params }: { params: URLSearchParams }) {
  const { state, update } = useStore();
  const [text, setText] = useState("");
  const [open, setOpen] = useState<ID | null>(params.get("id"));
  const [planning, setPlanning] = useState(params.get("plan") === "1");
  const [showDone, setShowDone] = useState(false);
  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text) : null), [text]);

  useEffect(() => setOpen(params.get("id")), [params]);

  const items = agenda(state.deadlines);
  const done = state.deadlines.filter((d) => d.done).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));

  const add = () => {
    if (!parsed) return;
    const due = parsed.due ?? addDays(new Date(new Date().setHours(23, 59, 0, 0)), 7);
    const d: Deadline = {
      id: uid(),
      title: parsed.title,
      due: due.toISOString(),
      done: false,
      notes: "",
      steps: [],
      requirements: [],
      concepts: [],
      reminders: [1440],
      createdAt: new Date().toISOString(),
    };
    update((s) => void s.deadlines.push(d));
    setText("");
    toast("Added", `${d.title} — ${fmtDate(d.due, { time: true })}${parsed.due ? "" : " (no date found, set to a week out)"}`);
  };

  return (
    <>
      <PageHead title="Deadlines" sub="Every assignment and due date, sorted by urgency.">
        <button onClick={() => downloadICS(state.deadlines)} title="Download .ics for Google or Apple Calendar">
          <Download size={14} /> Export calendar
        </button>
        <button className="primary" onClick={() => setPlanning(true)}>
          <FileText size={14} /> Plan an assignment
        </button>
      </PageHead>

      <div className="stack">
        <div className="search">
          <Plus size={16} />
          <input
            placeholder='Quick add — e.g. "Terraform lab due Friday 11:59pm"'
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </div>
        {parsed && (
          <div className="small muted" style={{ marginTop: -4, paddingLeft: 4 }}>
            ↵ adds <b style={{ color: "var(--text)" }}>{parsed.title}</b> ·{" "}
            {parsed.due ? fmtDate(parsed.due, { time: true }) : "no date found — defaults to a week from now"}
          </div>
        )}
      </div>

      {items.length === 0 && <Empty>Nothing due. Add something above, or plan an assignment from its brief.</Empty>}

      {BUCKETS.map((b) => {
        const list = items.filter((i) => bucketOf(i.due) === b.id);
        if (!list.length) return null;
        return (
          <div className="section" key={b.id}>
            <div className="section-title">
              <span className={`dot ${b.id}`} />
              {b.label}
              {b.id === "today" && <span className="faint" style={{ textTransform: "none", letterSpacing: 0 }}>{fmtDate(new Date())}</span>}
              <span className="faint">{list.length}</span>
            </div>
            <div className="card flush list">
              {list.map((a) => (
                <AgendaRow key={a.key} a={a} onOpen={() => setOpen(a.deadline.id)} />
              ))}
            </div>
          </div>
        );
      })}

      {done.length > 0 && (
        <div className="section">
          <button className="ghost sm" onClick={() => setShowDone(!showDone)}>
            {showDone ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Completed ({done.length})
          </button>
          {showDone && (
            <div className="card flush list" style={{ marginTop: 8 }}>
              {done.map((d) => (
                <div className="item click" key={d.id} onClick={() => setOpen(d.id)}>
                  <button className="check on" onClick={(e) => (e.stopPropagation(), update((s) => void (s.deadlines.find((x) => x.id === d.id)!.done = false)))}>
                    <Check size={11} strokeWidth={3} />
                  </button>
                  <div className="grow">
                    <div className="item-title done-text">{d.title}</div>
                    <div className="item-meta">was due {fmtDate(d.due)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {open && state.deadlines.some((d) => d.id === open) && <DeadlineDetail id={open} onClose={() => (setOpen(null), params.get("id") && go("deadlines"))} />}
      {planning && <BreakdownModal onClose={() => (setPlanning(false), params.get("plan") && go("deadlines"))} onCreated={(id) => (setPlanning(false), go("deadlines", { id }))} />}
    </>
  );
}

const REMINDER_OPTIONS = [
  { m: 15, label: "15 min" },
  { m: 60, label: "1 hour" },
  { m: 180, label: "3 hours" },
  { m: 1440, label: "1 day" },
  { m: 2880, label: "2 days" },
  { m: 10080, label: "1 week" },
];

function DeadlineDetail({ id, onClose }: { id: ID; onClose: () => void }) {
  const { state, update } = useStore();
  const d = state.deadlines.find((x) => x.id === id)!;
  const [openStep, setOpenStep] = useState<ID | null>(null);
  const edit = (fn: (d: Deadline) => void) => update((s) => fn(s.deadlines.find((x) => x.id === id)!));
  const doneSteps = d.steps.filter((s) => s.done).length;
  const resFor = (concept: string) => state.resources.filter((r) => conceptMatches(concept, [r.title, r.module, r.notes, ...r.tags], r.tags));
  const allConcepts = [...new Set([...d.concepts, ...d.steps.flatMap((s) => s.concepts)])];
  const errors = state.errors.filter((e) => e.deadlineId === id);

  const askPermission = () => {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  };

  return (
    <Modal title={d.steps.length ? "Assignment" : "Deadline"} onClose={onClose} wide={d.steps.length > 0}>
      <input value={d.title} onChange={(e) => edit((x) => void (x.title = e.target.value))} style={{ fontSize: 16, fontWeight: 600 }} />
      {d.summary && <p className="muted">{d.summary}</p>}
      <div className="grid2">
        <Field label="Due">
          <input type="datetime-local" value={toLocalInput(d.due)} onChange={(e) => e.target.value && edit((x) => void (x.due = fromLocalInput(e.target.value)))} />
        </Field>
        <Field label="Add to calendar">
          <div className="row">
            <a className="btn" href={googleCalendarUrl(d.title, new Date(d.due), d.notes)} target="_blank" rel="noreferrer">
              <CalendarPlus size={14} /> Google
            </a>
            <button onClick={() => downloadICS([d], `${d.title.replace(/\W+/g, "-").toLowerCase()}.ics`)}>
              <Download size={14} /> Apple (.ics)
            </button>
          </div>
        </Field>
      </div>

      <Field label="Reminders" hint="Notifications show while Clouded is open in a browser tab.">
        <div className="row">
          {REMINDER_OPTIONS.map((o) => {
            const on = d.reminders.includes(o.m);
            return (
              <button
                key={o.m}
                className={`sm ${on ? "primary" : ""}`}
                onClick={() => {
                  askPermission();
                  edit((x) => void (x.reminders = on ? x.reminders.filter((m) => m !== o.m) : [...x.reminders, o.m].sort((a, b) => a - b)));
                }}
              >
                {o.label} before
              </button>
            );
          })}
        </div>
      </Field>

      {d.steps.length > 0 && (
        <>
          <Field label="Step reminders" hint='e.g. "Today: Step 3, set up the project structure" on the morning each step is due.'>
            <div className="row">
              <input type="checkbox" checked={!!d.stepReminderTime} onChange={(e) => (askPermission(), edit((x) => void (x.stepReminderTime = e.target.checked ? "09:00" : undefined)))} />
              {d.stepReminderTime && (
                <input type="time" value={d.stepReminderTime} onChange={(e) => edit((x) => void (x.stepReminderTime = e.target.value))} style={{ width: 130 }} />
              )}
            </div>
          </Field>

          {d.rescheduleWarning && (
            <div className={`banner ${d.rescheduleWarning.startsWith("Time is tight") ? "warn" : ""}`}>
              <span className="grow">{d.rescheduleWarning}</span>
              <button className="icon" onClick={() => edit((x) => void (x.rescheduleWarning = undefined))}>
                ✕
              </button>
            </div>
          )}

          <div>
            <div className="row between" style={{ marginBottom: 8 }}>
              <h3>Steps</h3>
              <span className="row small muted">
                <Progress value={doneSteps} total={d.steps.length} /> {doneSteps} of {d.steps.length}
              </span>
            </div>
            <div className="card flush list">
              {d.steps.map((s, i) => (
                <div key={s.id} className="item" style={{ flexDirection: "column", gap: 6 }}>
                  <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", width: "100%" }}>
                    <button className={`check ${s.done ? "on" : ""}`} onClick={() => edit((x) => void (x.steps[i].done = !x.steps[i].done))}>
                      <Check size={11} strokeWidth={3} />
                    </button>
                    <div className="grow" style={{ cursor: "pointer" }} onClick={() => setOpenStep(openStep === s.id ? null : s.id)}>
                      <div className={`item-title ${s.done ? "done-text" : ""}`}>
                        {i + 1}. {s.title}
                      </div>
                      <div className="item-meta">
                        <span className={`dot ${s.done ? "later" : bucketOf(s.due)}`} /> {relative(s.due)}
                        {s.notes && <span>· has notes</span>}
                      </div>
                    </div>
                    {openStep === s.id ? <ChevronDown size={16} className="faint" /> : <ChevronRight size={16} className="faint" />}
                  </div>
                  {openStep === s.id && (
                    <div className="stack" style={{ paddingLeft: 30, width: "100%" }}>
                      <p>{s.focus}</p>
                      {s.concepts.length > 0 && (
                        <div className="small">
                          <span className="muted">Review: </span>
                          {s.concepts.map((c) => {
                            const rs = resFor(c);
                            return (
                              <span key={c} style={{ marginRight: 10 }}>
                                {c}
                                {rs.length > 0 && (
                                  <a href={`#/vault?q=${encodeURIComponent(c)}`} className="faint">
                                    {" "}
                                    ({rs.length} saved)
                                  </a>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <Field label="Mini-deadline">
                        <input type="datetime-local" value={toLocalInput(s.due)} onChange={(e) => e.target.value && edit((x) => void (x.steps[i].due = fromLocalInput(e.target.value)))} style={{ maxWidth: 240 }} />
                      </Field>
                      <Field label="Step notes">
                        <textarea placeholder="Your thinking, links, questions…" value={s.notes} onChange={(e) => edit((x) => void (x.steps[i].notes = e.target.value))} />
                      </Field>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {d.requirements.length > 0 && (
        <div>
          <h3 style={{ marginBottom: 8 }}>
            Requirements checklist{" "}
            <span className="faint small">
              {d.requirements.filter((r) => r.checked).length}/{d.requirements.length}
            </span>
          </h3>
          <div className="stack" style={{ gap: 6 }}>
            {d.requirements.map((r, i) => (
              <label key={r.id} className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", cursor: "pointer" }}>
                <input type="checkbox" checked={r.checked} onChange={() => edit((x) => void (x.requirements[i].checked = !x.requirements[i].checked))} style={{ marginTop: 4 }} />
                <span className={`grow ${r.checked ? "done-text" : ""}`}>{r.text}</span>
                <span className="pill">{r.kind}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {allConcepts.length > 0 && (
        <div>
          <h3 style={{ marginBottom: 8 }}>Concepts to review</h3>
          <div className="stack" style={{ gap: 6 }}>
            {allConcepts.map((c) => {
              const rs = resFor(c);
              return (
                <div key={c} className="row small">
                  <b style={{ fontWeight: 550 }}>{c}</b>
                  {rs.length ? (
                    rs.slice(0, 3).map((r) => (
                      <ResLink key={r.id} r={r} className="tag">
                        {r.title}
                      </ResLink>
                    ))
                  ) : (
                    <a className="faint" href={`#/vault?add=1&tags=${encodeURIComponent(c)}`}>
                      nothing saved yet — add a resource
                    </a>
                  )}
                  <a className="faint" href={`#/explain?topic=${encodeURIComponent(c)}`}>
                    explain it back →
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div>
          <h3 style={{ marginBottom: 8 }}>Errors logged here</h3>
          {errors.map((e) => (
            <a key={e.id} href={`#/errors?id=${e.id}`} className="row small" style={{ textDecoration: "none" }}>
              <span className={`pill ${e.status}`}>{e.status}</span> {e.title}
            </a>
          ))}
        </div>
      )}

      <Field label="Notes">
        <textarea value={d.notes} onChange={(e) => edit((x) => void (x.notes = e.target.value))} />
      </Field>

      <div className="row between">
        <button
          className="ghost danger"
          onClick={() => {
            if (confirm(`Delete “${d.title}”?`)) {
              update((s) => void (s.deadlines = s.deadlines.filter((x) => x.id !== id)));
              onClose();
            }
          }}
        >
          <Trash2 size={14} /> Delete
        </button>
        <div className="row">
          <button onClick={() => (edit((x) => void ((x.done = !x.done), (x.doneAt = x.done ? new Date().toISOString() : undefined))), onClose())}>
            <Check size={14} /> {d.done ? "Mark not done" : "Mark done"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
