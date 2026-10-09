export const ANTIGONE_URN = "urn:cts:greekLit:tlg0011.tlg002.perseus-eng2";
export const ANTIGONE_SOURCE = "https://raw.githubusercontent.com/PerseusDL/canonical-greekLit/master/data/tlg0011/tlg002/tlg0011.tlg002.perseus-eng2.xml";
export const ANTIGONE_VIEWER = `https://scaife.perseus.org/reader/${ANTIGONE_URN}/`;

export type BookQuote = { text: string; reference: string; speaker: string; url: string };
type Block = { text: string; start: number; end: number; speaker: string };

function plainText(xml: string) {
  return xml.replace(/<stage\b[^>]*>[\s\S]*?<\/stage>/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}

// This edition marks translated blocks by their first Greek line number.
// Return complete blocks and their actual ranges rather than inventing line breaks.
export function parseAntigone(xml: string): Block[] {
  const blocks: Block[] = [];
  let speaker = "";
  for (const token of xml.matchAll(/<speaker\b[^>]*>([\s\S]*?)<\/speaker>|<l\b[^>]*\bn="(\d+)"[^>]*>([\s\S]*?)<\/l>/g)) {
    if (token[1] !== undefined) speaker = plainText(token[1]);
    else {
      const start = Number(token[2]);
      blocks.push({ text: plainText(token[3]), start, end: start, speaker });
    }
  }
  for (let i = 0; i < blocks.length - 1; i++) blocks[i].end = Math.max(blocks[i].start, blocks[i + 1].start - 1);
  if (!blocks.length) throw new Error("The Perseus text could not be read. Open the Scaife viewer to look up the passage.");
  return blocks;
}

const normalize = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

export function findBookQuotes(blocks: Block[], query: string): { quotes: BookQuote[]; total: number } {
  const range = query.trim().match(/^(\d+)\s*(?:[-–—]\s*(\d+))?$/);
  const quote = (selected: Block[]): BookQuote => {
    const first = selected[0], last = selected[selected.length - 1];
    const reference = first.start === last.end ? String(first.start) : `${first.start}-${last.end}`;
    return { text: selected.map((b) => b.text).join(" "), reference, speaker: [...new Set(selected.map((b) => b.speaker))].join(" / "), url: `https://scaife.perseus.org/reader/${ANTIGONE_URN}:${reference}/` };
  };
  if (range) {
    const start = Number(range[1]), end = Number(range[2] ?? range[1]);
    if (start < 1 || end < start || end - start > 100) throw new Error("Enter a valid range of up to 101 lines, such as 175–191.");
    const selected = blocks.filter((b) => b.start <= end && b.end >= start);
    return { quotes: selected.length ? [quote(selected)] : [], total: selected.length ? 1 : 0 };
  }
  const needle = normalize(query).replace(/^["']|["']$/g, "");
  if (!needle) return { quotes: [], total: 0 };
  const matches: BookQuote[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (normalize(block.text).includes(needle)) matches.push(quote([block]));
    else {
      const next = blocks[i + 1];
      if (next && next.speaker === block.speaker && !normalize(next.text).includes(needle) && normalize(`${block.text} ${next.text}`).includes(needle)) matches.push(quote([block, next]));
    }
  }
  return { quotes: matches.slice(0, 12), total: matches.length };
}
