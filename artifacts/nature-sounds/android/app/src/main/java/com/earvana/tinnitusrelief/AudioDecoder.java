package com.earvana.tinnitusrelief;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.os.Build;
import android.util.Log;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.ShortBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Decodes MP3/AAC assets to 16-bit PCM for the custom loop/DSP player.
 * Uses a disk cache so repeat plays skip the expensive MediaCodec pass.
 */
public class AudioDecoder {
    private static final String TAG = "AudioDecoder";
    private static final long TIMEOUT_US = 10_000;
    private static final int CACHE_VERSION = 2; // always 2-channel stereo PCM
    private static final String CACHE_MAGIC = "EVPCM001";

    public static class DecodedAudio {
        public short[] samples;
        public int sampleRate;
        public int channels = 2;
        public float duration;
        public final AtomicInteger framesReady = new AtomicInteger(0);
        public volatile boolean complete;
    }

    public interface StreamListener {
        void onPlayable(DecodedAudio audio);
        void onComplete(DecodedAudio audio);
    }

    public static DecodedAudio decodeAsset(Context context, String path) throws IOException {
        return decodeAsset(context, path, null);
    }

    /**
     * @param cancelCheck optional; return true to abort (throws IOException "cancelled")
     */
    public static DecodedAudio decodeAsset(Context context, String path, CancelCheck cancelCheck) throws IOException {
        final DecodedAudio[] holder = new DecodedAudio[1];
        final IOException[] error = new IOException[1];
        decodeStreaming(context, path, cancelCheck, new StreamListener() {
            @Override public void onPlayable(DecodedAudio audio) {}
            @Override public void onComplete(DecodedAudio audio) { holder[0] = audio; }
        });
        if (error[0] != null) throw error[0];
        if (holder[0] == null) throw new IOException("Decode produced no audio");
        return holder[0];
    }

    /**
     * Decode to stereo PCM. {@link StreamListener#onPlayable} fires as soon as ~0.6s
     * is in memory so playback can start while the rest of the file decodes.
     */
    public static void decodeStreaming(
            Context context,
            String path,
            CancelCheck cancelCheck,
            StreamListener listener
    ) throws IOException {
        Log.d(TAG, "decodeStreaming: " + path);
        checkCancelled(cancelCheck);

        ResolvedSource source = resolveSource(context, path);
        try {
            File cacheFile = cacheFileFor(context, source.cacheKey);
            DecodedAudio cached = readCache(cacheFile);
            if (cached != null) {
                cached.framesReady.set(cached.samples.length / 2);
                cached.complete = true;
                Log.d(TAG, "Cache hit: " + cacheFile.getName()
                        + " (" + cached.duration + "s)");
                listener.onPlayable(cached);
                listener.onComplete(cached);
                return;
            }

            checkCancelled(cancelCheck);
            DecodedAudio decoded = decodeFromExtractor(source, cancelCheck, listener);
            listener.onComplete(decoded);

            evictOtherCaches(cacheFile);
            final File outFile = cacheFile;
            final DecodedAudio toCache = decoded;
            new Thread(() -> {
                try {
                    writeCache(outFile, toCache);
                    Log.d(TAG, "Cache write: " + outFile.getName());
                } catch (IOException e) {
                    Log.w(TAG, "Cache write failed (non-fatal)", e);
                }
            }, "PCM-CacheWriter").start();
        } finally {
            source.close();
        }
    }

    public interface CancelCheck {
        boolean isCancelled();
    }

    private static void checkCancelled(CancelCheck cancelCheck) throws IOException {
        if (cancelCheck != null && cancelCheck.isCancelled()) {
            throw new IOException("cancelled");
        }
    }

    private static final class ResolvedSource {
        final MediaExtractor extractor;
        final AssetFileDescriptor afd; // may be null for file paths
        final String cacheKey;

        ResolvedSource(MediaExtractor extractor, AssetFileDescriptor afd, String cacheKey) {
            this.extractor = extractor;
            this.afd = afd;
            this.cacheKey = cacheKey;
        }

        void close() {
            try {
                extractor.release();
            } catch (Exception ignored) {}
            if (afd != null) {
                try {
                    afd.close();
                } catch (IOException ignored) {}
            }
        }
    }

