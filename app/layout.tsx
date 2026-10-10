import type { Metadata } from "next";
import "./globals.css";
import "./styles/panel.css";
import "./styles/outline.css";
import "./styles/suggestions.css";
import "./styles/markers.css";
import "./styles/ai-check.css";
import "./styles/paragraph.css";
import "./styles/sources.css";
import "./styles/setup.css";
import { AiSettings } from "@/components/AiSettings";

export const metadata: Metadata = { title: "Essay editor" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}<AiSettings /></body>
    </html>
  );
}
