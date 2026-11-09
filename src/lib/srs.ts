import type { CardProgress, State } from "../types";
import { CARDS, type Card } from "../data/cards";
import { addDays, dayKey, startOfDay, DAY } from "./dates";

export type Grade = "again" | "hard" | "good" | "easy";

/** SM-2 style scheduling: missed cards come back tomorrow, known cards spread further apart. */
export function review(p: CardProgress | undefined, grade: Grade, now = new Date()): CardProgress {
  const cur: CardProgress = p ?? { ease: 2.5, interval: 0, due: now.toISOString(), reps: 0, lapses: 0 };
  let { ease, interval, reps, lapses } = cur;
  if (grade === "again") {
    lapses += 1;
    reps = 0;
    interval = 0; // back later today / tomorrow
    ease = Math.max(1.3, ease - 0.2);
  } else {
    reps += 1;
    if (grade === "hard") {
      interval = Math.max(1, Math.round(interval * 1.2));
      ease = Math.max(1.3, ease - 0.15);
    } else if (grade === "good") {
      interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(interval * ease);
    } else {
      interval = reps === 1 ? 3 : Math.round(Math.max(interval, 1) * ease * 1.3);
      ease += 0.15;
    }
  }
  const due = interval === 0 ? addDays(startOfDay(now), 1) : addDays(startOfDay(now), interval);
  return { ease, interval, reps, lapses, due: due.toISOString(), last: now.toISOString(), first: cur.first ?? now.toISOString() };
}

const NEW_PER_DAY = 6;
const MAX_PER_DAY = 15;

/** Today's set: due reviews first (most-missed first), topped up with a few new cards. Stable through the day. */
export function todaysCards(state: State, now = new Date()): Card[] {
  const pool = CARDS.filter((c) => state.cardTopics.includes(c.topic));
  const endToday = startOfDay(now).getTime() + DAY;
  const reviewedToday = (c: Card) => {
    const last = state.cards[c.id]?.last;
    return last ? dayKey(new Date(last)) === dayKey(now) : false;
  };
  const due = pool
    .filter((c) => state.cards[c.id] && new Date(state.cards[c.id].due).getTime() < endToday && !reviewedToday(c))
    .sort((a, b) => state.cards[b.id].lapses - state.cards[a.id].lapses);
  const firstToday = (c: Card) => {
    const first = state.cards[c.id]?.first;
    return first ? dayKey(new Date(first)) === dayKey(now) : false;
  };
  const newDoneToday = pool.filter(firstToday).length;
  const unseen = pool.filter((c) => !state.cards[c.id]);
  // interleave topics for new cards
  const byTopic = new Map<string, Card[]>();
  unseen.forEach((c) => byTopic.set(c.topic, [...(byTopic.get(c.topic) ?? []), c]));
  const fresh: Card[] = [];
  while (fresh.length < unseen.length) {
    for (const list of byTopic.values()) if (list.length) fresh.push(list.shift()!);
  }
  const room = Math.max(0, Math.min(NEW_PER_DAY - newDoneToday, MAX_PER_DAY - due.length));
  return [...due.slice(0, MAX_PER_DAY), ...fresh.slice(0, room)];
}

export function topicMastery(state: State) {
  const topics = [...new Set(CARDS.map((c) => c.topic))];
  return topics.map((t) => {
    const cards = CARDS.filter((c) => c.topic === t);
    const seen = cards.filter((c) => state.cards[c.id]);
    const known = seen.filter((c) => state.cards[c.id].interval >= 3);
    return { topic: t, total: cards.length, seen: seen.length, known: known.length };
  });
}

/** Consecutive days (ending today, or yesterday if today isn't done yet) with any practice. */
export function streak(state: State, now = new Date()) {
  const active = (k: string) => {
    const d = state.days[k];
    return !!d && (d.reviewed > 0 || !!d.challenge);
  };
  let d = startOfDay(now);
  if (!active(dayKey(d))) d = addDays(d, -1);
  let n = 0;
  while (active(dayKey(d))) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}
