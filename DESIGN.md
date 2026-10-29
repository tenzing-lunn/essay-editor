---
name: Scholia
description: Reads your essay the way your professor will. Notes beside your text, never instead of it.
colors:
  paper: "#f9fafc"
  paper-sunk: "#f0f2f6"
  rule: "#dfe7f1"
  rule-strong: "#c9d6e7"
  margin-rule: "#efbcc6"
  ink: "#2b3354"
  graphite: "#5a5f6e"
  pencil: "#9a9daa"
  pen: "#34508f"
  pen-hover: "#263f78"
  hl-yellow: "#f8ef9f"
  pen-yellow: "#6e5c0c"
  hl-pink: "#f7cfd9"
  pen-pink: "#933a55"
  hl-blue: "#c9e5f2"
  pen-blue: "#295e7a"
  hl-green: "#d5ecca"
  pen-green: "#3a662c"
  hl-apricot: "#fbdabb"
  pen-apricot: "#8a4a22"
  hl-lilac: "#e0d8f3"
  pen-lilac: "#574693"
  hl-gray: "#e5e3de"
  pen-gray: "#57554f"
typography:
  display:
    fontFamily: "Literata, Times New Roman, serif"
    fontSize: "clamp(34px, 3.2vw, 46px)"
    fontWeight: 600
    lineHeight: "64px"
    letterSpacing: "-0.022em"
  headline:
    fontFamily: "Literata, Times New Roman, serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: "64px"
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Literata, Times New Roman, serif"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: "32px"
  body:
    fontFamily: "Literata, Times New Roman, serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: "32px"
  ui-body:
    fontFamily: "Figtree, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "32px"
  label:
    fontFamily: "Figtree, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "32px"
  button:
    fontFamily: "Figtree, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.005em"
  hand-note:
    fontFamily: "Kalam, Bradley Hand, cursive"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: "32px"
  hand-sigla:
    fontFamily: "Kalam, Bradley Hand, cursive"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: "32px"
  hand-grade:
    fontFamily: "Kalam, Bradley Hand, cursive"
    fontSize: "56px"
    fontWeight: 700
    lineHeight: 1
rounded:
  cut: "5px 7px 6px 4px / 6px 4px 7px 5px"
spacing:
  line: "32px"
  line-2: "64px"
  line-3: "96px"
  gutter: "104px"
components:
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.cut}"
    padding: "0 22px"
    height: "44px"
  button-ink-hover:
    backgroundColor: "{colors.pen-hover}"
    textColor: "{colors.paper}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.cut}"
    padding: "0 22px"
    height: "44px"
  button-outline-hover:
    backgroundColor: "{colors.hl-yellow}"
    textColor: "{colors.ink}"
  margin-note:
    textColor: "{colors.ink}"
    typography: "{typography.hand-note}"
  margin-note-dimmed:
    textColor: "{colors.graphite}"
    typography: "{typography.hand-note}"
---

# Design System: Scholia

## Overview

**Creative North Star: "The Scholia Page"**

The essay sits on a ruled notebook page and Scholia's notes live in the wide margin beside it, each tied to its words by a pen line, the way Greek scholars wrote scholia beside a manuscript. Everything on the page is one of three hands: the typed essay (what the student hands in), the quiet interface, and Scholia's pen. The page is cool white paper with pale blue rules and a pink margin rule; ink is a blue-black ballpoint; emphasis is a soft highlighter that layers like real ink. Nothing is a hard color, nothing is pure black or pure white.

Density is a notebook's: one line of text per ruled line, generous margins, and a margin column that is a real column, not a tooltip. The page refuses the SaaS hero-plus-screenshot; the product is shown by marking up a real paragraph in place. Depth comes from paper and ink, not from cards and shadows.

**Rollout status.** The system is built on every screen (2026-10-13): the landing (`/`), the sample essay (`/sample`), the editor and its notes column, home, sign-in, the AI settings, setup and version-history dialogs, and the share report (`/r`). The legacy token mapping is gone; every stylesheet reads `app/styles/tokens.css` directly. Light theme only; a night theme is deferred, and the tokens are the single place it will be added. What the editor does differently from the sample is listed under **The editor** in Layout.

