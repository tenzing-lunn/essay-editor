import { redirect } from "next/navigation";
import { currentAccount } from "@/lib/server/auth";
import EssayEditor from "@/components/EssayEditor";

// key={id}: opening another essay remounts the editor, so nothing from one essay carries into the next.
export default async function EssayRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await currentAccount();
  if (!account) redirect(`/login?next=/essay/${encodeURIComponent(id)}`);
  return <EssayEditor key={id} essayId={id} account={account} />;
}
