export type FixChallenge = {
  kind: "fix";
  id: string;
  topic: string;
  prompt: string;
  broken: string;
  answers: string[]; // accepted fixes (compared whitespace-insensitively)
  explain: string;
};
export type QuizChallenge = {
  kind: "quiz";
  id: string;
  topic: string;
  prompt: string;
  questions: (
    | { type: "mcq"; q: string; options: string[]; answer: number }
    | { type: "blank"; q: string; answers: string[] }
  )[];
  explain: string;
};
export type MiniChallenge = {
  kind: "mini";
  id: string;
  topic: string;
  prompt: string;
  answers: string[];
  hint: string;
  explain: string;
};
export type Challenge = FixChallenge | QuizChallenge | MiniChallenge;

export const CHALLENGES: Challenge[] = [
  {
    kind: "fix",
    id: "fix-docker-port",
    topic: "Docker",
    prompt: "This should make nginx reachable on http://localhost:8080. Fix it.",
    broken: "docker run -d -p 80:8080 nginx",
    answers: ["docker run -d -p 8080:80 nginx"],
    explain: "Port mapping is HOST:CONTAINER. nginx listens on 80 inside the container.",
  },
  {
    kind: "mini",
    id: "mini-chmod-owner-ro",
    topic: "Linux",
    prompt: "Give `notes.txt` read-only access for its owner, and no access for anyone else. Write the command.",
    answers: ["chmod 400 notes.txt", "chmod u=r,go= notes.txt", "chmod u=r,g=,o= notes.txt"],
    hint: "Read is 4. Three digits: owner, group, others.",
    explain: "`chmod 400` = owner read (4), group nothing (0), others nothing (0).",
  },
  {
    kind: "quiz",
    id: "quiz-k8s-basics",
    topic: "kubectl",
    prompt: "Quick quiz: Kubernetes basics",
    questions: [
      { type: "mcq", q: "Which Service type is only reachable from inside the cluster?", options: ["NodePort", "ClusterIP", "LoadBalancer", "ExternalName"], answer: 1 },
      { type: "blank", q: "Fill in: kubectl ____ pod web  (shows events and details)", answers: ["describe"] },
      { type: "mcq", q: "A failing readiness probe will…", options: ["Restart the container", "Delete the pod", "Stop sending it Service traffic", "Scale the deployment down"], answer: 2 },
    ],
    explain: "ClusterIP is internal-only; `describe` shows events; readiness controls traffic, liveness controls restarts.",
  },
  {
    kind: "fix",
    id: "fix-ssh-key",
    topic: "Linux",
    prompt: "SSH refuses this key with \"UNPROTECTED PRIVATE KEY FILE\". Fix the key's permissions (one command).",
    broken: "chmod 644 key.pem",
    answers: ["chmod 400 key.pem", "chmod 600 key.pem", "chmod go-rwx key.pem"],
    explain: "SSH requires the private key to be unreadable by group/others: 400 or 600.",
  },
  {
    kind: "mini",
    id: "mini-tf-plan-file",
    topic: "Terraform",
    prompt: "Save a plan to a file called `tfplan` so you can apply exactly that plan later. Write the command.",
    answers: ["terraform plan -out=tfplan", "terraform plan -out tfplan"],
    hint: "There's a flag for writing the plan out.",
    explain: "`terraform plan -out=tfplan`, then `terraform apply tfplan` applies exactly what you reviewed.",
  },
  {
    kind: "quiz",
    id: "quiz-docker",
    topic: "Docker",
    prompt: "Quick quiz: Docker images and containers",
    questions: [
      { type: "mcq", q: "Which instruction is best for copying local source files into an image?", options: ["ADD", "COPY", "RUN cp", "VOLUME"], answer: 1 },
      { type: "blank", q: "Fill in: docker ____ -it web sh  (shell into a running container)", answers: ["exec"] },
      { type: "mcq", q: "`docker compose down -v` also removes…", options: ["Images", "Named volumes", "The compose file", "Networks only"], answer: 1 },
    ],
    explain: "COPY is the plain choice; `exec -it` opens a shell; `-v` drops the stack's volumes.",
  },
  {
    kind: "fix",
    id: "fix-kubectl-scale",
    topic: "kubectl",
    prompt: "Scale deployment `api` to 3 replicas. Fix the command.",
    broken: "kubectl scale pod api --replicas 3",
    answers: ["kubectl scale deployment api --replicas=3", "kubectl scale deployment api --replicas 3", "kubectl scale deploy api --replicas=3", "kubectl scale deploy api --replicas 3", "kubectl scale deployment/api --replicas=3", "kubectl scale deploy/api --replicas=3"],
    explain: "You scale the Deployment (which manages the ReplicaSet), not a pod.",
  },
  {
    kind: "mini",
    id: "mini-find-port",
    topic: "Linux",
    prompt: "Something is already using port 3000. Write a command that shows which process is listening on it.",
    answers: ["sudo lsof -i :3000", "lsof -i :3000", "sudo ss -tulpn | grep 3000", "ss -tulpn | grep 3000", "sudo ss -lptn 'sport = :3000'", "sudo netstat -tulpn | grep 3000", "netstat -tulpn | grep 3000"],
    hint: "Try lsof with -i, or ss with -tulpn.",
    explain: "`lsof -i :3000` or `ss -tulpn | grep 3000` both show the listening process.",
  },
  {
    kind: "fix",
    id: "fix-tf-var",
    topic: "Terraform",
    prompt: "This should set the variable `region` for one run. Fix it.",
    broken: "terraform apply -var region=us-east-1 -var-file",
    answers: ["terraform apply -var=region=us-east-1", "terraform apply -var region=us-east-1", "terraform apply -var=\"region=us-east-1\"", "terraform apply -var \"region=us-east-1\""],
    explain: "`-var-file` needs a filename; for one value `-var=\"region=us-east-1\"` is enough.",
  },
  {
    kind: "quiz",
    id: "quiz-terraform",
    topic: "Terraform",
    prompt: "Quick quiz: Terraform workflow",
    questions: [
      { type: "mcq", q: "Which command downloads providers?", options: ["terraform plan", "terraform get", "terraform init", "terraform providers"], answer: 2 },
      { type: "blank", q: "Fill in: terraform ____  (rewrites .tf files into canonical style)", answers: ["fmt"] },
      { type: "mcq", q: "Adding/removing items is safest with…", options: ["count", "for_each", "depends_on", "-target"], answer: 1 },
    ],
    explain: "init sets up providers/backends; fmt formats; for_each keys resources by value so removal doesn't shift indexes.",
  },
  {
    kind: "mini",
    id: "mini-docker-logs",
    topic: "Docker",
    prompt: "Container `api` keeps dying. Show only its last 50 log lines and keep following new ones.",
    answers: ["docker logs -f --tail 50 api", "docker logs --tail 50 -f api", "docker logs -f --tail=50 api", "docker logs --tail=50 -f api", "docker logs -n 50 -f api", "docker logs -f -n 50 api"],
    hint: "Two flags: one to follow, one to limit lines.",
    explain: "`docker logs -f --tail 50 api`",
  },
  {
    kind: "fix",
    id: "fix-git-unstage",
    topic: "Git",
    prompt: "You staged `.env` by mistake. This deletes your changes! Fix it so it only unstages.",
    broken: "git restore .env",
    answers: ["git restore --staged .env", "git reset .env", "git reset HEAD .env", "git rm --cached .env"],
    explain: "`--staged` touches only the index; plain `restore` resets the working copy.",
  },
  {
    kind: "mini",
    id: "mini-k8s-logs",
    topic: "kubectl",
    prompt: "Pod `worker-5c` is in CrashLoopBackOff. Write the command that shows the logs from the crash before the latest restart.",
    answers: ["kubectl logs worker-5c --previous", "kubectl logs --previous worker-5c", "kubectl logs worker-5c -p", "kubectl logs -p worker-5c"],
    hint: "The current container may have no useful logs yet.",
    explain: "`kubectl logs <pod> --previous` (or `-p`).",
  },
  {
    kind: "fix",
    id: "fix-sudo-redirect",
    topic: "Linux",
    prompt: "This fails with \"Permission denied\". Rewrite it so the line is written as root.",
    broken: "sudo echo \"127.0.0.1 app.local\" >> /etc/hosts",
    answers: ["echo \"127.0.0.1 app.local\" | sudo tee -a /etc/hosts", "echo '127.0.0.1 app.local' | sudo tee -a /etc/hosts", "echo 127.0.0.1 app.local | sudo tee -a /etc/hosts"],
    explain: "The `>>` redirect runs as you. `sudo tee -a` appends as root.",
  },
];

/** One challenge per calendar day, rotating through the pool. */
export function challengeFor(dayKey: string) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const n = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return CHALLENGES[n % CHALLENGES.length];
}

export const norm = (s: string) =>
  s
    .trim()
    .replace(/^\$\s*/, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*;$/, "")
    .toLowerCase();
