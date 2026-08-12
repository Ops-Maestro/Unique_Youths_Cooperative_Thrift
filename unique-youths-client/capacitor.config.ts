import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.uniqueyouths.thrift",
  appName: "Unique Youth",
  webDir: "dist",
  // Remove or comment out 'server' so the app loads local bundled files instantly
  // server: {
  //   url: LIVE_URL,
  //   cleartext: false
  // },
  android: {
    allowMixedContent: false
  }
};

export default config;