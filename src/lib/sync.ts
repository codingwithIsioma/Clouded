/**
 * Item-by-item sync between this device and your Supabase account.
 *
 * Every deadline, error, topic, resource, card's progress and day's log is one
 * row. Each row remembers when it was last edited, and the newest edit wins, so
 * changes made on your phone and laptop merge instead of overwriting each other.
 * Deletions are sent as markers so they reach the other device too.
 *
 * Local IndexedDB stays the working copy: the app opens from it instantly and
 * works offline; changes are pushed when there's a connection.
 */
import type { State } from "../types";

export type Kind = "deadline" | "error" | "topic" | "resource" | "card" | "day" | "setting";
export type Row = { kind: Kind; id: string; data: unknown; deleted: boolean; updated_at: string; synced_at?: string };

/** What this device knows about each item: its content (stable JSON, or "null" if deleted) and edit time. */
export type Meta = {
  userId: string;
  cursor?: string; // newest server synced_at seen
  known: Record<string, { h: string; t: string }>;
  dirty: Record<string, true>; // edited here, not yet on the server
  files: Record<string, true>; // PDFs already uploaded
  fileDeletes: string[]; // PDFs to remove from the server
  /** Pulled changes handed to the app but not yet seen in its state (re-applied if the app closed first). */
  incoming: Record<string, string>;
};

export type Remote = {
  pull: (since: string | undefined, limit: number) => Promise<Row[]>;
  push: (rows: Row[]) => Promise<void>;
  upload: (fileId: string, blob: Blob, type: string) => Promise<void>;
  download: (fileId: string) => Promise<Blob | null>;
  remove: (fileIds: string[]) => Promise<void>;
};

export type Deps = {
  remote: Remote;
  loadMeta: () => Promise<Meta | undefined>;
  saveMeta: (m: Meta) => Promise<unknown>;
  getFile: (id: string) => Promise<{ blob: Blob; type: string } | undefined>;
  deleteFile: (id: string) => Promise<unknown>;
  now?: () => string;
};

export type Status = { state: "idle" | "syncing" | "offline" | "error"; at?: string; message?: string; pending: number };

const LOCAL = "local:";
const key = (kind: string, id: string) => `${kind}:${id}`;
const split = (k: string) => {
  const i = k.indexOf(":");
  return { kind: k.slice(0, i) as Kind, id: k.slice(i + 1) };
};

