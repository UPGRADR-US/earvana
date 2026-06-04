import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.earvana.tinnitusrelief',
  appName: 'earvana',
  webDir: 'dist/public',
  plugins: {
    // No extra plugins needed — Web Audio API is native to WKWebView
  },
  ios: {
    // Background audio entitlement is added in Xcode:
    // Signing & Capabilities → + Capability → Background Modes → Audio
    contentInset: 'always',
    allowsLinkPreview: false,
  },
};

export default config;
