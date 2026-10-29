import Link from "next/link";
import { APP_NAME } from "@/lib/brand";

/** The diple (>), the mark Greek editors drew in the margin to say "look at this line", beside the name in the typed face. */
export function Diple({ size = 18 }: { size?: number }) {
  return <svg className="diple" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
    <path d="M4.5 3.5c3.4 2 7 4.3 11 6.4-3.9 2.3-7.5 4.4-11 6.6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export default function Wordmark({ href = "/" }: { href?: string }) {
  return <Link href={href} className="wordmark" aria-label={`${APP_NAME} home`}><Diple /><span>{APP_NAME}</span></Link>;
}
