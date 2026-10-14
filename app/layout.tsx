import type { Metadata } from "next";
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
import { APP_NAME, TAGLINE } from "@/lib/brand";

export const metadata: Metadata = { title: APP_NAME, description: TAGLINE };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}<AiSettings /></body>
    </html>
  );
}
