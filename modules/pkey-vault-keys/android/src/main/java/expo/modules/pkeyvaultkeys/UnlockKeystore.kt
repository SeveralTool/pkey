package expo.modules.pkeyvaultkeys

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * AES-256-GCM unlock blob sealed by an AndroidKeyStore key that requires
 * BIOMETRIC_STRONG for every encrypt/decrypt (no validity window).
 */
object UnlockKeystore {
  private const val ANDROID_KEYSTORE = "AndroidKeyStore"
  private const val BUNDLE_ALIAS = "pkey_unlock_bundle_v3"
  private const val DEVICE_SECRET_ALIAS = "pkey_device_secret_v1"
  private const val BUNDLE_FILE = "pkey_unlock_bundle_v3.bin"
  private const val DEVICE_SECRET_FILE = "pkey_device_secret_v1.bin"
  private const val GCM_TAG_BITS = 128

  fun hasBlob(filesDir: File, fileName: String): Boolean = File(filesDir, fileName).exists()

  fun hasUnlockBundle(filesDir: File): Boolean = hasBlob(filesDir, BUNDLE_FILE)

  fun hasDeviceSecret(filesDir: File): Boolean = hasBlob(filesDir, DEVICE_SECRET_FILE)

  fun clearUnlockBundle(filesDir: File) {
    File(filesDir, BUNDLE_FILE).delete()
    deleteKey(BUNDLE_ALIAS)
  }

  fun clearDeviceSecret(filesDir: File) {
    File(filesDir, DEVICE_SECRET_FILE).delete()
    deleteKey(DEVICE_SECRET_ALIAS)
  }

  fun hardwareKind(): String {
    return try {
      val key = getOrCreateKey(BUNDLE_ALIAS, allowCreate = false) ?: return "none"
      val factory = javax.crypto.SecretKeyFactory.getInstance(key.algorithm, ANDROID_KEYSTORE)
      val info =
        factory.getKeySpec(key, android.security.keystore.KeyInfo::class.java)
          as android.security.keystore.KeyInfo
      when {
        Build.VERSION.SDK_INT >= 31 && info.securityLevel == KeyProperties.SECURITY_LEVEL_STRONGBOX ->
          "strongbox"
        info.isInsideSecureHardware -> "tee"
        else -> "none"
      }
    } catch (_: Exception) {
      "none"
    }
  }

