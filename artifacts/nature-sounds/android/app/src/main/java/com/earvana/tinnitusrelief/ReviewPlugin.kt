package com.earvana.tinnitusrelief

import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.play.core.review.ReviewManagerFactory

/**
 * Google Play In-App Review. Play may ignore the request based on quota —
 * this is not guaranteed to present a dialog.
 */
object StoreReviewHelper {
    private const val TAG = "StoreReview"
    private const val PREFS = "store_review"
    private const val KEY_LAUNCHES = "launchCount"
    private const val KEY_LAST_VERSION = "lastRequestedVersion"
    private const val MIN_LAUNCHES = 3

    @JvmStatic
    fun incrementLaunch(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit().putInt(KEY_LAUNCHES, prefs.getInt(KEY_LAUNCHES, 0) + 1).apply()
    }

    @JvmStatic
    fun request(activity: Activity) {
        val manager = ReviewManagerFactory.create(activity)
        val request = manager.requestReviewFlow()
        request.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                manager.launchReviewFlow(activity, task.result)
            } else {
                Log.i(TAG, "requestReviewFlow unsuccessful: ${task.exception?.message}")
            }
        }
    }

    @JvmStatic
    fun requestIfAppropriate(activity: Activity) {
        val prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val launches = prefs.getInt(KEY_LAUNCHES, 0)
        val lastVersion = prefs.getString(KEY_LAST_VERSION, null)
        val currentVersion = currentVersionName(activity) ?: return
        if (launches < MIN_LAUNCHES || lastVersion == currentVersion) return
        Handler(Looper.getMainLooper()).postDelayed({
            if (activity.isFinishing) return@postDelayed
            request(activity)
            prefs.edit().putString(KEY_LAST_VERSION, currentVersion).apply()
        }, 2500)
    }

    private fun currentVersionName(context: Context): String? {
        return try {
            val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.packageManager.getPackageInfo(
                    context.packageName,
                    PackageManager.PackageInfoFlags.of(0),
                )
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getPackageInfo(context.packageName, 0)
            }
            info.versionName
        } catch (e: Exception) {
            Log.w(TAG, "versionName unavailable", e)
            null
        }
    }
}

@CapacitorPlugin(name = "StoreReview")
class ReviewPlugin : Plugin() {

    @PluginMethod
    fun requestReview(call: PluginCall) {
        val act = activity
        if (act == null) {
            call.reject("Activity not available")
            return
        }
        StoreReviewHelper.request(act)
        call.resolve(JSObject().put("presented", true))
    }
}
