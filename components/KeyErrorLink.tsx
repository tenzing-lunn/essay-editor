"use client";

import { openAiSettings } from "@/components/AiAccount";

/** Appended to an inline AI error: a missing or rejected key gets a direct way to fix it. */
export default function KeyErrorLink({ error }: { error: string | null }) {
  return !!error && /API key/i.test(error) && <> <button className="link" onClick={openAiSettings}>Connect your key</button></>;
}
