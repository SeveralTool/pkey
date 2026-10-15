package expo.modules.pkeyautofill

import android.app.Activity
import android.content.Context
import android.util.Log
import androidx.security.crypto.EncryptedFile
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.charset.Charset
import java.util.Collections
import java.util.WeakHashMap
import java.util.concurrent.ConcurrentHashMap

data class CacheEntry(
  val id: String,
  val title: String,
  val username: String,
  val password: String,
  val domains: List<String>,
  val packages: List<String>,
)

/**
 * Session-bound autofill cache (audit M4).
 *
 * Passwords live only in this process's memory. Disk holds username / domains /
 * packages so the service can still present a dataset after a JS reload; the
 * secret is filled after [AutofillAuthActivity] biometric confirmation.
 * [wipeSession] runs on lock, logout, and BOOT_COMPLETED. It does not run from
 * [android.service.autofill.AutofillService.onDisconnected]: the framework
 * unbinds after the fill request and before the user confirms the dataset.
 */
object AutofillCache {
  private const val TAG = "PKeyAutofillCache"
  private const val ENC_FILE_NAME = "pkey_autofill_cache_v2.enc"
  private const val LEGACY_FILE_NAME = "pkey_autofill_cache.json"
  private const val KEY_ALIAS = "pkey_autofill_master_v1"

  /**
   * Multi-label public suffixes treated as the eTLD, not as a registrable
   * domain. Not a public-suffix list: just the suffixes whose last two labels
   * would otherwise collapse unrelated hosts.
   */
  private val MULTI_LABEL_PUBLIC_SUFFIXES = setOf(
    "github.io",
    "gitlab.io",
    "co.uk",
    "org.uk",
    "ac.uk",
    "com.au",
    "com.br",
    "com.ar",
    "co.jp",
  )

  private val sessionPasswords = ConcurrentHashMap<String, String>()
  private val sessionLock = Any()
  private var sessionGeneration = 0

  @Volatile
  private var rememberedApp: Context? = null

  private val authActivities: MutableSet<Activity> =
    Collections.newSetFromMap(WeakHashMap())

  private fun remember(context: Context) {
    if (rememberedApp == null) rememberedApp = context.applicationContext
  }

  fun write(context: Context, json: String) {
    remember(context)
    val entries = parseEntries(json)
    synchronized(sessionLock) {
      sessionPasswords.clear()
      for (e in entries) {
        if (e.password.isNotEmpty()) sessionPasswords[e.id] = e.password
      }
    }
    persistMetadata(context, entries)
    File(context.filesDir, LEGACY_FILE_NAME).delete()
  }

  fun clear(context: Context) {
    wipeSession(context)
  }

  fun wipeSession(context: Context) {
    remember(context)
    synchronized(sessionLock) {
      sessionGeneration++
      sessionPasswords.clear()
    }
    File(context.filesDir, ENC_FILE_NAME).delete()
    File(context.filesDir, LEGACY_FILE_NAME).delete()
    cancelAuthActivities()
  }

  /**
   * Lock/logout path when the React context is already gone. Uses the
   * application context captured by the last [write] or [read].
   */
  fun wipeRememberedSession() {
    val ctx = rememberedApp
    if (ctx != null) {
      wipeSession(ctx)
      return
    }
    synchronized(sessionLock) {
      sessionGeneration++
      sessionPasswords.clear()
    }
    cancelAuthActivities()
  }

  fun trackAuthActivity(activity: Activity) {
    synchronized(authActivities) { authActivities.add(activity) }
  }

  fun untrackAuthActivity(activity: Activity) {
    synchronized(authActivities) { authActivities.remove(activity) }
  }

  fun currentGeneration(): Int = synchronized(sessionLock) { sessionGeneration }

  fun passwordFor(id: String): String = synchronized(sessionLock) {
    sessionPasswords[id] ?: ""
  }

  /** Password for [id] only when [generation] is still the current session. */
  fun passwordForSession(id: String, generation: Int): String = synchronized(sessionLock) {
    if (generation != sessionGeneration) "" else sessionPasswords[id] ?: ""
  }

  fun read(context: Context): List<CacheEntry> {
    remember(context)
    val meta = readMetadata(context)
    return synchronized(sessionLock) {
      meta.map { it.copy(password = sessionPasswords[it.id] ?: "") }
    }
  }

  private fun persistMetadata(context: Context, entries: List<CacheEntry>) {
    val arr = JSONArray()
    for (e in entries) {
      arr.put(
        JSONObject()
          .put("id", e.id)
          .put("title", e.title)
          .put("username", e.username)
          .put("domains", JSONArray(e.domains))
          .put("packages", JSONArray(e.packages)),
      )
    }
    val encFile = openEncryptedFile(context)
    val target = File(context.filesDir, ENC_FILE_NAME)
    if (target.exists()) target.delete()
    encFile.openFileOutput().use { out ->
      out.write(arr.toString().toByteArray(Charset.forName("UTF-8")))
    }
  }

