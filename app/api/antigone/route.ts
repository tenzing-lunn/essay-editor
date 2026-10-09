import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseAntigone } from "@/lib/antigone";

export async function GET() {
  try {
    const xml = await readFile(path.join(process.env.FINALS_DATA_ROOT ?? process.cwd(), "data", "antigone.xml"), "utf8");
    return Response.json({ blocks: parseAntigone(xml) }, { headers: { "cache-control": "public, max-age=86400" } });
  } catch {
    return Response.json({ error: "The Antigone text could not be loaded." }, { status: 502 });
  }
}