    private static ResolvedSource resolveSource(Context context, String path) throws IOException {
        MediaExtractor extractor = new MediaExtractor();

        // Physical file
        if (path.startsWith("/")) {
            File file = new File(path);
            if (file.exists() && file.isFile()) {
                extractor.setDataSource(path);
                String key = "file_" + path.hashCode() + "_" + file.length() + "_" + file.lastModified();
                return new ResolvedSource(extractor, null, key);
            }
        }

        String assetPath = path;
        if (assetPath.startsWith("/")) assetPath = assetPath.substring(1);
        if (assetPath.startsWith("public/")) assetPath = assetPath.substring(7);

        String[] candidates = { "public/" + assetPath, assetPath };
        IOException last = null;
        for (String candidate : candidates) {
            try {
                AssetFileDescriptor afd = context.getAssets().openFd(candidate);
                // Keep AFD open for the full decode — closing early breaks some OEM codecs.
                extractor.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
                String key = "asset_" + candidate.replace('/', '_') + "_" + afd.getLength();
                return new ResolvedSource(extractor, afd, key);
            } catch (IOException e) {
                last = e;
            }
        }

        extractor.release();
        throw new IOException("Failed to load file or asset: " + path, last);
    }

    private static DecodedAudio decodeFromExtractor(
            ResolvedSource source,
            CancelCheck cancelCheck,
            StreamListener listener
    ) throws IOException {
        MediaExtractor extractor = source.extractor;

        int trackIndex = -1;
        MediaFormat format = null;
        for (int i = 0; i < extractor.getTrackCount(); i++) {
            MediaFormat f = extractor.getTrackFormat(i);
            String mime = f.getString(MediaFormat.KEY_MIME);
            if (mime != null && mime.startsWith("audio/")) {
                trackIndex = i;
                format = f;
                break;
            }
        }

        if (trackIndex < 0) {
            throw new IOException("No audio track found");
        }

        extractor.selectTrack(trackIndex);

        int sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE);
        int channels = Math.max(1, format.getInteger(MediaFormat.KEY_CHANNEL_COUNT));
        long durationUs = format.containsKey(MediaFormat.KEY_DURATION)
                ? format.getLong(MediaFormat.KEY_DURATION) : 0;

        String mime = format.getString(MediaFormat.KEY_MIME);
        if (mime == null) throw new IOException("Missing audio mime type");

        if (Build.VERSION.SDK_INT >= 32) {
            format.setInteger(MediaFormat.KEY_MAX_OUTPUT_CHANNEL_COUNT, 2);
        }

        MediaCodec decoder = MediaCodec.createDecoderByType(mime);
        decoder.configure(format, null, null, 0);
        decoder.start();

        // Always store stereo. Pre-size from duration so we never copy 80MB at the end.
        long estimatedFrames = durationUs > 0
                ? (durationUs * (long) sampleRate / 1_000_000L)
                : (2 * 60 * (long) sampleRate);
        int capacity = (int) Math.min(Integer.MAX_VALUE / 2 - 8, (estimatedFrames + estimatedFrames / 10 + 8192) * 2);
        short[] stereo = new short[Math.max(capacity, 44100 * 2)];
        Log.d(TAG, "Pre-allocated stereo buffer shorts=" + stereo.length);

        DecodedAudio decoded = new DecodedAudio();
        decoded.samples = stereo;
        decoded.sampleRate = sampleRate;
        decoded.channels = 2;
        decoded.duration = durationUs > 0 ? durationUs / 1_000_000f : 0f;

        int stereoShorts = 0;
        boolean playableFired = false;
        int playableAt = Math.max(sampleRate / 2, 8000); // ~0.5s of frames
        short[] scratch = new short[8192];

        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        boolean sawInputEOS = false;
        boolean sawOutputEOS = false;
        long t0 = System.currentTimeMillis();

