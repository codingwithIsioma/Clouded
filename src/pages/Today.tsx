import { useEffect, useMemo, useRef, useState } from "react";
import { BookMarked, Brain, Bug, CalendarClock, Flame, Search, SquareTerminal } from "lucide-react";
import { useStore } from "../store";
import type { State } from "../types";
import { agenda, bucketOf, dayKey, fmtDate, timeAgo } from "../lib/dates";
import { streak, todaysCards } from "../lib/srs";
import { challengeFor } from "../data/challenges";
import { includesCI } from "../lib/text";
import { Empty, go } from "../ui";
import { AgendaRow } from "./Deadlines";
import { CONF, topicsToReview } from "./Explain";
import { ResLink } from "./Vault";
import { backupOverdue } from "./Data";

type Hit = { kind: "Deadline" | "Step" | "Error" | "Resource" | "Note" | "Topic"; title: string; sub: string; go: () => void };

function searchAll(s: State, q: string): Hit[] {
  const hits: Hit[] = [];
  const m = (...f: (string | undefined)[]) => f.some((x) => includesCI(x, q));
  for (const d of s.deadlines) {
    if (m(d.title, d.notes, d.summary, ...d.concepts)) hits.push({ kind: "Deadline", title: d.title, sub: `due ${fmtDate(d.due)}${d.done ? " · done" : ""}`, go: () => go("deadlines", { id: d.id }) });
    d.steps.forEach((st, i) => {
      if (m(st.title, st.focus, st.notes, ...st.concepts))
        hits.push({ kind: "Step", title: `Step ${i + 1}: ${st.title}`, sub: d.title + (st.notes && includesCI(st.notes, q) ? " · in your notes" : ""), go: () => go("deadlines", { id: d.id }) });
    });
  }
  for (const e of s.errors)
    if (m(e.title, e.message, e.cause, e.fix, ...e.tags)) hits.push({ kind: "Error", title: e.title, sub: `${e.status} · ${e.tags.join(", ")}`, go: () => go("errors", { id: e.id }) });
  for (const r of s.resources)
    if (m(r.title, r.url, r.notes, r.module, ...r.tags)) hits.push({ kind: r.kind === "note" ? "Note" : "Resource", title: r.title, sub: [r.module, ...r.tags].filter(Boolean).join(" · "), go: () => go("vault", { id: r.id }) });
  for (const t of s.topics)
    if (m(t.name, ...t.explanations.map((e) => e.text))) hits.push({ kind: "Topic", title: t.name, sub: CONF.find((c) => c.value === t.confidence)!.label, go: () => go("explain", { topic: t.name }) });
  return hits.slice(0, 30);
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export default function Today() {
  const { state } = useStore();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => (q.trim().length > 1 ? searchAll(state, q.trim()) : null), [q, state]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const items = agenda(state.deadlines);
  const urgent = items.filter((a) => ["overdue", "today"].includes(bucketOf(a.due)));
  const thisWeek = items.filter((a) => bucketOf(a.due) === "week");
  const cards = todaysCards(state);
  const ch = challengeFor(dayKey());
  const chDone = !!state.days[dayKey()]?.challenge;
  const topic = topicsToReview(state)[0];
  const unread = [...state.resources].filter((r) => r.kind !== "note" && !r.opened && r.status === "toread").sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  const st = streak(state);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted small">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
          <h1 style={{ marginTop: 2 }}>{greeting()}</h1>
        </div>
      </div>

      <div className="search">
        <Search size={16} />
        <input ref={inputRef} placeholder="Search deadlines, errors, resources and notes   /" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQ("")} />
      </div>

      {hits ? (
        <div className="card flush list" style={{ marginTop: 10 }}>
          {hits.length === 0 && <Empty>Nothing found for “{q}”.</Empty>}
          {hits.map((h, i) => (
            <div className="item click" key={i} onClick={h.go}>
              <span className="pill" style={{ minWidth: 70, textAlign: "center" }}>
                {h.kind}
              </span>
              <div className="grow">
                <div className="item-title">{h.title}</div>
                {h.sub && <div className="item-meta">{h.sub}</div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="section">
            <div className="section-title">
              <CalendarClock size={13} /> Due today
              {thisWeek.length > 0 && (
                <a href="#/deadlines" className="faint" style={{ marginLeft: "auto", textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
                  {thisWeek.length} more this week →
                </a>
              )}
            </div>
            <div className="card flush list">
              {urgent.length === 0 && <Empty>Nothing due today. {items.length ? "Get ahead on something from this week." : <a href="#/deadlines">Add a deadline</a>}</Empty>}
              {urgent.map((a) => (
                <AgendaRow key={a.key} a={a} onOpen={() => go("deadlines", { id: a.deadline.id })} />
              ))}
            </div>
          </div>

          <div className="section tiles">
            <div className="tile">
              <span className="label">
                <SquareTerminal size={13} /> Today's cards
                <span className="row" style={{ marginLeft: "auto", gap: 3 }}>
                  <Flame size={13} color={st ? "var(--orange)" : "var(--faint)"} /> {st}
                </span>
              </span>
              <div className="big">{cards.length ? `${cards.length} card${cards.length > 1 ? "s" : ""} to review` : "All caught up"}</div>
              <p className="small muted">
                Daily challenge: {{ fix: "fix the broken command", quiz: "quick quiz", mini: "mini challenge" }[ch.kind]} ({ch.topic}) {chDone ? "✓" : ""}
              </p>
              <div className="foot row">
                {cards.length > 0 && (
                  <a className="btn primary sm" href="#/cards">
                    Start
                  </a>
                )}
                <a className="btn sm" href="#/cards?tab=challenge">
                  {chDone ? "Review challenge" : "Challenge"}
                </a>
              </div>
            </div>

            <div className="tile">
              <span className="label">
                <Brain size={13} /> One topic to review
              </span>
              {topic ? (
                <>
                  <div className="big">{topic.name}</div>
                  <p className="small muted">
                    {CONF.find((c) => c.value === topic.confidence)!.label} · {topic.lastReviewed ? `last explained ${timeAgo(topic.lastReviewed)}` : "never explained"}
                  </p>
                  <div className="foot">
                    <a className="btn sm" href={`#/explain?topic=${encodeURIComponent(topic.name)}`}>
                      Explain it back
                    </a>
                  </div>
                </>
              ) : (
                <>
                  <p className="small muted">{state.topics.length ? "Everything's fresh. Nice." : "Add topics you're learning to get review suggestions."}</p>
                  <div className="foot">
                    <a className="btn sm" href="#/explain">
                      Topics
                    </a>
                  </div>
                </>
              )}
            </div>

            <div className="tile">
              <span className="label">
                <BookMarked size={13} /> One unread resource
              </span>
              {unread ? (
                <>
                  <div className="big">{unread.title}</div>
                  <p className="small muted">
                    {[unread.module, `saved ${timeAgo(unread.createdAt)}`].filter(Boolean).join(" · ")}
                  </p>
                  <div className="foot">
                    <ResLink r={unread} className="btn sm">
                      Open
                    </ResLink>
                  </div>
                </>
              ) : (
                <>
                  <p className="small muted">{state.resources.length ? "You've opened everything you saved." : "Nothing saved yet."}</p>
                  <div className="foot">
                    <a className="btn sm" href="#/vault?add=1">
                      Save a resource
                    </a>
                  </div>
                </>
              )}
            </div>

            <div className="tile">
              <span className="label">
                <Bug size={13} /> Error Journal
              </span>
              <div className="big">
                {state.errors.length} logged
                {state.errors.some((e) => e.status === "stuck") && <span className="muted" style={{ fontWeight: 400 }}> · {state.errors.filter((e) => e.status === "stuck").length} still stuck</span>}
              </div>
              <p className="small muted">Hit something new? Paste it to check whether you've solved it before.</p>
              <div className="foot">
                <a className="btn sm" href="#/errors">
                  Check an error
                </a>
              </div>
            </div>
          </div>

          <div className="section row between small desktop-only">
            {backupOverdue(state) ? (
              <span className="muted">
                {state.lastBackup ? `Last backup ${timeAgo(state.lastBackup)}.` : "You haven't backed up yet."} Your data only lives in this browser.
              </span>
            ) : (
              <span className="faint">Saved in this browser.</span>
            )}
            <a href="#/data" className="btn sm">
              Back up
            </a>
          </div>
        </>
      )}
    </>
  );
}