**Key Characteristics:**
- A 32px ruled grid; every line of text sits on a rule.
- A pink margin rule divides the writer's text (left) from Scholia's notes (right).
- Issue category = highlighter + pen tone + pen weight.
- Notes in a handwritten pen face, numbered with sigla, joined to their marks by drawn leader lines.
- Fixes shown as proofreader corrections, never as rewritten prose.
- Drawn SVG marks only; no icon set.

## Colors

A cool paper-and-ballpoint palette: tinted neutrals for paper and ink, one pen blue for action, and seven soft highlighters each paired with a darker pen tone for legible labels. Token source of truth: `app/styles/tokens.css`.

### Primary
- **Ballpoint Blue** (pen): links, focus rings, the caret, the wordmark diple, the grade circle, the handwritten replacement in a fix, and margin asides. 7.5:1 on paper.
- **Pressed Ballpoint** (pen-hover): hover state for links and the ink button.

### Secondary
- **The Highlighters** (hl-yellow, hl-pink, hl-blue, hl-green, hl-apricot, hl-lilac, hl-gray): swipes over marked words, one per issue category. Yellow is also the house highlighter: the hero swipe, the point headings, text selection, and the outline button's hover. Never used for text.
- **The Pen Tones** (pen-yellow, pen-pink, pen-blue, pen-green, pen-apricot, pen-lilac, pen-gray): the legible partner of each highlighter, used for category names, sigla, mark underlines and active leader lines. Every pen tone is at least 6.3:1 on paper. Pen pink doubles as the proofreader's red: the strike and caret in a fix, and a missed requirement.

### Neutral
- **Notebook Paper** (paper): the page.
- **The Desk** (paper-sunk): what sits under the page; the legacy `--bg`.
- **Blue Rule** (rule): the ruled lines.
- **Drawn Rule** (rule-strong): a ruled divider drawn on purpose (the sample bar's foot, the toggle's border), and scrollbars.
- **Margin Pink** (margin-rule): the 2px vertical line between text and notes. Structural, never decorative elsewhere.
- **Blue-Black Ink** (ink): headings, body text, the ink button fill. 11.8:1 on paper.
- **Graphite** (graphite): secondary text, captions, footer, and every dimmed note. 6.1:1 on paper.
- **Pencil** (pencil): decoration only (resting leader lines, empty pips). 2.6:1; never text.

### Category mapping
Defined once in `tokens.css` on `[data-category]`, which sets `--hl`, `--pen-tone` and `--weight`:

| Category | Highlighter | Pen tone | Pen weight |
|---|---|---|---|
| Grammar | yellow | pen-yellow | fine (1.5px) |
| Wrong word | pink | pen-pink | fine |
| Clarity | apricot | pen-apricot | fine |
| Analysis | blue | pen-blue | medium (2.25px) |
| Use of evidence | green | pen-green | medium |
| Factual accuracy | gray | pen-gray | medium |
| Structure | lilac | pen-lilac | heavy (3px) |

### Named Rules
**The Paper-and-Ink Rule.** Every neutral is a paper tint or graphite. No `#000`, no `#fff`, no gray from outside the token file.

**The Highlighter-Is-Never-Text Rule.** A highlighter colors the ground behind words; any text naming a category uses its pen tone, which passes 4.5:1. Category is never carried by color alone: the note names it in words.

**The Graphite Dim Rule.** An inactive note dims by turning graphite, never by opacity. Inactive marks drop their highlighter to 45% strength via `--hl-strength`; their text stays ink.

## Typography

**Typed Font:** Literata (latin + greek), fallback Times New Roman, serif. Token `--typed`.
**Interface Font:** Figtree, fallback -apple-system, Segoe UI, sans-serif. Token `--ui`.
**Pen Font:** Kalam 300/400/700, fallback Bradley Hand, cursive. Token `--hand`.

**Character:** Three hands on one page. Literata is what the student hands in, so the essay and all headings are typed. Figtree is the quiet machine: navigation, buttons, captions, category names. Kalam is Scholia's own pen: notes, sigla, the grade, asides. Greek (σχόλια) sets in Literata.

