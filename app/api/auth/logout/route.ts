import { endSession } from "@/lib/server/auth";
import { json, route } from "@/lib/server/http";

export const POST = route(async () => {
  await endSession();
  return json({ ok: true });
});
