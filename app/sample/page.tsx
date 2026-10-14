import type { Metadata } from "next";
import SampleDemo from "@/components/SampleDemo";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Sample essay · ${APP_NAME}` };

// Public and static: the results are a fixture, so no account, no database and no AI call.
export default function SamplePage() {
  return <SampleDemo />;
}
