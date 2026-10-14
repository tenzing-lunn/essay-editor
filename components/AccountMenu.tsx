"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Account } from "@/lib/api-types";
import { api } from "@/lib/essay-store";
import { forgetSignedOut } from "@/lib/local-essay-data";
import { clearAiFree } from "@/lib/ai-client";

export default function AccountMenu({ account, beforeSignOut }: { account: Account; beforeSignOut?: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const initial = (Array.from(account.name.trim())[0] ?? account.username[0] ?? "?").toUpperCase();
  useEffect(() => { if (open) menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  // The editor flushes unsaved work in beforeSignOut; a throw or `false` means it couldn't, so ask before losing it.
  const signOut = async () => {
    setBusy(true); setError(null);
    let flushed: unknown = true;
    try { flushed = await beforeSignOut?.(); } catch { flushed = false; }
    if (flushed === false && !window.confirm("Your latest changes may not be saved. Sign out anyway?")) { setBusy(false); return; }
    try { await api("/api/auth/logout", { method: "POST" }); }
    catch (e) { setBusy(false); setError(e instanceof Error ? e.message : String(e)); return; }
    forgetSignedOut(); clearAiFree(); // the free-check count belongs to the account that just left
    window.location.assign("/");
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); button.current?.focus(); }
    if (event.key === "Tab") setOpen(false);
  };

  return (
    <div className="account-menu-wrap">
      <button ref={button} className="account-avatar" aria-haspopup="menu" aria-expanded={open} aria-controls={id} aria-label={`Account: ${account.name}`} title={`${account.name} (@${account.username})`}
        onClick={() => { setError(null); setOpen((v) => !v); }} onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); } }}>{initial}</button>
      <div ref={menu} id={id} className="account-menu" role="menu" aria-label="Account" hidden={!open} onKeyDown={onKeyDown}>
        <div className="account-menu-who" role="presentation">
          <span className="account-avatar big" aria-hidden="true">{initial}</span>
          <strong>{account.name}</strong>
          <span className="muted">@{account.username}</span>
        </div>
        <div role="separator" />
        <button role="menuitem" tabIndex={-1} disabled={busy} onClick={() => void signOut()}>{busy ? "Signing out…" : "Sign out"}</button>
        {error && <p className="error account-menu-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
