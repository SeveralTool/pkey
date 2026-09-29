package expo.modules.pkeyvaultkeys

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class RootDetectorTest {
  @Test
  fun inspectReturnsStructuredSignals() {
    val context = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.content.Context>()
    val (compromised, signals) = RootDetector.inspect(context)
    if (compromised) {
      assertTrue(signals.isNotEmpty())
    } else {
      assertTrue(signals.isEmpty())
    }
  }

  @Test
  fun decryptWithoutAuthFailsWhenBlobMissing() {
    val context = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.content.Context>()
    assertTrue(UnlockKeystore.decryptWithoutAuthMustFail(context.filesDir))
    assertFalse(UnlockKeystore.hasUnlockBundle(context.filesDir))
  }

  @Test
  fun userDismissedBiometricIsCanceled() {
    assertTrue(UnlockKeystore.isBiometricCanceled(androidx.biometric.BiometricPrompt.ERROR_USER_CANCELED))
    assertTrue(UnlockKeystore.isBiometricCanceled(androidx.biometric.BiometricPrompt.ERROR_NEGATIVE_BUTTON))
    assertTrue(UnlockKeystore.isBiometricCanceled(androidx.biometric.BiometricPrompt.ERROR_CANCELED))
    assertFalse(UnlockKeystore.isBiometricCanceled(androidx.biometric.BiometricPrompt.ERROR_LOCKOUT))
  }
}
