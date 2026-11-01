import "../styles/share.css";
import Wordmark from "@/components/Wordmark";

// Rendered by notFound() in ./page.tsx: a link that is missing, truncated or altered. Next sends 404 and noindex.
export default function ShareNotFound() {
  return (
    <main className="share">
      <header className="share-bar"><Wordmark /></header>
      <p className="share-invalid">This link is not valid.</p>
      <p><a className="btn btn-ink" href="/">Try it on your essay</a></p>
    </main>
  );
}