### Hierarchy
- **Display** (Literata 600, clamp(34px, 3.2vw, 46px), two rules tall, -0.022em, balanced): the page promise. Mobile drops to clamp(24px, 6.6vw, 27px) on one rule.
- **Headline** (Literata 600, 30px, two rules): section headings.
- **Title** (Literata 600, 21px, one rule): point headings, each under a yellow swipe.
- **Body** (Literata 400, 18px on 32px): the essay and landing prose. Sample sheet caps at 680px, paragraphs indented 2em.
- **UI body** (Figtree 400, 15–16px on 32px): side-panel and supporting copy, often graphite.
- **Label** (Figtree 500, 14px): captions, nav (15px), footer. Category names are Figtree 600 13px in their pen tone.
- **Pen note** (Kalam 400, 18px on 32px): note bodies and margin asides.
- **Pen sigla** (Kalam 700, 19px; 14px superscript in text): note numbers and the handwritten replacement in a fix.
- **Pen grade** (Kalam 700, 56px): the letter inside the drawn grade circle.

### Named Rules
**The On-the-Rule Rule.** Every line-height is 32px or a multiple; type does not choose its own leading. Display and headline take two rules.

**The Three Hands Rule.** Typed for what the student writes, UI for the controls, pen for what Scholia says. Scholia's voice is never typed, the student's essay is never handwritten.

## Layout

**The ruled grid.** `--line-gap` is 32px. The `.ruled` surface paints a rule at the foot of every line; each surface sets `--rule-offset: -7px` so the baseline of 18px Literata sits on the rule. Every vertical measure (section padding, margins, note stacking) is a multiple of the line: 32, 64, 96px.

**The sheet.** The landing is a centered three-track grid: text column clamp(460px, 50vw, 680px), a 104px gutter, and a margin column clamp(250px, 25vw, 360px). The pink margin rule runs the full page height at the boundary of the gutter, so pen leader lines cross it. Margin notes are positioned level with their mark's line, snapped to the 32px grid, and stacked without overlap.

**The sample.** A full-height two-pane workspace: the ruled essay (max 680px) scrolls on the left; the notes column (320–420px) scrolls on the right behind a 2px margin-pink left border.

**The editor.** The essay is a Letter page of ruled paper (1in margins, three rules) on the desk (paper-sunk), typed in Literata 18px on the 32px grid and scaled with `--page-zoom` to fit; pasted text keeps its own fonts and spacing, so it may sit off the rules. The notes column sits right of a 2px pink rule on plain, unruled paper, because its forms and buttons would cross the rules. Marks are CSS Custom Highlights, which cannot draw the ragged swipe or a sigla, so each category is a flat highlighter at 60% under a pen-tone underline at its pen weight, and the open note's words take the house yellow on top; editor notes carry no sigla numbers and no leader line. The docbar is two rows, document then formatting; formatting buttons are 32px on a mouse. Every control height comes from `--hit` (36px, 44px on touch screens). Dialogs, menus and the selection toolbar are drawn with a 1.5px ink border instead of a shadow. Print is the page alone: no rules, marks or chrome.

**Responsive.** Below 960px (landing) and 900px (sample) the margin folds under the text: the pink rule moves to a fixed line near the left edge (30px / 26px), text indents past it, notes stack below their paragraph with one rule between them, and leader lines are not drawn. Dimming is switched off on the landing at that width so every note reads in ink.

## Elevation & Depth

Flat. The page is paper; depth comes from layered ink: highlighters multiply over the rules, pen lines cross the margin, the grade circle is drawn over its letter. There are no shadows, no cards and no raised panels on Scholia surfaces. The only "lift" is the button's 1px press on `:active`.

### Named Rules
**The Paper Has No Shadows Rule.** If a surface needs separation, draw a rule (rule-strong or margin-rule) or move it to the desk (paper-sunk). Never a box-shadow.

## Shapes

Hand-drawn. The single radius token, `--cut` (5px 7px 6px 4px / 6px 4px 7px 5px), gives each corner a slightly different curve, like a shape cut by hand; never a perfect pill or a uniform radius. Lines are pen strokes with round caps: leader lines are cubic curves at 1.25px in pencil, thickening to the category's pen weight when active. Marks underline in the pen tone at the category weight, 6px below the text, skip-ink off. The highlighter swipe has ragged angled ends (a 100deg gradient) and covers only the lower 72% of the letters.

## Components

