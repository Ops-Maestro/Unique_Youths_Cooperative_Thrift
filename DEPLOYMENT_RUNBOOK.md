# Deployment Runbook — from zero to a working app (web + Android APK)

This is the full sequence, start to finish. Every URL, secret, and variable
mentioned anywhere else in this project's docs is generated during one of
these steps — nothing is pre-made or something I can hand you ahead of time.
Follow this in order; later steps need values produced by earlier ones.

**The shape of the whole system**, so the order makes sense:

```
MongoDB Atlas (database)
        ↑
Render: backend (Node/Express API)  →  gives you BACKEND_URL
        ↑
Render: client (member web app)     →  gives you CLIENT_URL   (needs BACKEND_URL)
Render: admin (admin dashboard)     →  needs BACKEND_URL + CLIENT_URL
        ↑
GitHub Actions: builds the Android APK, needs CLIENT_URL, publishes to
GitHub Releases  →  gives you APK_URL
        ↑
Back into Render client env vars: APK_URL, so the "Get the app" button works
```

You'll go through this roughly top to bottom, then loop back once at the end.

---

## Part A — Accounts you need (all free tier)

1. **GitHub** — github.com — for the code + Actions CI/CD.
2. **MongoDB Atlas** — mongodb.com/cloud/atlas — free M0 cluster, this is your database.
3. **Render** — render.com — hosts the backend API and the two frontend apps.
4. **Resend** — resend.com — sends the OTP verification emails. Free tier is enough for a POC/small community.

Create all four accounts now if you haven't already (they're all free to sign up, no card needed for the tiers used here except possibly Render if their policy has changed — check at signup).

---

## Part B — Push the code to GitHub

From the folder containing `unique-youths-backend/`, `unique-youths-client/`,
`unique-youths-admin/`, `.github/`, etc:

```bash
git init
git add -A
git commit -m "Initial commit"
```

On GitHub: click **New repository**, give it a name (e.g. `unique-youths`),
leave it empty (no README/gitignore — you already have one), create it.
GitHub will show you a remote URL like `https://github.com/<you>/unique-youths.git`.

```bash
git remote add origin https://github.com/<you>/unique-youths.git
git branch -M main
git push -u origin main
```

Your repo URL is now `https://github.com/<you>/unique-youths` — this is the
`<your-username>/<your-repo>` referenced elsewhere in these docs.

---

## Part C — Set up MongoDB Atlas

