/**
 * Optional AI features through OpenRouter's free models.
 * Calls go straight from your browser to OpenRouter with your own key; no server in between.
 * Everything here has an offline fallback, so the app works the same without a key.
 */
import type { AIFeedback, AISettings } from "../types";
import type { Plan, PlanStep, Requirement } from "./planner";

const API = "https://openrouter.ai/api/v1";
export const FREE_ROUTER = "openrouter/free";
export const DEFAULT_AI: Omit<AISettings, "key"> = { model: FREE_ROUTER };

export type FreeModel = { id: string; name: string; context: number };

/** Free text models on OpenRouter right now (the list changes often). */
export async function listFreeModels(): Promise<FreeModel[]> {
  const res = await fetch(`${API}/models`);
  if (!res.ok) throw new Error(`Couldn't load models (${res.status})`);
  const { data } = (await res.json()) as {
    data: { id: string; name: string; context_length?: number; architecture?: { input_modalities?: string[]; output_modalities?: string[] } }[];
  };
  return data
    .filter((m) => m.id === FREE_ROUTER || m.id.endsWith(":free"))
    .filter((m) => (m.architecture?.output_modalities ?? ["text"]).includes("text") && (m.architecture?.input_modalities ?? ["text"]).includes("text"))
    .map((m) => ({ id: m.id, name: m.id === FREE_ROUTER ? "Any free model (picked automatically)" : m.name.replace(/\s*\(free\)\s*$/i, ""), context: m.context_length ?? 0 }))
    .sort((a, b) => (a.id === FREE_ROUTER ? -1 : b.id === FREE_ROUTER ? 1 : a.name.localeCompare(b.name)));
}

export type KeyInfo = { label: string; freeUsed?: number; freeLimit?: number };

/** Checks a key without using up a request. */
export async function checkKey(key: string): Promise<KeyInfo> {
  const res = await fetch(`${API}/key`, { headers: { Authorization: `Bearer ${key.trim()}` } });
  if (res.status === 401 || res.status === 403) throw new Error("OpenRouter didn't accept that key. Check you copied all of it.");
  if (!res.ok) throw new Error(`OpenRouter returned ${res.status}`);
  const { data } = (await res.json()) as { data: { label?: string; free_model_daily_requests?: { used?: number; limit?: number } } };
  return { label: data.label ?? "", freeUsed: data.free_model_daily_requests?.used, freeLimit: data.free_model_daily_requests?.limit };
}

class AIError extends Error {}

