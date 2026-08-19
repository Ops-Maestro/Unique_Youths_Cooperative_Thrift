import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.uniqueyouths.admin',
  appName: 'unique-youths-admin',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
