import { supabase } from "./supabase";
import type { Remote, Row } from "./sync";

const BUCKET = "files";

/** The sync engine's link to your Supabase project. */
export function supabaseRemote(userId: string): Remote {
  const path = (fileId: string) => `${userId}/${fileId}`;
  return {
    async pull(since, limit) {
      let q = supabase.from("items").select("kind,id,data,deleted,updated_at,synced_at").order("synced_at").limit(limit);
      if (since) q = q.gte("synced_at", since);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as Row[];
    },
    async push(rows) {
      const { error } = await supabase.from("items").upsert(
        rows.map((r) => ({ ...r, user_id: userId })),
        { onConflict: "user_id,kind,id" },
      );
      if (error) throw new Error(error.message);
    },
    async upload(fileId, blob, type) {
      const { error } = await supabase.storage.from(BUCKET).upload(path(fileId), blob, { upsert: true, contentType: type || "application/pdf" });
      if (error) throw new Error(error.message);
    },
    async download(fileId) {
      const { data, error } = await supabase.storage.from(BUCKET).download(path(fileId));
      if (error) {
        if (/not found|404|400/i.test(error.message) || /not.?found/i.test(String((error as { statusCode?: string }).statusCode))) return null;
        throw new Error(error.message);
      }
      return data;
    },
    async remove(fileIds) {
      const { error } = await supabase.storage.from(BUCKET).remove(fileIds.map(path));
      if (error) throw new Error(error.message);
    },
  };
}
