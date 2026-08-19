import type { CapacitorConfig } from "@capacitor/cli";

const LIVE_URL =
  process.env.CLIENT_APP_URL ||
  "https://unique-youths-client.onrender.com/";

const config: CapacitorConfig = {
  appId: "com.uniqueyouths.thrift",
  appName: "Unique Youth",
  webDir: "dist",

  server: {
    url: LIVE_URL,
    cleartext: false,
  },

  android: {
    allowMixedContent: false,
  },
};

export default config;