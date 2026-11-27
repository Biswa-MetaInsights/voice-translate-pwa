package eu.voicetranslator.app;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Run on an emulator/device with connectedDebugAndroidTest. Not a WhatsApp test. */
@RunWith(AndroidJUnit4.class)
public class ShareRegistrationTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    @Test public void receivesSupportedAudioTypes() {
        for (String type : new String[]{"audio/ogg", "audio/mp4", "audio/mpeg", "audio/opus", "application/ogg"}) {
            Intent intent = new Intent(Intent.ACTION_SEND).setType(type).setPackage(context.getPackageName());
            ResolveInfo result = context.getPackageManager().resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY);
            assertNotNull("Share receiver missing for " + type, result);
            assertEquals("eu.voicetranslator.app.MainActivity", result.activityInfo.name);
        }
    }
    @Test public void doesNotRegisterForUnrelatedContent() {
        Intent intent = new Intent(Intent.ACTION_SEND).setType("text/plain").setPackage(context.getPackageName());
        assertNull(context.getPackageManager().resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY));
    }
    @Test public void requestsMicrophoneWithoutBroadStorageOrContactAccess() throws Exception {
        PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), PackageManager.GET_PERMISSIONS);
        List<String> permissions = Arrays.asList(info.requestedPermissions);
        assertTrue(permissions.contains("android.permission.RECORD_AUDIO"));
        assertFalse(permissions.contains("android.permission.MANAGE_EXTERNAL_STORAGE"));
        assertFalse(permissions.contains("android.permission.READ_CONTACTS"));
    }
}
