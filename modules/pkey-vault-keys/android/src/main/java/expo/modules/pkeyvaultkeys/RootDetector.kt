package expo.modules.pkeyvaultkeys

import android.content.Context
import android.os.Build
import java.io.File

/**
 * Best-effort root signals. Explicitly not a security boundary (audit M10).
 */
object RootDetector {
  private val suPaths = listOf(
    "/system/bin/su",
    "/system/xbin/su",
    "/sbin/su",
    "/data/local/xbin/su",
    "/data/local/bin/su",
    "/system/sd/xbin/su",
    "/system/bin/failsafe/su",
    "/data/local/su",
    "/su/bin/su",
    "/system/app/Superuser.apk",
    "/system/xbin/daemonsu",
    "/system/etc/init.d/99SuperSUDaemon",
    "/dev/com.koushikdutta.superuser.daemon/",
    "/system/xbin/busybox",
    "/sbin/magisk",
    "/data/adb/magisk",
    "/data/adb/ksu",
  )

  private val rootPackages = listOf(
    "com.topjohnwu.magisk",
    "io.github.vvb2060.magisk",
    "com.koushikdutta.superuser",
    "eu.chainfire.supersu",
    "com.noshufou.android.su",
    "me.weishu.kernelsu",
  )

  fun inspect(context: Context): Pair<Boolean, List<String>> {
    val signals = mutableListOf<String>()
    if (Build.TAGS?.contains("test-keys") == true) signals.add("test-keys")
    for (path in suPaths) {
      if (File(path).exists()) {
        signals.add("bin:$path")
        break
      }
    }
    try {
      val pm = context.packageManager
      for (pkg in rootPackages) {
        try {
          pm.getPackageInfo(pkg, 0)
          signals.add("pkg:$pkg")
          break
        } catch (_: Exception) {
        }
      }
    } catch (_: Exception) {
    }
    if (canWriteSystem()) signals.add("rw-system")
    return signals.isNotEmpty() to signals
  }

  private fun canWriteSystem(): Boolean {
    return try {
      val probe = File("/system/.pkey_root_probe")
      probe.exists() && probe.canWrite()
    } catch (_: Exception) {
      false
    }
  }
}
