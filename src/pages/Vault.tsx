import { useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, FileText, Link2, Plus, Search, Trash2, Upload, Video } from "lucide-react";
import { uid, useStore } from "../store";
import type { ID, ReadStatus, Resource, ResourceKind } from "../types";
import { includesCI, splitTags } from "../lib/text";
import { timeAgo } from "../lib/dates";
import { LOCAL_PREFIX, deleteFile, isLocalUrl, openUrl, putFile } from "../lib/db";
import { Empty, Field, Modal, PageHead, Segmented, Tags, go } from "../ui";

export const STATUS: { value: ReadStatus; label: string }[] = [
  { value: "toread", label: "To read" },
  { value: "reading", label: "In progress" },
  { value: "done", label: "Done" },
];
const KIND_ICON = { link: Link2, video: Video, pdf: FileText };

const guessKind = (url: string): ResourceKind =>
  /youtu\.?be|vimeo|loom\.com|\.mp4/i.test(url) ? "video" : /\.pdf($|\?)/i.test(url) ? "pdf" : "link";

export function useOpenResource() {
  const { update } = useStore();
  return (r: Resource) =>
    update((s) => {
      const x = s.resources.find((y) => y.id === r.id);
      if (!x) return;
      x.opened = true;
      if (x.status === "toread") x.status = "reading";
    });
}

/** A link to a vault item. Opens web links normally and PDFs stored on this device from IndexedDB. */
export function ResLink({ r, className, title, children }: { r: Resource; className?: string; title?: string; children: ReactNode }) {
  const markOpened = useOpenResource();
  return (
    <a
      className={className}
      title={title}
      href={isLocalUrl(r.url) ? "#" : r.url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => {
        e.stopPropagation();
        if (isLocalUrl(r.url)) {
          e.preventDefault();
          openUrl(r.url);
        }
        markOpened(r);
      }}
    >
      {children}
    </a>
  );
}

