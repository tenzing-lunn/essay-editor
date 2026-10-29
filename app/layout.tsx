import type { Metadata } from "next";
import { Figtree, Kalam, Literata } from "next/font/google";
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

// Three hands on one page: the typed essay (Literata), the interface (Figtree), and Scholia's pen notes (Kalam).
const typed = Literata({ subsets: ["latin", "greek"], variable: "--font-typed", display: "swap" });
const ui = Figtree({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const hand = Kalam({ subsets: ["latin"], weight: ["300", "400", "700"], variable: "--font-hand", display: "swap" });

export const metadata: Metadata = { title: APP_NAME, description: `${THESIS} ${TAGLINE}` };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${typed.variable} ${ui.variable} ${hand.variable}`}>
      <body>{children}<AiSettings /></body>
    </html>
  );
}
