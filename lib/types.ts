export type TopicType = "concept" | "procedure" | "proof" | "formatting" | "derivation" | "writing";

export type Problem = { file: string; label: string; where?: string; hasKey?: boolean; keyFile?: string };

export type Topic = {
  id: string;
  course: string;
  name: string;
  unit?: string;
  type: TopicType;
  weight: number;
  prereqs?: string[];
  sources?: { file: string; where?: string }[];
  problems?: Problem[];
  pitfalls?: string[];
};

export type CourseFile = {
  course: string;
  examDate: string;
  exam?: { format?: string; coverage?: string };
  topics: Omit<Topic, "course">[];
  gaps?: string[];
};

export type Question = {
  id: string;
  section: string;
  kind: "numeric" | "exact" | "choice" | "short";
  prompt: string;
  format: string;
  answer: number[] | string[] | number | string;
  tol?: number;
  choices?: string[];
  solution: string;
  source: string;
};

export type Lesson = {
  topicId: string;
  summary: string;
  sections: { id: string; title: string; source: string; body: string }[];
  diagnostic: Question[];
  practice: Question[];
};

/** Where he is inside a topic: set by the diagnostic, advanced by practice. */
export type Study = {
  sections: Record<string, "known" | "weak" | "learned">;
  practice: Record<string, boolean>; // question id -> last result
};

export type TopicState = {
  confidence: 0 | 1 | 2 | 3;
  status: "active" | "done" | "skipped";
  retestDue?: string; // ISO date of the next spaced review
  reviews?: number;   // spaced reviews passed
  lastSeen?: string;
  study?: Study;
};

export type Block = {
  id: string;
  topicId: string;
  course: string;
  kind: "study" | "retest" | "mock" | "write" | "review" | "knockout";
  minutes: number;
  breakMinutes?: number;
  start: string; // ISO
  end: string;
  title: string;
  instructions: string;
  topicIds?: string[]; // mixed review: every topic in the block
};

export type LogEntry = { topicId: string; kind: Block["kind"]; start: string; end: string; rating?: number; outcome: "done" | "skipped" | "missed"; activeMinutes?: number; course?: string };

export type State = {
  topics: Record<string, TopicState>;
  log: LogEntry[];
  current?: { block: Block; startedAt: string; pausedMs?: number; pausedAt?: string | null; knockoutResults?: Record<string, TopicState> } | null;
  pauseUntil?: string | null;
  doneForDay?: string | null; // ISO date
  life?: LifeEvent[];
  settings?: PlannerSettings;
  runs?: Record<string, RunProgress>;
  mistakes?: Mistake[];
  knockoutDone?: string[]; // courses whose knockout test is finished
};

/** Meals, gym, breaks, anything else: study blocks get scheduled around these. */
/** A class meeting, from materials/classes.json. Fixed: study is scheduled around it. */
export type ClassMeeting = { date: string; start: string; minutes: number; title: string };

export type LifeEvent = { id: string; date: string; start: string; minutes: number; title: string; kind: "meal" | "gym" | "break" | "busy" }; // date "2026-10-08", start "12:30" local

export type Window = { start: string; end: string }; // ISO
export type Availability = {
  days: Record<string, Window[]>; // "2026-10-08" -> free windows
  exams: Record<string, string>;   // course -> ISO datetime
  examMinutes?: Record<string, number>;
};

export type PlannerSettings = {
  dailyMinutes: number;
  workStart: string;
  workEnd: string;
  exams: Record<string, string>;
  examMinutes: Record<string, number>;
  dayMinutes: Record<string, number>;
};
export type RunProgress = { index: number; results: Record<string, boolean>; answers?: Record<string, string>; submitted?: boolean; items?: { topicId: string; qid: string }[] };
export type Mistake = { id: string; topicId: string; qid: string; prompt: string; answer: string; solution: string; attempted: string; at: string; note?: string; resolved?: boolean };
