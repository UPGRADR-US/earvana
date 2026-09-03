package com.earvana.tinnitusrelief;

import android.Manifest;
import android.content.pm.ActivityInfo;
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
        // Tablet detection: smallest screen width >= 600dp is Google's official definition
        // and works reliably in both emulators and real devices (unlike SCREENLAYOUT_SIZE_LARGE).
        int smallestWidth = getResources().getConfiguration().smallestScreenWidthDp;
        boolean isTablet = smallestWidth >= 600;

        if (isTablet) {
            // Tablets: both orientations. Landscape keeps the 430px phone column
            // (CSS); portrait is full-screen. SENSOR_LANDSCAPE letterboxed the
            // activity with black bars when the tablet was held in portrait.
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_USER);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        }

        registerPlugin(EarvanaAudioPlugin.class);
        registerPlugin(BillingPlugin.class);
        registerPlugin(ReviewPlugin.class);
        super.onCreate(savedInstanceState);
        StoreReviewHelper.incrementLaunch(this);
        StoreReviewHelper.requestIfAppropriate(this);
        // Edge-to-edge: WebView extends behind status bar and navigation bar so
        // the #bg-blur layer fills landscape letterbox sides on tablets.
        // Capacitor SystemBars plugin injects --safe-area-inset-* CSS variables
        // so the UI content is padded correctly inside the system bars.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
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
