import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Cloud } from "lucide-react";
import { storedUser, supabase } from "./lib/supabase";

type User = { id: string; email?: string };
const AuthCtx = createContext<User | null>(null);

export const useUser = () => {
  const u = useContext(AuthCtx);
  if (!u) throw new Error("useUser outside AuthGate");
  return u;
};

/** Shows the sign-in screen until you're signed in, then the app. Works offline once you've signed in on this device. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(storedUser);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) setUser((u) => (u?.id === session.user.id ? u : { id: session.user.id, email: session.user.email }));
      else if (event === "SIGNED_OUT") setUser(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!user) return <SignIn />;
  return <AuthCtx.Provider value={user}>{children}</AuthCtx.Provider>;
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(/fetch|network/i.test(error.message) ? "You're offline. Connect to the internet to sign in." : error.message);
  };

  return (
    <div className="signin">
      <form className="signin-card stack" onSubmit={submit}>
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark">
            <Cloud size={14} strokeWidth={2.5} />
          </span>
          Clouded
        </div>
        <p className="muted small">Sign in to sync your deadlines, notes and progress across your devices.</p>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="small" style={{ color: "var(--danger, #c2410c)" }}>{error}</p>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
