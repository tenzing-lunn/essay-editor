"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, USERNAME_RE } from "@/lib/api-types";
import { api } from "@/lib/essay-store";

type Mode = "signin" | "signup";
type Field = "name" | "username" | "password";

/** `next` is already checked by the page to be a same-site path. */
export default function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: Field } | null>(null);
  const fields = { name: useRef<HTMLInputElement>(null), username: useRef<HTMLInputElement>(null), password: useRef<HTMLInputElement>(null) };
  const signup = mode === "signup";
  const user = username.trim().toLowerCase();

  // Mirrors the server's rules so most mistakes are caught without a round trip.
  const problem = (): { message: string; field: Field } | null => {
    if (signup && !name.trim()) return { field: "name", message: "Enter your name." };
    if (signup && name.trim().length > NAME_MAX) return { field: "name", message: `Keep your name under ${NAME_MAX} characters.` };
    if (!user) return { field: "username", message: "Enter your username." };
    if (signup && !USERNAME_RE.test(user)) return { field: "username", message: "Usernames are 3–32 letters, numbers, dots, dashes or underscores, starting with a letter or number." };
    if (!password) return { field: "password", message: "Enter your password." };
    if (signup && password.length < PASSWORD_MIN) return { field: "password", message: `Use at least ${PASSWORD_MIN} characters for your password.` };
    if (password.length > PASSWORD_MAX) return { field: "password", message: `Passwords can be at most ${PASSWORD_MAX} characters.` };
    return null;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const p = problem();
    if (p) { setError(p); fields[p.field].current?.focus(); return; }
    setBusy(true); setError(null);
    try {
      await api(signup ? "/api/auth/signup" : "/api/auth/login", { method: "POST", body: signup ? { name: name.trim(), username: user, password } : { username: user, password } });
      // A full load, not a client navigation, so nothing cached for a previous account survives.
      window.location.assign(next || "/");
    } catch (e) {
      setBusy(false);
      setError({ message: e instanceof Error ? e.message : String(e), field: signup && (e as { code?: string }).code === "taken" ? "username" : undefined });
    }
  };
  // The username carries over; a password typed for one form is never sent by the other.
  const switchMode = () => { setMode(signup ? "signin" : "signup"); setError(null); setPassword(""); setShowPassword(false); };
  useEffect(() => { document.title = `${signup ? "Create your account" : "Sign in"} · Essay editor`; }, [signup]);
  const invalid = (f: Field) => error?.field === f || undefined;

  return (
    <main className="login">
      <form className="login-card" method="post" onSubmit={(e) => void submit(e)} noValidate aria-labelledby="login-title" aria-busy={busy}>
        <p className="login-brand">Essay editor</p>
        <h1 id="login-title">{signup ? "Create your account" : "Sign in"}</h1>
        <p className="login-lede">
          {signup
            ? "Your username and password are how you get back to your essays from any device. There’s no email and no password reset, so pick something you’ll remember."
            : "Welcome back. Sign in to see your essays."}
        </p>

        {signup && (
          <div className="login-field">
            <label htmlFor="login-name">Name</label>
            <input ref={fields.name} id="login-name" name="name" autoComplete="name" value={name} maxLength={NAME_MAX} aria-invalid={invalid("name")}
              onChange={(e) => setName(e.target.value)} disabled={busy} />
          </div>
        )}
        <div className="login-field">
          <label htmlFor="login-username">Username</label>
          <input ref={fields.username} id="login-username" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            value={username} maxLength={32} aria-invalid={invalid("username")} aria-describedby={signup ? "login-username-hint" : undefined}
            onChange={(e) => setUsername(e.target.value)} disabled={busy} />
          {signup && <small id="login-username-hint" className="muted">3–32 characters: letters, numbers, and . _ -</small>}
        </div>
        <div className="login-field">
          <label htmlFor="login-password">Password</label>
          <span className="login-password">
            <input ref={fields.password} id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete={signup ? "new-password" : "current-password"}
              value={password} maxLength={PASSWORD_MAX} aria-invalid={invalid("password")} aria-describedby={signup ? "login-password-hint" : undefined}
              onChange={(e) => setPassword(e.target.value)} disabled={busy} />
            <button type="button" className="login-reveal" aria-pressed={showPassword} aria-label="Show password" aria-controls="login-password"
              onClick={() => setShowPassword((v) => !v)}>{showPassword ? "Hide" : "Show"}</button>
          </span>
          {signup && <small id="login-password-hint" className="muted">At least {PASSWORD_MIN} characters.</small>}
        </div>

        <div className="login-error" role="alert">{error && <p className="error">{error.message}</p>}</div>
        <button type="submit" className="primary login-submit" disabled={busy}>
          {busy ? (signup ? "Creating account…" : "Signing in…") : signup ? "Create account" : "Sign in"}
        </button>
        <p className="login-switch">
          {signup ? "Already have an account?" : "New here?"}{" "}
          <button type="button" className="link" onClick={switchMode} disabled={busy}>{signup ? "Sign in" : "Create an account"}</button>
        </p>
      </form>
    </main>
  );
}
