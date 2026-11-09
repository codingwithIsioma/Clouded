import { useEffect, useMemo, useState } from "react";
import { Flame, RotateCcw } from "lucide-react";
import { useStore } from "../store";
import type { State } from "../types";
import { CARDS, CARD_TOPICS, type Card } from "../data/cards";
import { challengeFor, norm, type Challenge, type QuizChallenge } from "../data/challenges";
import { review, streak, todaysCards, topicMastery, type Grade } from "../lib/srs";
import { addDays, dayKey, startOfDay } from "../lib/dates";
import { Empty, PageHead, Progress, Segmented, md } from "../ui";

type Tab = "cards" | "challenge" | "progress";

export default function Cards({ params }: { params: URLSearchParams }) {
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) ?? "cards");
  const { state } = useStore();
  useEffect(() => setTab((params.get("tab") as Tab) ?? "cards"), [params]);
  const s = streak(state);

  return (
    <>
      <PageHead title="CommandCards" sub="Daily practice for Linux, Docker, kubectl and Terraform.">
        <span className="row small" title="Daily streak" style={{ gap: 4, fontWeight: 600 }}>
          <Flame size={16} color={s ? "var(--orange)" : "var(--faint)"} /> {s} day{s === 1 ? "" : "s"}
        </span>
      </PageHead>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "cards", label: "Today's cards" },
          { value: "challenge", label: "Daily challenge" },
          { value: "progress", label: "Progress" },
        ]}
      />
      <div style={{ marginTop: 18 }}>
        {tab === "cards" && <Session />}
        {tab === "challenge" && <DailyChallenge />}
        {tab === "progress" && <ProgressView />}
      </div>
    </>
  );
}

function logDay(s: State, fn: (d: State["days"][string]) => void) {
  const k = dayKey();
  s.days[k] ??= { reviewed: 0, correct: 0 };
  fn(s.days[k]);
}

const intervalLabel = (days: number) => (days <= 0 ? "tomorrow" : days === 1 ? "1 day" : days < 30 ? `${days} days` : `${Math.round(days / 30)} mo`);

