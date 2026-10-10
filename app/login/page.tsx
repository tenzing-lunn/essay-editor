import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { currentAccount } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Sign in · Essay editor" };

// Only same-site paths: "//host" and "/\host" are protocol-relative elsewhere, browsers drop tabs and newlines
// (so "/\t/host" becomes "//host"), and /login itself would loop.
function safeNext(value: string | string[] | undefined): string {
  const next = typeof value === "string" ? value : "";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /[\u0000-\u001f\u007f]/.test(next) || /^\/login(?:[/?#]|$)/.test(next)) return "";
  return next;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const next = safeNext((await searchParams).next);
  if (await currentAccount()) redirect(next || "/");
  return <LoginForm next={next} />;
}
