package com.earvana.tinnitusrelief;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Foreground media service — mirrors iOS EarvanaAudioPlugin + CrossfadeLoopPlayer.
 * Streams audio (no full-file PCM decode) so track switches / stop are responsive.
 */
public class EarvanaAudioService extends Service {
    private static final String TAG = "EarvanaAudioService";
    private static final String CHANNEL_ID = "earvana_audio_channel";
    private static final int NOTIFICATION_ID = 4040;

    public static final String ACTION_PLAY = "com.earvana.tinnitusrelief.ACTION_PLAY";
    public static final String ACTION_PAUSE = "com.earvana.tinnitusrelief.ACTION_PAUSE";
    public static final String ACTION_STOP = "com.earvana.tinnitusrelief.ACTION_STOP";

    private final IBinder binder = new LocalBinder();
    private final AtomicInteger loadGeneration = new AtomicInteger(0);
    private final Set<String> loadingTracks = new HashSet<>();
    private final Set<String> errorTracks = new HashSet<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private CrossfadeLoopPlayer loopPlayer;
    private String activeTrackId = null;
    private String activeTrackName = "Earvana Relief";
    private float activeTrackVolume = 0.5f;

    private PowerManager.WakeLock wakeLock;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private NotificationManager notificationManager;

    private float masterVolume = 0.8f;
    private final float[] eqGains = new float[]{0, 0, 0, 0, 0};
    private Float notchFreq = null;
    private Float boostFreq = null;

    private Thread durationThread;
    private StatusChangeListener statusListener;
    private boolean foregroundStarted = false;

    public interface StatusChangeListener {
        void onStatusChanged();
    }

    public class LocalBinder extends Binder {
        public EarvanaAudioService getService() {
            return EarvanaAudioService.this;
        }
    }

