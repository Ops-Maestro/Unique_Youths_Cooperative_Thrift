import type { CapacitorConfig } from "@capacitor/cli";

// Bundles the built web files directly into the APK for instant loading,
// while API requests will still connect to your remote backend server.
const config: CapacitorConfig = {
  appId: "com.uniqueyouths.thrift",
  appName: "Unique Youth",
  webDir: "dist",
  android: {
    allowMixedContent: false
  }
};

export default config;