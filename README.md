# Clouded — Student Command Center

A personal study app for cloud engineering students. It runs in your browser, hosted free on GitHub Pages, and syncs between your devices through a free Supabase project. There's no server to run and nothing to pay for.

- **Today:** what's due today, today's cards and challenge, one topic to review, one unread resource, and search across everything (press `/`).
- **Deadlines:**
  - Quick-add, like `Terraform lab due Friday 11:59pm`.
  - Urgency groups: Overdue, Today, This week, Later.
  - Progress bars, mark done or snooze, reminders.
  - Calendar export: an .ics file for Apple Calendar, or a link for Google Calendar.
- **Plan an assignment:**
  - Upload a PDF or paste the brief, then set your schedule.
  - Get 4–8 editable steps with mini-deadlines, a requirements checklist and concepts to review.
  - Each step has a notes box, and missed steps are rescheduled automatically.
  - Steps say what to work on, never how to solve it.
- **Error Journal:** log errors with the cause, fix, tags, status and the assignment they came from. Paste a new error to see whether you've hit it before.
- **Explain-It-Back:** explain a topic in writing or by voice, then check yourself against six points. Anything you missed shows up next time, along with a confidence rating and review suggestions.
- **Resource Vault:** links, videos, PDFs and plain notes, with tags, module, reading status, notes, and links to assignment steps or topics.
- **CommandCards:** daily Linux, Docker, kubectl, Terraform and Git flashcards with spaced repetition, plus a daily challenge, a streak and per-topic progress.

## AI (optional, free)

Add an OpenRouter key under **Settings → AI** to turn on two extras:

- **Plan with AI.** AI reads an assignment brief and suggests steps, requirements and concepts. It never gives solutions, and you can edit everything before saving.
- **AI feedback** in Explain-It-Back. You get hints on what's missing or wrong, a follow-up question, and the self-check ticked for you to adjust.

How it works:
- It uses OpenRouter's free models: "Any free model" by default, or one you pick. Free models allow about 50 requests a day.
- Calls go straight from your browser to OpenRouter.
- The key syncs through your account, so you only enter it once.
- Without a key, if you hit the limit, or if a model is busy, the offline planner and self-check take over.

## Your data

- **Sign in once per device** with the email and password of the one user in Supabase. New sign-ups are switched off, so nobody else can create an account.
- **Synced item by item.** Each deadline, error, topic, resource, card's progress and day's log syncs on its own. The newest edit wins, so changes on your phone and laptop merge instead of overwriting each other. PDFs sync through a private storage folder.
- **Works offline.** Each device keeps a copy in IndexedDB. Changes made offline sync when you're back online. The sidebar (or **More** on a phone) shows the sync status.
- **Private.** The repo only contains the public Supabase URL and publishable key. Row-level security in [`supabase/schema.sql`](supabase/schema.sql) means only your signed-in account can read or write your data.
- **Backups.** **Backup & data → Export backup** still downloads everything as one file, as an extra safety net.

Free Supabase projects pause after about a week with no activity. To stop that, [`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml) pings the project every 3 days. If it ever does pause, open the project in the Supabase dashboard and click **Restore**. Nothing is lost.

Reminders show as browser notifications while Clouded is open in a tab.

### Setting up Supabase (once)

1. Create a free project at supabase.com.
2. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql).
3. In **Authentication → Users**, add yourself with **Auto Confirm User** ticked.
4. Turn off **Allow new users to sign up** under **Authentication → Sign In / Providers**.
5. Put the project URL and publishable key in `src/lib/supabase.ts`.

## Run it on your computer

Needs Node 20+.

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Put it on GitHub Pages (free)

1. Create a new **public** repository on GitHub, for example `clouded`. GitHub Pages is free for public repos.
2. Push this folder to it on the `main` branch.
3. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
4. The workflow in `.github/workflows/deploy.yml` builds and publishes the site. Watch it in the **Actions** tab; it takes about a minute.
5. Open `https://<your-username>.github.io/clouded/` on your phone and choose **Add to Home Screen**, so it opens like an app.

Every push to `main` redeploys automatically.

The repository contains no passwords, secret keys or personal data.

## Stack

React + TypeScript, built with Vite. pdf.js reads assignment PDFs in the browser. IndexedDB keeps the local copy, and Supabase (Postgres, Auth and Storage) syncs it.
