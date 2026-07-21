package com.earvana.tinnitusrelief;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
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
import java.util.ArrayList;

/**
 * Decodes MP3/AAC assets to 16-bit PCM for the custom loop/DSP player.
 * Uses a disk cache so repeat plays skip the expensive MediaCodec pass.
 */
public class AudioDecoder {
    private static final String TAG = "AudioDecoder";
    private static final long TIMEOUT_US = 10_000;
    private static final int CACHE_VERSION = 1;
    private static final String CACHE_MAGIC = "EVPCM001";

    public static class DecodedAudio {
        public short[] samples;
        public int sampleRate;
        public int channels;
        public float duration;
    }

    public static DecodedAudio decodeAsset(Context context, String path) throws IOException {
        return decodeAsset(context, path, null);
    }

    /**
     * @param cancelCheck optional; return true to abort (throws IOException "cancelled")
     */
    public static DecodedAudio decodeAsset(Context context, String path, CancelCheck cancelCheck) throws IOException {
        Log.d(TAG, "decodeAsset: " + path);
        checkCancelled(cancelCheck);

        ResolvedSource source = resolveSource(context, path);
        try {
            File cacheFile = cacheFileFor(context, source.cacheKey);
            DecodedAudio cached = readCache(cacheFile);
            if (cached != null) {
                Log.d(TAG, "Cache hit: " + cacheFile.getName()
                        + " (" + cached.samples.length + " samples, " + cached.duration + "s)");
                return cached;
            }

            checkCancelled(cancelCheck);
            DecodedAudio decoded = decodeFromExtractor(source, cancelCheck);

            // Write cache off the critical path so first play starts immediately.
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
            return decoded;
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

    private static DecodedAudio decodeFromExtractor(ResolvedSource source, CancelCheck cancelCheck) throws IOException {
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

        if (trackIndex < 0 || format == null) {
            throw new IOException("No audio track found");
        }

        extractor.selectTrack(trackIndex);

        int sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE);
        int channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
        long durationUs = format.containsKey(MediaFormat.KEY_DURATION)
                ? format.getLong(MediaFormat.KEY_DURATION) : 0;

        String mime = format.getString(MediaFormat.KEY_MIME);
        if (mime == null) throw new IOException("Missing audio mime type");

        MediaCodec decoder = MediaCodec.createDecoderByType(mime);
        decoder.configure(format, null, null, 0);
        decoder.start();

        short[] allSamples = null;
        int totalSamples = 0;
        ArrayList<short[]> chunkList = null;

        if (durationUs > 0) {
            // 2% headroom — nature loops often decode slightly past declared duration
            long estimated = (durationUs * (long) sampleRate / 1_000_000L) * channels;
            int capacity = (int) Math.min(Integer.MAX_VALUE - 8, estimated + estimated / 50 + 4096);
            allSamples = new short[capacity];
            Log.d(TAG, "Pre-allocated ~" + capacity + " samples");
        } else {
            chunkList = new ArrayList<>();
        }

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

                            if (allSamples != null) {
                                if (totalSamples + numShorts > allSamples.length) {
                                    int newLen = Math.max(allSamples.length * 2, totalSamples + numShorts);
                                    short[] grown = new short[newLen];
                                    System.arraycopy(allSamples, 0, grown, 0, totalSamples);
                                    allSamples = grown;
                                }
                                shortBuffer.get(allSamples, totalSamples, numShorts);
                            } else {
                                short[] chunk = new short[numShorts];
                                shortBuffer.get(chunk);
                                chunkList.add(chunk);
                            }
                            totalSamples += numShorts;
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
                    }
                    if (newFormat.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) {
                        channels = newFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
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

        if (allSamples == null) {
            allSamples = new short[totalSamples];
            int offset = 0;
            for (short[] chunk : chunkList) {
                System.arraycopy(chunk, 0, allSamples, offset, chunk.length);
                offset += chunk.length;
            }
        } else if (totalSamples < allSamples.length) {
            short[] trimmed = new short[totalSamples];
            System.arraycopy(allSamples, 0, trimmed, 0, totalSamples);
            allSamples = trimmed;
        }

        DecodedAudio decoded = new DecodedAudio();
        decoded.samples = allSamples;
        decoded.sampleRate = sampleRate;
        decoded.channels = Math.max(1, channels);
        decoded.duration = decoded.channels > 0
                ? (float) totalSamples / (sampleRate * decoded.channels)
                : 0f;

        Log.d(TAG, "Decode finished in " + (System.currentTimeMillis() - t0) + "ms: "
                + totalSamples + " samples (" + decoded.duration + "s) @ "
                + sampleRate + "Hz ch=" + decoded.channels);
        return decoded;
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
            if (!CACHE_MAGIC.equals(new String(magicBytes, "US-ASCII"))) return null;
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
            return audio;
        } catch (Exception e) {
            Log.w(TAG, "Cache read failed, re-decoding", e);
            //noinspection ResultOfMethodCallIgnored
            file.delete();
            return null;
        }
    }

    private static void writeCache(File file, DecodedAudio audio) throws IOException {
        File tmp = new File(file.getAbsolutePath() + ".tmp");
        try (DataOutputStream out = new DataOutputStream(new FileOutputStream(tmp))) {
            out.writeBytes(CACHE_MAGIC);
            out.writeInt(CACHE_VERSION);
            out.writeInt(audio.sampleRate);
            out.writeInt(audio.channels);
            out.writeInt(audio.samples.length);

            byte[] buf = new byte[Math.min(audio.samples.length * 2, 256 * 1024)];
            int offset = 0;
            while (offset < audio.samples.length) {
                int count = Math.min(audio.samples.length - offset, buf.length / 2);
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