        try {
            while (!sawOutputEOS) {
                checkCancelled(cancelCheck);

                if (!sawInputEOS) {
                    int inputBufferIndex = decoder.dequeueInputBuffer(TIMEOUT_US);
                    if (inputBufferIndex >= 0) {
                        ByteBuffer inputBuffer = decoder.getInputBuffer(inputBufferIndex);
                        if (inputBuffer == null) {
                            decoder.queueInputBuffer(inputBufferIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            sawInputEOS = true;
                        } else {
                            int sampleSize = extractor.readSampleData(inputBuffer, 0);
                            if (sampleSize < 0) {
                                decoder.queueInputBuffer(inputBufferIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                                sawInputEOS = true;
                            } else {
                                decoder.queueInputBuffer(inputBufferIndex, 0, sampleSize, extractor.getSampleTime(), 0);
                                extractor.advance();
                            }
                        }
                    }
                }

                int outputBufferIndex = decoder.dequeueOutputBuffer(info, TIMEOUT_US);
                if (outputBufferIndex >= 0) {
                    if (info.size > 0) {
                        ByteBuffer outputBuffer = decoder.getOutputBuffer(outputBufferIndex);
                        if (outputBuffer != null) {
                            outputBuffer.position(info.offset);
                            outputBuffer.limit(info.offset + info.size);
                            outputBuffer.order(ByteOrder.LITTLE_ENDIAN);
                            ShortBuffer shortBuffer = outputBuffer.asShortBuffer();
                            int numShorts = shortBuffer.remaining();
                            if (numShorts > scratch.length) {
                                scratch = new short[numShorts];
                            }
                            shortBuffer.get(scratch, 0, numShorts);
                            stereoShorts = appendStereo(stereo, stereoShorts, scratch, numShorts, channels);
                            int frames = stereoShorts / 2;
                            decoded.framesReady.set(frames);
                            if (!playableFired && frames >= playableAt) {
                                playableFired = true;
                                Log.d(TAG, "Playable after " + (System.currentTimeMillis() - t0)
                                        + "ms (" + frames + " frames)");
                                listener.onPlayable(decoded);
                            }
                        }
                    }
                    decoder.releaseOutputBuffer(outputBufferIndex, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        sawOutputEOS = true;
                    }
                } else if (outputBufferIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat newFormat = decoder.getOutputFormat();
                    if (newFormat.containsKey(MediaFormat.KEY_SAMPLE_RATE)) {
                        sampleRate = newFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                        decoded.sampleRate = sampleRate;
                    }
                    if (newFormat.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) {
                        channels = Math.max(1, newFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT));
                    }
                }
            }
        } finally {
            try {
                decoder.stop();
            } catch (Exception ignored) {}
            try {
                decoder.release();
            } catch (Exception ignored) {}
        }

        int frames = stereoShorts / 2;
        decoded.framesReady.set(frames);
        decoded.complete = true;
        decoded.duration = sampleRate > 0 ? (float) frames / sampleRate : 0f;
        if (!playableFired) {
            listener.onPlayable(decoded);
        }

        Log.d(TAG, "Decode finished in " + (System.currentTimeMillis() - t0) + "ms: "
                + frames + " frames (" + decoded.duration + "s) @ "
                + sampleRate + "Hz stereo");
        return decoded;
    }

    /** Append a decoded buffer, folding to L/R interleaved stereo. */
    private static int appendStereo(short[] dest, int destShorts, short[] src, int srcShorts, int inCh) {
        inCh = Math.max(1, inCh);
        int frames = srcShorts / inCh;
        int roomFrames = Math.max(0, (dest.length - destShorts) / 2);
        if (frames > roomFrames) frames = roomFrames;
        if (frames <= 0) return destShorts;
        int o = destShorts;
        if (inCh == 2) {
            int n = frames * 2;
            System.arraycopy(src, 0, dest, o, n);
            return o + n;
        }
        if (inCh == 1) {
            for (int f = 0; f < frames && o + 1 < dest.length; f++) {
                dest[o++] = src[f];
                dest[o++] = src[f];
            }
            return o;
        }
        for (int f = 0; f < frames && o + 1 < dest.length; f++) {
            int i = f * inCh;
            float l = src[i];
            float r = src[i + 1];
            if (inCh >= 3) {
                float c = src[i + 2] * 0.707f;
                l += c;
                r += c;
            }
            if (inCh >= 5) {
                l += src[i + 4] * 0.707f;
                r += src[i + Math.min(5, inCh - 1)] * 0.707f;
            }
            dest[o++] = clampShort(l);
            dest[o++] = clampShort(r);
        }
        return o;
    }