### Buttons
Pen-drawn shapes; ink-filled only for the one action that matters.
- **Shape:** hand-cut corners ({rounded.cut}), 1.5px ink border, 44px tall (40px in the sample bar).
- **Ink (primary):** ink fill, paper text, Figtree 600 16px. One per view: "Try it on a sample", "Check my own essay".
- **Outline:** transparent, ink text and border.
- **Hover / Focus:** outline fills with 70% yellow highlighter; ink deepens to pen-hover. 160ms ease-out. Focus is the global 2px pen outline at 3px offset. Active presses down 1px.
- **Toggle (small):** 36px tall, 1.5px rule-strong border, Figtree 500 13px; border inks on hover.
- **App controls:** every other button in the signed-in app is this small shape (Figtree 500 14px, `--hit` tall, 44px on touch), and `button.primary` is the ink button. Icons are drawn pen strokes from `components/PenIcon.tsx`.

### Marks
- **Style:** a highlighter swipe in the category color plus an underline in the pen tone at the category's pen weight, 55% strength at rest, full when active. A superscript sigla in Kalam 700 follows each mark.
- **State:** when any mark is active, the others drop their highlighter to 45%. Marks are focusable and open their note on hover or focus.

### Margin Notes (signature)
- **Structure:** sigla number (Kalam 700 19px, pen tone), category name (Figtree 600 13px, pen tone), then the note in Kalam 18px ink. In the sample panel the quoted words come first as a typed, highlighted button that scrolls to the mark.
- **Leader lines:** an SVG cubic curve from the end of the mark's line, across the pink rule, to the note's first line. Drawn in with a stroke-dashoffset animation (720ms, staggered on load); opening a note redraws only its line in the pen tone at full weight.
- **Dimming:** see the Graphite Dim Rule.

### Proofreader Fix
- A fix shows only the changed words: the original in Literata graphite struck through with a 2px pen-pink line, then a pen-pink caret (‸) and the replacement handwritten in Kalam 700 pen blue. Never a rewritten sentence.

### Drawn Marks
- **Diple wordmark:** a hand-drawn ">" (2.4px stroke, pen) beside "Scholia" in Literata 600 25px. The editors' sign for "look at this line".
- **Grade circle:** the letter in Kalam 56px inside an open, overlapping pen loop (2.4px stroke), percent in Kalam 22px beside it.
- **Requirement marks:** tick (met, pen-green), half (partial, pen-yellow), cross (missed, pen-pink), 20px, 2.2px round strokes.
- **Gloss leader:** a pen line arcing from the name in the headline over the type and across the margin rule to the σχόλια gloss.

### Navigation
- Figtree 500 15px ink links, right-aligned in the margin column of a two-rule header bar, wordmark in the text column. Hover goes pen blue and underlines. Body links are pen blue with a 1px underline offset 4px, thickening to 2px on hover.

### Margin Asides
- Kalam 18px pen-blue sentences in the margin column beside landing sections: Scholia commenting on its own page. Short, blunt, one or two lines.

## Do's and Don'ts

### Do:
- **Do** set every line-height to 32px or a multiple, and set `--rule-offset: -7px` on any new ruled surface.
- **Do** keep the writer's text left of the pink margin rule and Scholia's notes right of it.
- **Do** give every issue category its highlighter, pen tone and pen weight from the `[data-category]` mapping; never pick category colors ad hoc.
- **Do** dim inactive notes to graphite and inactive marks to 45% highlighter strength.
- **Do** show fixes as proofreader corrections: pink strike, caret, handwritten replacement.
- **Do** draw any new mark as an inline SVG pen stroke with round caps, in currentColor or a pen tone.
- **Do** use the ink button once per view; everything else is outline or a link.
- **Do** respect `prefers-reduced-motion`: swipes and leader lines appear fully drawn.

### Don't:
- **Don't** dim with opacity; it drops note text below contrast.
- **Don't** use a highlighter color or pencil for text.
- **Don't** use pure black, pure white, or any color not in `tokens.css`.
- **Don't** add box-shadows, cards, or raised panels to a Scholia surface.
- **Don't** use a uniform border-radius or a pill; use `--cut`.
- **Don't** use glyph or icon-font icons (✓, ✕, emoji); draw the mark.
- **Don't** mark a category with a thick colored side-tab border; that is the legacy editor's pattern, not the system's.
- **Don't** set Scholia's notes in the typed face or the essay in the pen face.
- **Don't** add a night theme outside `tokens.css`.
