import { currentAccount } from "@/lib/server/auth";
import { json, route } from "@/lib/server/http";

export const GET = route(async () => json({ account: await currentAccount() }), false);
