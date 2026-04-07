import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zbalmuth.noshnotes',
  appName: 'Nosh Notes',
  // webDir is required by Capacitor even for live-URL apps; not served locally.
  webDir: 'dist',
  server: {
    // The app is a WKWebView wrapper pointing at the live Vercel deployment.
    // Remove this block only if you ever want to bundle a local build instead.
    url: 'https://nosh-notes.vercel.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
    // Prevent Capacitor from stripping the status-bar area on notched devices.
    backgroundColor: '#ffffff',
  },
};

export default config;
