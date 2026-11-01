# Design audit: the UI before Scholia (2026-10-13)

> **2026-10-29: the notebook system is retired.** The owner asked for a more serious look and chose "neutral tool": white surfaces on a gray desk, Inter for the interface and notes, Literata for the essay only, gray borders, color only for meaning. `DESIGN.md` and `app/styles/tokens.css` describe the new system; the notebook system below is kept in git (commit 10547e4). The "Still open" items about sigla, the ragged swipe, leader lines and the ruled grid no longer apply.


Audit of the incumbent interface on `margin-launch` before the Scholia brand, done to decide whether to polish it or replace it. Verdict: replace. The landing and sample are now rebuilt on the Scholia system; everything below the line "Still open" applies to the screens that have not moved yet.

## Score

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 2 | `outline: none` in 9 places against 12 `:focus-visible` rules; nav and footer links 15–21px tall on phones |
| 2 | Performance | 3 | Plain CSS, no images, no web fonts; nothing heavy |
| 3 | Responsive | 2 | Landing reflows; the editor is desktop-first by design; small touch targets |
| 4 | Theming | 1 | 8 tokens against 102 distinct hard-coded colors; no dark mode |
| 5 | Implementation integrity | 1 | No identity of its own: a Google Docs costume plus stock SaaS parts |
| | **Total** | **9/20** | **Poor: replace, don't polish** |

## Implementation integrity: fail

The UI had no point of view to preserve. Evidence:

- **It dressed up as Google Docs.** `#f1f3f4` canvas, `#edf2fa` toolbars, `#d3e3fd` pressed states, Docs' page shadow, Times New Roman 12pt. Students would see a copy of the tool they already have, not a product.
- **Stock SaaS accent.** One saturated blue (`#2f5bea`) for every action, white cards, a bright green "connected" pill.
- **Hard colors everywhere.** Issue categories were Tailwind 600–700 shades (`#b45309`, `#7c3aed`, `#be123c`, `#2563eb`), red `#b00020` for errors. The opposite of the "soft" brief.
- **No type system.** System sans for UI, Times for the page, Georgia italic for quotes; 21 different font sizes (7.5px to 72px) and 11 border radii.
- **AI-template tells.** The detector found 8 thick colored `border-left` side tabs (suggestion cards, popover, paragraph tasks, AI check) and a thick border on a rounded card. Unicode glyphs stood in for icons (`✓ ◐ ✗ › ⚠`).
- **Dead CSS from another product.** `app/globals.css` still carries a study planner (`.app`, `.rail`, `.timeline`, `.cal-*`, `.qcard`, `.tutor`), about 150 lines nothing renders.

## What the Scholia system fixes

| Problem | Now |
|---|---|
| Docs costume | A notebook page: ruled lines, pink margin rule, your text left of the rule and Scholia's notes right of it (`app/styles/tokens.css`) |
| Hard colors | Soft highlighters that multiply over paper, each paired with a pen tone that passes AA for labels (6.3–7.5:1) |
| No type system | Three hands: Literata (typed essay and headings), Figtree (interface), Kalam (Scholia's pen notes). Text sits on a 32px ruled grid |
| Side-tab cards | Margin notes with numbered sigla; a pen line ties each note to its words; opening one dims the rest |
| Color as the only signal | Category is written in every note; pen weight (underline thickness) says how much a mark costs the grade |
| Glyph icons | Drawn SVG pen marks (tick, half tick, cross), a drawn diple for the logo, a drawn circle round the grade |
| Browser defaults | Themed selection, caret, focus ring, scrollbar and accent color |

## Done (2026-10-13)

- **Editor, home, login, settings, setup, version history and share page** are on the system: tokens only, no shadows, hand-cut corners, margin-note anatomy in place of side-tab cards, drawn SVG marks in place of glyphs (`components/PenIcon.tsx`, `components/GradeCircle.tsx`). The detector reports no anti-patterns on these files.
- **Focus states:** the pen ring is back on every control. `outline: none` remains only where the ring is drawn on a parent instead (home search field, blank-page tile) and on two headings focused by script for screen readers, which are not controls.
- **Touch targets:** every control height comes from `--hit`, 44px on touch screens.
- **Dead planner CSS** removed from `app/globals.css`.

## Still open

- **[P2] Pasted formatting vs. the ruled grid:** text pasted from Docs keeps its own font size and line spacing, so it can sit off the rules. Normalising it would change paste behaviour; decide whether the page should offer "match the notebook".
- **[P3] Editor marks** cannot draw sigla or the ragged swipe (CSS Custom Highlights only allow flat colour and decoration), and the editor draws no leader line from the open note to its mark.
- **[P3] Font menu** lists Times, Arial and others but not Literata, the new default; a student who changes font can only get back to it with Clear formatting.
- **[P3] Night theme:** deferred by choice; tokens are named by role so a dim desk-lamp theme can be added later.
