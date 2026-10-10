// What this browser keeps per essay, outside the account. Prefixes match recoveryKey/setupClosedKey (components/EssayEditor.tsx),
// liveCheckKey (lib/essay-issues.ts), aiCheckKey (lib/ai-check.ts) and mapKey (components/ParagraphOutline.tsx).
import { resetAiCost, saveAiSettings } from "./ai-client";

const RECOVERY = "finals:essay-recovery:v2:";
const CACHES = ["finals:essay-live-check:v1:", "finals:essay-ai-check:v2:", "essay:argument-map:v1:"];
const SETUP_CLOSED = "essay:setup:closed:"; // sessionStorage

const keys = (storage: Storage) => Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k): k is string => k !== null);

/** After Delete forever: nothing of the essay is left to restore. */
export function forgetEssay(id: string) {
  try { for (const prefix of [RECOVERY, ...CACHES]) localStorage.removeItem(prefix + id); } catch {}
  try { sessionStorage.removeItem(SETUP_CLOSED + id); } catch {}
}

/**
 * After signing out, so the next account in this tab can't use or be billed to the AI key, or see cached checks of essays.
 * Recovery copies stay: one only exists while an essay's changes haven't reached the server (the editor deletes it once a save
 * lands), so it is unsaved work; it is offered again when its owner reopens that essay, and no other account can open it.
 */
export function forgetSignedOut() {
  try { saveAiSettings(null); resetAiCost(); } catch {}
  try { for (const k of keys(localStorage)) if (CACHES.some((p) => k.startsWith(p))) localStorage.removeItem(k); } catch {}
  try { for (const k of keys(sessionStorage)) if (k.startsWith(SETUP_CLOSED)) sessionStorage.removeItem(k); } catch {}
}
