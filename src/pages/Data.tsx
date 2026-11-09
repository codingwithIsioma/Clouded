import { useEffect, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { useStore } from "../store";
import type { State } from "../types";
import { allFiles, clearFiles, putFile, storageUsage } from "../lib/db";
import { dayKey, timeAgo } from "../lib/dates";
import { PageHead, toast } from "../ui";

type Backup = {
  app: "clouded";
  version: 1;
  exportedAt: string;
  state: State;
  files: { id: string; name: string; type: string; data: string }[];
};

const toBase64 = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

const fromBase64 = (data: string, type: string) => {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
};

const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);

export const backupOverdue = (s: State) => {
  const hasData = s.deadlines.length + s.errors.length + s.topics.length + s.resources.length > 0;
  return hasData && (!s.lastBackup || Date.now() - new Date(s.lastBackup).getTime() > 14 * 86_400_000);
};

export default function Data() {
  const { state, update, replace } = useStore();
  const [usage, setUsage] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => void storageUsage().then(setUsage), []);

  const exportBackup = async () => {
    setBusy("Preparing backup…");
    try {
      const files = await allFiles();
      const backup: Backup = {
        app: "clouded",
        version: 1,
        exportedAt: new Date().toISOString(),
        state: { ...state, lastBackup: new Date().toISOString() },
        files: await Promise.all(files.map(async (f) => ({ id: f.id, name: f.name, type: f.type, data: await toBase64(f.blob) }))),
      };
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }));
      a.download = `clouded-backup-${dayKey()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      update((s) => void (s.lastBackup = backup.exportedAt));
      toast("Backup downloaded", a.download);
    } finally {
      setBusy("");
    }
  };

  const importBackup = async (f?: File) => {
    if (!f) return;
    let b: Backup;
    try {
      b = JSON.parse(await f.text());
      if (b.app !== "clouded" || !b.state || !Array.isArray(b.state.deadlines)) throw new Error("not a Clouded backup");
    } catch (e) {
      alert(`That file can't be imported: ${(e as Error).message}`);
      return;
    }
    const s = b.state;
    const summary = `${s.deadlines.length} deadlines, ${s.errors.length} errors, ${s.topics.length} topics, ${s.resources.length} resources, ${b.files.length} PDFs`;
    if (!confirm(`Replace everything on this device with the backup from ${new Date(b.exportedAt).toLocaleString()}?\n\n${summary}\n\nWhat's here now will be overwritten.`)) return;
    setBusy("Importing…");
    try {
      await clearFiles();
      for (const file of b.files) await putFile({ id: file.id, name: file.name, type: file.type, blob: fromBase64(file.data, file.type) });
      replace(s);
      toast("Backup imported", summary);
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`);
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <PageHead title="Your data" sub="Clouded saves everything in this browser, on this device. Nothing is sent anywhere." />

      <div className="stack">
        <div className="card stack">
          <h3>Back up</h3>
          <p className="muted small">
            Downloads one file with all your deadlines, errors, topics, resources, PDFs and card progress. Keep it somewhere safe, like Google Drive. If this browser's data is cleared,
            the backup is the only copy.
          </p>
          <div className="row between">
            <span className="small faint">{state.lastBackup ? `Last backup ${timeAgo(state.lastBackup)}` : "No backup yet"}</span>
            <button className="primary" onClick={exportBackup} disabled={!!busy}>
              <Download size={14} /> Export backup
            </button>
          </div>
        </div>

        <div className="card stack">
          <h3>Restore or move to another device</h3>
          <p className="muted small">
            To move from your laptop to your phone: export a backup on the laptop, get the file onto your phone, open Clouded there and import it. Importing replaces what's on that device.
          </p>
          <div className="row between">
            <span className="small faint">{busy}</span>
            <button onClick={() => fileRef.current?.click()} disabled={!!busy}>
              <Upload size={14} /> Import backup
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => importBackup(e.target.files?.[0])} />
          </div>
        </div>

        <p className="small faint">
          {usage !== null && `Using about ${fmtBytes(usage)} of browser storage. `}
          Clearing this site's data in your browser settings deletes everything here.
        </p>
      </div>
    </>
  );
}
