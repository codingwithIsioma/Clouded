import { createClient } from "@supabase/supabase-js";

/**
 * Your Supabase project. Both values are public by design: the database's
 * row-level security (supabase/schema.sql) is what keeps your data private,
 * and new sign-ups are turned off, so only your account can sign in.
 */
export const SUPABASE_URL = "https://ymgbeshlflzskwxaewuk.supabase.co";
export const SUPABASE_KEY = "sb_publishable_iZMHN-gBFa9IveSYPJoFYA_NAmoCBCz";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

const STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

/**
 * The signed-in user saved on this device, read without the network.
 * Lets you keep using Clouded offline even when the login token has expired;
 * it refreshes the next time you're online.
 */
export function storedUser(): { id: string; email?: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const u = raw ? JSON.parse(raw)?.user : null;
    return u?.id ? { id: u.id, email: u.email } : null;
  } catch {
    return null;
  }
}