  private fun readMetadata(context: Context): List<CacheEntry> {
    val encPath = File(context.filesDir, ENC_FILE_NAME)
    if (encPath.exists()) {
      File(context.filesDir, LEGACY_FILE_NAME).delete()
      return try {
        val encFile = openEncryptedFile(context)
        val json = encFile.openFileInput().use { input ->
          input.readBytes().toString(Charset.forName("UTF-8"))
        }
        parseEntries(json)
      } catch (e: Exception) {
        Log.w(TAG, "encrypted cache read failed", e)
        emptyList()
      }
    }
    val legacy = File(context.filesDir, LEGACY_FILE_NAME)
    if (legacy.exists()) {
      val plaintext = try {
        legacy.readText(Charset.forName("UTF-8"))
      } catch (e: Exception) {
        Log.w(TAG, "legacy cache read failed", e)
        legacy.delete()
        return emptyList()
      }
      // Metadata only. Passwords stay out of the session until an unlocked
      // vault calls [write]. A fill must not offer secrets the user never unlocked.
      val entries = parseEntries(plaintext).map { it.copy(password = "") }
      try {
        persistMetadata(context, entries)
      } catch (e: Exception) {
        Log.w(TAG, "legacy migration failed", e)
      }
      legacy.delete()
      return entries
    }
    return emptyList()
  }

  private fun openEncryptedFile(context: Context): EncryptedFile {
    val masterKey = MasterKey.Builder(context, KEY_ALIAS)
      .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
      .build()
    return EncryptedFile.Builder(
      context,
      File(context.filesDir, ENC_FILE_NAME),
      masterKey,
      EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
    ).build()
  }

  private fun parseEntries(json: String): List<CacheEntry> {
    return try {
      val arr = JSONArray(json)
      buildList {
        for (i in 0 until arr.length()) {
          val o = arr.optJSONObject(i) ?: continue
          add(
            CacheEntry(
              id = o.optString("id"),
              title = o.optString("title"),
              username = o.optString("username"),
              password = o.optString("password"),
              domains = jsonStringList(o.optJSONArray("domains")),
              packages = jsonStringList(o.optJSONArray("packages")),
            )
          )
        }
      }
    } catch (_: Exception) {
      emptyList()
    }
  }

  private fun jsonStringList(arr: JSONArray?): List<String> {
    if (arr == null) return emptyList()
    return buildList {
      for (i in 0 until arr.length()) {
        val s = arr.optString(i).trim().lowercase()
        if (s.isNotEmpty()) add(s)
      }
    }
  }

  private fun normalizeHost(raw: String): String =
    raw.trim().lowercase().removePrefix("www.")

  /** eTLD+1. Multi-label suffixes in [MULTI_LABEL_PUBLIC_SUFFIXES] count as the eTLD. */
  private fun registrable(domain: String): String {
    val parts = normalizeHost(domain).split('.').filter { it.isNotEmpty() }
    if (parts.isEmpty()) return ""
    if (parts.size == 1) return parts[0]
    val lastTwo = parts.takeLast(2).joinToString(".")
    val suffixLabels = if (lastTwo in MULTI_LABEL_PUBLIC_SUFFIXES) 2 else 1
    val keep = suffixLabels + 1
    return if (parts.size <= keep) parts.joinToString(".")
    else parts.takeLast(keep).joinToString(".")
  }

  /**
   * Exact package (100), exact host (90), or same registrable domain (70).
   * Title text and raw suffix checks are not matches.
   */
  fun match(entries: List<CacheEntry>, host: String?, packageName: String?): List<CacheEntry> {
    val h = host?.let(::normalizeHost)?.takeIf { it.isNotEmpty() } ?: ""
    val pkg = packageName?.trim()?.lowercase()?.takeIf { it.isNotEmpty() } ?: ""
    if (h.isEmpty() && pkg.isEmpty()) return emptyList()
    val want = if (h.isEmpty()) "" else registrable(h)

    val scored = entries.mapNotNull { e ->
      val score = when {
        pkg.isNotEmpty() && e.packages.any { it == pkg } -> 100
        h.isNotEmpty() && e.domains.any { normalizeHost(it) == h } -> 90
        want.isNotEmpty() && e.domains.any { registrable(it) == want } -> 70
        else -> 0
      }
      if (score > 0) score to e else null
    }
    return scored.sortedByDescending { it.first }.map { it.second }.take(8)
  }

  private fun cancelAuthActivities() {
    val snapshot = synchronized(authActivities) { authActivities.toList() }
    for (activity in snapshot) {
      activity.runOnUiThread {
        if (activity.isFinishing) return@runOnUiThread
        activity.setResult(Activity.RESULT_CANCELED)
        activity.finish()
      }
    }
  }

  fun isPersistedFileEncrypted(context: Context): Boolean {
    val encPath = File(context.filesDir, ENC_FILE_NAME)
    if (!encPath.exists()) return false
    val header = try {
      encPath.inputStream().use { input ->
        val buf = ByteArray(4)
        val n = input.read(buf)
        if (n <= 0) return false
        buf.copyOf(n)
      }
    } catch (_: Exception) {
      return false
    }
    return header.isNotEmpty() && header[0].toInt() != '['.code
  }
}
