package com.earvana.tinnitusrelief;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@SuppressWarnings({"deprecation", "unchecked"})
@CapacitorPlugin(name = "EarvanaAudio")
public class EarvanaAudioPlugin extends Plugin {
    private static final String TAG = "EarvanaAudioPlugin";
    private static final long BIND_WAIT_MS = 4000;

    private EarvanaAudioService audioService;
    private boolean isBound = false;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final List<Runnable> pendingWhenBound = new ArrayList<>();
    /** Diagnostics sine tones — independent of the therapy service. */
    private final DiagnosticTonePlayer tonePlayer = new DiagnosticTonePlayer();

    private final ServiceConnection connection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName className, IBinder service) {
            Log.d(TAG, "Service Bound");
            EarvanaAudioService.LocalBinder binder = (EarvanaAudioService.LocalBinder) service;
            audioService = binder.getService();
            isBound = true;

            audioService.setStatusListener(() -> {
                JSObject data = new JSObject();
                data.put("tracks", getStatusMapObject());
                notifyListeners("statusChange", data);
            });

            List<Runnable> queued;
            synchronized (pendingWhenBound) {
                queued = new ArrayList<>(pendingWhenBound);
                pendingWhenBound.clear();
            }
            for (Runnable r : queued) {
                try {
                    r.run();
                } catch (Exception e) {
                    Log.e(TAG, "Queued call failed", e);
                }
            }
        }

        @Override
        public void onServiceDisconnected(ComponentName arg0) {
            Log.d(TAG, "Service Unbound");
            isBound = false;
            audioService = null;
        }
    };

    @Override
    public void load() {
        super.load();
        Log.d(TAG, "Plugin Load - Binding Service");
        Context context = getContext();
        Intent intent = new Intent(context, EarvanaAudioService.class);
        try {
            context.startService(intent);
        } catch (Exception e) {
            Log.w(TAG, "startService failed, bind will still try", e);
        }
        context.bindService(intent, connection, Context.BIND_AUTO_CREATE);
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        try {
            tonePlayer.stop();
        } catch (Exception ignored) {}
        if (isBound) {
            try {
                getContext().unbindService(connection);
            } catch (Exception ignored) {}
            isBound = false;
        }
    }

    /** Run when service is bound, or reject after timeout. */
    private void withService(PluginCall call, ServiceAction action) {
        if (isBound && audioService != null) {
            try {
                action.run(audioService);
            } catch (Exception e) {
                Log.e(TAG, "Service action failed", e);
                call.reject(e.getMessage() != null ? e.getMessage() : "Service action failed");
            }
            return;
        }

        final long deadline = System.currentTimeMillis() + BIND_WAIT_MS;
        Runnable waiter = new Runnable() {
            @Override
            public void run() {
                if (isBound && audioService != null) {
                    try {
                        action.run(audioService);
                    } catch (Exception e) {
                        Log.e(TAG, "Service action failed", e);
                        call.reject(e.getMessage() != null ? e.getMessage() : "Service action failed");
                    }
                    return;
                }
                if (System.currentTimeMillis() >= deadline) {
                    call.reject("Audio service not bound");
                    return;
                }
                mainHandler.postDelayed(this, 50);
            }
        };
        mainHandler.post(waiter);
    }

    private interface ServiceAction {
        void run(EarvanaAudioService service) throws Exception;
    }

    private JSObject getStatusMapObject() {
        JSObject obj = new JSObject();
        if (isBound && audioService != null) {
            HashMap<String, Object> map = audioService.getStatusMap();
            for (Map.Entry<String, Object> entry : map.entrySet()) {
                if (entry.getValue() instanceof HashMap) {
                    JSObject trackData = new JSObject();
                    HashMap<?, ?> inner = (HashMap<?, ?>) entry.getValue();
                    for (Map.Entry<?, ?> val : inner.entrySet()) {
                        trackData.put((String) val.getKey(), val.getValue());
                    }
                    obj.put(entry.getKey(), trackData);
                }
            }
        }
        return obj;
    }

    @PluginMethod
    public void play(PluginCall call) {
        Log.d(TAG, "Play called with: " + call.getData().toString());
        String trackId = call.getString("trackId");
        String filePath = call.getString("filePath");
        if (trackId == null || filePath == null) {
            call.reject("Missing trackId or filePath");
            return;
        }

        String trackName = trackId.replace("_", " ");
        float volume = call.getFloat("volume", 0.5f);
        float loopStart = call.getFloat("loopStart", 0.0f);
        Float loopEnd = null;
        if (call.getData().has("loopEnd")) {
            loopEnd = call.getFloat("loopEnd");
        }
        float crossfade = call.getFloat("crossfadeDuration", 40.0f);

        final Float loopEndFinal = loopEnd;
        withService(call, service -> {
            service.playTrack(trackId, filePath, trackName, loopStart, loopEndFinal, crossfade, volume);
            // Resolve immediately so the WebView stays responsive while decode runs
            call.resolve();
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        withService(call, service -> {
            service.pauseActiveTrack();
            call.resolve();
        });
    }

    @PluginMethod
    public void resume(PluginCall call) {
        withService(call, service -> {
            service.resumeActiveTrack();
            call.resolve();
        });
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        String trackId = call.getString("trackId");
        Float volume = call.getFloat("volume");
        if (trackId == null || volume == null) {
            call.reject("Missing trackId or volume");
            return;
        }
        withService(call, service -> {
            service.setVolume(trackId, volume);
            call.resolve();
        });
    }

    @PluginMethod
    public void setMasterVolume(PluginCall call) {
        Float volume = call.getFloat("volume");
        if (volume == null) {
            call.reject("Missing volume");
            return;
        }
        withService(call, service -> {
            service.setMasterVolume(volume);
            call.resolve();
        });
    }

    @PluginMethod
    public void setEq(PluginCall call) {
        JSArray gainsArray = call.getArray("gains");
        if (gainsArray == null) {
            call.reject("Missing gains array");
            return;
        }
        float[] gains = new float[gainsArray.length()];
        for (int i = 0; i < gainsArray.length(); i++) {
            try {
                gains[i] = (float) gainsArray.getDouble(i);
            } catch (JSONException e) {
                gains[i] = 0.0f;
            }
        }
        withService(call, service -> {
            service.setEq(gains);
            call.resolve();
        });
    }

    @PluginMethod
    public void setNotch(PluginCall call) {
        Float freq = call.getFloat("freq");
        withService(call, service -> {
            service.setNotch(freq);
            call.resolve();
        });
    }

    @PluginMethod
    public void setBoost(PluginCall call) {
        Float freq = call.getFloat("freq");
        withService(call, service -> {
            service.setBoost(freq);
            call.resolve();
        });
    }

    @PluginMethod
    public void startFadeOut(PluginCall call) {
        Float duration = call.getFloat("durationSeconds");
        if (duration == null) {
            call.reject("Missing durationSeconds");
            return;
        }
        withService(call, service -> {
            service.startFadeOut(duration);
            call.resolve();
        });
    }

    @PluginMethod
    public void cancelFade(PluginCall call) {
        withService(call, service -> {
            service.cancelFade();
            call.resolve();
        });
    }

    @PluginMethod
    public void setPlayDuration(PluginCall call) {
        Float duration = call.getFloat("durationSeconds");
        if (duration == null) {
            call.reject("Missing durationSeconds");
            return;
        }
        withService(call, service -> {
            service.setPlayDuration(duration);
            call.resolve();
        });
    }

    @PluginMethod
    public void stopAll(PluginCall call) {
        withService(call, service -> {
            service.stopAllTracks();
            call.resolve();
        });
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("tracks", getStatusMapObject());
        call.resolve(ret);
    }

    @PluginMethod
    public void setLastPlayed(PluginCall call) {
        String trackId = call.getString("trackId");
        if (trackId != null) {
            SharedPreferences prefs = getContext().getSharedPreferences("earvana_prefs", Context.MODE_PRIVATE);
            prefs.edit().putString("earvana_last_played", trackId).apply();
            call.resolve();
        } else {
            call.reject("Missing trackId");
        }
    }

    @PluginMethod
    public void getLastPlayed(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences("earvana_prefs", Context.MODE_PRIVATE);
        String trackId = prefs.getString("earvana_last_played", null);
        JSObject ret = new JSObject();
        ret.put("trackId", trackId);
        call.resolve(ret);
    }

    @PluginMethod
    public void playTestTone(PluginCall call) {
        Double freq = call.getDouble("freq");
        if (freq == null) {
            // Capacitor may deliver numbers as floats
            Float freqF = call.getFloat("freq");
            if (freqF != null) freq = freqF.doubleValue();
        }
        if (freq == null) {
            call.reject("Missing freq");
            return;
        }
        float gain = call.getFloat("gain", 0.12f);
        final double f = freq;
        final float g = gain;
        mainHandler.post(() -> {
            try {
                tonePlayer.play(f, g);
                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "playTestTone failed", e);
                call.reject(e.getMessage() != null ? e.getMessage() : "Test tone failed");
            }
        });
    }

    @PluginMethod
    public void stopTestTone(PluginCall call) {
        mainHandler.post(() -> {
            try {
                tonePlayer.stop();
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "stopTestTone failed");
            }
        });
    }

    @PluginMethod
    public void setTestToneGain(PluginCall call) {
        Float gain = call.getFloat("gain");
        if (gain == null) {
            call.reject("Missing gain");
            return;
        }
        tonePlayer.setGain(gain);
        call.resolve();
    }
}

