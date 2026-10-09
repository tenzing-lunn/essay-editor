// Any open web page can POST text/plain here without a CORS preflight, and req.json() parses it anyway.
// Browsers always label their own requests, so refuse ones another site sent. Requests without these headers (curl) pass.
export function rejectCrossSite(req: Request): Response | null {
  const site = req.headers.get("sec-fetch-site");
  const origin = req.headers.get("origin");
  let foreign = site === "cross-site" || site === "same-site";
  if (!foreign && origin) {
    try {
      const host = new URL(origin).host;
      foreign = !host || (host !== req.headers.get("host") && host !== req.headers.get("x-forwarded-host"));
    } catch { foreign = true; } // "null" or malformed
  }
  return foreign ? Response.json({ error: "Requests from other sites are not allowed." }, { status: 403 }) : null;
}
