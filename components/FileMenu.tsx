"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

type Props = {
  disabled: boolean;
  onNewEssay: () => void; onCheckpoint: () => void | Promise<boolean | void>; onHistory: () => void;
  onDownload: (format: "html" | "text") => void; onPrint: () => void; onAssignment: () => void;
};

export default function FileMenu({ disabled, onNewEssay, onCheckpoint, onHistory, onDownload, onPrint, onAssignment }: Props) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const items = () => Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
  useEffect(() => { if (open) items()[0]?.focus(); }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  // The menu closes on choosing, so the File button itself confirms the checkpoint. A save that resolves false shows nothing.
  const checkpoint = async () => { if (await onCheckpoint() === false) return; setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const choose = (action: () => void) => () => { setOpen(false); button.current?.focus(); action(); };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); button.current?.focus(); return; }
    if (event.key === "Tab") { setOpen(false); return; }
    const list = items(), i = list.indexOf(document.activeElement as HTMLButtonElement);
    const keys: Record<string, number | undefined> = { ArrowDown: (i + 1) % list.length, ArrowUp: (i + list.length - 1) % list.length, Home: 0, End: list.length - 1 };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    list[next]?.focus();
  };

  return (
    <div className="file-menu-wrap">
      <button ref={button} className="file-menu-button" disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-controls="file-menu"
        onClick={() => setOpen((v) => !v)} onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); } }}>{saved ? "Checkpoint saved ✓" : "File ▾"}</button>
      <div ref={menu} id="file-menu" className="file-menu" role="menu" aria-label="File" hidden={!open} onKeyDown={onKeyDown}>
        <button role="menuitem" tabIndex={-1} onClick={choose(onNewEssay)}>New essay…</button>
        <div role="separator" />
        <button role="menuitem" tabIndex={-1} onClick={choose(() => void checkpoint())}>Save checkpoint</button>
        <button role="menuitem" tabIndex={-1} onClick={choose(onHistory)}>Version history…</button>
        <div role="separator" />
        <button role="menuitem" tabIndex={-1} onClick={choose(() => onDownload("html"))}>Download formatted (.html)</button>
        <button role="menuitem" tabIndex={-1} onClick={choose(() => onDownload("text"))}>Download text (.txt)</button>
        <button role="menuitem" tabIndex={-1} onClick={choose(onPrint)}>Print / PDF</button>
        <div role="separator" />
        <button role="menuitem" tabIndex={-1} onClick={choose(onAssignment)}>Assignment &amp; sources</button>
      </div>
    </div>
  );
}