function Session() {
  const { state, update } = useStore();
  const [queue, setQueue] = useState<Card[]>(() => todaysCards(state));
  const [shown, setShown] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const card = queue[0];

  const grade = (g: Grade) => {
    if (!card) return;
    update((s) => {
      s.cards[card.id] = review(s.cards[card.id], g);
      logDay(s, (d) => {
        d.reviewed++;
        if (g !== "again") d.correct++;
      });
    });
    setShown(false);
    setDoneCount((n) => n + 1);
    setQueue((q) => (g === "again" ? [...q.slice(1), q[0]].filter((c, i, arr) => arr.indexOf(c) === i) : q.slice(1)));
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      if (e.key === " " && !shown) (e.preventDefault(), setShown(true));
      else if (shown && ["1", "2", "3", "4"].includes(e.key)) grade((["again", "hard", "good", "easy"] as Grade[])[+e.key - 1]);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  if (!card)
    return (
      <div className="card flash">
        <div className="q">{doneCount ? "Done for today 🎉" : "No cards due today"}</div>
        <p className="muted">{doneCount ? `You reviewed ${doneCount} card${doneCount > 1 ? "s" : ""}. Missed ones come back sooner.` : "Come back tomorrow, or try the daily challenge."}</p>
        <a className="btn" href="#/cards?tab=challenge">
          Daily challenge →
        </a>
      </div>
    );

  const p = state.cards[card.id];
  const preview = (g: Grade) => intervalLabel(review(p, g).interval);

  return (
    <div className="stack">
      <div className="row between small muted">
        <span>
          <span className="tag">{card.topic}</span> {!p && <span className="faint">new</span>}
        </span>
        <span>{queue.length} left</span>
      </div>
      <div className="card flash" onClick={() => !shown && setShown(true)} style={{ cursor: shown ? "default" : "pointer" }}>
        <div className="q">{md(card.q)}</div>
        {shown ? (
          <>
            <div style={{ width: 40, borderTop: "1px solid var(--line)" }} />
            <div className="a">{md(card.a)}</div>
            {card.note && <p className="small muted">{md(card.note)}</p>}
          </>
        ) : (
          <span className="small faint">Think of the answer, then tap or press space</span>
        )}
      </div>
      {shown && (
        <div className="grades">
          {(["again", "hard", "good", "easy"] as Grade[]).map((g, i) => (
            <button key={g} onClick={() => grade(g)} className={g === "good" ? "primary" : ""}>
              {g[0].toUpperCase() + g.slice(1)}
              <small style={g === "good" ? { color: "inherit", opacity: 0.7 } : undefined}>
                {preview(g)} · {i + 1}
              </small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DailyChallenge() {
  const { state, update } = useStore();
  const today = dayKey();
  const ch = useMemo(() => challengeFor(today), [today]);
  const doneToday = !!state.days[today]?.challenge;
  const markDone = () => update((s) => logDay(s, (d) => void (d.challenge = true)));

  const label = { fix: "Fix the broken command", quiz: "Quick quiz", mini: "Mini challenge" }[ch.kind];
  return (
    <div className="card stack">
      <div className="row between">
        <span className="section-title" style={{ margin: 0 }}>
          {label}
        </span>
        <span className="row small">
          <span className="tag">{ch.topic}</span>
          {doneToday && <span className="pill done">done today</span>}
        </span>
      </div>
      <ChallengeBody key={ch.id} ch={ch} onSolved={markDone} />
    </div>
  );
}

function ChallengeBody({ ch, onSolved }: { ch: Challenge; onSolved: () => void }) {
  const [answer, setAnswer] = useState(ch.kind === "fix" ? ch.broken : "");
  const [result, setResult] = useState<null | boolean>(null);
  const [tries, setTries] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [revealed, setRevealed] = useState(false);

  if (ch.kind === "quiz") return <Quiz ch={ch} onSolved={onSolved} />;

  const check = () => {
    const ok = ch.answers.some((a) => norm(a) === norm(answer));
    setResult(ok);
    setTries((t) => t + 1);
    if (ok) onSolved();
  };

  return (
    <>
      <p style={{ fontSize: 15 }}>{md(ch.prompt)}</p>
      {ch.kind === "fix" && <pre className="faint">$ {ch.broken}</pre>}
      <input
        className="mono"
        value={answer}
        onChange={(e) => (setAnswer(e.target.value), setResult(null))}
        onKeyDown={(e) => e.key === "Enter" && answer.trim() && check()}
        placeholder="Type the command"
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
      />
      {result === false && <div className="banner warn small">Not quite{tries > 1 ? ` (try ${tries})` : ""}. Look again — you've got this.</div>}
      {(result || revealed) && (
        <div className={`banner ${result ? "good" : ""} small`}>
          <div>
            {result ? <b>Correct. </b> : <b>Answer: </b>}
            {!result && <code>{ch.answers[0]}</code>} {md(ch.explain)}
          </div>
        </div>
      )}
      <div className="row between">
        <div className="row">
          {ch.kind === "mini" && !showHint && !result && (
            <button className="ghost sm" onClick={() => setShowHint(true)}>
              Hint
            </button>
          )}
          {showHint && ch.kind === "mini" && <span className="small muted">{md(ch.hint)}</span>}
          {tries >= 2 && !result && !revealed && (
            <button className="ghost sm" onClick={() => (setRevealed(true), onSolved())}>
              Show answer
            </button>
          )}
        </div>
        <button className="primary" onClick={check} disabled={!answer.trim() || !!result}>
          Check
        </button>
      </div>
    </>
  );
}

function Quiz({ ch, onSolved }: { ch: QuizChallenge; onSolved: () => void }) {
  const [picks, setPicks] = useState<(number | string | null)[]>(ch.questions.map(() => null));
  const [checked, setChecked] = useState(false);
  const correct = (i: number) => {
    const q = ch.questions[i];
    return q.type === "mcq" ? picks[i] === q.answer : q.answers.some((a) => norm(a) === norm(String(picks[i] ?? "")));
  };
  const score = ch.questions.filter((_, i) => correct(i)).length;

  return (
    <>
      <p style={{ fontSize: 15 }}>{md(ch.prompt)}</p>
      {ch.questions.map((q, i) => (
        <div key={i} className="stack" style={{ gap: 6 }}>
          <b style={{ fontWeight: 550 }}>
            {i + 1}. {md(q.q)}
          </b>
          {q.type === "mcq" ? (
            <div className="grid2" style={{ gap: 6 }}>
              {q.options.map((o, j) => (
                <button
                  key={j}
                  className={`opt ${checked ? (j === q.answer ? "right" : picks[i] === j ? "wrong" : "") : picks[i] === j ? "primary" : ""}`}
                  onClick={() => !checked && setPicks(picks.map((p, k) => (k === i ? j : p)))}
                >
                  {o}
                </button>
              ))}
            </div>
          ) : (
            <input
              className={`mono`}
              style={checked ? { borderColor: correct(i) ? "var(--green)" : "var(--red)" } : undefined}
              value={String(picks[i] ?? "")}
              onChange={(e) => !checked && setPicks(picks.map((p, k) => (k === i ? e.target.value : p)))}
              placeholder="answer"
              autoCapitalize="off"
              spellCheck={false}
            />
          )}
          {checked && q.type === "blank" && !correct(i) && <span className="small muted">Answer: {q.answers[0]}</span>}
        </div>
      ))}
      {checked && (
        <div className={`banner ${score === ch.questions.length ? "good" : ""} small`}>
          <div>
            <b>
              {score}/{ch.questions.length}.
            </b>{" "}
            {md(ch.explain)}
          </div>
        </div>
      )}
      <div className="row between">
        {checked ? (
          <button className="ghost sm" onClick={() => (setChecked(false), setPicks(ch.questions.map(() => null)))}>
            <RotateCcw size={13} /> Retry
          </button>
        ) : (
          <span />
        )}
        <button className="primary" disabled={checked || picks.some((p) => p === null || p === "")} onClick={() => (setChecked(true), onSolved())}>
          Check answers
        </button>
      </div>
    </>
  );
}

function ProgressView() {
  const { state, update } = useStore();
  const mastery = topicMastery(state);
  const today = startOfDay(new Date());
  const days = Array.from({ length: 28 }, (_, i) => addDays(today, i - 27));
  const totalReviewed = Object.values(state.days).reduce((s, d) => s + d.reviewed, 0);
  const totalCorrect = Object.values(state.days).reduce((s, d) => s + d.correct, 0);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="kpis">
        <div className="kpi">
          <b>{streak(state)}</b>
          <span>day streak</span>
        </div>
        <div className="kpi">
          <b>{Object.keys(state.cards).length}</b>
          <span>of {CARDS.length} cards seen</span>
        </div>
        <div className="kpi">
          <b>{totalReviewed}</b>
          <span>reviews</span>
        </div>
        <div className="kpi">
          <b>{totalReviewed ? Math.round((totalCorrect / totalReviewed) * 100) : 0}%</b>
          <span>recall rate</span>
        </div>
      </div>

      <div>
        <div className="section-title">Last 4 weeks</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(14, 1fr)", gap: 4, maxWidth: 420 }}>
          {days.map((d) => {
            const log = state.days[dayKey(d)];
            const n = (log?.reviewed ?? 0) + (log?.challenge ? 3 : 0);
            const op = n === 0 ? 0 : Math.min(1, 0.25 + n / 20);
            return (
              <div
                key={d.toISOString()}
                title={`${d.toDateString()}: ${log?.reviewed ?? 0} cards${log?.challenge ? " + challenge" : ""}`}
                style={{ aspectRatio: "1", borderRadius: 4, background: n ? `color-mix(in srgb, var(--ink) ${op * 100}%, var(--sunken))` : "var(--sunken)" }}
              />
            );
          })}
        </div>
      </div>

      <div>
        <div className="section-title">How well you know each topic</div>
        <div className="card flush list">
          {mastery.map((m) => {
            const on = state.cardTopics.includes(m.topic);
            return (
              <div className="item" key={m.topic} style={{ alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={on}
                  title="Include in daily cards"
                  onChange={() => update((s) => void (s.cardTopics = on ? s.cardTopics.filter((t) => t !== m.topic) : [...s.cardTopics, m.topic]))}
                />
                <div className="grow">
                  <div className="row between">
                    <span className="item-title">{m.topic}</span>
                    <span className="small muted">
                      {m.known} known · {m.seen} seen · {m.total} total
                    </span>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <Progress value={m.known} total={m.total} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="small faint" style={{ marginTop: 6 }}>
          Tick a topic to include it in your daily cards. “Known” = you've recalled it well enough that it's spaced 3+ days out.
        </p>
      </div>
      {CARD_TOPICS.length === 0 && <Empty>No cards.</Empty>}
    </div>
  );
}
