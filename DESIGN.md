---
name: Scholia
description: An essay harness for writing with AI. Reads your essay the way your professor will; notes beside your text, never instead of it.
colors:
  bg: "#f4f4f5"
  surface: "#ffffff"
  hover: "#f1f1f3"
  border: "#e4e4e7"
  border-strong: "#d4d4d8"
  text: "#18181b"
  text-2: "#52525b"
  text-3: "#a1a1aa"
  accent: "#2f5bd3"
  accent-hover: "#2449ad"
  accent-soft: "#e8eefc"
  primary: "#18181b"
  primary-hover: "#3f3f46"
  ok: "#2f6a2c"
  ok-soft: "#e9f3e7"
  warn: "#8a5a00"
  warn-soft: "#fbf3e0"
  danger: "#b42318"
  danger-soft: "#fdecea"
typography:
  display:
    fontFamily: "Inter, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(32px, 3.4vw, 44px)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Inter, -apple-system, Segoe UI, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Inter, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Inter, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  overline:
    fontFamily: "Inter, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.04em"
  essay:
    fontFamily: "Literata, Times New Roman, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.7
  grade:
    fontFamily: "Inter, -apple-system, Segoe UI, sans-serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
rounded:
  radius: "6px"
  radius-sm: "4px"
spacing:
  scale: "4px 8px 12px 16px 24px 32px 48px 64px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.radius}"
    padding: "0 12px"
    height: "36px"
  button-hover:
    backgroundColor: "{colors.hover}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  note:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.radius}"
---

# Design System: Scholia

## Overview

**North star: a serious tool.** Scholia is the harness a student writes inside, so it should look like an instrument, not a notebook: quiet, exact, and out of the way of the essay. A white page sits on a light gray desk; the panel beside it holds the checks and notes in one interface face. Gray borders separate things. Color appears only where it carries meaning: an issue's category, an error, a warning, a check that passes or fails.

Chosen by the owner on 2026-10-29 ("neutral tool"), replacing the notebook, pen and highlighter system of 2026-10-13 (commit 10547e4 keeps it).

**Key characteristics:**
- Two faces: Literata for the essay only, Inter for everything else, including Scholia's notes.
- White surfaces, 1px gray borders, a uniform 6px radius.
- Marks in the essay are underlines in the category's color, weighted by how much the mark costs the grade.
- Notes are plain cards: a category tag, the quoted words, the note.
- The grade is a number and a list of checks, not a drawing.
- Line icons from `components/PenIcon.tsx`; no glyph icons, no emoji.

## Colors

Token source of truth: `app/styles/tokens.css`. Never use a color that is not a token.

- **Surfaces:** `--bg` (the desk and app background), `--surface` (page, panel, dialogs, menus), `--hover` (row and quiet-button hover).
- **Borders:** `--border` (dividers, control outlines), `--border-strong` (inputs, a divider drawn on purpose).
- **Text:** `--text` (headings, body), `--text-2` (secondary, captions, dimmed notes), `--text-3` (decoration only, never text).
- **Action:** `--accent` for links, focus, the caret and the selected tab; `--accent-soft` for selection and a selected row. `--primary` fills the one primary button per view.
- **State:** `--ok`, `--warn`, `--danger`, each a text color that passes 4.5:1, with a `-soft` fill for a banner or a failing row.

### Categories

Set once on `[data-category]` in `tokens.css`: `--cat` (underline and tag square, 3:1 or more), `--cat-ink` (legible text, 4.5:1 or more), `--cat-soft` (faint fill behind the open mark only), and `--weight`.

| Category | Hue | Underline weight |
|---|---|---|
| Grammar | amber | fine (1.5px) |
| Wrong word | rose | fine |
| Clarity | orange | fine |
| Analysis | blue | medium (2px) |
| Use of evidence | green | medium |
| Factual accuracy | slate | medium |
| Structure | violet | heavy (3px) |

### Rules

**Color carries meaning or nothing.** No decorative color, gradients or tinted panels. A surface is white or `--bg`.

**Never color alone.** Every category is named in words in its note and tag; pass and fail are written ("Passes", "Fails") as well as colored.

**Dim with color, not opacity.** An inactive note turns `--text-2`; opacity would drop text below contrast.

## Typography

