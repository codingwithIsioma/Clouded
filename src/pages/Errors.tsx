import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { uid, useStore } from "../store";
import type { ErrorEntry, ErrorStatus, ID } from "../types";
import { errorTokens, includesCI, similarity, splitTags } from "../lib/text";
import { timeAgo } from "../lib/dates";
import { Empty, Field, Modal, PageHead, Segmented, Tags, go } from "../ui";

const STATUS: { value: ErrorStatus; label: string }[] = [
  { value: "solved", label: "Solved" },
  { value: "workaround", label: "Workaround" },
  { value: "stuck", label: "Still stuck" },
];

export default function Errors({ params }: { params: URLSearchParams }) {
  const { state } = useStore();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [tag, setTag] = useState<string | null>(null);
  const [status, setStatus] = useState<ErrorStatus | "all">("all");
  const [paste, setPaste] = useState("");
  const [editing, setEditing] = useState<ID | "new" | null>(params.get("id"));
  const [prefill, setPrefill] = useState<Partial<ErrorEntry>>({});

  useEffect(() => setEditing(params.get("id")), [params]);

  const allTags = [...new Set(state.errors.flatMap((e) => e.tags))].sort();

  const list = state.errors
    .filter((e) => (status === "all" ? true : e.status === status))
    .filter((e) => (tag ? e.tags.includes(tag) : true))
    .filter((e) => !q || [e.title, e.message, e.cause, e.fix, ...e.tags].some((f) => includesCI(f, q)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const matches = useMemo(() => {
    if (paste.trim().length < 6) return null;
    const t = errorTokens(paste);
    const exact = paste.trim().toLowerCase();
    return state.errors
      .map((e) => ({ e, score: e.message.toLowerCase().includes(exact) ? 1 : similarity(t, errorTokens(`${e.title} ${e.message}`)) }))
      .filter((m) => m.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [paste, state.errors]);

  return (
    <>
      <PageHead title="Error Journal" sub="Every error you've hit and how you fixed it, so you never solve the same one twice.">
        <button className="primary" onClick={() => (setPrefill({}), setEditing("new"))}>
          <Plus size={14} /> Log an error
        </button>
      </PageHead>

      <div className="card stack">
        <Field label="Seen this before?" hint="Paste a new error message to search your journal.">
          <textarea className="mono" placeholder="Paste an error…" value={paste} onChange={(e) => setPaste(e.target.value)} style={{ minHeight: 64 }} />
        </Field>
        {matches &&
          (matches.length ? (
            <div className="stack" style={{ gap: 8 }}>
              <div className="small muted">You've seen something like this {matches.length === 1 ? "once" : `${matches.length} times`}:</div>
              {matches.map(({ e, score }) => (
                <div key={e.id} className="banner good" style={{ cursor: "pointer" }} onClick={() => go("errors", { id: e.id })}>
                  <div className="grow">
                    <b>{e.title}</b> <span className="faint small">{Math.round(score * 100)}% match</span>
                    {e.fix && (
                      <p className="small" style={{ marginTop: 4 }}>
                        <span className="muted">Fix: </span>
                        {e.fix.length > 200 ? e.fix.slice(0, 200) + "…" : e.fix}
                      </p>
                    )}
                  </div>
                  <span className={`pill ${e.status}`}>{e.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="row between small">
              <span className="muted">New one — nothing like it in your journal.</span>
              <button className="sm" onClick={() => (setPrefill({ message: paste }), setEditing("new"))}>
                Log it
              </button>
            </div>
          ))}
      </div>

      <div className="section row between">
        <div className="search grow" style={{ maxWidth: 360 }}>
          <Search size={15} />
          <input placeholder="Search entries" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Segmented value={status} onChange={setStatus} options={[{ value: "all", label: "All" }, ...STATUS]} />
      </div>
      {allTags.length > 0 && (
        <div className="row" style={{ marginTop: 10, gap: 4 }}>
          {allTags.map((t) => (
            <button key={t} className={`sm ${tag === t ? "primary" : "ghost"}`} onClick={() => setTag(tag === t ? null : t)}>
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="card flush list" style={{ marginTop: 14 }}>
        {list.length === 0 && <Empty>{state.errors.length ? "No entries match." : "No errors logged yet. The next time something breaks, write down the fix here."}</Empty>}
        {list.map((e) => (
          <div className="item click" key={e.id} onClick={() => go("errors", { id: e.id })}>
            <div className="grow">
              <div className="item-title">{e.title}</div>
              {e.message && (
                <div className="mono small muted" style={{ marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.message.split("\n")[0]}
                </div>
              )}
              <div className="item-meta">
                <span className={`pill ${e.status}`}>{STATUS.find((s) => s.value === e.status)!.label}</span>
                <Tags tags={e.tags} onClick={setTag} />
                <span>{timeAgo(e.createdAt)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (editing === "new" || state.errors.some((e) => e.id === editing)) && (
        <ErrorEditor id={editing} prefill={prefill} onClose={() => (setEditing(null), params.get("id") && go("errors"))} />
      )}
    </>
  );
}

function ErrorEditor({ id, prefill, onClose }: { id: ID | "new"; prefill: Partial<ErrorEntry>; onClose: () => void }) {
  const { state, update } = useStore();
  const existing = state.errors.find((e) => e.id === id);
  const [e, setE] = useState<ErrorEntry>(
    () =>
      existing ?? {
        id: uid(),
        title: "",
        message: "",
        cause: "",
        fix: "",
        tags: [],
        status: "solved",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...prefill,
      },
  );
  const [tags, setTags] = useState(e.tags.join(", "));
  const knownTags = [...new Set(state.errors.flatMap((x) => x.tags))];

  const save = () => {
    const entry = { ...e, title: e.title.trim() || e.message.split("\n")[0].slice(0, 80) || "Untitled error", tags: splitTags(tags), updatedAt: new Date().toISOString() };
    update((s) => {
      const i = s.errors.findIndex((x) => x.id === entry.id);
      if (i >= 0) s.errors[i] = entry;
      else s.errors.push(entry);
    });
    onClose();
  };

  return (
    <Modal title={existing ? "Error entry" : "Log an error"} onClose={onClose} wide>
      <Field label="Title">
        <input autoFocus={!existing} value={e.title} onChange={(x) => setE({ ...e, title: x.target.value })} placeholder="e.g. nginx 502 after deploying the API container" />
      </Field>
      <Field label="Error message">
        <textarea className="mono" value={e.message} onChange={(x) => setE({ ...e, message: x.target.value })} placeholder="Paste the exact output" />
      </Field>
      <Field label="What caused it">
        <textarea value={e.cause} onChange={(x) => setE({ ...e, cause: x.target.value })} style={{ minHeight: 60 }} />
      </Field>
      <Field label="The fix">
        <textarea value={e.fix} onChange={(x) => setE({ ...e, fix: x.target.value })} placeholder="What you changed, the command that worked…" />
      </Field>
      <div className="grid2">
        <Field label="Tags" hint={knownTags.length ? `Used: ${knownTags.slice(0, 8).join(", ")}` : "Comma separated — Docker, nginx, Git…"}>
          <input value={tags} onChange={(x) => setTags(x.target.value)} placeholder="Docker, nginx" />
        </Field>
        <Field label="Where it happened">
          <select value={e.deadlineId ?? ""} onChange={(x) => setE({ ...e, deadlineId: x.target.value || undefined })}>
            <option value="">—</option>
            {state.deadlines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Status">
        <Segmented value={e.status} onChange={(status) => setE({ ...e, status })} options={STATUS} />
      </Field>
      <div className="row between">
        {existing ? (
          <button
            className="ghost danger"
            onClick={() => {
              if (confirm("Delete this entry?")) {
                update((s) => void (s.errors = s.errors.filter((x) => x.id !== e.id)));
                onClose();
              }
            }}
          >
            <Trash2 size={14} /> Delete
          </button>
        ) : (
          <span />
        )}
        <button className="primary" onClick={save}>
          Save
        </button>
      </div>
    </Modal>
  );
}
