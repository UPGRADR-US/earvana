import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.earvana.tinnitusrelief',
  appName: 'earvana',
  webDir: 'dist/public',
  plugins: {
    // Native EarvanaAudio plugin (iOS AVAudioEngine / Android AudioService)
    // is registered in MyViewController.swift and MainActivity.java.
    // Do not use WKWebView Web Audio for therapy playback.
  },
  ios: {
    // Background audio entitlement is added in Xcode:
    // Signing & Capabilities → + Capability → Background Modes → Audio
    // never = edge-to-edge WKWebView (no black home-indicator gap).
    // Safe areas are handled in CSS (env(safe-area-inset-*)).
    contentInset: 'never',
    allowsLinkPreview: false,
  },
  android: {
    // Portrait lock is also set on MainActivity in AndroidManifest.
    allowMixedContent: false,
  },
};

export default config;
