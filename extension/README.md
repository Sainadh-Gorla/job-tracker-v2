# JobTrack v2 Saver (Chrome Extension)

Saves job postings from LinkedIn, Indeed, Glassdoor, and Amazon Jobs directly
into your JobTrack v2 Firestore data, under `users/{yourUid}/jobs` - the same
place the web app reads from.

## Load it

1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this `extension/` folder.

## Use it

1. Click the extension icon and log in with the same email/password you use
   for the JobTrack v2 web app (same Firebase project, same user).
2. Visit a job posting on LinkedIn, Indeed, Glassdoor, or Amazon Jobs.
3. A **Save to JobTrack** button appears in the bottom-right corner of the
   page. Click it (or use "Save this page to JobTrack" in the popup).
4. A confirmation toast ("Saved to JobTrack!") appears on the page, and the
   job shows up in your JobTrack v2 dashboard with status "Applied".

## How it works

- Auth and Firestore writes use the Firebase REST API directly via `fetch`
  (`identitytoolkit.googleapis.com` for login/token refresh,
  `firestore.googleapis.com` for writing job documents) - no bundled SDK,
  since Manifest V3 disallows remotely-hosted code in extension pages.
- `background.js` is the only place that holds the auth session
  (`chrome.storage.local`), refreshing the ID token automatically.
- `content.js` runs on matched job sites, extracts the job posting - first
  via any `application/ld+json` `JobPosting` schema on the page (LinkedIn,
  Indeed, Glassdoor, and Amazon Jobs all embed this for SEO), falling back to
  hand-picked DOM selectors per site - then sends it to the background
  worker to save.

## Known limitations

- **DOM selectors will drift.** The per-site CSS selectors in
  `SITE_SELECTORS` (content.js) are a fallback for when a page has no
  JSON-LD `JobPosting` data. These sites change their markup periodically;
  if extraction stops working on DOM-only fallback, the selectors need
  updating. JSON-LD is the more durable path.
- **Job type detection** relies on `employmentType` in JSON-LD - if a
  posting has no structured data, `jobType` is left blank for manual entry.
- No extension icon is bundled; Chrome will show a generic placeholder icon
  in the toolbar. Add `icons` to `manifest.json` if you want a custom one.
