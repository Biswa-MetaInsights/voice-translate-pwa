package eu.voicetranslator.app;

import static org.junit.Assert.*;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Installed-app smoke test. No microphone permission, real audio or cloud calls. */
@RunWith(AndroidJUnit4.class)
public class StartupConsentTest {
    private String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        CountDownLatch resultReady = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            result.set(value); resultReady.countDown();
        }));
        assertTrue("WebView evaluation timed out", resultReady.await(10, TimeUnit.SECONDS));
        return result.get();
    }
    @Test public void opensBundledAppAndRequiresAgreementBeforeCapture() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            long deadline = SystemClock.elapsedRealtime() + 30_000;
            boolean ready = false;
            while (SystemClock.elapsedRealtime() < deadline) {
                ready = "true".equals(evaluate(scenario, "Boolean(document.querySelector('.mobile-tabs') && document.getElementById('mic') && document.getElementById('personOneLanguage')?.options.length > 0)"));
                if (ready) break;
                Thread.sleep(200);
            }
            assertTrue("Bundled mobile UI did not start", ready);
            assertEquals("true", evaluate(scenario,
                "sessionStorage.removeItem('vt-processing-notice'); document.getElementById('mic').click(); Boolean(document.querySelector('dialog[open]') && !document.getElementById('mic').classList.contains('listening'))"));
            assertEquals("true", evaluate(scenario,
                "Array.from(document.querySelector('dialog').querySelectorAll('button')).find(b => b.textContent === 'Cancel').click(); !document.querySelector('dialog[open]') && !document.getElementById('mic').classList.contains('listening')"));
            assertEquals("true", evaluate(scenario,
                "Array.from(document.querySelector('.mobile-support').querySelectorAll('button')).find(b => b.textContent === 'Report a problem').click(); Boolean(document.querySelector('dialog[open] textarea')?.disabled)"));
        }
    }
}
