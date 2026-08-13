package com.earvana.tinnitusrelief;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private static final int REQ_POST_NOTIFICATIONS = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EarvanaAudioPlugin.class);
        registerPlugin(BillingPlugin.class);
        super.onCreate(savedInstanceState);
        // Pre-Android 15: keep content clear of system bars by default.
        // Android 15+ (API 35) with targetSdk 35+ enforces edge-to-edge; this call
        // becomes a no-op and Android 16 (API 36) removes the opt-out entirely.
        // Capacitor 8.4 SystemBars injects --safe-area-inset-* CSS variables so
        // the WebView UI (banner / bottom dock) pads correctly under system bars.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        requestNotificationPermissionIfNeeded();
    }

    /**
     * Android 13+ requires runtime notification permission so the media-playback
     * foreground service notification is visible on OEM builds (Motorola, etc.).
     * Denial is safe: audio still plays; only the notification may be suppressed.
     */
    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    this,
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    REQ_POST_NOTIFICATIONS
            );
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_POST_NOTIFICATIONS) return;
        boolean granted = grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (!granted) {
            // No crash / no re-prompt loop. FGS mediaPlayback still runs; notification
            // may be hidden until the user enables notifications in system settings.
            Log.i(TAG, "POST_NOTIFICATIONS denied — playback continues without media controls notification");
        }
    }
}
