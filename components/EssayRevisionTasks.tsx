"use client";

import type { RevisionTask } from "@/lib/essay-workflow";
import { bodyParagraphNumber } from "@/lib/essay-document";

type Props = {
  kind: RevisionTask["kind"]; tasks: RevisionTask[]; context: string;
  onChange: (task: RevisionTask) => void;
  onJump: (task: RevisionTask) => void;
  onRemove: (task: RevisionTask) => void;
  paragraphOf?: number[]; // the outline's body-paragraph numbering; raw block numbers without it
};
const rank = { high: 0, medium: 1, low: 2 };
export default function EssayRevisionTasks({ kind, tasks, context, onChange, onJump, onRemove, paragraphOf }: Props) {
  const group = tasks.filter((t) => t.kind === kind);
  const open = group.filter((t) => t.status === "open").sort((a, b) => rank[a.priority] - rank[b.priority]);
  const title = kind === "source" ? "Source checks" : "Revision tasks";
  const label = (i: number) => !paragraphOf || paragraphOf[i] === undefined ? `¶ ${i + 1}` : bodyParagraphNumber(paragraphOf, i) ? `P${bodyParagraphNumber(paragraphOf, i)}` : "Heading";
  const closed = (status: RevisionTask["status"], label: string) => {
    const list = group.filter((t) => t.status === status);
    return list.length > 0 && <details className="task-group"><summary>{label} ({list.length})</summary>
      {list.map((task) => <div className="task-closed" key={task.id}>
        <span>{task.task}</span>
        <button onClick={() => onChange({ ...task, status: "open" })}>Restore</button>
        <button onClick={() => onRemove(task)}>Remove</button>
      </div>)}
    </details>;
  };
  return <section className="revision-tasks" aria-label={title}>
    <h2>{title}</h2>
    {!group.length && <p className="muted">No {title.toLowerCase()} yet.</p>}
    {open.map((task) => {
      const stale = task.context !== context;
      const unverified = kind === "source" && !task.note.trim();
      return <article className="task" data-priority={task.priority} key={task.id}>
        <div className="task-head">
          <label className="task-check">
            <input type="checkbox" checked={false} disabled={unverified} onChange={(e) => onChange({ ...task, status: e.target.checked ? "done" : "open" })} />
            <b>{task.task}</b>
          </label>
          <button className="task-jump" title="Show in essay" aria-label={`Show ${label(task.paragraphId)}`} onClick={() => onJump(task)}>{label(task.paragraphId)}</button>
        </div>
        {unverified && <p className="muted small">Add where you verified it to check this off.</p>}
        <div className="task-tags"><span className="task-priority">{task.priority}</span>{stale && <span className="task-stale">Changed since check</span>}</div>
        {task.quote && <q>{task.quote}</q>}
        <p>{task.reason}</p>
        <textarea rows={2} maxLength={5000} aria-label={kind === "source" ? "Where you verified it" : "Your note"} placeholder={kind === "source" ? "Where you verified it (source, page)" : "Your note"} value={task.note}
          onChange={(e) => onChange({ ...task, note: e.target.value, status: kind === "source" && task.status === "done" ? "open" : task.status })} />
        <div className="row">
          {stale && <button onClick={() => onChange({ ...task, context, status: "open" })}>Still applies</button>}
          <button onClick={() => onChange({ ...task, status: "declined" })}>Dismiss</button>
        </div>
      </article>;
    })}
    {closed("done", "Done")}
    {closed("declined", "Dismissed")}
  </section>;
}
