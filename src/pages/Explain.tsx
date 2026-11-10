import { useEffect, useRef, useState } from "react";
import { ListChecks, Mic, MicOff, Plus, Sparkles, Trash2 } from "lucide-react";
import { uid, useStore } from "../store";
import type { AIFeedback, Confidence, Explanation, ID, State, Topic } from "../types";
import { aiFeedback } from "../lib/ai";
import { ResLink } from "./Vault";
import { DAY, fmtDate, timeAgo } from "../lib/dates";
import { conceptMatches } from "../lib/text";
import { Empty, PageHead, Segmented, go, toast } from "../ui";

export const CONF: { value: Confidence; label: string }[] = [
  { value: "shaky", label: "Shaky" },
  { value: "getting", label: "Getting there" },
  { value: "locked", label: "Locked in" },
];

/** Higher = more in need of review: shaky topics and ones not revisited in a while. */
export function reviewScore(t: Topic, now = Date.now()) {
  const days = t.lastReviewed ? (now - new Date(t.lastReviewed).getTime()) / DAY : 30;
  const weight = { shaky: 3, getting: 1.5, locked: 0.5 }[t.confidence];
  const stale = { shaky: 2, getting: 5, locked: 14 }[t.confidence];
  return weight * (days / stale);
}
export const topicsToReview = (s: State) =>
  [...s.topics].filter((t) => reviewScore(t) >= 1).sort((a, b) => reviewScore(b) - reviewScore(a));