async function chat(ai: AISettings, system: string, user: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(`${API}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${ai.key.trim()}`,
        "Content-Type": "application/json",
        "X-Title": "Clouded",
        "HTTP-Referer": location.origin,
      },
      body: JSON.stringify({
        model: ai.model || FREE_ROUTER,
        // If the chosen model is busy or gone, OpenRouter falls back to any free model.
        ...(ai.model && ai.model !== FREE_ROUTER ? { models: [ai.model, FREE_ROUTER] } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const msg: string = body?.error?.message ?? res.statusText;
      if (res.status === 401) throw new AIError("OpenRouter rejected your key. Check it under Settings → AI.");
      if (res.status === 429) throw new AIError("You've hit the free limit for now (50 requests a day, 20 a minute). Try again later.");
      if (res.status === 402) throw new AIError("OpenRouter says your account balance is negative, which blocks free models too.");
      throw new AIError(`OpenRouter error ${res.status}: ${msg}`);
    }
    const text: string | undefined = body?.choices?.[0]?.message?.content;
    if (!text?.trim()) throw new AIError("The model sent back an empty answer. Try again, or pick another model.");
    return text;
  } catch (e) {
    if (e instanceof AIError) throw e;
    if ((e as Error).name === "AbortError") throw new AIError("The model took too long to answer. Try again, or pick another model.");
    throw new AIError(navigator.onLine === false ? "You're offline." : `Couldn't reach OpenRouter: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Pulls the JSON object out of a reply, even if it's wrapped in prose, code fences or <think> tags. */
export function extractJson(text: string): unknown {
  const t = text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) throw new AIError("The model didn't answer in the expected format.");
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    throw new AIError("The model's answer was cut off or malformed.");
  }
}

/** Asks, and asks once more if the answer can't be used. */
async function ask<T>(ai: AISettings, system: string, user: string, read: (j: unknown) => T): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return read(extractJson(await chat(ai, system, user)));
    } catch (e) {
      last = e;
      if (!(e instanceof AIError) || /key|limit|balance|offline/i.test(e.message)) throw e;
    }
  }
  throw last;
}

const str = (v: unknown, max = 400) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const strs = (v: unknown, n: number, max = 200) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);

/* ---------------- Assignment breakdown ---------------- */

const PLAN_SYSTEM = `You help a cloud engineering student plan assignments. You break a brief into a study plan.

The most important rule: never solve the assignment. No commands, code, config, answers or step-by-step solutions. Each step says WHAT to work on, learn, decide or produce, never HOW to do it. Write as if you were a tutor who wants the student to do the thinking.

Reply with only a JSON object, no other text:
{
  "title": "short assignment title",
  "summary": "one or two sentences: what the assignment asks for",
  "steps": [
    { "title": "short imperative step title", "focus": "1-2 sentences on what to focus on or produce in this step, with no solution", "concepts": ["concepts to review for this step"], "effortHours": 2 }
  ],
  "requirements": [ { "text": "a requirement from the brief, close to its own wording", "kind": "must" | "should" | "deliverable" } ],
  "concepts": ["key technical concepts the brief relies on"]
}

Steps: 4 to 8, in the order the student should do them. Start with understanding the brief and end with checking requirements and submitting. Use the brief's own tasks and parts where it has them. effortHours is a realistic estimate in half hours (0.5 to 12) and the total should fit the hours available.
Requirements: everything the brief says must, should or must be submitted (deliverables such as a repo link, screenshots or a README). At most 20.
Concepts: short names like "IAM roles" or "Docker volumes", at most 10.`;

export async function aiPlan(ai: AISettings, brief: string, ctx: { start: Date; due: Date; hoursAvailable: number }): Promise<Plan> {
  const user = `Start date: ${ctx.start.toDateString()}
Due: ${ctx.due.toString()}
Hours the student has available before the due date: about ${Math.round(ctx.hoursAvailable)}

Assignment brief:
"""
${brief.slice(0, 30_000)}
"""`;
  return ask(ai, PLAN_SYSTEM, user, (j) => {
    const o = j as Record<string, unknown>;
    const steps: PlanStep[] = (Array.isArray(o.steps) ? o.steps : [])
      .map((s: Record<string, unknown>) => ({
        title: str(s?.title, 120),
        focus: str(s?.focus, 500),
        concepts: strs(s?.concepts, 4, 60),
        effortHours: Math.min(12, Math.max(0.5, Math.round((Number(s?.effortHours) || 1) * 2) / 2)),
      }))
      .filter((s) => s.title)
      .slice(0, 8);
    if (steps.length < 3) throw new AIError("The model's plan didn't have enough steps.");
    const kinds = ["must", "should", "deliverable"] as const;
    const requirements: Requirement[] = (Array.isArray(o.requirements) ? o.requirements : [])
      .map((r: Record<string, unknown>) => ({ text: str(r?.text, 300), kind: kinds.includes(r?.kind as never) ? (r.kind as Requirement["kind"]) : "must" }))
      .filter((r) => r.text)
      .slice(0, 20);
    return { title: str(o.title, 120) || "Assignment", summary: str(o.summary, 400), steps, requirements, concepts: strs(o.concepts, 10, 60) };
  });
}

/* ---------------- Explain-It-Back feedback ---------------- */

export const CHECK_IDS = ["what", "why", "how", "example", "limits", "jargon"] as const;

const FEEDBACK_SYSTEM = `You give feedback to a cloud engineering student who explained a topic in their own words, to test whether they really understand it.

Be warm, honest and brief. Don't rewrite their explanation or give them the full answer: point at what's missing or wrong with hints and guiding questions, so they work it out themselves. If something is factually wrong, say clearly what is wrong, but leave the correction to them with a hint.

Judge which of these the explanation actually covers:
- "what": says what it is in one or two plain sentences
- "why": explains why it exists, the problem it solves
- "how": walks through how it works, step by step
- "example": gives a concrete example (a command, config or real scenario)
- "limits": names a limitation, trade-off or common mistake
- "jargon": every technical word used is used correctly and could be defined

Reply with only a JSON object, no other text:
{
  "covered": ["ids from the list above that the explanation covers"],
  "summary": "one sentence overall verdict",
  "strengths": ["what they got right, up to 3"],
  "gaps": ["what's missing, each as a hint or guiding question, up to 4"],
  "misconceptions": ["anything incorrect, stated plainly with a hint toward the right idea, up to 3; empty if none"],
  "question": "one follow-up question to test deeper understanding",
  "confidence": "shaky" | "getting" | "locked"
}`;

export async function aiFeedback(ai: AISettings, topic: string, explanation: string): Promise<AIFeedback & { covered: string[] }> {
  const user = `Topic: ${topic}

Student's explanation:
"""
${explanation.slice(0, 12_000)}
"""`;
  return ask(ai, FEEDBACK_SYSTEM, user, (j) => {
    const o = j as Record<string, unknown>;
    const summary = str(o.summary, 300);
    const strengths = strs(o.strengths, 3, 300);
    const gaps = strs(o.gaps, 4, 300);
    if (!summary && !strengths.length && !gaps.length) throw new AIError("The model's feedback was empty.");
    const conf = ["shaky", "getting", "locked"].includes(o.confidence as string) ? (o.confidence as AIFeedback["confidence"]) : undefined;
    return {
      covered: (Array.isArray(o.covered) ? o.covered : []).filter((c): c is string => CHECK_IDS.includes(c as never)),
      summary,
      strengths,
      gaps,
      misconceptions: strs(o.misconceptions, 3, 300),
      question: str(o.question, 300),
      confidence: conf,
      model: ai.model || FREE_ROUTER,
    };
  });
}