export default function Vault({ params }: { params: URLSearchParams }) {
  const { state } = useStore();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState<ReadStatus | "all">("all");
  const [kind, setKind] = useState<ResourceKind | "all">("all");
  const [module, setModule] = useState("");
  const [editing, setEditing] = useState<ID | "new" | null>(params.get("id") ?? (params.get("add") ? "new" : null));

  useEffect(() => {
    setEditing(params.get("id") ?? (params.get("add") ? "new" : null));
    if (params.get("q")) setQ(params.get("q")!);
  }, [params]);

  const modules = [...new Set(state.resources.map((r) => r.module).filter(Boolean))].sort();
  const list = state.resources
    .filter((r) => status === "all" || r.status === status)
    .filter((r) => kind === "all" || r.kind === kind)
    .filter((r) => !module || r.module === module)
    .filter((r) => !q || [r.title, r.url, r.notes, r.module, ...r.tags].some((f) => includesCI(f, q)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <PageHead title="Resource Vault" sub="All the links, videos and docs you save, in one place.">
        <button className="primary" onClick={() => setEditing("new")}>
          <Plus size={14} /> Save resource
        </button>
      </PageHead>

      <div className="row between">
        <div className="search grow" style={{ maxWidth: 340 }}>
          <Search size={15} />
          <input placeholder="Search title, tags, notes" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="row">
          {modules.length > 0 && (
            <select value={module} onChange={(e) => setModule(e.target.value)} style={{ width: "auto" }}>
              <option value="">All modules</option>
              {modules.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          )}
          <Segmented value={kind} onChange={setKind} options={[{ value: "all", label: "All" }, { value: "link", label: "Links" }, { value: "video", label: "Videos" }, { value: "pdf", label: "PDFs" }]} />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <Segmented value={status} onChange={setStatus} options={[{ value: "all", label: "Any status" }, ...STATUS]} />
      </div>

      <div className="card flush list" style={{ marginTop: 14 }}>
        {list.length === 0 && <Empty>{state.resources.length ? "Nothing matches." : "Your vault is empty. Save the next useful link, video or PDF here."}</Empty>}
        {list.map((r) => {
          const Icon = KIND_ICON[r.kind];
          return (
            <div className="item click" key={r.id} onClick={() => go("vault", { id: r.id })}>
              <Icon size={16} className="faint" style={{ marginTop: 3, flex: "none" }} />
              <div className="grow">
                <div className="item-title">{r.title}</div>
                <div className="item-meta">
                  <span className={`pill ${r.status}`}>{STATUS.find((s) => s.value === r.status)!.label}</span>
                  {r.module && <span>{r.module}</span>}
                  <Tags tags={r.tags} onClick={setQ} />
                  {r.notes && <span>· notes</span>}
                  <span>{timeAgo(r.createdAt)}</span>
                </div>
              </div>
              <ResLink r={r} className="btn ghost sm" title="Open">
                <ExternalLink size={14} />
              </ResLink>
            </div>
          );
        })}
      </div>

      {editing && (editing === "new" || state.resources.some((r) => r.id === editing)) && (
        <ResourceEditor id={editing} defaultTags={params.get("tags") ?? ""} onClose={() => (setEditing(null), (params.get("id") || params.get("add")) && go("vault"))} />
      )}
    </>
  );
}

function ResourceEditor({ id, defaultTags, onClose }: { id: ID | "new"; defaultTags: string; onClose: () => void }) {
  const { state, update } = useStore();
  const existing = state.resources.find((r) => r.id === id);
  const [r, setR] = useState<Resource>(
    () =>
      existing ?? {
        id: uid(),
        title: "",
        url: "",
        kind: "link",
        tags: [],
        module: "",
        status: "toread",
        notes: "",
        opened: false,
        links: [],
        createdAt: new Date().toISOString(),
      },
  );
  const [tags, setTags] = useState(existing ? r.tags.join(", ") : defaultTags);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const modules = [...new Set(state.resources.map((x) => x.module).filter(Boolean))];

  const upload = async (f?: File) => {
    if (!f) return;
    setUploading(true);
    try {
      const id = uid();
      await putFile({ id, name: f.name, type: f.type || "application/pdf", blob: f });
      setR((x) => ({ ...x, url: LOCAL_PREFIX + id, kind: "pdf", title: x.title || f.name.replace(/\.pdf$/i, "") }));
    } catch (e) {
      alert(`Couldn't store that PDF: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    const entry = { ...r, title: r.title.trim() || r.url, tags: splitTags(tags), opened: r.opened || !!existing?.opened };
    update((s) => {
      const i = s.resources.findIndex((x) => x.id === entry.id);
      if (i >= 0) s.resources[i] = entry;
      else s.resources.push(entry);
    });
    onClose();
  };

  // Links to assignment steps / topics
  const stepOptions = state.deadlines.flatMap((d) => [
    { key: `d:${d.id}`, label: d.title, link: { deadlineId: d.id } },
    ...d.steps.map((s, i) => ({ key: `s:${s.id}`, label: `${d.title} → Step ${i + 1}: ${s.title}`, link: { deadlineId: d.id, stepId: s.id } })),
  ]);
  const topicOptions = state.topics.map((t) => ({ key: `t:${t.id}`, label: t.name, link: { topicId: t.id } }));
  const linkKey = (l: Resource["links"][number]) => (l.stepId ? `s:${l.stepId}` : l.deadlineId ? `d:${l.deadlineId}` : `t:${l.topicId}`);
  const linkLabel = (l: Resource["links"][number]) => [...stepOptions, ...topicOptions].find((o) => o.key === linkKey(l))?.label ?? "(removed)";

  return (
    <Modal title={existing ? "Resource" : "Save a resource"} onClose={onClose}>
      <Field label="URL">
        <div className="row" style={{ flexWrap: "nowrap" }}>
          {isLocalUrl(r.url) ? (
            <input value="PDF saved on this device" readOnly className="faint" />
          ) : (
            <input autoFocus={!existing} value={r.url} onChange={(e) => setR({ ...r, url: e.target.value, kind: guessKind(e.target.value) })} placeholder="https://…" />
          )}
          <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Upload a PDF">
            <Upload size={14} /> {uploading ? "…" : "PDF"}
          </button>
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        </div>
      </Field>
      <Field label="Title">
        <input value={r.title} onChange={(e) => setR({ ...r, title: e.target.value })} />
      </Field>
      <div className="grid2">
        <Field label="Type">
          <Segmented value={r.kind} onChange={(kind) => setR({ ...r, kind })} options={[{ value: "link", label: "Link" }, { value: "video", label: "Video" }, { value: "pdf", label: "PDF" }]} />
        </Field>
        <Field label="Course module">
          <input list="modules" value={r.module} onChange={(e) => setR({ ...r, module: e.target.value })} placeholder="e.g. Cloud Engineering — Month 4" />
          <datalist id="modules">
            {modules.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
      </div>
      <Field label="Tags">
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Kubernetes, networking" />
      </Field>
      <Field label="Status">
        <Segmented value={r.status} onChange={(status) => setR({ ...r, status })} options={STATUS} />
      </Field>
      <Field label="Your notes">
        <textarea value={r.notes} onChange={(e) => setR({ ...r, notes: e.target.value })} />
      </Field>
      <Field label="Linked to">
        <div className="stack" style={{ gap: 6 }}>
          {r.links.map((l, i) => (
            <div key={i} className="row small">
              <span className="grow">{linkLabel(l)}</span>
              <button className="icon" onClick={() => setR({ ...r, links: r.links.filter((_, j) => j !== i) })}>
                ✕
              </button>
            </div>
          ))}
          <select
            value=""
            onChange={(e) => {
              const o = [...stepOptions, ...topicOptions].find((x) => x.key === e.target.value);
              if (o && !r.links.some((l) => linkKey(l) === o.key)) setR({ ...r, links: [...r.links, o.link] });
            }}
          >
            <option value="">+ Link to an assignment step or topic…</option>
            {stepOptions.length > 0 && (
              <optgroup label="Assignments">
                {stepOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            )}
            {topicOptions.length > 0 && (
              <optgroup label="Explain-It-Back topics">
                {topicOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </Field>
      <div className="row between">
        {existing ? (
          <button
            className="ghost danger"
            onClick={() => {
              if (confirm("Delete this resource?")) {
                update((s) => void (s.resources = s.resources.filter((x) => x.id !== r.id)));
                if (isLocalUrl(r.url)) deleteFile(r.url.slice(LOCAL_PREFIX.length)).catch(() => {});
                onClose();
              }
            }}
          >
            <Trash2 size={14} /> Delete
          </button>
        ) : (
          <span />
        )}
        <div className="row">
          {existing && r.url && (
            <ResLink r={r} className="btn">
              <ExternalLink size={14} /> Open
            </ResLink>
          )}
          <button className="primary" onClick={save} disabled={!r.url.trim()}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