1. In Atlas, create a free **M0** cluster (any region close to you/Nigeria — e.g. a European or nearest available region).
2. **Database Access** → add a database user (username + password — save these).
3. **Network Access** → add IP address `0.0.0.0/0` (allow from anywhere — Render's servers have dynamic IPs, so this is the practical option for this scale of project).
4. **Connect** → **Drivers** → copy the connection string. It looks like:
   ```
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
   ```
5. Add your database name into it before the `?`, e.g.:
   ```
   mongodb+srv://myuser:mypassword@cluster0.abcde.mongodb.net/unique_youths?retryWrites=true&w=majority
   ```

This full string is your `MONGODB_URI` — you'll paste it into Render in Part E.

---

## Part D — Set up Resend (for OTP emails)

1. Sign up at resend.com, verify your account.
2. **API Keys** → create one → copy it. This is `RESEND_API_KEY` (starts with `re_`).
3. For `EMAIL_FROM`: Resend's free tier lets you send from their shared
   `onboarding@resend.dev` address without any domain setup — fine for
   testing. Format: `Unique Youths <onboarding@resend.dev>`.
   (To send from your own domain like `no-reply@uniqueyouths.com` later,
   you'd verify that domain in Resend's dashboard — optional, not needed to
   get started.)

---

## Part E — Deploy the backend to Render

1. Render dashboard → **New** → **Web Service**.
2. Connect your GitHub account, pick the repo you just pushed.
3. Configure:
   - **Root Directory**: `unique-youths-backend`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start` (runs `node server.js`)
   - **Instance Type**: Free
4. **Environment variables** — add each of these (values from Parts C/D, plus you choose the rest):

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PORT` | `3000` (Render sets its own `PORT` automatically for routing, but keep this as a fallback — check your `server.js` uses `process.env.PORT`) |
   | `MONGODB_URI` | the connection string from Part C |
   | `JWT_SECRET` | any long random string — generate one: `openssl rand -hex 32` |
   | `JWT_EXPIRES_IN` | `1d` |
   | `CLIENT_URL` | leave a placeholder for now (`http://localhost:5173`) — you'll update this in Part G once the client has a real URL |
   | `ADMIN_URL` | same, placeholder for now |
   | `RESEND_API_KEY` | from Part D |
   | `EMAIL_FROM` | from Part D |
   | `OTP_EXPIRES_MINUTES` | `10` |
   | `OTP_MAX_ATTEMPTS` | `5` |
   | `OTP_RESEND_COOLDOWN_SECONDS` | `60` |
   | `CIRCLE_BASELINE_SIZE` | `20` |
   | `SUPER_ADMIN_EMAIL` | an email you control |
   | `SUPER_ADMIN_USERNAME` | your choice |
   | `SUPER_ADMIN_INITIAL_PASSWORD` | a strong password, 12+ characters |
   | `SUPERVISOR_EMAIL` | an email you control (can be the same as above or different) |
   | `SUPERVISOR_USERNAME` | your choice |
   | `SUPERVISOR_INITIAL_PASSWORD` | a strong password, 12+ characters |

5. Click **Create Web Service**. Wait for the first deploy to finish.
6. Render gives you a URL like `https://unique-youths-backend.onrender.com`.
   **This is your `BACKEND_URL`.** Test it: visit
   `https://unique-youths-backend.onrender.com/health` in a browser — you
   should see a simple OK response. If you see an error, check the Render
   logs tab for that service.

---

## Part F — Deploy the client (member app) to Render

1. Render dashboard → **New** → **Static Site**.
2. Same repo, configure:
   - **Root Directory**: `unique-youths-client`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
3. **Environment variables**:

   | Key | Value |
   |---|---|
   | `VITE_API_BASE_URL` | your `BACKEND_URL` from Part E, e.g. `https://unique-youths-backend.onrender.com` |
   | `VITE_APK_DOWNLOAD_URL` | leave blank for now — set in Part I |

4. Create it, wait for deploy. Render gives you a URL like
   `https://unique-youths-client.onrender.com`.
   **This is your `CLIENT_URL`.**

---

## Part G — Deploy the admin app to Render, and wire everything together

1. Render dashboard → **New** → **Static Site**, same repo again:
   - **Root Directory**: `unique-youths-admin`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
2. **Environment variables**:

   | Key | Value |
   |---|---|
   | `VITE_API_BASE_URL` | your `BACKEND_URL` from Part E |
   | `VITE_CLIENT_URL` | your `CLIENT_URL` from Part F |

3. Create it, wait for deploy. You get an `ADMIN_URL` too, e.g.
   `https://unique-youths-admin.onrender.com`.
4. **Go back to the backend service** (Part E) → Environment tab → update
   the placeholders:
   - `CLIENT_URL` → your real `CLIENT_URL` from Part F
   - `ADMIN_URL` → your real `ADMIN_URL` from step 3 above
   Save — Render will redeploy the backend automatically with the updated values.

At this point: **the web app is fully live.** Visit your `CLIENT_URL`,
register a test member, check the OTP email arrives, verify the admin app
at `ADMIN_URL` logs in with your `SUPER_ADMIN_*` / `SUPERVISOR_*`
credentials. Confirm this all works before moving on to the APK — no point
debugging two things at once.

---

## Part H — Keep the backend from sleeping (Render free tier)

Render's free tier sleeps a service after ~15 minutes of no traffic. The
`.github/workflows/keep-alive.yml` workflow pings it every 10 minutes to
reduce this.

1. GitHub repo → **Settings → Secrets and variables → Actions → Secrets tab**.
2. Add secret `BACKEND_HEALTH_URL` = `<your BACKEND_URL>/health`, e.g.
   `https://unique-youths-backend.onrender.com/health`.

That's it — the workflow is already written and runs on its own schedule
once this secret exists. (Reminder: this reduces cold starts but Render can
still restart the service for its own maintenance regardless.)

---

## Part I — Build the Android APK

1. GitHub repo → **Settings → Secrets and variables → Actions → Variables tab** (note: **Variables**, not Secrets, for these two):

   | Name | Value |
   |---|---|
   | `CLIENT_APP_URL` | your `CLIENT_URL` from Part F |
   | `BACKEND_API_URL` | your `BACKEND_URL` from Part E |

2. (Optional, for a properly signed APK instead of debug-signed — skip this
   the first time through if you just want to see it work end-to-end first)
   ```bash
   keytool -genkeypair -v -keystore release.keystore -alias uniqueyouths \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
   Then add these as **Secrets** (not Variables):
   `ANDROID_KEYSTORE_BASE64` (output of `base64 -w0 release.keystore`),
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
   Keep `release.keystore` somewhere safe outside git.

3. Trigger the build. Either:
   - Push any small change to `unique-youths-client/` on `main`, or
   - Go to the **Actions** tab → **Build Android APK** → **Run workflow** button (this works even with no code changes).

4. Watch it run (takes a few minutes — installing Android SDK + Gradle takes
   most of that time). Green check = success.

5. Once it succeeds: GitHub repo → **Releases** (right sidebar on the repo's
   main page, or `github.com/<you>/<repo>/releases`). You'll see a release
   tagged **`latest-android`** with `unique-youths.apk` attached. Right-click
   that asset link → copy link address. It'll be:
   ```
   https://github.com/<you>/<repo>/releases/download/latest-android/unique-youths.apk
   ```
   **This is your `APK_URL`.**

---

## Part J — Wire the APK link back into the client

1. Render dashboard → your **client** static site → Environment tab.
2. Set `VITE_APK_DOWNLOAD_URL` = the `APK_URL` from Part I.
3. Save → Render redeploys the client automatically.

---

## Part K — Test the whole thing end to end

1. Visit `CLIENT_URL` on a desktop browser, log in as a member.
2. You should see the **"Get the mobile app"** card. Click the **Android**
   tab → **Download APK** button should now work.
3. On an actual Android phone (or transfer the file to one), open the
   downloaded APK. Android will warn "installing from unknown sources" —
   that's expected for a sideloaded, non-Play-Store APK; allow it and install.
4. Open the installed app — it should show your live `CLIENT_URL` content,
   log in, everything working exactly like the browser version.
5. On an iPhone: visit `CLIENT_URL` in **Safari**, log in, check the **iPhone**
   tab shows the Add to Home Screen steps, and confirm that actually works.

---

## Quick reference — where each value came from

| Value | Comes from |
|---|---|
| `MONGODB_URI` | MongoDB Atlas → Connect → Drivers (Part C) |
| `RESEND_API_KEY` | Resend dashboard → API Keys (Part D) |
| `BACKEND_URL` | Render, after deploying the backend (Part E) |
| `CLIENT_URL` | Render, after deploying the client (Part F) |
| `ADMIN_URL` | Render, after deploying the admin app (Part G) |
| `BACKEND_HEALTH_URL` | `BACKEND_URL` + `/health` (Part H) |
| `CLIENT_APP_URL` / `BACKEND_API_URL` (GitHub Variables) | same as `CLIENT_URL` / `BACKEND_URL` above, just copied into GitHub (Part I) |
| `APK_URL` | GitHub Releases page, after the Android workflow runs successfully (Part I) |
| `VITE_APK_DOWNLOAD_URL` | = `APK_URL`, set back into Render's client env vars (Part J) |

None of these exist until you generate them by actually deploying — that's
why I couldn't hand them to you directly earlier.

---

## Troubleshooting

- **Backend deploy fails on Render**: check the Logs tab. Usually a missing/
  wrong env var (especially `MONGODB_URI` — test the connection string with
  `mongosh "<your-uri>"` locally if you have the MongoDB shell installed) or
  Atlas Network Access not allowing `0.0.0.0/0`.
- **Client/admin builds but shows a network error / can't reach API**:
  double check `VITE_API_BASE_URL` was set *before* the build ran (Vite
  bakes env vars in at build time, not runtime — if you change it, you must
  trigger a new deploy, not just save the setting).
- **OTP emails never arrive**: check Resend's dashboard → Logs for delivery
  status. Common cause: `EMAIL_FROM` using a domain you haven't verified in
  Resend — switch back to `onboarding@resend.dev` to confirm the rest of
  the pipeline works, then fix domain verification separately.
- **Android workflow fails**: check the Actions tab → click the failed run
  → expand the failing step. Most common cause early on: `CLIENT_APP_URL`
  variable not set yet (Part I, step 1) — the build will still succeed but
  it's a good first thing to check if the APK opens to a blank/wrong page.
- **APK installs but shows a blank white screen**: almost always means
  `CLIENT_APP_URL` was wrong or unset when the APK was built — fix the
  GitHub Variable and re-run the workflow (Part I, step 3).
- **Render free tier backend feels slow to respond the first time**: normal
  cold-start behavior (Part H) — subsequent requests within the active
  window are fast.
