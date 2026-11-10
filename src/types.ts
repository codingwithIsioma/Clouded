export type ID = string;

export type Availability = {
  days: number[]; // 0=Sun … 6=Sat
  hoursPerDay: number;
};

export type Step = {
  id: ID;
  title: string;
  focus: string;
  concepts: string[];
  effortHours: number;
  due: string; // ISO
  done: boolean;
  notes: string;
};

export type Requirement = { id: ID; text: string; kind: "must" | "should" | "deliverable"; checked: boolean };

export type Deadline = {
  id: ID;
  title: string;
  due: string; // ISO
  done: boolean;
  doneAt?: string;
  notes: string;
  course?: string;
  steps: Step[];
  requirements: Requirement[];
  concepts: string[];
  summary?: string;
  start?: string; // ISO date, breakdown plans only
  availability?: Availability;
  reminders: number[]; // minutes before due
  stepReminderTime?: string; // "09:00" – reminder on the day each step is due
  rescheduleWarning?: string;
  createdAt: string;
};

export type ErrorStatus = "solved" | "workaround" | "stuck";
export type ErrorEntry = {
  id: ID;
  title: string;
  message: string;
  cause: string;
  fix: string;
  tags: string[];
  status: ErrorStatus;
  deadlineId?: ID;
  createdAt: string;
  updatedAt: string;
};

export type Confidence = "shaky" | "getting" | "locked";
/** AI feedback on an explanation, kept with it. */
export type AIFeedback = {
  summary: string;
  strengths: string[];
  gaps: string[];
  misconceptions: string[];
  question: string;
  confidence?: Confidence;
  model: string;
};
/** Self-check after an explanation: ids of the checklist items you covered. */
export type Explanation = { id: ID; text: string; at: string; checks?: string[]; feedback?: AIFeedback };

/** OpenRouter key and model; syncs to your account so you enter it once. */
export type AISettings = { key: string; model: string };
export type Topic = {
  id: ID;
  name: string;
  confidence: Confidence;
  explanations: Explanation[];
  lastReviewed?: string;
  createdAt: string;
};

export type ResourceKind = "link" | "video" | "pdf";
export type ReadStatus = "toread" | "reading" | "done";
export type Resource = {
  id: ID;
  title: string;
  url: string;
  kind: ResourceKind;
  tags: string[];
  module: string;
  status: ReadStatus;
  notes: string;
  opened: boolean;
  links: { deadlineId?: ID; stepId?: ID; topicId?: ID }[];
  createdAt: string;
};

export type CardProgress = { ease: number; interval: number; due: string; reps: number; lapses: number; last?: string; first?: string };

export type DayLog = { reviewed: number; correct: number; challenge?: boolean };

export type State = {
  version: 1;
  deadlines: Deadline[];
  errors: ErrorEntry[];
  topics: Topic[];
  resources: Resource[];
  cards: Record<ID, CardProgress>;
  days: Record<string, DayLog>; // yyyy-mm-dd
  cardTopics: string[]; // topics enabled for daily cards
  firedReminders: string[];
  lastBackup?: string;
  ai?: AISettings;
};

export const emptyState = (): State => ({
  version: 1,
  deadlines: [],
  errors: [],
  topics: [],
  resources: [],
  cards: {},
  days: {},
  cardTopics: ["Linux", "Docker", "kubectl", "Terraform"],
  firedReminders: [],
});
