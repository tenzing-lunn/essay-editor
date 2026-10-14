import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { APP_NAME, PROMISE, TAGLINE } from "@/lib/brand";
import { LEVEL_NAMES, TRAITS } from "@/lib/essay-grade";
import { decodeShare } from "@/lib/server/share";
import "../styles/share.css";

// A report is for the people it is sent to, not for search engines; the link is the only way in.
export const metadata: Metadata = { title: `Grade report · ${APP_NAME}`, robots: { index: false } };

const traitName = (key: string) => TRAITS.find((t) => t.key === key)?.name ?? key;
const dateOf = (iso: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));

/** Public, server-rendered. Everything shown comes from the signed `d` in the URL: no account, no database, no essay. */
export default async function SharePage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const report = decodeShare((await searchParams).d);
  if (!report) notFound();
  return (
    <main className="share">
      <article className="share-card" aria-label="Grade report">
        {report.title && <h1 className="share-title">{report.title}</h1>}
        <p className="ai-headline grade-headline"><b>{report.letter}</b> <span>{report.percent}%</span></p>
        <p className="muted ai-meta">Rubric estimate, not a teacher’s grade.</p>
        <ul className="grade-traits">
          {report.traits.map((t) => <li key={t.key}>
            <span className="grade-trait-name">{traitName(t.key)}</span>
            <span className="grade-level" data-level={t.level}>{LEVEL_NAMES[t.level]}</span>
            <span className="grade-pips" aria-hidden="true">{[1, 2, 3, 4].map((n) => <i key={n} data-on={n <= t.level || undefined} />)}</span>
          </li>)}
        </ul>
        {report.steps.length > 0 && <>
          <h4 className="grade-heading">Biggest gains</h4>
          <ol className="grade-steps">{report.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </>}
        <p className="muted share-stamp">Checked with {APP_NAME} on {dateOf(report.at)}.</p>
      </article>
      <p className="share-promise"><b>{APP_NAME}.</b> {TAGLINE} {PROMISE}</p>
      <a className="button primary" href="/">Try it on your essay</a>
    </main>
  );
}
