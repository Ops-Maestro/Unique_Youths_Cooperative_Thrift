# Mobile app — setup guide

This app is available on mobile two ways: a real installable **Android APK**,
and an **installable web app (PWA)** that works on both Android and iPhone
via "Add to Home Screen." Both are wired into the client's "Get the mobile
app" card, which appears on every member's dashboard after login (dismissible,
and hidden automatically once someone's already using the installed app).

## The honest version of what's possible here

**Android:** a real, genuinely installable `.apk` file. This is what
`build-android.yml` builds automatically.

**iPhone:** there is no equivalent "download an app file and install it"
path. iOS doesn't use APKs, and producing a real `.ipa` requires an Apple
Developer Program membership ($99/year), a Mac, and Xcode — then either
publishing to the App Store (review process, ongoing maintenance) or
distributing via TestFlight (still requires that paid account, and testers
expire after 90 days). None of that is set up here, and I can't build it for
you without those resources.

What **does** work today, on iPhone, with zero cost and zero setup: opening
the site in Safari and using **Share → Add to Home Screen**. It installs a
real icon, opens full-screen with no browser chrome, and behaves like an
installed app. It's not in the App Store, but functionally it's the same
experience for a group this size. The client app already walks members
through this exact flow in its "Get the mobile app" card.

If you ever do want a real App Store listing later, that's a separate,
larger undertaking (Apple Developer account + a Mac + App Store review) —
tell me when you're ready and we can plan that separately.

## One-time setup for the Android APK pipeline

The workflow (`.github/workflows/build-android.yml`) is already written and
will run automatically once this repo is pushed to GitHub, but it needs a
couple of values configured first.

### 1. Point it at your deployed client URL

The APK is a thin native shell that displays your **already-deployed**
client web app (e.g. on Render) — it doesn't bundle a frozen copy of the
site. That means app updates require *zero* new APK builds for routine UI
changes; the APK just always shows whatever is live at that URL.

In the GitHub repo: **Settings → Secrets and variables → Actions → Variables
tab**, add:

| Name | Value |
|---|---|
| `CLIENT_APP_URL` | Your deployed client URL, e.g. `https://unique-youths-client.onrender.com` |
| `BACKEND_API_URL` | Your deployed backend URL, e.g. `https://unique-youths-backend.onrender.com` (used when building the web assets bundled as a fallback inside the APK) |

Without `CLIENT_APP_URL` set, the workflow still runs but the APK will point
at a placeholder URL — it'll build, but won't be useful until this is set.

### 2. (Optional but recommended) Sign the APK properly

Without this, the workflow still produces a working, installable
**debug-signed** APK — completely fine for your community to sideload and
use. The difference: a properly signed release APK lets you publish updates
under a consistent identity later (e.g. if you ever move to the Play Store),
and looks slightly more "official" (no debug watermark in some Android
security prompts).

To set it up:

```bash
keytool -genkeypair -v -keystore release.keystore -alias uniqueyouths \
  -keyalg RSA -keysize 2048 -validity 10000
```

You'll be asked for passwords and some identity details — keep the answers
and the resulting `release.keystore` file somewhere safe **outside git**.
Losing this file means any future update can't be published under the same
app identity.

Then, in GitHub **Settings → Secrets and variables → Actions → Secrets
tab**, add:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Output of `base64 -w0 release.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password you set |
| `ANDROID_KEY_ALIAS` | `uniqueyouths` (or whatever alias you used) |
| `ANDROID_KEY_PASSWORD` | The key password you set |

### 3. Get the download link into the app

Once the workflow has run at least once (push to `main`, or trigger it
manually from the Actions tab), it publishes the APK to a GitHub Release
tagged `latest-android`. The stable download URL is:

```
https://github.com/<your-username>/<your-repo>/releases/download/latest-android/unique-youths.apk
```

Set that as `VITE_APK_DOWNLOAD_URL` in the client app's environment
variables (wherever you configure the client's build — e.g. Render's
environment variable settings) and rebuild/redeploy the client. The "Get the
mobile app" card's Android download button will then work.

## What members actually see

On their dashboard, right under the welcome heading: a **"Get the mobile
app"** card with two tabs, **Android** and **iPhone**. Android shows a
direct APK download button (once configured) plus a note that Android will
warn about installing from outside the Play Store — that's expected and
normal for a sideloaded APK, not a sign anything's wrong. iPhone shows the
step-by-step Add to Home Screen instructions. The card remembers if someone
dismissed it (won't nag every login) and hides itself automatically for
anyone already using the installed app.

## Testing the Android build without any of the above

You don't need GitHub Actions to try this locally if you have Android
Studio installed:

```bash
cd unique-youths-client
npm install
npm run build
CLIENT_APP_URL=https://your-deployed-client-url npx cap sync android
npx cap open android
```

That opens the project in Android Studio, where you can run it on an
emulator or a plugged-in phone directly, or build an APK via
**Build → Build Bundle(s) / APK(s) → Build APK(s)**.
