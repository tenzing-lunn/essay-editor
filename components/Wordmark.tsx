import Link from "next/link";
import { APP_NAME } from "@/lib/brand";

export default function Wordmark({ href = "/" }: { href?: string }) {
  return <Link href={href} className="wordmark" aria-label={`${APP_NAME} home`}><span>{APP_NAME}</span></Link>;
}
