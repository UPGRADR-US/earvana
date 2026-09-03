import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.earvana.tinnitusrelief',
  appName: 'earphoria',
  webDir: 'dist/public',
  plugins: {
    // Native EarvanaAudio plugin (iOS AVAudioEngine / Android AudioService)
    // is registered in MyViewController.swift and MainActivity.java.
    // Do not use WKWebView Web Audio for therapy playback.
    //
    // Android 15/16 edge-to-edge: SystemBars injects --safe-area-inset-* CSS vars
    // (env() alone is wrong on many Android WebViews < 140). DARK = light icons
    // on our dark-green UI (see Capacitor SystemBars setAppearanceLightStatusBars).
    SystemBars: {
      insetsHandling: 'css',
      style: 'DARK',
    },
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
    // Phones stay portrait-locked in MainActivity. Tablets allow both
    // orientations (portrait = full screen, landscape = 430px column).
    // Target/compile SDK 36 (Android 16) for Google Play — see android/variables.gradle.
    allowMixedContent: false,
  },
};

export default config;