    private final AudioManager.OnAudioFocusChangeListener afChangeListener = focusChange -> {
        switch (focusChange) {
            case AudioManager.AUDIOFOCUS_LOSS, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> pauseActiveTrack();
            default -> {}
        }
    };

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (action == null) return;
            switch (action) {
                case ACTION_PAUSE -> pauseActiveTrack();
                case ACTION_PLAY -> resumeActiveTrack();
                case ACTION_STOP -> stopAllTracks();
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Earvana::AudioWakeLock");
        createNotificationChannel();

        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_PLAY);
        filter.addAction(ACTION_PAUSE);
        filter.addAction(ACTION_STOP);
        ContextCompat.registerReceiver(this, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        loadGeneration.incrementAndGet();
        releasePlayer();
        try {
            unregisterReceiver(receiver);
        } catch (Exception ignored) {}
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    public void setStatusListener(StatusChangeListener listener) {
        this.statusListener = listener;
    }

    private void notifyStatus() {
        StatusChangeListener listener = statusListener;
        if (listener == null) return;
        mainHandler.post(listener::onStatusChanged);
    }

    private void releasePlayer() {
        if (loopPlayer != null) {
            loopPlayer.stopImmediate();
            loopPlayer = null;
        }
    }

    private void enterForeground(boolean isPlaying, String title) {
        try {
            Notification notification = buildNotification(isPlaying, title);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceCompat.startForeground(
                        this,
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                );
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            foregroundStarted = true;
        } catch (Exception e) {
            Log.e(TAG, "startForeground failed", e);
            try {
                startForeground(NOTIFICATION_ID, buildNotification(isPlaying, title));
                foregroundStarted = true;
            } catch (Exception e2) {
                Log.e(TAG, "legacy startForeground failed", e2);
            }
        }
    }

    private void updateNotification(boolean isPlaying) {
        if (!foregroundStarted || notificationManager == null) return;
        try {
            notificationManager.notify(NOTIFICATION_ID, buildNotification(isPlaying, activeTrackName));
        } catch (Exception e) {
            Log.w(TAG, "notify update failed", e);
        }
    }

    public void playTrack(String trackId, String filePath, String trackName,
                          float loopStart, Float loopEnd, float crossfade, float volume) {
        Log.d(TAG, "PlayTrack (stream): " + trackId);

        final int gen = loadGeneration.incrementAndGet();

        // Instant stop of previous stream — matches iOS loopPlayer?.stop(immediate: true)
        releasePlayer();

        synchronized (loadingTracks) {
            loadingTracks.clear();
            loadingTracks.add(trackId);
        }
        synchronized (errorTracks) {
            errorTracks.clear();
        }
        activeTrackId = trackId;
        activeTrackName = trackName != null ? trackName : trackId;
        activeTrackVolume = volume;

        enterForeground(false, "Loading…");
        notifyStatus();

        requestFocusAndWakeLock();

        CrossfadeLoopPlayer player = new CrossfadeLoopPlayer(this);
        loopPlayer = player;

        final float[] gainsCopy = eqGains.clone();
        final Float notch = notchFreq;
        final Float boost = boostFreq;
        final float master = masterVolume;

        long t0 = System.currentTimeMillis();
        player.play(
                filePath,
                loopStart,
                loopEnd,
                crossfade,
                volume,
                master,
                false,
                gainsCopy,
                notch,
                boost,
                () -> {
                    if (gen != loadGeneration.get()) {
                        player.stopImmediate();
                        return;
                    }
                    synchronized (loadingTracks) {
                        loadingTracks.remove(trackId);
                    }
                    Log.d(TAG, "Play ready in " + (System.currentTimeMillis() - t0) + "ms: " + trackId);
                    enterForeground(true, activeTrackName);
                    notifyStatus();
                },
                () -> {
                    if (gen != loadGeneration.get()) return;
                    synchronized (loadingTracks) {
                        loadingTracks.remove(trackId);
                    }
                    synchronized (errorTracks) {
                        errorTracks.add(trackId);
                    }
                    if (loopPlayer == player) loopPlayer = null;
                    notifyStatus();
                }
        );
    }

    private void requestFocusAndWakeLock() {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes playbackAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build();
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(playbackAttributes)
                    .setAcceptsDelayedFocusGain(true)
                    .setOnAudioFocusChangeListener(afChangeListener)
                    .build();
            audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            audioManager.requestAudioFocus(afChangeListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
        if (wakeLock != null && !wakeLock.isHeld()) {
            wakeLock.acquire(10 * 60 * 60 * 1000L);
        }
    }

    /** Pause / stop button — cancels in-flight load immediately. */
    public void pauseActiveTrack() {
        // Cancel any prepare in flight
        loadGeneration.incrementAndGet();
        synchronized (loadingTracks) {
            loadingTracks.clear();
        }

        CrossfadeLoopPlayer player = loopPlayer;
        if (player == null) {
            activeTrackId = null;
            updateNotification(false);
            notifyStatus();
            return;
        }

        // Instant halt when still preparing (playing==false) — no 0.4s fade wait
        if (!player.isPlaying()) {
            player.stopImmediate();
            loopPlayer = null;
            activeTrackId = null;
            updateNotification(false);
            notifyStatus();
            return;
        }

        // Short fade then release — status flips immediately via isPlaying=false
        notifyStatus();
        player.pause(0.35f, () -> {
            if (loopPlayer == player) loopPlayer = null;
            updateNotification(false);
            notifyStatus();
        });
    }

    public void resumeActiveTrack() {
        // Resume = re-play last track is handled on JS side via play()
        notifyStatus();
    }

    public void setVolume(String trackId, float volume) {
        activeTrackVolume = volume;
        if (loopPlayer != null && trackId != null && Objects.equals(trackId, activeTrackId)) {
            loopPlayer.setVolume(volume);
        }
    }

    public void setMasterVolume(float volume) {
        this.masterVolume = volume;
        if (loopPlayer != null) loopPlayer.setMasterVolume(volume);
    }

    public void setEq(float[] gains) {
        if (gains == null) return;
        System.arraycopy(gains, 0, eqGains, 0, Math.min(gains.length, 5));
        if (loopPlayer != null) loopPlayer.setEq(eqGains);
    }

    public void setNotch(Float freq) {
        this.notchFreq = freq;
        this.boostFreq = null;
        if (loopPlayer != null) loopPlayer.setNotch(freq);
    }

    public void setBoost(Float freq) {
        this.boostFreq = freq;
        this.notchFreq = null;
        if (loopPlayer != null) loopPlayer.setBoost(freq);
    }

    public void startFadeOut(float durationSeconds) {
        if (loopPlayer != null) loopPlayer.startFadeOut(durationSeconds);
    }

    public void cancelFade() {
        if (loopPlayer != null) loopPlayer.cancelFade();
    }

    public void setPlayDuration(float durationSeconds) {
        if (durationThread != null) {
            durationThread.interrupt();
            durationThread = null;
        }
        if (durationSeconds <= 0) {
            cancelFade();
            return;
        }
        durationThread = new Thread(() -> {
            try {
                float fadeDuration = (durationSeconds > 600) ? 60.0f : Math.min(60.0f, durationSeconds * 0.1f);
                float delay = Math.max(0.0f, durationSeconds - fadeDuration);
                Thread.sleep((long) (delay * 1000));
                if (loopPlayer != null && loopPlayer.isPlaying()) startFadeOut(fadeDuration);
                Thread.sleep((long) (fadeDuration * 1000));
                mainHandler.post(this::stopAllTracks);
            } catch (InterruptedException ignored) {}
        }, "DurationTimer-Thread");
        durationThread.start();
    }

    public void stopAllTracks() {
        Log.d(TAG, "StopAllTracks");
        loadGeneration.incrementAndGet();
        if (durationThread != null) {
            durationThread.interrupt();
            durationThread = null;
        }
        releasePlayer();
        synchronized (loadingTracks) {
            loadingTracks.clear();
        }
        activeTrackId = null;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
        } else if (audioManager != null) {
            audioManager.abandonAudioFocus(afChangeListener);
        }
        try {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } catch (Exception ignored) {}
        foregroundStarted = false;
        stopSelf();
        notifyStatus();
    }

    public boolean isTrackPlaying(String trackId) {
        return trackId != null
                && Objects.equals(trackId, activeTrackId)
                && loopPlayer != null
                && loopPlayer.isPlaying();
    }

    public HashMap<String, Object> getStatusMap() {
        HashMap<String, Object> statusMap = new HashMap<>();

        synchronized (loadingTracks) {
            for (String tid : loadingTracks) {
                HashMap<String, Object> trackData = new HashMap<>();
                trackData.put("isPlaying", false);
                trackData.put("isLoading", true);
                trackData.put("hasError", false);
                trackData.put("volume", activeTrackVolume);
                statusMap.put(tid, trackData);
            }
        }
        synchronized (errorTracks) {
            for (String tid : errorTracks) {
                if (statusMap.containsKey(tid)) continue;
                HashMap<String, Object> trackData = new HashMap<>();
                trackData.put("isPlaying", false);
                trackData.put("isLoading", false);
                trackData.put("hasError", true);
                trackData.put("volume", activeTrackVolume);
                statusMap.put(tid, trackData);
            }
        }

        if (activeTrackId != null && !statusMap.containsKey(activeTrackId)) {
            boolean playing = loopPlayer != null && loopPlayer.isPlaying();
            HashMap<String, Object> trackData = new HashMap<>();
            trackData.put("isPlaying", playing);
            trackData.put("isLoading", false);
            trackData.put("hasError", false);
            trackData.put("volume", activeTrackVolume);
            statusMap.put(activeTrackId, trackData);
        }
        return statusMap;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                    CHANNEL_ID,
                    "Earvana Tinnitus Therapy",
                    NotificationManager.IMPORTANCE_LOW
            );
            serviceChannel.setDescription("Persistent controls for background sound therapy");
            serviceChannel.setSound(null, null);
            notificationManager.createNotificationChannel(serviceChannel);
        }
    }

    private Notification buildNotification(boolean isPlaying, String rawTitle) {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, notificationIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        Intent playPauseIntent = new Intent(isPlaying ? ACTION_PAUSE : ACTION_PLAY);
        PendingIntent playPausePending = PendingIntent.getBroadcast(
                this, 1, playPauseIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        Intent stopIntent = new Intent(ACTION_STOP);
        PendingIntent stopPending = PendingIntent.getBroadcast(
                this, 2, stopIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        String title = (rawTitle != null) ? rawTitle : "Earvana Relief";
        String subtitle = isPlaying ? "Tinnitus Relief" : "Loading…";
        if (title.contains(": ")) {
            String[] parts = title.split(": ", 2);
            subtitle = parts[0].substring(0, 1).toUpperCase() + parts[0].substring(1);
            title = parts[1].substring(0, 1).toUpperCase() + parts[1].substring(1);
        }
        title = title.replace('_', ' ');

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(subtitle)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentIntent(pendingIntent)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .addAction(
                        isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                        isPlaying ? "Pause" : "Play",
                        playPausePending
                )
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopPending)
                .build();
    }
}
