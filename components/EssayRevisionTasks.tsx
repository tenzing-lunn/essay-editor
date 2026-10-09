"use client";

import type { RevisionTask } from "@/lib/essay-workflow";

type Props = {
  tasks: RevisionTask[]; context: string;
  onChange: (task: RevisionTask) => void;
  onJump: (task: RevisionTask) => void;
  onRemove: (task: RevisionTask) => void;
};
const rank = { high: 0, medium: 1, low: 2 };
export default function EssayRevisionTasks({ tasks, context, onChange, onJump, onRemove }: Props) {
  return <section className="revision-tasks" aria-label="Saved revision tasks">
    <h2>Revision checklist</h2>
    <p className="muted">Tasks, notes, and decisions are saved with your essay. New analyses keep earlier tasks for your review. After changes, recheck a task before closing it.</p>
    {!tasks.length && <p className="muted">Analyze a paragraph or check sources to create specific revision tasks.</p>}
    {(["revision", "source"] as const).map((kind) => {
      const group = tasks.filter((t) => t.kind === kind).sort((a, b) => rank[a.priority] - rank[b.priority]);
      if (!group.length) return null;
      return <div key={kind}><h3>{kind === "source" ? "Source verification" : "Paragraph priorities"}</h3>
        <p className="muted">{group.filter((t) => t.context === context && t.status === "open").length} open · {group.filter((t) => t.context === context && t.status === "done").length} completed · {group.filter((t) => t.context === context && t.status === "declined").length} declined · {group.filter((t) => t.context !== context).length} need rechecking</p>
        {group.map((task) => {
          const stale = task.context !== context;
          return <article className="connection" key={task.id}>
            <button onClick={() => onJump(task)}>Paragraph {task.paragraphId + 1} · {task.priority}</button>
            <p><b>{task.task}</b></p>{task.quote && <q>{task.quote}</q>}<p>{task.reason}</p>
            <p className={stale ? "warn" : "muted"}>{task.status === "done" ? "Completed" : task.status === "declined" ? "Declined" : "Open"}{stale ? " · Draft, assignment, or sources changed; recheck this task." : ""}</p>
            <label>{kind === "source" ? "Verified source, page/line, and what it supports" : "Revision note"}
              <textarea rows={2} maxLength={5000} value={task.note} onChange={(e) => onChange({ ...task, note: e.target.value, status: kind === "source" && task.status === "done" ? "open" : task.status })} />
            </label>
            <div className="row">
              {stale && <button onClick={() => onChange({ ...task, context, status: "open" })}>I rechecked this task</button>}
              {task.status !== "done" && <button disabled={stale || (kind === "source" && !task.note.trim())} onClick={() => onChange({ ...task, status: "done" })}>{kind === "source" ? "Mark source verified" : "Mark complete"}</button>}
              {task.status === "open" && <button disabled={stale} onClick={() => onChange({ ...task, status: "declined" })}>Decline task</button>}
              {task.status !== "open" && <button onClick={() => onChange({ ...task, status: "open" })}>Reopen task</button>}
              {task.status !== "open" && <button title="Remove this task and its saved note from the checklist" onClick={() => onRemove(task)}>Remove task and note</button>}
            </div>
          </article>;
        })}
      </div>;
    })}
  </section>;
}
