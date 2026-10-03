import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ewaybill.generator',
  appName: 'E-Waybill Generator',
  webDir: 'dist',
  server: {
    // Loads the app from your live VPS — updates deploy to web + mobile at once
    url: 'https://ewaybillgenerator.in',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#1a3a5c',
  },
};

export default config;
