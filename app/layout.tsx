import type { Metadata } from "next";
import "./globals.css";
import { AiSettings } from "@/components/AiSettings";

export const metadata: Metadata = { title: "Essay editor" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}<AiSettings /></body>
    </html>
  );
}
