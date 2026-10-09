// Turns clipboard HTML (Google Docs, Word, web pages) into clean HTML that keeps
// the formatting you can see — fonts, sizes, bold/italic, spacing, indents, alignment —
// and drops everything else (scripts, classes, Docs' wrapper tags).

const KEEP_TAGS = new Set([
  "P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BR", "SPAN", "A",
  "B", "STRONG", "I", "EM", "U", "S", "SUB", "SUP", "BLOCKQUOTE",
  "TABLE", "THEAD", "TBODY", "TR", "TD", "TH",
]);
const DROP_TAGS = new Set(["SCRIPT", "STYLE", "META", "TITLE", "LINK", "HEAD", "IMG", "SVG", "O:P"]);
const BLOCK_ALIASES = new Set(["DIV", "SECTION", "ARTICLE"]);
const BLOCKS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH"]);

// Source indentation between blocks would show as blank lines under pre-wrap. Spaces between inline
// elements and NBSP are content, so only drop plain whitespace that sits next to a block.
function tidy(nodes: Node[]): Node[] {
  const isBlock = (n?: Node) => !!n && BLOCKS.has(n.nodeName);
  return nodes.filter((n, i) => !(n.nodeType === Node.TEXT_NODE && /^[ \t\r\n]*$/.test((n as Text).data) && (isBlock(nodes[i - 1]) || isBlock(nodes[i + 1]))));
}

const KEEP_STYLES = [
  "font-weight", "font-style", "text-decoration", "text-decoration-line", "vertical-align",
  "font-size", "font-family", "color", "background-color",
  "text-align", "text-indent", "margin-left", "margin-right", "margin-top", "margin-bottom",
  "padding-left", "line-height", "list-style-type",
];

function cleanStyle(el: HTMLElement): string {
  const out: string[] = [];
  for (const prop of KEEP_STYLES) {
    const v = el.style.getPropertyValue(prop);
    if (!v) continue;
    if (prop === "background-color" && (v === "transparent" || v === "rgba(0, 0, 0, 0)")) continue;
    out.push(`${prop}:${v}`);
  }
  return out.join(";");
}

function cleanNode(node: Node, doc: Document): Node[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = (node as Text).data.replace(/\r?\n/g, " ");
    return t ? [doc.createTextNode(t)] : [];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const el = node as HTMLElement;
  const tag = el.tagName.toUpperCase();
  if (DROP_TAGS.has(tag)) return [];
  const kids = () => tidy([...el.childNodes].flatMap((c) => cleanNode(c, doc)));

  // Google Docs wraps the whole clipboard in <b style="font-weight:normal" id="docs-internal-guid-…">
  if (el.id?.startsWith("docs-internal-guid")) return kids();

  const asTag = BLOCK_ALIASES.has(tag) ? "P" : KEEP_TAGS.has(tag) ? tag : null;
  if (!asTag) return kids(); // unknown wrapper: keep its contents

  const out = doc.createElement(asTag);
  const style = cleanStyle(el);
  if (style) out.setAttribute("style", style);
  if (asTag === "A") {
    const href = el.getAttribute("href")?.trim();
    if (href && /^(https?:|mailto:|#|\/)/i.test(href) && !href.startsWith("//")) out.setAttribute("href", href);
  }
  for (const k of kids()) out.appendChild(k);
  return [out];
}

export function cleanHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const box = doc.createElement("div");
  for (const n of tidy([...doc.body.childNodes].flatMap((c) => cleanNode(c, doc)))) box.appendChild(n);
  return box.innerHTML;
}

export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text.split(/\r?\n/).map((l) => `<p>${l ? esc(l) : "<br>"}</p>`).join("");
}
