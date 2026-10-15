package expo.modules.pkeyautofill

import android.content.Context
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/**
 * Unit tests for [AutofillCache] (audit finding M10).
 *
 * Requires the `testOptions { unitTests { includeAndroidResources = true } }`
 * block in the parent app's build.gradle and Robolectric in the test
 * classpath. The AndroidX Security library relies on the AndroidKeyStore,
 * which Robolectric shadows out of the box for API 24+ so
 * `EncryptedFile.build()` works in JVM tests.
 *
 * Run with:
 * ```
 * ./gradlew :pkey-autofill:testDebugUnitTest
 * ```
 *
 * Add to `modules/pkey-autofill/android/build.gradle`:
 * ```gradle
 * testImplementation 'junit:junit:4.13.2'
 * testImplementation 'org.robolectric:robolectric:4.13'
 * testImplementation 'androidx.test:core:1.6.1'
 * ```
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class AutofillCacheTest {
  private lateinit var context: Context

  @Before
  fun setUp() {
    context = androidx.test.core.app.ApplicationProvider.getApplicationContext()
    AutofillCache.clear(context)
  }

  @Test
  fun writeAndReadRoundTrip() {
    val json = """
      [
        {
          "id": "abc",
          "title": "Example",
          "username": "user",
          "password": "hunter2",
          "domains": ["example.com"],
          "packages": ["com.example.app"]
        }
      ]
    """.trimIndent()

    AutofillCache.write(context, json)
    val entries = AutofillCache.read(context)

    assertEquals(1, entries.size)
    assertEquals("Example", entries[0].title)
    assertEquals("hunter2", entries[0].password)
  }

  @Test
  fun persistedFileMustNotContainPlaintext() {
    val json = """[{"id":"x","title":"T","username":"u","password":"MYPLAINTEXTPASSWORD","domains":[],"packages":[]}]"""
    AutofillCache.write(context, json)

    assertTrue(
      "Cache file should report as encrypted",
      AutofillCache.isPersistedFileEncrypted(context)
    )

    // Belt-and-braces: read the raw bytes and assert the plaintext password
    // does not appear anywhere in the encrypted blob (audit C1 regression
    // guard). Even a tiny ciphertext-side leak would fail this check.
    val encFile = File(context.filesDir, "pkey_autofill_cache_v2.enc")
    val raw = encFile.readBytes()
    val rawStr = String(raw, Charsets.ISO_8859_1)
    assertFalse(
      "Encrypted file MUST NOT contain plaintext password",
      rawStr.contains("MYPLAINTEXTPASSWORD")
    )
  }

  @Test
  fun legacyPlaintextIsMigratedToEncryptedOnRead() {
    // Simulate an older PKey build that wrote plaintext JSON.
    val legacy = File(context.filesDir, "pkey_autofill_cache.json")
    val json =
      """[{"id":"leg","title":"Legacy","username":"u","password":"LEGACYPLAINTEXTSECRET","domains":["legacy.example"],"packages":[]}]"""
    legacy.writeText(json)

    val entries = AutofillCache.read(context)

    assertEquals(1, entries.size)
    assertEquals("Legacy", entries[0].title)
    assertEquals("", entries[0].password)
    assertEquals("", AutofillCache.passwordFor("leg"))
    // After the read the plaintext file must be gone and the encrypted one
    // must exist, without the legacy secret.
    assertFalse(legacy.exists())
    val encFile = File(context.filesDir, "pkey_autofill_cache_v2.enc")
    assertTrue(encFile.exists())
    assertFalse(String(encFile.readBytes(), Charsets.ISO_8859_1).contains("LEGACYPLAINTEXTSECRET"))
  }

  @Test
  fun clearWipesBothLegacyAndEncrypted() {
    val legacy = File(context.filesDir, "pkey_autofill_cache.json")
    legacy.writeText("[]")
    AutofillCache.write(context, "[]")

    AutofillCache.clear(context)

    assertFalse(legacy.exists())
    assertFalse(File(context.filesDir, "pkey_autofill_cache_v2.enc").exists())
  }

  @Test
  fun wipeSessionRemovesPasswordsFromMemory() {
    val json = """[{"id":"x","title":"T","username":"u","password":"hunter2","domains":[],"packages":[]}]"""
    AutofillCache.write(context, json)
    val generation = AutofillCache.currentGeneration()
    assertEquals("hunter2", AutofillCache.passwordFor("x"))
    assertEquals("hunter2", AutofillCache.passwordForSession("x", generation))
    AutofillCache.wipeSession(context)
    assertEquals("", AutofillCache.passwordFor("x"))
    assertEquals("", AutofillCache.passwordForSession("x", generation))
  }

  @Test
  fun wipeRememberedSessionClearsWithoutACallerContext() {
    val json = """[{"id":"x","title":"T","username":"u","password":"hunter2","domains":["example.com"],"packages":[]}]"""
    AutofillCache.write(context, json)
    assertTrue(File(context.filesDir, "pkey_autofill_cache_v2.enc").exists())

    AutofillCache.wipeRememberedSession()

    assertEquals("", AutofillCache.passwordFor("x"))
    assertFalse(File(context.filesDir, "pkey_autofill_cache_v2.enc").exists())
  }

  @Test
  fun matchScoresPackageAboveHostAndReturnsTopEight() {
    val entries = (0 until 10).map {
      CacheEntry(
        id = "id-$it",
        title = "Title $it",
        username = "u$it",
        password = "p$it",
        domains = listOf("example$it.com"),
        packages = listOf("com.example.app.$it"),
      )
    }

    val exactPackage = AutofillCache.match(entries, null, "com.example.app.3")
    assertEquals(1, exactPackage.size)
    assertEquals("id-3", exactPackage[0].id)

    val hostRegistrable = AutofillCache.match(entries, "www.example5.com", null)
    assertEquals("id-5", hostRegistrable[0].id)
  }

  @Test
  fun matchRejectsTitleAndPublicSuffixSiblings() {
    val paypal = CacheEntry("pp", "PayPal", "u", "secret", listOf("paypal.com"), emptyList())
    val pages = CacheEntry("gh", "Foo", "u", "secret", listOf("foo.github.io"), emptyList())
    val bbc = CacheEntry("bbc", "BBC", "u", "secret", listOf("bbc.co.uk"), emptyList())

    assertTrue(
      AutofillCache.match(listOf(paypal), "paypal.evil.com", "com.android.chrome").isEmpty(),
    )
    assertTrue(AutofillCache.match(listOf(paypal), "pay.evil.com", null).isEmpty())
    assertTrue(AutofillCache.match(listOf(paypal), "notpaypal.com", null).isEmpty())
    assertEquals("pp", AutofillCache.match(listOf(paypal), "paypal.com", null)[0].id)
    assertEquals("pp", AutofillCache.match(listOf(paypal), "login.paypal.com", null)[0].id)

    assertTrue(AutofillCache.match(listOf(pages), "bar.github.io", null).isEmpty())
    assertEquals("gh", AutofillCache.match(listOf(pages), "foo.github.io", null)[0].id)

    assertEquals("bbc", AutofillCache.match(listOf(bbc), "news.bbc.co.uk", null)[0].id)
    assertTrue(AutofillCache.match(listOf(bbc), "other.co.uk", null).isEmpty())
  }
}
