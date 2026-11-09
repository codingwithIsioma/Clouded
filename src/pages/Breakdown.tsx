import { useRef, useState } from "react";
import { ListChecks, Plus, Upload, X } from "lucide-react";
import { uid, useStore } from "../store";
import type { Availability, Deadline } from "../types";
import { planFromBrief, type Plan, type PlanStep } from "../lib/planner";
import { pdfToText } from "../lib/pdf";
import { addDays, dayKey, fmtDate, fromDayKey, scheduleSteps } from "../lib/dates";
import { Field, Modal, toLocalInput } from "../ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function BreakdownModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { update } = useStore();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [start, setStart] = useState(dayKey());
  const [due, setDue] = useState(() => toLocalInput(new Date(new Date(addDays(new Date(), 14)).setHours(23, 59, 0, 0)).toISOString()));
  const [av, setAv] = useState<Availability>({ days: [1, 2, 3, 4, 5], hoursPerDay: 2 });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError("");
    setBusy("Reading PDF…");
    try {
      const t = f.type === "application/pdf" || f.name.endsWith(".pdf") ? await pdfToText(f) : await f.text();
      setText(t);
      setFileName(f.name);
      if (!t.trim()) setError("No text found in that PDF (it may be scanned). Paste the text instead.");
    } catch (e) {
      setError(`Couldn't read that file: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  };

  const generate = () => {
    setError("");
    setPlan(planFromBrief(text));
  };

  const editStep = (i: number, patch: Partial<PlanStep>) => plan && setPlan({ ...plan, steps: plan.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const dueDate = new Date(due);
  const scheduled = plan ? scheduleSteps(plan.steps, fromDayKey(start), dueDate, av) : null;

  const save = () => {
    if (!plan || !scheduled) return;
    const d: Deadline = {
      id: uid(),
      title: plan.title,
      summary: plan.summary,
      due: dueDate.toISOString(),
      done: false,
      notes: fileName ? `From ${fileName}` : "",
      steps: scheduled.steps.map((s) => ({ ...s, id: uid(), done: false, notes: "" })),
      requirements: plan.requirements.map((r) => ({ ...r, id: uid(), checked: false })),
      concepts: plan.concepts,
      start: fromDayKey(start).toISOString(),
      availability: av,
      reminders: [1440],
      stepReminderTime: "09:00",
      rescheduleWarning: scheduled.warning,
      createdAt: new Date().toISOString(),
    };
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    update((s) => void s.deadlines.push(d));
    onCreated(d.id);
  };

  return (
    <Modal title="Plan an assignment" onClose={onClose} wide>
      {!plan ? (
        <>
          <p className="muted small">
            Upload or paste the brief. You'll get 4–8 steps with mini-deadlines that say what to work on, never how to solve it.
          </p>
          <div className="row">
            <button onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> Upload PDF
            </button>
            <input ref={fileRef} type="file" accept=".pdf,.txt,.md" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            {fileName && <span className="small muted">{fileName}</span>}
          </div>
          <Field label="Assignment brief">
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="…or paste the assignment text here" style={{ minHeight: 160 }} />
          </Field>
          <div className="grid2">
            <Field label="Start date">
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Due">
              <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
          </div>
          <div className="grid2">
            <Field label="Days you can work">
              <div className="row" style={{ gap: 4 }}>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <button
                    key={d}
                    className={`sm ${av.days.includes(d) ? "primary" : ""}`}
                    onClick={() => setAv({ ...av, days: av.days.includes(d) ? av.days.filter((x) => x !== d) : [...av.days, d] })}
                  >
                    {DAYS[d].slice(0, 2)}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Hours a day">
              <input type="number" min={0.5} max={12} step={0.5} value={av.hoursPerDay} onChange={(e) => setAv({ ...av, hoursPerDay: Math.max(0.5, Number(e.target.value) || 1) })} />
            </Field>
          </div>
          <p className="small faint">
            Steps are built from the brief's own tasks and its must/should lines. You can edit, add or remove any step on the next screen.
          </p>
          {error && <div className="banner warn small">{error}</div>}
          <div className="row between">
            <span className="small muted">{busy}</span>
            <button className="primary" disabled={!text.trim() || !!busy || new Date(due) <= fromDayKey(start)} onClick={generate}>
              <ListChecks size={14} /> {busy || "Build plan"}
            </button>
          </div>
        </>
      ) : (
        <>
          <input value={plan.title} onChange={(e) => setPlan({ ...plan, title: e.target.value })} style={{ fontSize: 16, fontWeight: 600 }} />
          {plan.summary && <p className="muted">{plan.summary}</p>}
          {error && <div className="banner warn small">{error}</div>}
          {scheduled?.warning && <div className="banner warn small">{scheduled.warning}</div>}
          <div className="card flush list">
            {scheduled!.steps.map((s, i) => (
              <div className="item" key={i}>
                <span className="faint mono" style={{ width: 18, paddingTop: 8 }}>
                  {i + 1}
                </span>
                <div className="grow stack" style={{ gap: 6 }}>
                  <input value={s.title} onChange={(e) => editStep(i, { title: e.target.value })} style={{ fontWeight: 550 }} />
                  <textarea value={s.focus} onChange={(e) => editStep(i, { focus: e.target.value })} style={{ minHeight: 52, fontSize: 13 }} />
                  <div className="item-meta">
                    <span>by {fmtDate(s.due)}</span>
                    <label className="row" style={{ gap: 4 }}>
                      ~
                      <input type="number" min={0.5} step={0.5} value={s.effortHours} onChange={(e) => editStep(i, { effortHours: Math.max(0.5, Number(e.target.value) || 1) })} style={{ width: 64, padding: "2px 6px" }} />h
                    </label>
                    {s.concepts.length > 0 && <span>review: {s.concepts.join(", ")}</span>}
                  </div>
                </div>
                <button className="icon" title="Remove step" disabled={plan.steps.length <= 1} onClick={() => setPlan({ ...plan, steps: plan.steps.filter((_, j) => j !== i) })}>
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
          {plan.steps.length < 8 && (
            <button
              className="ghost sm"
              style={{ alignSelf: "flex-start" }}
              onClick={() => {
                const steps = [...plan.steps];
                steps.splice(Math.max(0, steps.length - 2), 0, { title: "New step", focus: "What to focus on in this step.", concepts: [], effortHours: 1 });
                setPlan({ ...plan, steps });
              }}
            >
              <Plus size={14} /> Add a step
            </button>
          )}
          {plan.requirements.length > 0 && (
            <div>
              <h3 style={{ marginBottom: 6 }}>Requirements found ({plan.requirements.length})</h3>
              <p className="small faint" style={{ marginBottom: 6 }}>These become your checklist.</p>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {plan.requirements.slice(0, 8).map((r, i) => (
                  <li key={i}>
                    <span className="faint">{r.kind}:</span> {r.text}
                  </li>
                ))}
                {plan.requirements.length > 8 && <li className="faint">…and {plan.requirements.length - 8} more</li>}
              </ul>
            </div>
          )}
          <div className="row between">
            <button className="ghost" onClick={() => setPlan(null)}>
              Back
            </button>
            <button className="primary" onClick={save}>
              Save plan
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

