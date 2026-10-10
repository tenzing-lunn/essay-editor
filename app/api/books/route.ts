import { requireAccount } from "@/lib/server/auth";
import { createBook, CreateSchema, listBooks } from "@/lib/server/books";
import { json, parse, route } from "@/lib/server/http";

export const GET = route(async () => {
  const account = await requireAccount();
  if (account instanceof Response) return account;
  return json({ books: await listBooks(account.id) });
}, false);

// Creates the book with its first batch of sections; further batches go to /api/books/:id/sections.
export const POST = route(async (request) => {
  const account = await requireAccount();
  if (account instanceof Response) return account;
  return json({ book: await createBook(account.id, await parse(request, CreateSchema)) }, 201);
});