/** JSON with sorted keys, so the same content always gives the same text. */
export function stable(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : stable(x))).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(",")}}`;
}

/** The synced parts of the state, one entry per item. Reminders already shown and backup dates stay per-device. */
export function flatten(s: State): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const d of s.deadlines) m.set(key("deadline", d.id), d);
  for (const e of s.errors) m.set(key("error", e.id), e);
  for (const t of s.topics) m.set(key("topic", t.id), t);
  for (const r of s.resources) m.set(key("resource", r.id), r);
  for (const [id, c] of Object.entries(s.cards)) m.set(key("card", id), c);
  for (const [id, d] of Object.entries(s.days)) m.set(key("day", id), d);
  m.set(key("setting", "cardTopics"), s.cardTopics);
  return m;
}

const LISTS = { deadline: "deadlines", error: "errors", topic: "topics", resource: "resources" } as const;
const MAPS = { card: "cards", day: "days" } as const;

/** Applies pulled rows to a state object in place. */
export function applyRows(s: State, rows: Row[]) {
  for (const r of rows) {
    if (r.kind in LISTS) {
      const list = s[LISTS[r.kind as keyof typeof LISTS]] as { id: string }[];
      const i = list.findIndex((x) => x.id === r.id);
      if (r.deleted) {
        if (i >= 0) list.splice(i, 1);
      } else if (i >= 0) list[i] = r.data as { id: string };
      else list.push(r.data as { id: string });
    } else if (r.kind in MAPS) {
      const map = s[MAPS[r.kind as keyof typeof MAPS]] as Record<string, unknown>;
      if (r.deleted) delete map[r.id];
      else map[r.id] = r.data;
    } else if (r.kind === "setting" && r.id === "cardTopics" && !r.deleted && Array.isArray(r.data)) {
      s.cardTopics = r.data as string[];
    }
  }
}

const localFileId = (data: unknown) => {
  const url = (data as { url?: unknown } | null)?.url;
  return typeof url === "string" && url.startsWith(LOCAL) ? url.slice(LOCAL.length) : null;
};

const PAGE = 1000;
const PUSH_CHUNK = 200;
const OVERLAP_MS = 60_000; // re-read the last minute, in case a slow write landed just behind the cursor

export class SyncEngine {
  private meta!: Meta;
  private started = false;
  private stopped = false;
  private flat = new Map<string, unknown>();
  private running: Promise<void> | null = null;
  private again = false;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  status: Status = { state: "idle", pending: 0 };
  onStatus: (s: Status) => void = () => {};
  /** Hands pulled rows to the app, which applies them to its state. */
  onRows: (rows: Row[]) => void = () => {};

  constructor(
    private userId: string,
    private deps: Deps,
  ) {}

  private now = () => this.deps.now?.() ?? new Date().toISOString();

  private setStatus(s: Partial<Status>) {
    this.status = { ...this.status, ...s, pending: Object.keys(this.meta?.dirty ?? {}).length };
    this.onStatus(this.status);
  }

  private persist(soon = true) {
    clearTimeout(this.saveTimer);
    const write = () => this.deps.saveMeta(this.meta).catch((e) => console.error("Sync meta save failed", e));
    if (soon) this.saveTimer = setTimeout(write, 300);
    else return write();
  }

  /** Call once with the state loaded from this device. */
  async start(state: State) {
    const saved = await this.deps.loadMeta();
    if (this.stopped) return;
    this.meta = saved?.userId === this.userId ? { ...saved, incoming: saved.incoming ?? {} } : { userId: this.userId, known: {}, dirty: {}, files: {}, fileDeletes: [], incoming: {} };
    this.flat = flatten(state);
    this.started = true;
    // Pulled changes that never made it into the saved state: apply them again.
    const redo: Row[] = [];
    for (const [k, h] of Object.entries(this.meta.incoming)) {
      if (stable(this.flat.get(k) ?? null) === h || (h === "null" && !this.flat.has(k))) delete this.meta.incoming[k];
      else {
        const { kind, id } = split(k);
        redo.push({ kind, id, data: h === "null" ? null : JSON.parse(h), deleted: h === "null", updated_at: this.meta.known[k]?.t ?? this.now() });
      }
    }
    if (redo.length) this.onRows(redo);
    // On the very first sync the account's copy goes first, then whatever only this device has is added to it.
    if (this.meta.cursor) this.diff(this.flat);
    await this.sync();
  }

  /** Call with every new state. Finds what changed here since last time and queues it. */
  localChange(state: State) {
    this.flat = flatten(state);
    if (!this.started || !this.meta.cursor) return;
    if (this.diff(this.flat)) {
      this.persist();
      this.setStatus({});
      this.schedulePush();
    }
  }

  private diff(flat: Map<string, unknown>) {
    const t = this.now();
    let changed = false;
    for (const [k, v] of flat) {
      const h = stable(v);
      const pending = this.meta.incoming[k];
      if (pending !== undefined) {
        if (pending === h) delete this.meta.incoming[k];
        continue; // the app hasn't shown the pulled version yet
      }
      if (this.meta.known[k]?.h !== h) {
        this.meta.known[k] = { h, t };
        this.meta.dirty[k] = true;
        changed = true;
      }
    }
    for (const [k, info] of Object.entries(this.meta.known)) {
      if (flat.has(k) || info.h === "null") continue;
      if (k in this.meta.incoming) {
        if (this.meta.incoming[k] === "null") delete this.meta.incoming[k];
        continue;
      }
      if (split(k).kind === "setting") continue;
      if (split(k).kind === "resource") {
        const fid = localFileId(JSON.parse(info.h));
        if (fid) this.meta.fileDeletes.push(fid);
      }
      this.meta.known[k] = { h: "null", t };
      this.meta.dirty[k] = true;
      changed = true;
    }
    return changed;
  }

  private pushTimer: ReturnType<typeof setTimeout> | undefined;
  private schedulePush() {
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => this.sync(), 1500);
  }

  /** Pull what's new, then push what's waiting. Safe to call any time. */
  sync(): Promise<void> {
    if (!this.started || this.stopped) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          this.setStatus({ state: "offline" });
          break;
        }
        this.setStatus({ state: "syncing" });
        try {
          await this.pull();
          await this.push();
          await this.pushFiles();
          await this.persist(false);
          this.setStatus({ state: "idle", at: this.now(), message: undefined });
        } catch (e) {
          await this.persist(false);
          const msg = (e as Error)?.message ?? String(e);
          const offline = /fetch|network|load failed/i.test(msg);
          this.setStatus({ state: offline ? "offline" : "error", message: offline ? undefined : msg });
          break;
        }
      } while (this.again);
    })().finally(() => (this.running = null));
    return this.running;
  }

  private async pull() {
    const first = !this.meta.cursor;
    const since = this.meta.cursor ? new Date(new Date(this.meta.cursor).getTime() - OVERLAP_MS).toISOString() : undefined;
    const seen = new Set<string>();
    let from = since;
    const apply: Row[] = [];
    for (;;) {
      const page = (await this.deps.remote.pull(from, PAGE)).filter((r) => !seen.has(key(r.kind, r.id) + r.synced_at));
      for (const r of page) {
        seen.add(key(r.kind, r.id) + r.synced_at);
        if (r.synced_at && (!this.meta.cursor || r.synced_at > this.meta.cursor)) this.meta.cursor = r.synced_at;
        const k = key(r.kind, r.id);
        const h = r.deleted ? "null" : stable(r.data);
        const mine = this.meta.known[k];
        if (mine?.h === h) {
          if (!this.meta.dirty[k] || mine.t <= r.updated_at) delete this.meta.dirty[k];
          continue;
        }
        if (mine && mine.t > r.updated_at && (this.meta.dirty[k] || !first)) continue; // ours is newer
        this.meta.known[k] = { h, t: r.updated_at };
        delete this.meta.dirty[k];
        apply.push(r);
      }
      if (page.length < PAGE) break;
      from = page[page.length - 1].synced_at;
    }
    if (first) {
      // Nothing on the server yet still counts as synced from now on.
      this.meta.cursor ??= new Date(0).toISOString();
      const merged = new Map(this.flat);
      for (const r of apply) {
        if (r.deleted) merged.delete(key(r.kind, r.id));
        else merged.set(key(r.kind, r.id), r.data);
      }
      this.diff(merged); // anything only on this device gets queued for upload
    }
    if (apply.length) {
      for (const r of apply) {
        const k = key(r.kind, r.id);
        if (r.deleted) {
          if (r.kind === "resource") {
            const fid = localFileId(this.flat.get(k));
            if (fid) this.deps.deleteFile(fid).catch(() => {});
          }
          if (this.flat.has(k)) this.meta.incoming[k] = "null";
        } else {
          const h = stable(r.data);
          if (stable(this.flat.get(k)) !== h) this.meta.incoming[k] = h;
        }
      }
      this.onRows(apply);
    }
  }

  private async push() {
    const keys = Object.keys(this.meta.dirty);
    for (let i = 0; i < keys.length; i += PUSH_CHUNK) {
      const chunk = keys.slice(i, i + PUSH_CHUNK);
      const sent = chunk.map((k) => ({ k, ...this.meta.known[k] }));
      const rows: Row[] = sent.map(({ k, h, t }) => {
        const { kind, id } = split(k);
        return { kind, id, data: h === "null" ? null : JSON.parse(h), deleted: h === "null", updated_at: t };
      });
      await this.deps.remote.push(rows);
      // Only clear what didn't change again while it was being sent.
      for (const s of sent) if (this.meta.known[s.k]?.t === s.t && this.meta.known[s.k]?.h === s.h) delete this.meta.dirty[s.k];
    }
  }

  private async pushFiles() {
    if (this.meta.fileDeletes.length) {
      const ids = [...new Set(this.meta.fileDeletes)];
      await this.deps.remote.remove(ids);
      for (const id of ids) delete this.meta.files[id];
      this.meta.fileDeletes = this.meta.fileDeletes.filter((x) => !ids.includes(x));
    }
    for (const [k, v] of this.flat) {
      if (split(k).kind !== "resource") continue;
      const fid = localFileId(v);
      if (!fid || this.meta.files[fid]) continue;
      const f = await this.deps.getFile(fid);
      if (!f) continue; // not on this device; the other one uploads it
      await this.deps.remote.upload(fid, f.blob, f.type);
      this.meta.files[fid] = true;
    }
  }

  /** Gets a PDF that was uploaded from another device. */
  async download(fileId: string) {
    const blob = await this.deps.remote.download(fileId);
    if (blob && this.meta) this.meta.files[fileId] = true; // already on the server; no need to send it back
    return blob;
  }

  /** Stops syncing (the app is closing this engine). */
  stop() {
    this.stopped = true;
    clearTimeout(this.pushTimer);
    this.onRows = () => {};
    this.onStatus = () => {};
    if (this.started) this.persist(false);
  }

  /** Writes what this device knows right away (when the app is being hidden or closed). */
  flush() {
    if (this.started) return this.persist(false);
  }

  /** Everything waiting has been sent (used before signing out). */
  get pending() {
    return Object.keys(this.meta?.dirty ?? {}).length + (this.meta?.fileDeletes.length ?? 0);
  }
}
