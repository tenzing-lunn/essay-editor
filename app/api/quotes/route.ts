import { readFile } from "node:fs/promises";
import path from "node:path";
import { findBookQuotes, parseAntigone } from "@/lib/antigone";

export async function GET(req: Request) {
  const query = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!query || query.length > 200) return Response.json({ error: "Enter a phrase or line number (up to 200 characters)." }, { status: 400 });
  if (/^\d+\s*(?:[-–—]\s*\d+)?$/.test(query)) {
    const [start, end = start] = query.split(/\s*[-–—]\s*/).map(Number);
    if (start < 1 || end < start || end - start > 100) return Response.json({ error: "Enter a valid range of up to 101 lines, such as 175–191." }, { status: 400 });
  }
  try {
    const xml = await readFile(path.join(process.env.FINALS_DATA_ROOT ?? process.cwd(), "data", "antigone.xml"), "utf8");
    return Response.json(findBookQuotes(parseAntigone(xml), query));
  } catch {
    return Response.json({ error: "Quote lookup failed. Try again." }, { status: 502 });
  }
}
