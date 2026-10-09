"use client";

import type { EssaySettings } from "@/lib/essay-document";

type Props = {
  open: boolean; onClose: () => void;
  brief: string; onBriefChange: (text: string) => void;
  settings: EssaySettings; updateSettings: (update: (settings: EssaySettings) => EssaySettings) => void;
};

/** Start-of-essay setup: the assignment prompt and sources. */
export default function SetupWelcome(_props: Props) {
  return null;
}
