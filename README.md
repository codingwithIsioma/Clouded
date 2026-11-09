# Clouded — Student Command Center

A personal study app for cloud engineering students. It runs entirely in your browser: there's no server, no account and no paid services. It's hosted free on GitHub Pages.

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
- **Resource Vault:** links, videos and PDFs with tags, module, reading status, notes, and links to assignment steps or topics.
- **CommandCards:** daily Linux, Docker, kubectl, Terraform and Git flashcards with spaced repetition, plus a daily challenge, a streak and per-topic progress.

## Your data

Everything is saved in your browser's built-in storage (IndexedDB) on the device you're using. Nothing is uploaded anywhere.

- **Private by design.** The site is public, but each visitor gets their own empty copy in their own browser. Nobody can see your data, even if they open the same link.
- **Each device has its own data.** Your phone and laptop don't sync. To move data, go to **Backup & data → Export backup** on one device, then **Import backup** on the other.
- **Back up now and then.** Clearing your browser's site data deletes everything, so keep the backup file somewhere safe, like Google Drive. The Today page reminds you if it's been more than two weeks.

Reminders show as browser notifications while Clouded is open in a tab.

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

The repository only contains code. There are no passwords, keys or personal data in it.

## Stack

React + TypeScript, built with Vite. pdf.js reads assignment PDFs in the browser, and IndexedDB stores your data.
