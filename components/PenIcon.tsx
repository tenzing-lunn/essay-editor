/** Drawn pen marks for the signed-in app: round-capped strokes in currentColor, never glyphs or an icon font. */
const PATHS = {
  tick: "M3 10.5l4 4.5 9-11",
  half: "M3 10.5l4 4.5 4-5",
  cross: "M4.5 4.5l11 11M15.5 4.5l-11 11",
  close: "M5.5 5.5l9 9M14.5 5.5l-9 9",
  plus: "M10 3.5v13M3.5 10.2h13",
  "chevron-right": "M7.5 4.5c2 1.8 3.8 3.6 5.5 5.6-1.8 1.9-3.6 3.7-5.5 5.4",
  "chevron-left": "M12.5 4.5c-2 1.8-3.8 3.6-5.5 5.6 1.8 1.9 3.6 3.7 5.5 5.4",
  "chevron-down": "M4.5 7.5c1.8 2 3.6 3.8 5.6 5.5 1.9-1.8 3.7-3.6 5.4-5.5",
  menu: "M3.5 5.5h13M3.5 10h13M3.5 14.5h13",
  undo: "M7.5 4L4 7.5 7.5 11M4 7.5h7.5a4.5 4.5 0 0 1 0 9H8",
  redo: "M12.5 4L16 7.5 12.5 11M16 7.5H8.5a4.5 4.5 0 0 0 0 9H12",
  outdent: "M9.5 5h7M9.5 10h7M9.5 15h7M6.5 7.5L3.5 10l3 2.5",
  indent: "M9.5 5h7M9.5 10h7M9.5 15h7M3.5 7.5l3 2.5-3 2.5",
  bullets: "M8.5 5.5h8M8.5 10h8M8.5 14.5h8M4 5.5v.01M4 10v.01M4 14.5v.01",
  "clear-format": "M4 4.5h10M9 4.5v11M4 16l12-12",
  star: "M10 3.2l1.9 4.4 4.7.4-3.6 3.1 1.1 4.6L10 13.3l-4.1 2.4 1.1-4.6-3.6-3.1 4.7-.4z",
  wave: "M3 10.5c1.6-2.6 3.1-2.6 4.6 0s3.1 2.6 4.7 0 3.1-2.6 4.7 0",
  bracket: "M7.5 4.5H5v11h2.5M12.5 4.5H15v11h-2.5",
  bolt: "M11.5 2.5L6.5 10.5h5l-3.5 7",
  search: "M8.5 3.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12.3 12.3l4.2 4.2",
} as const;

export type PenIconName = keyof typeof PATHS;

export default function PenIcon({ name, size = 16, label, className, ...rest }: { name: PenIconName; size?: number; label?: string; className?: string; "data-status"?: string }) {
  return <svg className={className ? `pen-icon ${className}` : "pen-icon"} width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })} {...rest}>
    <path d={PATHS[name]} />
  </svg>;
}
