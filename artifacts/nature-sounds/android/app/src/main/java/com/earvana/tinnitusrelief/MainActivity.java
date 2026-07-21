package com.earvana.tinnitusrelief;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int REQ_POST_NOTIFICATIONS = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EarvanaAudioPlugin.class);
        super.onCreate(savedInstanceState);
        // Lay out WebView above status bar + nav bar. Without this, edge-to-edge
        // + zero CSS safe-area on Motorola clips the bottom dock under the nav.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        requestNotificationPermissionIfNeeded();
    }

    /**
     * Android 13+ requires runtime notification permission for a reliable
     * media-playback foreground service on OEM builds (Motorola, etc.).
     */
    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            return;
        }
        ActivityCompat.requestPermissions(
                this,
                new String[]{Manifest.permission.POST_NOTIFICATIONS},
                REQ_POST_NOTIFICATIONS
        );
    }
}
