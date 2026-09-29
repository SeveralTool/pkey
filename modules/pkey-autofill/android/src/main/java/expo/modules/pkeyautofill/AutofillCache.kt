package expo.modules.pkeyautofill

import android.content.Context
import android.util.Log
import androidx.security.crypto.EncryptedFile
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.charset.Charset
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
 * [wipeSession] is called from onDestroy / BOOT_COMPLETED.
 */
object AutofillCache {
  private const val TAG = "PKeyAutofillCache"
  private const val ENC_FILE_NAME = "pkey_autofill_cache_v2.enc"
  private const val LEGACY_FILE_NAME = "pkey_autofill_cache.json"
  private const val KEY_ALIAS = "pkey_autofill_master_v1"

  private val sessionPasswords = ConcurrentHashMap<String, String>()

  fun write(context: Context, json: String) {
    val entries = parseEntries(json)
    sessionPasswords.clear()
    for (e in entries) {
      if (e.password.isNotEmpty()) sessionPasswords[e.id] = e.password
    }
    persistMetadata(context, entries)
    File(context.filesDir, LEGACY_FILE_NAME).delete()
  }

  fun clear(context: Context) {
    wipeSession(context)
  }

  fun wipeSession(context: Context) {
    sessionPasswords.clear()
    File(context.filesDir, ENC_FILE_NAME).delete()
    File(context.filesDir, LEGACY_FILE_NAME).delete()
  }

  fun passwordFor(id: String): String = sessionPasswords[id] ?: ""

  fun read(context: Context): List<CacheEntry> {
    val meta = readMetadata(context)
    return meta.map { it.copy(password = sessionPasswords[it.id] ?: "") }
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
      val entries = parseEntries(plaintext)
      for (e in entries) {
        if (e.password.isNotEmpty()) sessionPasswords[e.id] = e.password
      }
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

  fun match(entries: List<CacheEntry>, host: String?, packageName: String?): List<CacheEntry> {
    val h = host?.trim()?.lowercase()?.removePrefix("www.") ?: ""
    val pkg = packageName?.trim()?.lowercase() ?: ""
    if (h.isEmpty() && pkg.isEmpty()) return emptyList()

    fun registrable(domain: String): String {
      val parts = domain.split('.').filter { it.isNotEmpty() }
      return if (parts.size <= 2) domain else parts.takeLast(2).joinToString(".")
    }

    val scored = entries.mapNotNull { e ->
      var score = 0
      if (pkg.isNotEmpty() && e.packages.any { it == pkg }) score = 100
      else if (h.isNotEmpty()) {
        when {
          e.domains.any { it == h } -> score = 90
          e.domains.any { registrable(it) == registrable(h) } -> score = 70
          e.domains.any { h.endsWith(".$it") || it.endsWith(".$h") } -> score = 55
          e.title.lowercase().contains(h.substringBefore('.')) -> score = 25
        }
      }
      if (score > 0) score to e else null
    }
    return scored.sortedByDescending { it.first }.map { it.second }.take(8)
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