- **Inter** (`--ui`): the interface and Scholia's voice. Headings 600, body 400, labels 500.
- **Literata** (`--typed`): the essay page only, 17px on 1.7, so the draft reads like what is handed in. Pasted text keeps its own fonts.
- **Scale:** display clamp(32px, 3.4vw, 44px) for the landing headline; headline 24px; title 16px; body 15px on 1.55; label 13px; overline 12px uppercase 0.04em for section labels in the panel; grade 40px.
- Numbers that compare (percent, counts) use `font-variant-numeric: tabular-nums`.

## Layout

- **Spacing** on a 4px base: 4, 8, 12, 16, 24, 32, 48, 64.
- **The editor:** the essay page (white, Letter proportions, 1in margins, a 1px border on the `--bg` desk) on the left; the panel (`--surface`, 1px `--border` on its left) on the right. Control heights come from `--hit` (36px, 44px on touch).
- **The landing:** a centered column up to 1080px; a product example with the paragraph on the left and its notes on the right; sections separated by space and a 1px border, not by color.
- **Responsive:** below 900px the panel and the notes stack under the text. 16px side gutters on phones, no horizontal scroll.

## Elevation

Flat by default: separation is a 1px border. `--shadow-pop` is allowed only for things that float over the page: popovers, menus, the selection toolbar and dialogs. No shadows on cards, panels or the page.

## Shapes

`--radius` (6px) on controls, cards, dialogs and the page; `--radius-sm` (4px) on tags and small chips. No pills except a status dot.

## Components

### Buttons
- **Default:** `--surface` fill, 1px `--border-strong`, `--text`, Inter 500 14px, `--hit` tall, 12px side padding. Hover fills `--hover`.
- **Primary** (`button.primary`, `.btn-ink`): `--primary` fill, white text. One per view.
- **Link button** (`button.link`): accent text, underline on hover.
- **Danger:** `--danger` fill, white text, for destructive confirmations only.
- **Focus:** the global 2px `--accent` ring at 2px offset. Active state: no movement.

### Marks in the essay
- An underline in `--cat` at `--weight`, 3px below the text, skip-ink off. No background at rest.
- The open mark adds `--accent-soft` behind its words in the editor (one `issue-active` highlight covers every category) and `--cat-soft` on the landing and sample, where each mark is an element. Inactive marks stay as they are; only notes dim.
- In the editor they are CSS Custom Highlights (`::highlight(...)`), which allow text-decoration and background only.

### Notes
- A card: `--surface`, 1px `--border`, `--radius`, 12px 16px padding.
- First line: the category tag (a 8px square in `--cat`, then the category name in Inter 500 12px `--text-2`), then a small gray counter if notes are numbered.
- Then the quoted words (`.mark-quote`, a button that scrolls to the mark), then the note in Inter 15px `--text`.
- The active note gets a 1px `--text` border; the rest turn `--text-2`.

### Fixes
- Only the changed words: the original in `--text-2` struck through with a 1.5px `--danger` line, then the replacement in `--text` 600 with a `--ok-soft` fill. Never a rewritten sentence beyond the exceptions in `docs/harness.md`.

### The grade
- The letter in Inter 600 40px with the percent beside it in `--text-2`, tabular numerals, and the caveat "Rubric estimate, not your teacher's grade." directly under it.
- The checks under it: one row per rubric trait and per prompt requirement, each with a tick or a cross icon in `--ok` or `--danger` and the word "Passes" or "Fails". Failing rows first.

### Navigation
- A 56px top bar on `--surface` with a 1px bottom border: the wordmark (Inter 600 18px, `--text`) left, links right in Inter 500 14px `--text-2`, `--text` on hover.

## Do's and don'ts

### Do
- Use tokens from `tokens.css` for every color, radius and shadow.
- Name every category in words; color is the second signal.
- Keep one primary button per view.
- Respect `prefers-reduced-motion`: no transitions beyond 120ms color changes, none at all when reduced.

### Don't
- Don't bring back the notebook: no ruled lines, no handwriting face, no highlighter swipes, no hand-cut corners, no pink margin rule.
- Don't use shadows except `--shadow-pop` on floating things.
- Don't use colored side-tab borders on cards.
- Don't use glyph icons (✓, ✕, ⚠) or emoji; use `PenIcon`.
- Don't set Scholia's notes in the essay face, or the essay in the interface face.
- Don't add a night theme outside `tokens.css`.
