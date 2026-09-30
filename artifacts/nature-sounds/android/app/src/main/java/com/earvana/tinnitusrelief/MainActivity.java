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
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private static final int REQ_POST_NOTIFICATIONS = 1001;

    private int safeTopDp = 0;
    private int safeBottomDp = 0;
    private int safeLeftDp = 0;
    private int safeRightDp = 0;

    private void applyInsetsToWebView(WebView webView) {
        if (webView == null) return;
        String js = String.format(
            Locale.US,
            "document.documentElement.style.setProperty('--safe-area-inset-top', '%dpx');" +
            "document.documentElement.style.setProperty('--safe-area-inset-bottom', '%dpx');" +
            "document.documentElement.style.setProperty('--safe-area-inset-left', '%dpx');" +
            "document.documentElement.style.setProperty('--safe-area-inset-right', '%dpx');",
            safeTopDp, safeBottomDp, safeLeftDp, safeRightDp
        );
        webView.evaluateJavascript(js, null);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        androidx.core.splashscreen.SplashScreen.installSplashScreen(this);

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
        // WindowInsetsCompat queries system bars + display cutout insets and injects
        // --safe-area-inset-* CSS variables so the UI content is padded correctly.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        ViewCompat.setOnApplyWindowInsetsListener(getWindow().getDecorView(), (v, windowInsets) -> {
            Insets insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            float density = getResources().getDisplayMetrics().density;
            if (density > 0) {
                int top = Math.round(insets.top / density);
                int bottom = Math.round(insets.bottom / density);
                int left = Math.round(insets.left / density);
                int right = Math.round(insets.right / density);

                if (top != safeTopDp || bottom != safeBottomDp || left != safeLeftDp || right != safeRightDp) {
                    safeTopDp = top;
                    safeBottomDp = bottom;
                    safeLeftDp = left;
                    safeRightDp = right;

                    if (getBridge() != null && getBridge().getWebView() != null) {
                        applyInsetsToWebView(getBridge().getWebView());
                    }
                }
            }
            return windowInsets;
        });

        if (getBridge() != null) {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.setBackgroundColor(ContextCompat.getColor(this, R.color.colorSurface));
                webView.getSettings().setOffscreenPreRaster(true);
            }

            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    if (!isTablet) {
                        webView.evaluateJavascript("document.documentElement.classList.add('android-phone');", null);
                    }
                    applyInsetsToWebView(webView);
                }
            });
            if (!isTablet && getBridge().getWebView() != null) {
                String defaultUa = getBridge().getWebView().getSettings().getUserAgentString();
                if (defaultUa != null && !defaultUa.contains("AndroidPhone")) {
                    getBridge().getWebView().getSettings().setUserAgentString(defaultUa + " AndroidPhone");
                }
            }
        }
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