export default function Explain({ params }: { params: URLSearchParams }) {
  const { state, update } = useStore();
  const [sel, setSel] = useState<ID | null>(null);
  const [newName, setNewName] = useState("");

  // ?topic=Name opens (or creates) that topic
  useEffect(() => {
    const name = params.get("topic");
    if (!name) return;
    const found = state.topics.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (found) setSel(found.id);
    else {
      const t = newTopic(name);
      update((s) => void s.topics.push(t));
      setSel(t.id);
    }
    go("explain");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const add = () => {
    if (!newName.trim()) return;
    const t = newTopic(newName.trim());
    update((s) => void s.topics.push(t));
    setNewName("");
    setSel(t.id);
  };

  const review = topicsToReview(state);
  const topic = state.topics.find((t) => t.id === sel);

  if (topic) return <TopicView topic={topic} onBack={() => setSel(null)} />;

  return (
    <>
      <PageHead title="Explain-It-Back" sub="Explain a topic in your own words to find out whether you really understand it." />
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input placeholder="New topic — e.g. How a VPC routes traffic to the internet" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="primary" onClick={add} disabled={!newName.trim()}>
          <Plus size={14} /> Add
        </button>
      </div>

      {review.length > 0 && (
        <div className="section">
          <div className="section-title">Worth reviewing</div>
          <div className="card flush list">
            {review.slice(0, 4).map((t) => (
              <TopicRow key={t.id} t={t} onOpen={() => setSel(t.id)} />
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-title">All topics</div>
        <div className="card flush list">
          {state.topics.length === 0 && <Empty>No topics yet. Add something you're learning this week.</Empty>}
          {[...state.topics]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((t) => (
              <TopicRow key={t.id} t={t} onOpen={() => setSel(t.id)} />
            ))}
        </div>
      </div>
    </>
  );
}

const newTopic = (name: string): Topic => ({ id: uid(), name, confidence: "shaky", explanations: [], createdAt: new Date().toISOString() });

function TopicRow({ t, onOpen }: { t: Topic; onOpen: () => void }) {
  return (
    <div className="item click" onClick={onOpen}>
      <div className="grow">
        <div className="item-title">{t.name}</div>
        <div className="item-meta">
          <span className={`pill ${t.confidence}`}>{CONF.find((c) => c.value === t.confidence)!.label}</span>
          <span>{t.lastReviewed ? `reviewed ${timeAgo(t.lastReviewed)}` : "never explained"}</span>
          {t.explanations.length > 0 && <span>{t.explanations.length} attempt{t.explanations.length > 1 ? "s" : ""}</span>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Dictation (Web Speech API, where the browser supports it) ---------- */
type SR = { start(): void; stop(): void; continuous: boolean; interimResults: boolean; lang: string; onresult: (e: any) => void; onend: () => void; onerror: (e: any) => void };
const SpeechRec: (new () => SR) | undefined = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

/* ---------- Self-check (replaces AI feedback; works offline) ---------- */
export const CHECKS = [
  { id: "what", label: "Said what it is in one or two plain sentences", prompt: "What is it, in one or two plain sentences?" },
  { id: "why", label: "Explained why it exists — the problem it solves", prompt: "Why does it exist? What problem does it solve?" },
  { id: "how", label: "Walked through how it works, step by step", prompt: "How does it work, step by step?" },
  { id: "example", label: "Gave a concrete example (a command, config or real scenario)", prompt: "What's a concrete example — a command, a config, a real situation?" },
  { id: "limits", label: "Named a limitation, trade-off or common mistake", prompt: "What are its limits, trade-offs or common mistakes?" },
  { id: "jargon", label: "Could define every technical word I used", prompt: "Which technical words did you use? Can you define each one?" },
];
const suggestFrom = (n: number): Confidence => (n >= 5 ? "locked" : n >= 3 ? "getting" : "shaky");

function TopicView({ topic, onBack }: { topic: Topic; onBack: () => void }) {
  const { state, update } = useStore();
  const [text, setText] = useState("");
  const [checking, setChecking] = useState(false);
  const [ticks, setTicks] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<AIFeedback | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [recording, setRecording] = useState(false);
  const rec = useRef<SR | null>(null);
  const base = useRef("");

  useEffect(() => () => rec.current?.stop(), []);

  const edit = (fn: (t: Topic) => void) => update((s) => fn(s.topics.find((x) => x.id === topic.id)!));
  const resources = state.resources.filter((r) => r.links.some((l) => l.topicId === topic.id) || conceptMatches(topic.name, [r.title, ...r.tags, r.module], r.tags));

  const toggleMic = () => {
    if (!SpeechRec) return;
    if (recording) {
      rec.current?.stop();
      return;
    }
    const r = new SpeechRec();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || "en-US";
    base.current = text ? text.trimEnd() + " " : "";
    r.onresult = (e: any) => {
      let finalT = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalT += res[0].transcript;
        else interim += res[0].transcript;
      }
      setText(base.current + finalT + interim);
    };
    r.onend = () => setRecording(false);
    r.onerror = (e: any) => {
      setRecording(false);
      toast("Recording stopped", e.error === "not-allowed" ? "Microphone access was blocked." : e.error);
    };
    rec.current = r;
    r.start();
    setRecording(true);
  };

  const askAI = async () => {
    if (!state.ai) return;
    setAiBusy(true);
    setAiError("");
    try {
      const { covered, ...fb } = await aiFeedback(state.ai, topic.name, text.trim());
      setFeedback(fb);
      setTicks(covered);
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  };

  const save = () => {
    const ex: Explanation = { id: uid(), text: text.trim(), at: new Date().toISOString(), checks: ticks, ...(feedback ? { feedback } : {}) };
    const suggested = suggestFrom(ticks.length);
    edit((t) => {
      t.explanations.unshift(ex);
      t.lastReviewed = ex.at;
      t.confidence = suggested;
    });
    toast(`Saved — marked “${CONF.find((c) => c.value === suggested)!.label}”`, `You covered ${ticks.length} of ${CHECKS.length}. Change the rating anytime.`);
    setText("");
    setTicks([]);
    setFeedback(null);
    setAiError("");
    setChecking(false);
  };

  const latest = topic.explanations[0];
  const missed = latest?.checks ? CHECKS.filter((c) => !latest.checks!.includes(c.id)) : [];

  return (
    <>
      <button className="ghost sm" onClick={onBack} style={{ marginBottom: 12, marginLeft: -8 }}>
        ← All topics
      </button>
      <PageHead title={topic.name} sub={topic.lastReviewed ? `Last explained ${timeAgo(topic.lastReviewed)}` : "Explain it as if to a classmate who missed the lecture."}>
        <Segmented value={topic.confidence} onChange={(c) => edit((t) => void ((t.confidence = c), (t.lastReviewed ??= new Date().toISOString())))} options={CONF} />
      </PageHead>

      {!checking && (missed.length > 0 || !!latest?.feedback?.gaps.length || !!latest?.feedback?.question) && (
        <div className="banner" style={{ flexDirection: "column", gap: 4, marginBottom: 12 }}>
          <b style={{ fontWeight: 550 }}>Last time{latest?.feedback ? ", to work on:" : " you didn't cover:"}</b>
          <ul style={{ margin: 0, paddingLeft: 18 }} className="small">
            {(latest?.feedback ? [...latest.feedback.misconceptions, ...latest.feedback.gaps] : missed.map((c) => c.prompt)).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
            {latest?.feedback?.question && <li>{latest.feedback.question}</li>}
          </ul>
        </div>
      )}

      <div className="card stack">
        <textarea
          placeholder="In your own words…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          readOnly={checking}
          style={{ minHeight: checking ? 100 : 170, border: 0, padding: 0, fontSize: 15 }}
        />
        {!checking ? (
          <div className="row between">
            <div className="row">
              {SpeechRec && (
                <button className={recording ? "primary" : ""} onClick={toggleMic} title="Record — your speech is transcribed into the box">
                  {recording ? <MicOff size={14} /> : <Mic size={14} />} {recording ? "Stop" : "Record"}
                </button>
              )}
              <span className="small faint">{text.trim() ? `${text.trim().split(/\s+/).length} words` : ""}</span>
            </div>
            <button className="primary" disabled={text.trim().length < 20} onClick={() => (rec.current?.stop(), setChecking(true))}>
              <ListChecks size={14} /> Check myself
            </button>
          </div>
        ) : (
          <div className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            {state.ai && !feedback && (
              <div className="row between">
                <span className="small muted">{aiBusy ? "Reading your explanation… this can take up to a minute" : "Get hints on what's missing or wrong. It won't give you the answer."}</span>
                <button onClick={askAI} disabled={aiBusy}>
                  <Sparkles size={14} /> {aiBusy ? "Working…" : "Get AI feedback"}
                </button>
              </div>
            )}
            {aiError && <div className="banner warn small">{aiError}</div>}
            {feedback && <FeedbackView fb={feedback} />}
            <div className="small muted">
              {feedback ? "AI ticked what it thinks you covered. Adjust anything you disagree with." : "Read your explanation back. Tick only what you actually covered."}
            </div>
            {CHECKS.map((c) => (
              <label key={c.id} className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start", cursor: "pointer" }}>
                <input type="checkbox" style={{ marginTop: 4 }} checked={ticks.includes(c.id)} onChange={() => setTicks(ticks.includes(c.id) ? ticks.filter((x) => x !== c.id) : [...ticks, c.id])} />
                <span>{c.label}</span>
              </label>
            ))}
            <div className="row between">
              <button className="ghost" onClick={() => (setChecking(false), setFeedback(null), setAiError(""))}>
                Keep writing
              </button>
              <button className="primary" onClick={save}>
                Save · {ticks.length}/{CHECKS.length}
              </button>
            </div>
          </div>
        )}
      </div>

      {resources.length > 0 && (
        <div className="section">
          <div className="section-title">From your vault</div>
          <div className="row">
            {resources.slice(0, 6).map((r) => (
              <ResLink key={r.id} r={r} className="tag">
                {r.title}
              </ResLink>
            ))}
          </div>
        </div>
      )}

      {topic.explanations.length > 0 && (
        <div className="section">
          <div className="section-title">Past attempts</div>
          <div className="card flush list">
            {topic.explanations.map((ex) => (
              <details className="item" key={ex.id} style={{ display: "block" }}>
                <summary style={{ cursor: "pointer" }}>
                  <span className="item-title">{fmtDate(ex.at, { time: true })}</span>{" "}
                  {ex.checks && (
                    <span className="small muted">
                      — covered {ex.checks.length}/{CHECKS.length}
                    </span>
                  )}
                </summary>
                <p style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{ex.text}</p>
                {ex.feedback && (
                  <div style={{ marginTop: 10 }}>
                    <FeedbackView fb={ex.feedback} />
                  </div>
                )}
              </details>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <button
          className="ghost danger sm"
          onClick={() => {
            if (confirm(`Delete topic “${topic.name}”?`)) {
              update((s) => void (s.topics = s.topics.filter((t) => t.id !== topic.id)));
              onBack();
            }
          }}
        >
          <Trash2 size={13} /> Delete topic
        </button>
      </div>
    </>
  );
}

function FeedbackView({ fb }: { fb: AIFeedback }) {
  const part = (title: string, items: string[]) =>
    items.length > 0 && (
      <div>
        <div className="small" style={{ fontWeight: 550, marginBottom: 2 }}>
          {title}
        </div>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="banner" style={{ flexDirection: "column", gap: 8 }}>
      <div className="row" style={{ gap: 6 }}>
        <Sparkles size={13} />
        <span className="small">{fb.summary || "AI feedback"}</span>
      </div>
      {part("What you got right", fb.strengths)}
      {part("Not quite right", fb.misconceptions)}
      {part("To think about", fb.gaps)}
      {fb.question && part("Try answering", [fb.question])}
      <span className="small faint">AI feedback can be wrong. Check anything surprising against your notes.</span>
    </div>
  );
}
