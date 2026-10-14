import EssayHome from "@/components/EssayHome";
import Landing from "@/components/Landing";
import { currentAccount } from "@/lib/server/auth";

// Signed out: the landing page at status 200, so a stranger with the link sees the product. Signed in: the essay list, as before.
export default async function Home() {
  const account = await currentAccount();
  return account ? <EssayHome account={account} /> : <Landing />;
}