  fun store(
    activity: FragmentActivity,
    filesDir: File,
    plaintext: ByteArray,
    promptTitle: String,
    deviceSecret: Boolean,
    onDone: (Result<Unit>) -> Unit,
  ) {
    val alias = if (deviceSecret) DEVICE_SECRET_ALIAS else BUNDLE_ALIAS
    val fileName = if (deviceSecret) DEVICE_SECRET_FILE else BUNDLE_FILE
    try {
      val key = getOrCreateKey(alias, allowCreate = true) ?: error("keystore key missing")
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, key)
      authenticate(activity, promptTitle, cipher) { result ->
        result.fold(
          onSuccess = { unlocked ->
            try {
              val ciphertext = unlocked.doFinal(plaintext)
              val packed = unlocked.iv + ciphertext
              File(filesDir, fileName).writeBytes(packed)
              onDone(Result.success(Unit))
            } catch (e: Exception) {
              onDone(Result.failure(e))
            }
          },
          onFailure = { onDone(Result.failure(it)) },
        )
      }
    } catch (e: Exception) {
      onDone(Result.failure(e))
    }
  }

  fun load(
    activity: FragmentActivity,
    filesDir: File,
    promptTitle: String,
    deviceSecret: Boolean,
    onDone: (Result<ByteArray>) -> Unit,
  ) {
    val alias = if (deviceSecret) DEVICE_SECRET_ALIAS else BUNDLE_ALIAS
    val fileName = if (deviceSecret) DEVICE_SECRET_FILE else BUNDLE_FILE
    val blob = File(filesDir, fileName)
    if (!blob.exists()) {
      onDone(Result.failure(IllegalStateException("missing")))
      return
    }
    try {
      val packed = blob.readBytes()
      if (packed.size < 13) {
        onDone(Result.failure(IllegalStateException("short")))
        return
      }
      val iv = packed.copyOfRange(0, 12)
      val ciphertext = packed.copyOfRange(12, packed.size)
      val key = getOrCreateKey(alias, allowCreate = false) ?: error("keystore key missing")
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_BITS, iv))
      authenticate(activity, promptTitle, cipher) { result ->
        result.fold(
          onSuccess = { unlocked ->
            try {
              onDone(Result.success(unlocked.doFinal(ciphertext)))
            } catch (e: KeyPermanentlyInvalidatedException) {
              clearUnlockBundle(filesDir)
              if (deviceSecret) clearDeviceSecret(filesDir)
              onDone(Result.failure(e))
            } catch (e: Exception) {
              onDone(Result.failure(e))
            }
          },
          onFailure = { onDone(Result.failure(it)) },
        )
      }
    } catch (e: KeyPermanentlyInvalidatedException) {
      if (deviceSecret) clearDeviceSecret(filesDir) else clearUnlockBundle(filesDir)
      onDone(Result.failure(e))
    } catch (e: Exception) {
      onDone(Result.failure(e))
    }
  }

  /**
   * JVM test helper: creating a cipher for decrypt without a CryptoObject auth
   * must fail on a user-auth key (UserNotAuthenticatedException).
   */
  fun decryptWithoutAuthMustFail(filesDir: File): Boolean {
    val blob = File(filesDir, BUNDLE_FILE)
    if (!blob.exists()) return true
    return try {
      val packed = blob.readBytes()
      val iv = packed.copyOfRange(0, 12)
      val ciphertext = packed.copyOfRange(12, packed.size)
      val key = getOrCreateKey(BUNDLE_ALIAS, allowCreate = false) ?: return true
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_BITS, iv))
      cipher.doFinal(ciphertext)
      false
    } catch (_: Exception) {
      true
    }
  }

  internal class UserCanceledException(message: String) : Exception(message)

  internal fun isBiometricCanceled(errorCode: Int): Boolean =
    errorCode == BiometricPrompt.ERROR_USER_CANCELED ||
      errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON ||
      errorCode == BiometricPrompt.ERROR_CANCELED

  private fun authenticate(
    activity: FragmentActivity,
    promptTitle: String,
    cipher: Cipher,
    onDone: (Result<Cipher>) -> Unit,
  ) {
    activity.runOnUiThread {
      val executor = ContextCompat.getMainExecutor(activity)
      val prompt = BiometricPrompt(
        activity,
        executor,
        object : BiometricPrompt.AuthenticationCallback() {
          override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
            val unlocked = result.cryptoObject?.cipher
            if (unlocked == null) {
              onDone(Result.failure(IllegalStateException("no crypto object")))
            } else {
              onDone(Result.success(unlocked))
            }
          }

          override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
            val message = errString.toString()
            onDone(
              Result.failure(
                if (isBiometricCanceled(errorCode)) UserCanceledException(message)
                else IllegalStateException(message),
              ),
            )
          }

          override fun onAuthenticationFailed() {
            // Keep waiting for another attempt; error callback handles cancel.
          }
        },
      )
      val info = BiometricPrompt.PromptInfo.Builder()
        .setTitle(promptTitle)
        .setNegativeButtonText("Cancel")
        .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
        .build()
      prompt.authenticate(info, BiometricPrompt.CryptoObject(cipher))
    }
  }

  private fun getOrCreateKey(alias: String, allowCreate: Boolean): SecretKey? {
    val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
    val existing = ks.getKey(alias, null) as? SecretKey
    if (existing != null) return existing
    if (!allowCreate) return null
    val purposes = KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
    val builder = KeyGenParameterSpec.Builder(alias, purposes)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256)
      .setUserAuthenticationRequired(true)
      .setInvalidatedByBiometricEnrollment(true)
      .setRandomizedEncryptionRequired(true)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
    } else {
      @Suppress("DEPRECATION")
      builder.setUserAuthenticationValidityDurationSeconds(-1)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      try {
        builder.setIsStrongBoxBacked(true)
      } catch (_: Exception) {
        // StrongBox unavailable — fall through to TEE.
      }
    }
    val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
    try {
      gen.init(builder.build())
      return gen.generateKey()
    } catch (_: Exception) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        val tee = KeyGenParameterSpec.Builder(alias, purposes)
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          .setKeySize(256)
          .setUserAuthenticationRequired(true)
          .setInvalidatedByBiometricEnrollment(true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          tee.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
        }
        gen.init(tee.build())
        return gen.generateKey()
      }
      throw IllegalStateException("cannot create user-auth AES key")
    }
  }

  private fun deleteKey(alias: String) {
    try {
      val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
      if (ks.containsAlias(alias)) ks.deleteEntry(alias)
    } catch (_: Exception) {
    }
  }

  fun utf8(bytes: ByteArray): String = String(bytes, Charsets.UTF_8)

  fun fromUtf8(text: String): ByteArray = text.toByteArray(Charsets.UTF_8)

  fun hexToBytes(hex: String): ByteArray {
    val clean = hex.lowercase()
    require(clean.length % 2 == 0)
    return ByteArray(clean.length / 2) { i ->
      clean.substring(i * 2, i * 2 + 2).toInt(16).toByte()
    }
  }

  fun bytesToHex(bytes: ByteArray): String {
    val out = StringBuilder(bytes.size * 2)
    for (b in bytes) out.append(String.format("%02x", b))
    return out.toString()
  }

  fun b64(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.NO_WRAP)
}
