import { redirect } from "next/navigation";
import EssayHome from "@/components/EssayHome";
import { currentAccount } from "@/lib/server/auth";

export default async function Home() {
  const account = await currentAccount();
  if (!account) redirect("/login");
  return <EssayHome account={account} />;
}
