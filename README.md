# Job Tracker

A Vite + React job application tracker with Firebase email/password auth and Firestore storage.

## Features

- Email/password register & login (Firebase Auth)
- Per-user job applications stored in Firestore, synced in real time
- Dashboard with a stats bar (Applied / Interview / Offer / Rejected counts) — click a stat to filter the list
- Add, edit, and delete applications (company, role, status, date applied, link, notes)

## Setup

1. **Create a Firebase project** at https://console.firebase.google.com
2. In the project, enable **Authentication → Sign-in method → Email/Password**
3. Create a **Firestore database** (production or test mode)
4. In Project Settings → General → Your apps, add a **Web app** and copy the config values
5. Copy `.env.example` to `.env` (already done) and fill in the values:
   ```
   VITE_FIREBASE_API_KEY=
   VITE_FIREBASE_AUTH_DOMAIN=
   VITE_FIREBASE_PROJECT_ID=
   VITE_FIREBASE_STORAGE_BUCKET=
   VITE_FIREBASE_MESSAGING_SENDER_ID=
   VITE_FIREBASE_APP_ID=
   ```
6. Deploy the Firestore security rules and index in this repo (or paste them into the console):
   - `firestore.rules` — restricts each `jobs` document to its owning user
   - `firestore.indexes.json` — composite index required for the `userId == / createdAt desc` query
   - If you skip deploying the index, Firestore will show an error in the browser console the first time you load the dashboard, with a direct link to create the index — click it.
   - With the Firebase CLI: `firebase deploy --only firestore:rules,firestore:indexes`

## Run

```
npm install
npm run dev
```

## Build

```
npm run build
```