    private static void evictOtherCaches(File keep) {
        File dir = keep.getParentFile();
        if (dir == null) return;
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File f : files) {
            if (f.isFile() && !f.getName().equals(keep.getName())) {
                //noinspection ResultOfMethodCallIgnored
                f.delete();
            }
        }
    }

    /** Fold any layout down to L/R interleaved 16-bit stereo. */
    static void ensureStereo(DecodedAudio audio) {
        if (audio == null || audio.samples == null || audio.channels == 2) return;
        int ch = Math.max(1, audio.channels);
        int frames = audio.samples.length / ch;
        short[] stereo = new short[frames * 2];
        short[] in = audio.samples;
        if (ch == 1) {
            for (int f = 0; f < frames; f++) {
                stereo[f * 2] = in[f];
                stereo[f * 2 + 1] = in[f];
            }
        } else {
            for (int f = 0; f < frames; f++) {
                int i = f * ch;
                float l = in[i];
                float r = ch > 1 ? in[i + 1] : in[i];
                if (ch >= 3) {
                    float c = in[i + 2] * 0.707f; // center
                    l += c;
                    r += c;
                }
                if (ch >= 5) {
                    l += in[i + 4] * 0.707f; // surround L
                    r += in[i + Math.min(5, ch - 1)] * 0.707f;
                }
                stereo[f * 2] = clampShort(l);
                stereo[f * 2 + 1] = clampShort(r);
            }
        }
        audio.samples = stereo;
        audio.channels = 2;
        audio.duration = audio.sampleRate > 0 ? (float) frames / audio.sampleRate : 0f;
        Log.d(TAG, "Downmixed to stereo from " + ch + " ch (" + frames + " frames)");
    }

    private static short clampShort(float v) {
        if (v > 32767f) return 32767;
        if (v < -32768f) return -32768;
        return (short) v;
    }

    private static File cacheFileFor(Context context, String cacheKey) {
        File dir = new File(context.getCacheDir(), "pcm_cache");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        // Keep filename filesystem-safe and bounded
        String safe = cacheKey.replaceAll("[^a-zA-Z0-9._-]", "_");
        if (safe.length() > 80) safe = safe.substring(0, 80);
        return new File(dir, "v" + CACHE_VERSION + "_" + safe + ".pcm");
    }

    private static DecodedAudio readCache(File file) {
        if (!file.exists() || file.length() < 32) return null;
        try (DataInputStream in = new DataInputStream(new FileInputStream(file))) {
            byte[] magicBytes = new byte[8];
            in.readFully(magicBytes);
            if (!CACHE_MAGIC.equals(new String(magicBytes, StandardCharsets.US_ASCII))) return null;
            int version = in.readInt();
            if (version != CACHE_VERSION) return null;
            int sampleRate = in.readInt();
            int channels = in.readInt();
            int totalSamples = in.readInt();
            if (sampleRate <= 0 || channels <= 0 || totalSamples <= 0) return null;
            if (file.length() < 24L + (long) totalSamples * 2L) return null;

            short[] samples = new short[totalSamples];
            byte[] buf = new byte[Math.min(totalSamples * 2, 256 * 1024)];
            int filled = 0;
            while (filled < totalSamples) {
                int bytesWanted = Math.min(buf.length, (totalSamples - filled) * 2);
                in.readFully(buf, 0, bytesWanted);
                ByteBuffer.wrap(buf, 0, bytesWanted).order(ByteOrder.LITTLE_ENDIAN)
                        .asShortBuffer().get(samples, filled, bytesWanted / 2);
                filled += bytesWanted / 2;
            }

            DecodedAudio audio = new DecodedAudio();
            audio.samples = samples;
            audio.sampleRate = sampleRate;
            audio.channels = channels;
            audio.duration = (float) totalSamples / (sampleRate * channels);
            ensureStereo(audio);
            audio.framesReady.set(audio.samples.length / 2);
            audio.complete = true;
            return audio;
        } catch (Exception e) {
            Log.w(TAG, "Cache read failed, re-decoding", e);
            //noinspection ResultOfMethodCallIgnored
            file.delete();
            return null;
        }
    }

    private static void writeCache(File file, DecodedAudio audio) throws IOException {
        int totalSamples = audio.framesReady.get() * Math.max(1, audio.channels);
        if (totalSamples <= 0) totalSamples = audio.samples.length;
        totalSamples = Math.min(totalSamples, audio.samples.length);
        File tmp = new File(file.getAbsolutePath() + ".tmp");
        try (DataOutputStream out = new DataOutputStream(new FileOutputStream(tmp))) {
            out.writeBytes(CACHE_MAGIC);
            out.writeInt(CACHE_VERSION);
            out.writeInt(audio.sampleRate);
            out.writeInt(audio.channels);
            out.writeInt(totalSamples);

            byte[] buf = new byte[Math.min(totalSamples * 2, 256 * 1024)];
            int offset = 0;
            while (offset < totalSamples) {
                int count = Math.min(totalSamples - offset, buf.length / 2);
                ByteBuffer.wrap(buf).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
                        .put(audio.samples, offset, count);
                out.write(buf, 0, count * 2);
                offset += count;
            }
            out.flush();
        }
        if (!tmp.renameTo(file)) {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
            if (!tmp.renameTo(file)) {
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
                throw new IOException("Failed to publish cache file");
            }
        }
    }
}
