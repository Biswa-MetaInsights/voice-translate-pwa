package eu.voicetranslator.app;

import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.CancellationSignal;
import android.system.Os;
import android.system.OsConstants;
import android.system.StructPollfd;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** Receives one user-granted content URI. No paths, URLs, logs, or audio files are saved. */
@CapacitorPlugin(name = "VoiceNoteShare")
public class VoiceNoteSharePlugin extends Plugin {
    private static final int MAX = 4_000_000;
    private static final long TTL = 120_000;
    private final ExecutorService executor = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<Runnable>(1), new ThreadPoolExecutor.DiscardOldestPolicy());
    private final Handler main = new Handler(Looper.getMainLooper());
    private byte[] pendingAudio;
    private String pendingError;
    private long receivedAt;
    private int generation;
    private CancellationSignal currentRead;

    @Override public void load() { receive(getActivity().getIntent()); }
    @Override protected void handleOnNewIntent(Intent intent) { receive(intent); }

    private synchronized void clear() {
        if (pendingAudio != null) Arrays.fill(pendingAudio, (byte) 0);
        pendingAudio = null; pendingError = null;
    }
    private synchronized void expire() { if (SystemClock.elapsedRealtime() - receivedAt >= TTL) clear(); }
    private void receive(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        final int version;
        synchronized (this) { if (currentRead != null) currentRead.cancel(); clear(); version = ++generation; }
        // A cold-start Intent must not be consumed again on bridge recreation.
        Uri uri;
        try {
            Object value = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            uri = value instanceof Uri ? (Uri) value : null;
            if (intent.getClipData() != null && intent.getClipData().getItemCount() != 1) uri = null;
        } catch (RuntimeException error) { uri = null; }
        intent.removeExtra(Intent.EXTRA_STREAM); intent.setAction(Intent.ACTION_MAIN);
        final Uri selected = uri;
        executor.execute(() -> {
            byte[] audio = null;
            CancellationSignal cancellation = new CancellationSignal();
            synchronized (this) { if (version != generation) return; currentRead = cancellation; }
            Runnable timeout = () -> {
                cancellation.cancel();
                synchronized (this) {
                    if (version != generation) return;
                    pendingError = "The note could not be read in time. Save it to Files and try again.";
                    receivedAt = SystemClock.elapsedRealtime();
                }
                notifyListeners("shareAvailable", new JSObject(), true);
            };
            main.postDelayed(timeout, 10_000);
            try {
                if (selected == null || !"content".equals(selected.getScheme())) throw new IllegalArgumentException();
                long deadline = SystemClock.elapsedRealtime() + 10_000;
                try (AssetFileDescriptor descriptor = getContext().getContentResolver().openAssetFileDescriptor(selected, "r", cancellation)) {
                    if (descriptor == null || descriptor.getLength() > MAX) throw new IllegalArgumentException();
                    try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                        byte[] block = new byte[16_384]; int size = 0, n;
                        try {
                            if (descriptor.getStartOffset() != 0) throw new IllegalArgumentException();
                            long remaining = descriptor.getDeclaredLength();
                            StructPollfd poll = new StructPollfd(); poll.fd = descriptor.getFileDescriptor(); poll.events = (short) OsConstants.POLLIN;
                            while (true) {
                                if (remaining == 0) break;
                                cancellation.throwIfCanceled();
                                if (SystemClock.elapsedRealtime() > deadline) throw new IllegalArgumentException();
                                if (Os.poll(new StructPollfd[]{poll}, 250) == 0) continue;
                                int wanted = remaining < 0 ? block.length : (int) Math.min(block.length, remaining);
                                n = Os.read(poll.fd, block, 0, wanted);
                                if (n == 0) break;
                                if (remaining > 0) remaining -= n;
                                size += n;
                                if (size > MAX || SystemClock.elapsedRealtime() > deadline) throw new IllegalArgumentException();
                                output.write(block, 0, n);
                            }
                            audio = output.toByteArray();
                        } finally { Arrays.fill(block, (byte) 0); }
                    }
                }
                if (audio.length < 12) throw new IllegalArgumentException();
                // Web client and server independently sniff actual container bytes.
                synchronized (this) {
                    if (version != generation) { Arrays.fill(audio, (byte) 0); return; }
                    cancellation.throwIfCanceled(); pendingError = null; pendingAudio = audio; receivedAt = SystemClock.elapsedRealtime();
                }
            } catch (Exception error) {
                if (audio != null) Arrays.fill(audio, (byte) 0);
                synchronized (this) {
                    if (version != generation) return;
                    pendingError = "Select one supported audio note smaller than 4 MB.";
                    receivedAt = SystemClock.elapsedRealtime();
                }
            } finally {
                main.removeCallbacks(timeout);
                synchronized (this) { if (currentRead == cancellation) currentRead = null; }
            }
            main.post(() -> notifyListeners("shareAvailable", new JSObject(), true));
            main.postDelayed(() -> { synchronized (this) { if (version == generation) expire(); } }, TTL);
        });
    }
    @PluginMethod public synchronized void pending(PluginCall call) {
        expire(); JSObject value = new JSObject();
        value.put("available", pendingAudio != null); value.put("error", pendingError);
        call.resolve(value);
    }
    @PluginMethod public synchronized void consume(PluginCall call) {
        expire(); JSObject value = new JSObject();
        if (pendingAudio != null) value.put("base64", Base64.encodeToString(pendingAudio, Base64.NO_WRAP));
        if (pendingError != null) value.put("error", pendingError);
        clear(); call.resolve(value);
    }
    @Override protected synchronized void handleOnDestroy() {
        generation++; if (currentRead != null) currentRead.cancel(); clear(); main.removeCallbacksAndMessages(null); executor.shutdownNow();
    }
}
