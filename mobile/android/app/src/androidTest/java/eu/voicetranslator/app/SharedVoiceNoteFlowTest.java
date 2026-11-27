package eu.voicetranslator.app;

import static org.junit.Assert.*;

import android.app.Activity;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.SystemClock;
import android.util.Base64;
import android.view.MotionEvent;
import androidx.core.content.FileProvider;
import androidx.test.runner.lifecycle.ActivityLifecycleCallback;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Real installed-app/ContentResolver tests with synthetic silence only.
 * This does not install WhatsApp, authenticate to Meta, or evaluate speech accuracy.
 * The two service responses below are explicitly simulated inside the test WebView.
 */
@RunWith(AndroidJUnit4.class)
public class SharedVoiceNoteFlowTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final File fixtures = new File(context.getCacheDir(), "voice-translator-exports/simulator-fixtures");

    /** Tracks lifecycle by class, because consuming ACTION_SEND intentionally changes
     * its action to ACTION_MAIN. ActivityScenario matches the original action and
     * consequently cannot track this privacy-preserving cold-share lifecycle. */
    private static final class SharedActivity implements AutoCloseable {
        private final AtomicReference<MainActivity> current = new AtomicReference<>();
        private final AtomicReference<CountDownLatch> resumed = new AtomicReference<>(new CountDownLatch(1));
        private final AtomicReference<CountDownLatch> destroyed = new AtomicReference<>();
        private final ActivityLifecycleCallback observer = (Activity activity, Stage stage) -> {
            if (!(activity instanceof MainActivity)) return;
            if (stage == Stage.RESUMED) {
                current.set((MainActivity) activity);
                CountDownLatch signal = resumed.get();
                if (signal != null) signal.countDown();
            } else if (stage == Stage.DESTROYED) {
                current.compareAndSet((MainActivity) activity, null);
                CountDownLatch signal = destroyed.get();
                if (signal != null) signal.countDown();
            }
        };

        static SharedActivity launch(Class<MainActivity> type) throws Exception {
            Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
            return launch(new Intent(target, type).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }

        static SharedActivity launch(Intent intent) throws Exception {
            SharedActivity tracked = new SharedActivity();
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                ActivityLifecycleMonitorRegistry.getInstance().addLifecycleCallback(tracked.observer));
            try {
                InstrumentationRegistry.getInstrumentation().getTargetContext().startActivity(intent);
                assertTrue("Shared activity did not resume", tracked.resumed.get().await(30, TimeUnit.SECONDS));
                InstrumentationRegistry.getInstrumentation().waitForIdleSync();
                return tracked;
            } catch (Exception | AssertionError failure) {
                tracked.close();
                throw failure;
            }
        }

        void onActivity(Consumer<MainActivity> action) {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                MainActivity activity = current.get();
                assertNotNull("Shared activity is unavailable", activity);
                action.accept(activity);
            });
        }

        void recreate() throws Exception {
            CountDownLatch next = new CountDownLatch(1);
            resumed.set(next);
            onActivity(MainActivity::recreate);
            assertTrue("Recreated shared activity did not resume", next.await(30, TimeUnit.SECONDS));
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        }

        @Override public void close() throws Exception {
            CountDownLatch stopped = new CountDownLatch(1);
            destroyed.set(stopped);
            boolean hadActivity = current.get() != null;
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                MainActivity activity = current.get();
                if (activity != null) activity.finish();
            });
            if (hadActivity) stopped.await(10, TimeUnit.SECONDS);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                ActivityLifecycleMonitorRegistry.getInstance().removeLifecycleCallback(observer));
        }
    }

    private byte[] wav() {
        int samples = 4_000; // 250 ms of mono 16 kHz PCM silence; no personal audio.
        ByteBuffer b = ByteBuffer.allocate(44 + samples * 2).order(ByteOrder.LITTLE_ENDIAN);
        b.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(36 + samples * 2);
        b.put("WAVEfmt ".getBytes(StandardCharsets.US_ASCII)).putInt(16).putShort((short) 1);
        b.putShort((short) 1).putInt(16_000).putInt(32_000).putShort((short) 2).putShort((short) 16);
        b.put("data".getBytes(StandardCharsets.US_ASCII)).putInt(samples * 2);
        return b.array();
    }

    private byte[] opus() {
        // FFmpeg-generated 250 ms mono silence, real OGG/Opus container.
        return Base64.decode("T2dnUwACAAAAAAAAAABTg2ADAAAAANqIdnsBE09wdXNIZWFkAQE4AYA+AAAAAABPZ2dTAAAAAAAAAAAAAFODYAMBAAAA/EryfgE9T3B1c1RhZ3MMAAAATGF2ZjYxLjcuMTAzAQAAAB0AAABlbmNvZGVyPUxhdmM2MS4xOS4xMDEgbGlib3B1c09nZ1MABBgwAAAAAAAAU4NgAwIAAACgdiXBDQgJCAgICAgICAgICAhIC+TBNuzFgEgHyXIn4UTqUEgHyXnIyVfASAfJecjJV8BIB8l5yMlXwEgHyXnIyVfASAfJecjJV8BIB8l5yMlXwEgHyXnIyVfASAfJecjJV8BIB8l5yMlXwEgHyXnIyVfASAfJecjJV8A=", Base64.NO_WRAP);
    }

    private Uri file(String name, byte[] bytes) throws Exception {
        assertTrue(fixtures.isDirectory() || fixtures.mkdirs());
        File selected = new File(fixtures, name);
        try (FileOutputStream out = new FileOutputStream(selected)) { out.write(bytes); }
        return FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", selected);
    }

    private Intent share(Uri uri) {
        Intent intent = new Intent(context, MainActivity.class).setAction(Intent.ACTION_SEND).setType("audio/wav")
            .putExtra(Intent.EXTRA_STREAM, uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.setClipData(ClipData.newRawUri("Synthetic test note", uri));
        return intent;
    }

    private String evaluate(SharedActivity scenario, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            result.set(value); done.countDown();
        }));
        assertTrue("WebView evaluation timed out", done.await(10, TimeUnit.SECONDS));
        return result.get();
    }

    private void await(SharedActivity scenario, String message, String condition) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 30_000;
        while (SystemClock.elapsedRealtime() < deadline) {
            if ("true".equals(evaluate(scenario, "Boolean(" + condition + ")"))) return;
            Thread.sleep(100);
        }
        screenshot("failure-" + Integer.toUnsignedString(message.hashCode()));
        fail(message);
    }

    private void selected(SharedActivity scenario, int bytes) throws Exception {
        await(scenario, "Shared audio did not reach the ready note screen",
            "document.getElementById('voiceNoteFile')?.files[0]?.size === " + bytes +
            " && document.getElementById('voiceNoteStatus')?.textContent.startsWith('Ready.')");
        assertEquals("true", evaluate(scenario,
            "document.getElementById('translateNote').disabled && !document.getElementById('voiceNoteConsent').checked && document.getElementById('noteResults').hidden"));
        // The product correctly uses preload=none. Explicitly request decoding
        // of this local blob; selecting a note must not auto-play or upload it.
        assertEquals("true", evaluate(scenario,
            "(() => { const audio = document.getElementById('originalNoteAudio'); audio.preload = 'metadata'; audio.load(); return true; })()"));
        await(scenario, "Synthetic audio did not decode in the installed WebView",
            "document.getElementById('originalNoteAudio')?.readyState >= 1 && document.getElementById('originalNoteAudio').duration > 0.20 && document.getElementById('originalNoteAudio').duration < 0.35");
    }

    private void tap(SharedActivity scenario, String id) throws Exception {
        JSONObject point = new JSONObject(evaluate(scenario,
            "(() => { const e = document.getElementById(" + JSONObject.quote(id) + "); e.scrollIntoView({block:'center',behavior:'instant'}); const r = e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,width:innerWidth}; })()"));
        int[] bounds = new int[3];
        scenario.onActivity(activity -> {
            activity.getBridge().getWebView().getLocationOnScreen(bounds);
            bounds[2] = activity.getBridge().getWebView().getWidth();
        });
        float scale = (float) (bounds[2] / point.getDouble("width"));
        float x = bounds[0] + (float) point.getDouble("x") * scale;
        float y = bounds[1] + (float) point.getDouble("y") * scale;
        long time = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(time, time, MotionEvent.ACTION_DOWN, x, y, 0);
        MotionEvent up = MotionEvent.obtain(time, time + 50, MotionEvent.ACTION_UP, x, y, 0);
        try {
            InstrumentationRegistry.getInstrumentation().sendPointerSync(down);
            InstrumentationRegistry.getInstrumentation().sendPointerSync(up);
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        } finally { down.recycle(); up.recycle(); }
    }

    private void screenshot(String name) throws Exception {
        File dir = new File(context.getExternalFilesDir(null), "simulator-evidence");
        assertTrue(dir.isDirectory() || dir.mkdirs());
        Bitmap image = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull("Emulator screenshot unavailable", image);
        try (FileOutputStream out = new FileOutputStream(new File(dir, name + ".png"))) {
            assertTrue(image.compress(Bitmap.CompressFormat.PNG, 100, out));
        } finally { image.recycle(); }
    }

    @After public void removeSyntheticAudio() {
        File[] files = fixtures.listFiles();
        if (files != null) for (File f : files) assertTrue("Synthetic fixture cleanup failed", f.delete());
        if (fixtures.exists()) assertTrue(fixtures.delete());
    }

    @Test public void coldShareDecodesWavRequiresConsentAndClears() throws Exception {
        byte[] audio = wav();
        try (SharedActivity scenario = SharedActivity.launch(share(file("cold.wav", audio)))) {
            selected(scenario, audio.length);
            screenshot("01-shared-note-awaiting-consent");
            tap(scenario, "voiceNoteConsent");
            await(scenario, "Consent did not enable translation", "!document.getElementById('translateNote').disabled");
            // Selecting and agreeing never starts translation automatically.
            assertEquals("true", evaluate(scenario, "document.getElementById('noteResults').hidden && document.getElementById('cancelNote').hidden"));
            tap(scenario, "clearNote");
            await(scenario, "Clear left shared data available",
                "document.getElementById('voiceNoteFile').files.length === 0 && document.getElementById('clearNote').disabled && !document.getElementById('originalNoteAudio').hasAttribute('src') && document.getElementById('translateNote').disabled && !document.getElementById('voiceNoteConsent').checked");
        }
    }

    @Test public void warmShareNavigatesFromSpeakAndSecondOpusNoteResetsConsent() throws Exception {
        try (SharedActivity scenario = SharedActivity.launch(MainActivity.class)) {
            await(scenario, "Speak screen did not initialize", "document.getElementById('personOneLanguage')?.options.length > 0");
            context.startActivity(share(file("first.wav", wav())));
            selected(scenario, wav().length);
            tap(scenario, "voiceNoteConsent");
            await(scenario, "First consent was not applied", "document.getElementById('voiceNoteConsent').checked");
            context.startActivity(share(file("second.opus", opus())).setType("audio/ogg"));
            selected(scenario, opus().length);
            assertEquals("true", evaluate(scenario, "document.getElementById('voiceNoteFile').files[0].type === 'audio/ogg'"));
            screenshot("02-second-opus-note");
        }
    }

    @Test public void spoofedAudioIsRejectedByItsBytes() throws Exception {
        byte[] invalid = "<html>This is not an audio note; the MIME type must not be trusted.</html>".getBytes(StandardCharsets.UTF_8);
        try (SharedActivity scenario = SharedActivity.launch(share(file("spoofed.wav", invalid)))) {
            await(scenario, "Spoofed media did not show the safe fallback",
                "document.getElementById('voiceNoteStatus')?.textContent.startsWith('Direct sharing is unavailable.') && document.getElementById('translateNote').disabled");
            assertEquals("true", evaluate(scenario, "document.getElementById('noteResults').hidden && document.getElementById('originalNoteAudio').hidden"));
            screenshot("03-unsupported-note-fallback");
        }
    }

    @Test public void oversizedAudioIsRejectedBeforeFileSelection() throws Exception {
        byte[] huge = new byte[4_000_001];
        System.arraycopy(wav(), 0, huge, 0, 44);
        try (SharedActivity scenario = SharedActivity.launch(share(file("oversized.wav", huge)))) {
            await(scenario, "Oversized media was not rejected",
                "document.getElementById('voiceNoteStatus')?.textContent.startsWith('Direct sharing is unavailable.') && document.getElementById('voiceNoteFile').files.length === 0 && document.getElementById('translateNote').disabled");
        }
    }

    @Test public void multipleAttachmentsAreRejected() throws Exception {
        Uri one = file("one.wav", wav()), two = file("two.wav", wav());
        Intent intent = share(one);
        intent.getClipData().addItem(new ClipData.Item(two));
        try (SharedActivity scenario = SharedActivity.launch(intent)) {
            await(scenario, "Multiple attachments were accepted",
                "document.getElementById('voiceNoteStatus')?.textContent.startsWith('Direct sharing is unavailable.') && document.getElementById('voiceNoteFile').files.length === 0");
        }
    }

    @Test public void externalUrlIsNotDownloadedAsSharedMedia() throws Exception {
        try (SharedActivity scenario = SharedActivity.launch(share(Uri.parse("https://example.invalid/private-note.wav")))) {
            await(scenario, "An external URL was not rejected",
                "document.getElementById('voiceNoteStatus')?.textContent.startsWith('Direct sharing is unavailable.') && document.getElementById('voiceNoteFile').files.length === 0");
        }
    }

    @Test public void recreationDoesNotReimportConsumedAudio() throws Exception {
        try (SharedActivity scenario = SharedActivity.launch(share(file("restart.wav", wav())))) {
            selected(scenario, wav().length);
            scenario.recreate();
            await(scenario, "Recreated mobile UI did not start", "document.querySelector('.mobile-tabs')");
            assertEquals("true", evaluate(scenario,
                "!document.getElementById('voiceNoteFile')?.files.length && !document.getElementById('originalNoteAudio')?.getAttribute('src') && !document.getElementById('noteTranslation')?.textContent"));
        }
    }

    @Test public void simulatedServiceFailureAndCancellationNeverInventTranslation() throws Exception {
        try (SharedActivity scenario = SharedActivity.launch(share(file("errors.wav", wav())))) {
            selected(scenario, wav().length);
            assertEquals("true", evaluate(scenario, "window.__testCalls = 0; window.fetch = async () => { window.__testCalls++; return new Response(JSON.stringify({error:'Test service unavailable. Try again later.'}), {status:503,headers:{'Content-Type':'application/json'}}); }; true"));
            tap(scenario, "translateNote");
            assertEquals("0", evaluate(scenario, "window.__testCalls"));
            tap(scenario, "voiceNoteConsent");
            await(scenario, "Consent did not enable Translate", "!document.getElementById('translateNote').disabled");
            tap(scenario, "translateNote");
            await(scenario, "Service failure did not recover safely",
                "document.getElementById('voiceNoteStatus').textContent === 'Test service unavailable. Try again later.' && !document.getElementById('translateNote').disabled");
            assertEquals("true", evaluate(scenario, "window.__testCalls === 1 && document.getElementById('noteResults').hidden && !document.getElementById('noteTranslation').textContent"));
            screenshot("04-simulated-service-failure");
            assertEquals("true", evaluate(scenario, "window.fetch = (input, options) => new Promise((resolve, reject) => { window.__testCalls++; options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled','AbortError')), {once:true}); }); true"));
            tap(scenario, "translateNote");
            await(scenario, "Pending request did not show Cancel", "!document.getElementById('cancelNote').hidden && document.getElementById('translateNote').disabled && window.__testCalls === 2");
            tap(scenario, "cancelNote");
            await(scenario, "Cancellation left a request or stale translation visible",
                "document.getElementById('voiceNoteStatus').textContent.startsWith('Cancelled.') && document.getElementById('cancelNote').hidden && !document.getElementById('translateNote').disabled && document.getElementById('noteResults').hidden && !document.getElementById('noteTranslation').textContent");
        }
    }
}
