import "../styles/share.css";

// Rendered by notFound() in ./page.tsx: a link that is missing, truncated or altered. Next sends 404 and noindex.
export default function ShareNotFound() {
  return (
    <main className="share">
      <p className="share-invalid">This link is not valid.</p>
      <a className="button primary" href="/">Try it on your essay</a>
    </main>
  );
}
