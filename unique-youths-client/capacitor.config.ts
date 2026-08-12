import type { CapacitorConfig } from "@capacitor/cli";

// This wraps the already-deployed client web app in a native Android
// WebView shell so it can be built into a real, installable APK.
//
// It points at a *live, hosted* URL (server.url below) rather than bundling
// the built files into the APK. That's deliberate: the app should always
// show the current production site (same as opening it in a browser) - no
// separate "mobile build" to keep in sync with web releases, no need to
// publish a new APK every time the UI changes. An APK rebuild is only
// needed for icon/name/permission changes, not routine app updates.
//
// CLIENT_APP_URL is injected by the GitHub Actions workflow at build time
// (see .github/workflows/build-android.yml) so this can point at whichever
// URL the client is actually deployed to (e.g. your Render static site),
// without hardcoding it here. Falls back to a placeholder for local builds.
// const LIVE_URL = process.env.CLIENT_APP_URL || "https://example.com";

const config: CapacitorConfig = {
  appId: "com.uniqueyouths.thrift",
  appName: "Unique Youth",
  webDir: "dist",
  // server: {
  //   url: LIVE_URL,
  //   cleartext: false
  // },
  android: {
    allowMixedContent: false
  }
};

export default config;
