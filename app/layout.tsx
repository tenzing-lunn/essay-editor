import type { Metadata } from "next";
import { Inter, Literata } from "next/font/google";
import "./styles/tokens.css";
import "./globals.css";
import "./styles/panel.css";
import "./styles/outline.css";
import "./styles/suggestions.css";
import "./styles/popover.css";
import "./styles/ai-check.css";
import "./styles/paragraph.css";
import "./styles/sources.css";
import "./styles/setup.css";
import "./styles/home.css";
import "./styles/editor-chrome.css";
import "./styles/landing.css";
import { AiSettings } from "@/components/AiSettings";
import { APP_NAME, TAGLINE, THESIS } from "@/lib/brand";

// Two faces: the essay in a document serif (Literata, what the student hands in), everything else in Inter.
const typed = Literata({ subsets: ["latin", "greek"], variable: "--font-typed", display: "swap" });
const ui = Inter({ subsets: ["latin", "greek"], variable: "--font-ui", display: "swap" });

export const metadata: Metadata = { title: APP_NAME, description: `${THESIS} ${TAGLINE}` };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${typed.variable} ${ui.variable}`}>
      <body>{children}<AiSettings /></body>
    </html>
  );
}
