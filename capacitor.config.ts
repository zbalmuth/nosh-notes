import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zbalmuth.noshnotes',
  appName: 'Nosh Notes',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    allowsLinkPreview: false,
    backgroundColor: '#0F0F23',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: '#0F0F23',
      showSpinner: false,
    },
  },
};

export default config;
