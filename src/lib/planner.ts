/**
 * Turns an assignment brief into a step plan without any AI service.
 * It reads the brief's own structure (numbered tasks, "Part A", "Task 2"…) and
 * its must/should/deliverable lines, and wraps them in a study workflow.
 * Steps say what to focus on; they never say how to solve anything.
 */

export type PlanStep = { title: string; focus: string; concepts: string[]; effortHours: number };
export type Requirement = { text: string; kind: "must" | "should" | "deliverable" };
export type Plan = { title: string; summary: string; steps: PlanStep[]; requirements: Requirement[]; concepts: string[] };

const clean = (s: string) => s.replace(/^[\s•\-*–·\d.)(]+/, "").replace(/\s+/g, " ").trim();

function lines(text: string) {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Pulls must/should/deliverable lines out of a brief. */
export function extractRequirements(text: string): Requirement[] {
  const sentences = text
    .replace(/\r/g, "")
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z])/)
    .map(clean)
    .filter((s) => s.length > 8 && s.length < 400);
  const out: Requirement[] = [];
  const seen = new Set<string>();
  for (const s of sentences) {
    const l = s.toLowerCase();
    let kind: Requirement["kind"] | null = null;
    if (/\b(must|required|requirement|shall|need to|needs to|ensure|mandatory)\b/.test(l)) kind = "must";
    else if (/\b(submit|deliverables?|screenshots?|repository|repo link|readme|upload|provide a link|include|push to)\b/.test(l)) kind = "deliverable";
    else if (/\b(should|recommended|bonus|optional|nice to have|extra credit)\b/.test(l)) kind = "should";
    if (kind && !seen.has(l)) {
      seen.add(l);
      out.push({ text: s, kind });
    }
  }
  return out.slice(0, 40);
}

const TECH = [
  "Kubernetes", "Docker", "Docker Compose", "Terraform", "Ansible", "AWS", "EC2", "S3", "VPC", "IAM", "Load balancer", "Auto Scaling", "Route 53",
  "CloudFormation", "Lambda", "Nginx", "Apache", "Linux", "Bash scripting", "SSH", "Git", "GitHub Actions", "CI/CD", "Jenkins", "Helm",
  "Prometheus", "Grafana", "DNS", "SSL/TLS", "Subnets", "Security groups", "Bastion host", "Ingress", "Service", "Deployment", "ConfigMap",
  "Secret", "Persistent volume", "Namespace", "Monitoring", "Logging", "Azure", "GCP", "Python", "Node.js", "PostgreSQL", "MySQL", "Redis",
];

export function findConcepts(text: string) {
  const l = text.toLowerCase();
  return TECH.filter((t) => {
    const key = t.toLowerCase().split("/")[0];
    return new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:s|es)?\\b`, "i").test(l);
  }).filter((t, _i, all) => !(t === "Docker" && all.includes("Docker Compose") && !/\bdocker\b(?!\s*compose)/i.test(l)));
}

/** Lines that look like the brief's own tasks: "1. …", "Task 2: …", "Part B – …", "Step 3 …". */
function findTasks(text: string) {
  const re = /^(?:(?:task|part|step|section|exercise|question|q)\s*[\dA-Za-z]{1,3}\b[:.)\-–]?|\d{1,2}[.)]|[a-h][.)])\s+(.{6,})$/i;
  return lines(text)
    .map((l) => l.match(re))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => clean(m[1]))
    .filter((t) => t.length >= 6 && t.length < 220);
}

const conceptsIn = (s: string, all: string[]) => all.filter((c) => s.toLowerCase().includes(c.toLowerCase().split("/")[0]));

const shorten = (s: string, n = 70) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);

export function planFromBrief(text: string): Plan {
  const requirements = extractRequirements(text);
  const concepts = findConcepts(text);
  const tasks = findTasks(text);
  const title = shorten(lines(text)[0] ?? "Assignment", 80);

  // Work steps: the brief's own tasks if it has them, otherwise its "must" lines.
  const source = tasks.length >= 2 ? tasks : requirements.filter((r) => r.kind === "must").map((r) => r.text);
  const groups: string[][] = [];
  const maxWork = 4;
  if (source.length) {
    const per = Math.ceil(source.length / Math.min(maxWork, source.length));
    for (let i = 0; i < source.length; i += per) groups.push(source.slice(i, i + per));
  }

  const work: PlanStep[] = groups.length
    ? groups.map((g, i) => ({
        title: g.length === 1 ? `Work on: ${shorten(g[0], 60)}` : `Work on part ${i + 1} of ${groups.length}: ${shorten(g[0], 40)}`,
        focus: `Focus on what the brief asks for here: ${g.map((x) => `“${shorten(x, 110)}”`).join(" · ")}. Decide what “done” looks like before you start.`,
        concepts: conceptsIn(g.join(" "), concepts).slice(0, 4),
        effortHours: Math.min(5, 1.5 + g.length),
      }))
    : [
        { title: "Work through the core of the assignment", focus: "Tackle the main thing the brief asks you to build or answer.", concepts: concepts.slice(0, 3), effortHours: 3 },
        { title: "Finish the remaining parts", focus: "Cover everything else the brief mentions, including any 'should' items.", concepts: concepts.slice(3, 6), effortHours: 3 },
      ];

  const read: PlanStep = { title: "Read the brief and list what it asks for", focus: "Go through the requirements checklist. Mark anything you don't understand yet and note questions to ask.", concepts: [], effortHours: 1 };
  const plan: PlanStep = { title: "Plan your approach and set up", focus: "Sketch how the pieces connect and what order you'll build them in. Set up your project folder and tools.", concepts: [], effortHours: 1 };
  const steps: PlanStep[] = [
    // With four work steps, fold planning into the first step to stay within 8.
    work.length >= 4 ? { ...read, title: "Read the brief and plan your approach", focus: `${read.focus} Then sketch how the pieces connect and set up your project.`, effortHours: 1.5 } : read,
    { title: "Review the concepts involved", focus: concepts.length ? "Refresh these topics before you build. Try explaining each one back in your own words." : "Identify the tools and ideas this assignment relies on and refresh them.", concepts: concepts.slice(0, 6), effortHours: 1.5 },
    ...(work.length >= 4 ? [] : [plan]),
    ...work,
    { title: "Check your work against the brief", focus: "Tick off every requirement and re-read any grading criteria. Test that everything works end to end.", concepts: [], effortHours: 1 },
    { title: "Prepare deliverables and submit", focus: "Gather the screenshots, links and write-ups the brief asks for, and submit before the deadline.", concepts: [], effortHours: 1 },
  ];
  return { title, summary: "", steps: steps.slice(0, 8), requirements, concepts };
}
