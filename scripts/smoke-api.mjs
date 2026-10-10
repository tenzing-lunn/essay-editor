// End-to-end check of the account API against a running server: `node scripts/smoke-api.mjs` (BASE_URL defaults to http://localhost:3000).
// Signs up throwaway test_ users, exercises every endpoint, then deletes them so no test data is left behind.
// It also reads .env.local's DATABASE_URL to set up cheap limit checks and to clear the throttle rows it creates.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import pg from "pg";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const origin = new URL(BASE).origin;
const realFetch = globalThis.fetch;
const MAX_BODY = 4.5 * 1024 * 1024;
const stats = { maxRequest: 0, maxResponse: 0, sectionPosts: 0, sectionPages: 0 };
const root = new URL("..", import.meta.url);
if (existsSync(new URL(".env.local", root))) process.loadEnvFile(new URL(".env.local", root));
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL (the same database the server uses) in .env.local.");
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL.replace(/\bsslmode=(?:require|prefer|verify-ca)\b/, "sslmode=verify-full"), max: 2 });
const query = async (text, params) => (await db.query(text, params)).rows;
// Sign-ups are limited per IP, so each run claims its own addresses from the 198.18.0.0/15 benchmarking range (the dev server trusts x-forwarded-for).
const ip = () => `198.18.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
const IP = ip(), FULL_IP = ip();

class Client {
  cookie = "";
  async raw(path, init = {}) {
    const headers = { origin, "x-forwarded-for": IP, ...(init.headers ?? {}), ...(this.cookie ? { cookie: this.cookie } : {}) };
    const res = await realFetch(BASE + path, { method: init.method ?? "GET", headers, body: init.body, redirect: "manual" });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const value = pair.slice(pair.indexOf("=") + 1);
      if (pair.startsWith("essay_session=")) this.cookie = value && !/max-age=0|expires=thu, 01 jan 1970/i.test(c) ? pair : "";
    }
    return res;
  }
  async req(method, path, body, headers = {}) {
    const res = await this.raw(path, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: body === undefined ? headers : { "content-type": "application/json", ...headers } });
    assert.equal(res.headers.get("cache-control"), "no-store", `${method} ${path} must not be cached`);
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
  get = (path) => this.req("GET", path);
  post = (path, body) => this.req("POST", path, body);
  put = (path, body) => this.req("PUT", path, body);
  patch = (path, body) => this.req("PATCH", path, body);
  del = (path, body) => this.req("DELETE", path, body);
}

// lib/book-store.ts is browser code calling fetch("/api/..."); route it to BASE as the active user so the real batching logic is tested.
let active;
globalThis.fetch = async (input, init = {}) => {
  if (typeof input !== "string" || !input.startsWith("/")) return realFetch(input, init);
  if (typeof init.body === "string") stats.maxRequest = Math.max(stats.maxRequest, Buffer.byteLength(init.body));
  if (init.method === "POST" && /\/api\/books\/[^/]+\/sections$/.test(input)) stats.sectionPosts++;
  if (/\/sections\?/.test(input)) stats.sectionPages++;
  const res = await active.raw(input, { method: init.method, body: init.body, headers: init.headers });
  stats.maxResponse = Math.max(stats.maxResponse, Buffer.byteLength(await res.clone().text()));
  return res;
};
const books = await import("../lib/book-store.ts");

const expectError = (res, status, code, label) => {
  assert.equal(res.status, status, `${label}: expected ${status}, got ${res.status} ${JSON.stringify(res.body)}`);
  assert.equal(typeof res.body?.error, "string", `${label}: error message`);
  if (code) assert.equal(res.body.code, code, `${label}: code`);
};
const step = (name) => console.log(`- ${name}`);
const suffix = randomBytes(4).toString("hex");
const users = [
  { name: "Smoke Test A", username: `test_${suffix}a`, password: `pw-${randomBytes(8).toString("hex")}` },
  { name: "Smoke Test B", username: `test_${suffix}b`, password: `pw-${randomBytes(8).toString("hex")}` },
  { name: "Smoke Test C", username: `test_${suffix}c`, password: `pw-${randomBytes(8).toString("hex")}` },
  { name: "Smoke Test D", username: `test_${suffix}d`, password: `pw-${randomBytes(8).toString("hex")}` },
  { name: "Smoke Test E", username: `test_${suffix}e`, password: `pw-${randomBytes(8).toString("hex")}` }, // must never be created
];
const settings = { targetWords: 1000, checklist: { thesis: true }, notes: [], sources: "", includeAntigone: true, tasks: [], thesis: "", profile: { kind: "", course: "", citation: "", instructions: "" } };
const a = new Client(), b = new Client(), anon = new Client();
const MISSING = "00000000-0000-4000-8000-000000000000";

async function main() {
  step("auth: sign up, validation, duplicates, me");
  let r = await anon.get("/api/auth/me");
  assert.deepEqual(r.body, { account: null });
  expectError(await anon.get("/api/essays"), 401, "unauthenticated", "anonymous list");
  expectError(await anon.post("/api/auth/signup", { name: "", username: users[0].username, password: users[0].password }), 400, "invalid", "blank name");
  expectError(await anon.post("/api/auth/signup", { name: "X", username: "a b", password: users[0].password }), 400, "invalid", "bad username");
  expectError(await anon.post("/api/auth/signup", { name: "X", username: users[0].username, password: "short" }), 400, "invalid", "short password");
  r = await a.post("/api/auth/signup", { ...users[0], username: `  ${users[0].username.toUpperCase()} ` });
  assert.equal(r.status, 201);
  assert.equal(r.body.account.username, users[0].username);
  assert.equal(r.body.account.name, users[0].name);
  assert.ok(a.cookie, "signup sets the session cookie");
  users[0].client = a;
  expectError(await anon.post("/api/auth/signup", users[0]), 409, "taken", "duplicate username");
  r = await b.post("/api/auth/signup", users[1]);
  assert.equal(r.status, 201);
  users[1].client = b;
  r = await a.get("/api/auth/me");
  assert.equal(r.body.account.username, users[0].username);
  const cross = await a.raw("/api/essays", { method: "POST", body: "{}", headers: { "content-type": "application/json", origin: "https://evil.example" } });
  assert.equal(cross.status, 403, "cross-site POST is refused");
  const crossFetch = await a.raw("/api/auth/logout", { method: "POST", headers: { "sec-fetch-site": "cross-site" } });
  assert.equal(crossFetch.status, 403, "cross-site logout is refused");

  step("essays: create, read, list");
  r = await a.post("/api/essays", {});
  assert.equal(r.status, 201);
  const blank = r.body.essay;
  assert.deepEqual([blank.title, blank.preview, blank.words, blank.archivedAt, blank.trashedAt], ["", "", 0, null, null]);
  r = await a.post("/api/essays", { text: "Antigone's duty\nSecond line of the essay.", html: "<p>Antigone's duty</p><p>Second line of the essay.</p>", brief: "Discuss duty.", settings });
  const essay = r.body.essay;
  assert.equal(essay.words, 7);
  assert.equal(essay.preview.split("\n")[0], "Antigone's duty");
  expectError(await a.post("/api/essays", { html: "x".repeat(2_000_001) }), 400, "invalid", "oversized html");
  expectError(await a.post("/api/essays", { settings: { targetWords: -1 } }), 400, "invalid", "bad settings");
  r = await a.get(`/api/essays/${essay.id}`);
  let doc = r.body.essay;
  assert.equal(doc.html, "<p>Antigone's duty</p><p>Second line of the essay.</p>");
  assert.equal(doc.brief, "Discuss duty.");
  assert.equal(doc.settings.targetWords, 1000);
  assert.deepEqual(doc.versions, []);
  assert.match(doc.revision, /^[0-9a-f-]{36}$/);
  assert.ok(doc.openedAt >= essay.openedAt);
  r = await a.get("/api/essays?view=recent");
  assert.deepEqual(r.body.essays.map((e) => e.id), [essay.id, blank.id], "recent sorted by updatedAt desc");
  expectError(await a.get("/api/essays?view=bogus"), 400, "invalid", "bad view");

  step("essays: save, versions, conflict, validation");
  const save = (body) => a.put(`/api/essays/${essay.id}`, { html: "<p>One two three</p>", text: "One two three", brief: "Discuss duty.", settings, ...body });
  r = await save({ expectedRevision: doc.revision });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.versions.length, 1, "first save adds a version");
  assert.notEqual(r.body.revision, doc.revision);
  let revision = r.body.revision;
  r = await save({ expectedRevision: revision, text: "One two three four", html: "<p>One two three four</p>" });
  assert.equal(r.body.versions.length, 1, "a save within 60 s adds no version");
  revision = r.body.revision;
  r = await save({ expectedRevision: revision, text: "Checkpoint text here", html: "<p>Checkpoint text here</p>", checkpoint: true });
  assert.equal(r.body.versions.length, 2, "checkpoint adds a version");
  const [newest, oldest] = r.body.versions;
  assert.ok(newest.savedAt >= oldest.savedAt, "versions newest first");
  assert.equal(newest.words, 3);
  revision = r.body.revision;
  expectError(await save({ expectedRevision: doc.revision }), 409, "conflict", "stale revision");
  expectError(await save({ expectedRevision: revision, text: "x".repeat(500_001) }), 400, "invalid", "oversized text");
  expectError(await save({ expectedRevision: revision, brief: "x".repeat(20_001) }), 400, "invalid", "oversized brief");
  expectError(await save({ expectedRevision: revision, settings: { ...settings, notes: "nope" } }), 400, "invalid", "bad settings");
  expectError(await a.put(`/api/essays/${essay.id}`, { expectedRevision: revision }), 400, "invalid", "missing fields");
  r = await a.get("/api/essays?view=recent");
  assert.equal(r.body.essays[0].id, essay.id);
  assert.equal(r.body.essays[0].words, 3);
  assert.equal(r.body.essays[0].preview, "Checkpoint text here");

  r = await a.get(`/api/essays/${essay.id}/versions/${oldest.id}`);
  assert.equal(r.body.version.html, "<p>One two three</p>");
  assert.equal(r.body.version.settings.targetWords, 1000);
  expectError(await a.get(`/api/essays/${essay.id}/versions/not-a-uuid`), 404, "not_found", "malformed version id");
  expectError(await a.get(`/api/essays/${essay.id}/versions/${MISSING}`), 404, "not_found", "missing version");
  expectError(await a.get(`/api/essays/${blank.id}/versions/${oldest.id}`), 404, "not_found", "version of another essay");

  step("essays: rename, archive, copy");
  r = await a.patch(`/api/essays/${essay.id}`, { title: "  Duty in Antigone  " });
  assert.equal(r.body.essay.title, "Duty in Antigone");
  assert.ok(r.body.essay.updatedAt >= newest.savedAt);
  r = await a.get(`/api/essays/${essay.id}`);
  assert.equal(r.body.essay.revision, revision, "renaming keeps the revision");
  expectError(await a.patch(`/api/essays/${essay.id}`, { title: "x".repeat(201) }), 400, "invalid", "long title");
  expectError(await a.patch(`/api/essays/${essay.id}`, {}), 400, "invalid", "empty patch");
  const beforeArchive = r.body.essay.updatedAt;
  r = await a.patch(`/api/essays/${essay.id}`, { archived: true });
  assert.ok(r.body.essay.archivedAt);
  assert.equal(r.body.essay.updatedAt, beforeArchive, "archiving keeps updatedAt");
  assert.deepEqual((await a.get("/api/essays?view=archived")).body.essays.map((e) => e.id), [essay.id]);
  assert.ok(!(await a.get("/api/essays?view=recent")).body.essays.some((e) => e.id === essay.id));
  r = await a.patch(`/api/essays/${essay.id}`, { archived: false });
  assert.equal(r.body.essay.archivedAt, null);
  r = await a.post("/api/essays", { copyOf: essay.id });
  assert.equal(r.status, 201);
  const copy = r.body.essay;
  assert.equal(copy.title, "Copy of Duty in Antigone");
  r = await a.get(`/api/essays/${copy.id}`);
  assert.equal(r.body.essay.html, "<p>Checkpoint text here</p>");
  assert.equal(r.body.essay.brief, "Discuss duty.");
  assert.deepEqual(r.body.essay.versions, [], "copies start without history");
  r = await a.post("/api/essays", { copyOf: blank.id });
  assert.equal(r.body.essay.title, "Copy of Untitled essay");
  const blankCopy = r.body.essay;
  expectError(await a.post("/api/essays", { copyOf: MISSING }), 404, "not_found", "copy of missing essay");

  step("essays: trash, restore, delete, empty trash");
  expectError(await a.del(`/api/essays/${essay.id}`), 409, "invalid", "delete before trash");
  await a.patch(`/api/essays/${essay.id}`, { archived: true });
  r = await a.patch(`/api/essays/${essay.id}`, { trashed: true });
  assert.ok(r.body.essay.trashedAt);
  assert.deepEqual((await a.get("/api/essays?view=trash")).body.essays.map((e) => e.id), [essay.id]);
  assert.equal((await a.get("/api/essays?view=archived")).body.essays.length, 0, "trashed essays leave the archive view");
  r = await a.get(`/api/essays/${essay.id}`);
  assert.ok(r.body.essay.trashedAt, "trashed essays stay readable");
  expectError(await save({ expectedRevision: revision }), 409, "trashed", "save to trashed essay");
  r = await a.patch(`/api/essays/${essay.id}`, { trashed: false });
  assert.equal(r.body.essay.trashedAt, null);
  assert.ok(r.body.essay.archivedAt, "restoring keeps the archive state");
  r = await save({ expectedRevision: revision });
  assert.equal(r.status, 200, "restored essays save again");
  await a.patch(`/api/essays/${copy.id}`, { trashed: true });
  r = await a.del(`/api/essays/${copy.id}`);
  assert.deepEqual(r.body, { ok: true });
  expectError(await a.get(`/api/essays/${copy.id}`), 404, "not_found", "deleted essay");
  await a.patch(`/api/essays/${blank.id}`, { trashed: true });
  await a.patch(`/api/essays/${blankCopy.id}`, { trashed: true });
  expectError(await a.del("/api/essays"), 400, "invalid", "empty without view");
  r = await a.del("/api/essays?view=trash");
  assert.deepEqual(r.body, { ok: true });
  assert.equal((await a.get("/api/essays?view=trash")).body.essays.length, 0);
  for (const [method, body] of [["GET"], ["PUT", { html: "", text: "", brief: "", settings, expectedRevision: "" }], ["PATCH", { title: "x" }], ["DELETE"]]) {
    expectError(await a.req(method, "/api/essays/not-a-uuid", body), 404, "not_found", `${method} malformed id`);
    expectError(await a.req(method, `/api/essays/${MISSING}`, body), 404, "not_found", `${method} missing id`);
  }

  step("essays: NUL characters are stripped, a lost save response is not a conflict, size and count limits");
  r = await a.post("/api/essays", { title: "Nul\u0000 title", html: "<p>a\u0000b</p>", text: "a\u0000b c", brief: "br\u0000ief", settings: { ...settings, thesis: "x\u0000y", checklist: { ["k\u0000ey"]: true } } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const nul = r.body.essay;
  assert.deepEqual([nul.title, nul.preview, nul.words], ["Nul title", "ab c", 2]);
  doc = (await a.get(`/api/essays/${nul.id}`)).body.essay;
  assert.deepEqual([doc.html, doc.text, doc.brief, doc.settings.thesis, doc.settings.checklist], ["<p>ab</p>", "ab c", "brief", "xy", { key: true }]);
  const nulSave = { html: "<p>c\u0000d</p>", text: "c\u0000d", brief: "\u0000", settings: { ...settings, notes: [{ paragraph: "p\u0000", note: "n\u0000" }] } };
  const before = doc.revision;
  r = await a.put(`/api/essays/${nul.id}`, { ...nulSave, expectedRevision: before });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const committed = r.body;
  doc = (await a.get(`/api/essays/${nul.id}`)).body.essay;
  assert.deepEqual([doc.html, doc.text, doc.brief, doc.settings.notes], ["<p>cd</p>", "cd", "", [{ paragraph: "p", note: "n" }]]);
  assert.equal((await a.patch(`/api/essays/${nul.id}`, { title: "\u0000Renamed" })).body.essay.title, "Renamed");
  // The same save sent again with the revision it was based on (its response was lost) answers 200 with the stored revision.
  for (const retry of [nulSave, { ...nulSave, settings: Object.fromEntries(Object.entries(nulSave.settings).reverse()) }]) {
    r = await a.put(`/api/essays/${nul.id}`, { ...retry, expectedRevision: before });
    assert.equal(r.status, 200, `retried save: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.revision, committed.revision, "a retried save keeps the committed revision");
    assert.deepEqual(r.body.versions, committed.versions);
  }
  expectError(await a.put(`/api/essays/${nul.id}`, { ...nulSave, text: "changed", expectedRevision: before }), 409, "conflict", "stale revision, different content");
  r = await a.put(`/api/essays/${nul.id}`, { ...nulSave, html: "€".repeat(1_400_000), expectedRevision: committed.revision });
  expectError(r, 400, "invalid", "over the 4 MB byte budget");
  assert.match(r.body.error, /too large to save/);
  expectError(await a.post("/api/essays", { html: "€".repeat(1_400_000) }), 400, "invalid", "create over the byte budget");
  await a.patch(`/api/essays/${nul.id}`, { trashed: true });
  await a.del(`/api/essays/${nul.id}`);
  const [{ id: bId }] = await query(`SELECT id FROM users WHERE username = $1`, [users[1].username]);
  await query(`INSERT INTO essays (user_id, settings, trashed_at) SELECT $1, '{}'::jsonb, now() FROM generate_series(1, 1000)`, [bId]);
  r = await b.post("/api/essays", {});
  expectError(r, 409, "limit", "essay limit counts the trash");
  assert.match(r.body.error, /up to 1,000 essays/);
  await b.del("/api/essays?view=trash");
  assert.equal((await b.post("/api/essays", {})).status, 201, "emptying the trash frees the limit");
  await query(`DELETE FROM essays WHERE user_id = $1`, [bId]);

  step("essays: another account sees nothing");
  assert.deepEqual((await b.get("/api/essays?view=recent")).body.essays, []);
  expectError(await b.get(`/api/essays/${essay.id}`), 404, "not_found", "B reads A");
  expectError(await b.put(`/api/essays/${essay.id}`, { html: "", text: "", brief: "", settings, expectedRevision: revision }), 404, "not_found", "B saves A");
  expectError(await b.patch(`/api/essays/${essay.id}`, { trashed: true }), 404, "not_found", "B trashes A");
  expectError(await b.del(`/api/essays/${essay.id}`), 404, "not_found", "B deletes A");
  expectError(await b.get(`/api/essays/${essay.id}/versions/${oldest.id}`), 404, "not_found", "B reads A's version");
  expectError(await b.post("/api/essays", { copyOf: essay.id }), 404, "not_found", "B copies A");
  r = await a.get(`/api/essays/${essay.id}`);
  assert.equal(r.body.essay.trashedAt, null, "A's essay untouched");

  step("essays: search titles and full text, % and _ are literal, scoped to the view and account");
  const make = async (body) => { const res = await a.post("/api/essays", { settings, ...body }); assert.equal(res.status, 201, JSON.stringify(res.body)); return res.body.essay; };
  const longText = `Opening line about Creon.\n${"filler words for a long essay ".repeat(15_000)}\nThe closing word is quixotically.`;
  const found = [
    await make({ title: "Hamlet's Ghost", text: "Nothing to see." }),
    await make({ text: longText, html: `<p>${longText}</p>` }),
    await make({ text: "We are 100% sure of it." }),
    await make({ text: "We are 100 percent sure." }),
    await make({ text: "A snake_case name." }),
    await make({ text: "A snakeXcase name." }),
    await make({ text: "Back\\slash here." }),
  ];
  const [ghost, longEssay, pct, , under, , slash] = found;
  const search = async (q, v = "recent", client = a) => {
    const res = await client.get(`/api/essays?view=${v}&q=${encodeURIComponent(q)}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.essays.map((e) => e.id).sort();
  };
  assert.deepEqual(await search("GHOST"), [ghost.id], "title, case-insensitive");
  assert.ok(!longEssay.preview.includes("quixotically"), "the word is past the preview");
  assert.deepEqual(await search("quixotically"), [longEssay.id], "a word near the end of a long essay");
  assert.deepEqual(await search("100%"), [pct.id], "% is literal");
  assert.deepEqual(await search("%"), [pct.id], "a lone % matches only a %");
  assert.deepEqual(await search("e_c"), [under.id], "_ is literal");
  assert.deepEqual(await search("_"), [under.id], "a lone _ matches only an _");
  assert.deepEqual(await search("k\\s"), [slash.id], "\\ is literal");
  assert.deepEqual(await search("  ghost  "), [ghost.id], "surrounding spaces are ignored");
  assert.equal((await search("   ")).length, (await a.get("/api/essays?view=recent")).body.essays.length, "a blank search lists everything");
  assert.deepEqual(await search("ghost\u0000"), [ghost.id], "NUL is ignored");
  assert.deepEqual(await search("no-such-words-anywhere"), []);
  expectError(await a.get(`/api/essays?view=recent&q=${"x".repeat(201)}`), 400, "invalid", "search over 200 characters");
  assert.equal((await search("x".repeat(200))).length, 0, "200 characters is allowed");
  await a.patch(`/api/essays/${ghost.id}`, { archived: true });
  assert.deepEqual(await search("ghost"), [], "archived essays leave recent search");
  assert.deepEqual(await search("ghost", "archived"), [ghost.id], "and show in archived search");
  assert.deepEqual(await search("ghost", "recent", b), [], "another account finds nothing");
  for (const e of found) { await a.patch(`/api/essays/${e.id}`, { trashed: true }); await a.del(`/api/essays/${e.id}`); }
  assert.deepEqual(await search("ghost", "trash"), []);

  step("books: batched upload > 3 MB, paged read, rename, limit, remove");
  active = a;
  assert.deepEqual(await books.listBooks(), []);
  const small = [{ location: "p. 1", text: "Creon forbids the burial." }, { location: "p. 2", text: "Antigone buries her brother." }];
  await books.addBook({ id: "ignored", title: "Small", fileName: "small.txt", kind: "txt", sections: 2, chars: 0, addedAt: 0 }, small);
  const long = "Évidence 😀 du texte, ligne ".repeat(43_000); // ~1.2M UTF-16 units with multi-byte characters and surrogate pairs
  const big = [...Array.from({ length: 20 }, (_, i) => ({ location: `ch. ${i + 1}`, text: `${i} `.padEnd(100_000, "lorem ipsum ") })), { location: "ch. 21", text: long }, { location: "ch. 22", text: "The end." }];
  const bigBytes = Buffer.byteLength(JSON.stringify(big));
  assert.ok(bigBytes > 3_000_000, `big book is ${bigBytes} bytes`);
  await books.addBook({ id: "ignored", title: "Big", fileName: "big.epub", kind: "epub", sections: big.length, chars: 0, addedAt: 0 }, big);
  assert.ok(stats.sectionPosts >= 1, "the big book needed more than one batch");
  assert.ok(stats.maxRequest <= 3_200_000, `largest request ${stats.maxRequest} bytes`);
  let list = await books.listBooks();
  assert.deepEqual(list.map((x) => [x.title, x.fileName, x.kind, x.sections]), [["Small", "small.txt", "txt", 2], ["Big", "big.epub", "epub", 22]]);
  assert.equal(list[1].chars, big.reduce((n, s) => n + s.text.length, 0));
  assert.ok(list[0].addedAt <= list[1].addedAt);
  assert.deepEqual(await books.readSections(list[0].id), small);
  const read = await books.readSections(list[1].id);
  assert.equal(read.length, big.length);
  assert.ok(read.every((s, i) => s.location === big[i].location && s.text === big[i].text), "big book reads back exactly");
  assert.ok(stats.sectionPages > 3, "the big book was read in pages");
  assert.ok(stats.maxResponse < MAX_BODY, `largest response ${stats.maxResponse} bytes`);
  await books.renameBook(list[0].id, "Renamed");
  assert.equal((await books.listBooks())[0].title, "Renamed");
  expectError(await a.patch(`/api/books/${list[0].id}`, { title: "  " }), 400, "invalid", "blank book title");
  expectError(await a.post("/api/books", { title: "Bad", fileName: "x.exe", kind: "exe", parts: [], done: true }), 400, "invalid", "bad kind");
  expectError(await a.post("/api/books", { title: "Empty", fileName: "e.txt", kind: "txt", parts: [], done: true }), 400, "invalid", "empty book");
  r = await a.post("/api/books", { title: "Pending", fileName: "p.txt", kind: "txt", parts: [{ location: "1", text: "a" }], done: false });
  assert.equal(r.status, 201);
  const pending = r.body.book;
  assert.equal((await books.listBooks()).length, 2, "incomplete uploads are not listed");
  expectError(await a.get(`/api/books/${pending.id}/sections`), 404, "not_found", "read incomplete");
  expectError(await a.post(`/api/books/${pending.id}/sections`, { start: 5, parts: [], done: true }), 409, "invalid", "out-of-order batch");
  r = await a.post(`/api/books/${pending.id}/sections`, { start: 1, parts: [{ location: "1", text: "b", continued: true }, { location: "2", text: "c" }], done: true });
  assert.equal(r.body.book.sections, 2);
  assert.deepEqual(await books.readSections(pending.id), [{ location: "1", text: "ab" }, { location: "2", text: "c" }]);
  expectError(await a.post(`/api/books/${pending.id}/sections`, { start: 2, parts: [], done: true }), 409, "invalid", "append to complete book");

  expectError(await b.get(`/api/books/${pending.id}/sections`), 404, "not_found", "B reads A's book");
  expectError(await b.patch(`/api/books/${pending.id}`, { title: "Mine" }), 404, "not_found", "B renames A's book");
  expectError(await b.del(`/api/books/${pending.id}`), 404, "not_found", "B removes A's book");
  expectError(await b.post(`/api/books/${pending.id}/sections`, { start: 2, parts: [], done: true }), 404, "not_found", "B appends to A's book");
  expectError(await a.get("/api/books/not-a-uuid/sections"), 404, "not_found", "malformed book id");
  active = b;
  assert.deepEqual(await books.listBooks(), []);
  assert.deepEqual(await books.readSections(pending.id), [], "missing books read as empty");
  active = a;

  step("books: NUL characters are stripped, unfinished uploads and sections are capped");
  r = await a.post("/api/books", { title: "N\u0000ul", fileName: "n\u0000.txt", kind: "txt", parts: [{ location: "p.\u0000 1", text: "he\u0000llo" }, { location: "p. 2", text: "\u0000", continued: true }], done: true });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual([r.body.book.title, r.body.book.fileName, r.body.book.sections, r.body.book.chars], ["Nul", "n.txt", 1, 5]);
  assert.deepEqual(await books.readSections(r.body.book.id), [{ location: "p. 1", text: "hello" }]);
  await books.removeBook(r.body.book.id);
  const unfinished = { fileName: "u.txt", kind: "txt", parts: [{ location: "1", text: "x" }], done: false };
  const uploading = [];
  for (let i = 0; i < 2; i++) uploading.push((await a.post("/api/books", { title: `Uploading ${i}`, ...unfinished })).body.book.id);
  expectError(await a.post("/api/books", { title: "One upload too many", ...unfinished }), 409, "invalid", "third unfinished upload");
  for (const id of uploading) assert.equal((await a.del(`/api/books/${id}`)).status, 200);
  const many = Array.from({ length: 50_001 }, (_, i) => ({ location: `p. ${i + 1}`, text: "x" }));
  expectError(await a.post("/api/books", { title: "Many", fileName: "m.txt", kind: "txt", parts: many, done: true }), 400, "invalid", "too many sections");
  expectError(await a.post("/api/books", { title: "Long location", fileName: "l.txt", kind: "txt", parts: [{ location: "x".repeat(101), text: "x" }], done: true }), 400, "invalid", "long location");
  assert.equal((await books.listBooks()).length, 3, "rejected uploads leave nothing behind");

  for (let i = (await books.listBooks()).length; i < books.MAX_BOOKS; i++) await books.addBook({ id: "", title: `Filler ${i}`, fileName: "f.txt", kind: "txt", sections: 1, chars: 1, addedAt: 0 }, [{ location: "p. 1", text: "x" }]);
  await assert.rejects(books.addBook({ id: "", title: "One too many", fileName: "f.txt", kind: "txt", sections: 1, chars: 1, addedAt: 0 }, [{ location: "p. 1", text: "x" }]), { message: `You can keep up to ${books.MAX_BOOKS} sources. Remove one first.` });
  expectError(await a.post("/api/books", { title: "Over", fileName: "o.txt", kind: "txt", parts: [{ location: "1", text: "x" }], done: true }), 409, "limit", "book limit");
  list = await books.listBooks();
  assert.equal(list.length, books.MAX_BOOKS);
  for (const book of list) await books.removeBook(book.id);
  assert.deepEqual(await books.listBooks(), []);
  await books.removeBook(list[0].id); // already gone: a no-op, as with IndexedDB

  step("auth: logout, login, throttling");
  r = await a.post("/api/auth/logout");
  assert.deepEqual(r.body, { ok: true });
  assert.equal(a.cookie, "", "logout clears the cookie");
  assert.deepEqual((await a.get("/api/auth/me")).body, { account: null });
  expectError(await a.get("/api/essays"), 401, "unauthenticated", "after logout");
  const wrong = await a.post("/api/auth/login", { username: users[0].username, password: "wrong-password" });
  const c = new Client();
  const unknown = await c.post("/api/auth/login", { username: users[2].username, password: "wrong-password" }); // no account yet: miss 1 of 10
  expectError(wrong, 401, null, "wrong password");
  assert.deepEqual(wrong.body, unknown.body, "unknown users get the same answer");
  expectError(await a.post("/api/auth/login", { username: users[0].username }), 400, "invalid", "missing password");
  r = await a.post("/api/auth/login", { username: users[0].username.toUpperCase(), password: users[0].password });
  assert.equal(r.status, 200);
  assert.equal(r.body.account.username, users[0].username);
  assert.equal((await a.get("/api/essays?view=archived")).body.essays[0].id, essay.id, "data survives logout");
  // Nine misses, then success, resets the count: nine more misses still don't lock.
  const bLogin = new Client();
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 9; i++) expectError(await bLogin.post("/api/auth/login", { username: users[1].username, password: "nope-nope" }), 401, null, "miss");
    assert.equal((await bLogin.post("/api/auth/login", { username: users[1].username, password: users[1].password })).status, 200, "success resets the counter");
  }
  // Ten misses lock a username, even one with no account yet; signing it up clears the lock.
  for (let miss = 2; miss <= 10; miss++) {
    r = await c.post("/api/auth/login", { username: users[2].username, password: "nope-nope" });
    if (miss < 10) expectError(r, 401, null, `miss ${miss}`);
  }
  expectError(r, 429, "locked", "tenth miss locks");
  assert.match(r.body.error, /Too many attempts\. Try again in 15 minutes\./);
  expectError(await c.post("/api/auth/login", { username: users[2].username, password: users[2].password }), 429, "locked", "locked even with the right password");
  r = await c.post("/api/auth/signup", users[2]);
  assert.equal(r.status, 201);
  users[2].client = c;
  assert.equal((await new Client().post("/api/auth/login", { username: users[2].username, password: users[2].password })).status, 200, "a new account starts unlocked");

  step("auth: parallel guesses can't outrun the lockout");
  const d = new Client();
  assert.equal((await d.post("/api/auth/signup", users[3])).status, 201);
  users[3].client = d;
  const login = (password) => new Client().post("/api/auth/login", { username: users[3].username, password });
  const tally = (rs) => rs.reduce((t, x) => ({ ...t, [x.status]: (t[x.status] ?? 0) + 1 }), {});
  let burst = tally(await Promise.all(Array.from({ length: 15 }, (_, i) => login(`wrong-${i}`))));
  assert.deepEqual(burst, { 401: 9, 429: 6 }, `15 parallel misses: only 9 are checked, the 10th locks (${JSON.stringify(burst)})`);
  expectError(await login(users[3].password), 429, "locked", "right password while locked");
  expectError(await d.del("/api/auth/account", { password: users[3].password }), 429, "locked", "account deletion while locked");
  const expireLock = () => query(`UPDATE login_throttle SET locked_until = now() - interval '1 second' WHERE username = $1`, [users[3].username]);
  await expireLock();
  const mixed = await Promise.all(Array.from({ length: 21 }, (_, i) => login(i === 10 ? users[3].password : `wrong-${i}`)));
  burst = tally(mixed);
  assert.ok((burst[200] ?? 0) + (burst[401] ?? 0) <= 10, `at most 10 of a parallel burst are checked (${JSON.stringify(burst)})`);
  expectError(await login(users[3].password), 429, "locked", "right password after a mixed burst");
  await expireLock();
  assert.equal((await login(users[3].password)).status, 200, "the lock expires");

  step("auth: sign-ups are limited per IP");
  const limit = Number(process.env.SIGNUP_LIMIT_PER_HOUR ?? 5);
  if (limit > 0) {
    await query(`INSERT INTO signup_throttle (ip, count) VALUES ($1, $2)`, [FULL_IP, limit]);
    r = await new Client().req("POST", "/api/auth/signup", users[4], { "x-forwarded-for": `${FULL_IP}, 10.0.0.1` });
    expectError(r, 429, "locked", "sign-up over the IP limit");
    assert.match(r.body.error, /Too many new accounts from this network\. Try again in \d+ minutes?\./);
    const used = async () => (await query(`SELECT count FROM signup_throttle WHERE ip = $1`, [IP]))[0].count;
    const count = await used();
    expectError(await anon.post("/api/auth/signup", users[0]), 409, "taken", "duplicate username");
    assert.equal(await used(), count, "a taken username doesn't use up the limit");
  } else console.log("  (SIGNUP_LIMIT_PER_HOUR=0: limit off, skipped)");

  step("auth: delete accounts");
  expectError(await c.del("/api/auth/account", { password: "wrong-password" }), 400, "invalid", "delete with wrong password");
  expectError(await anon.del("/api/auth/account", { password: "x" }), 401, "unauthenticated", "delete signed out");
}

async function cleanup() {
  let failed = false;
  await query(`DELETE FROM login_throttle WHERE username = ANY($1)`, [users.map((u) => u.username)]); // lift any lock left by a failed run
  for (const user of users) {
    const client = user.client ?? new Client();
    if (!(await client.get("/api/auth/me")).body?.account) await client.post("/api/auth/login", { username: user.username, password: user.password });
    if (!(await client.get("/api/auth/me")).body?.account) continue; // never created
    const ghost = new Client();
    ghost.cookie = client.cookie;
    const r = await client.del("/api/auth/account", { password: user.password });
    if (r.status !== 200 || client.cookie) { failed = true; console.error(`Could not delete ${user.username}: ${JSON.stringify(r.body)}`); }
    else if ((await ghost.get("/api/auth/me")).body.account !== null) { failed = true; console.error(`${user.username}'s session outlived the account`); }
  }
  await query(`DELETE FROM login_throttle WHERE username = ANY($1)`, [users.map((u) => u.username)]);
  await query(`DELETE FROM signup_throttle WHERE ip = ANY($1)`, [[IP, FULL_IP]]);
  return !failed;
}

let ok = false;
try { await main(); ok = true; }
catch (error) { console.error(error); }
finally {
  const cleaned = await cleanup().catch((e) => { console.error("Cleanup failed", e); return false; });
  if (cleaned) console.log("- cleanup: test accounts and everything they owned deleted");
  console.log(ok && cleaned ? `PASS (largest request ${stats.maxRequest} B, largest response ${stats.maxResponse} B, ${stats.sectionPosts} extra upload batches, ${stats.sectionPages} pages read)` : "FAIL");
  process.exitCode = ok && cleaned ? 0 : 1;
  await db.end();
}
