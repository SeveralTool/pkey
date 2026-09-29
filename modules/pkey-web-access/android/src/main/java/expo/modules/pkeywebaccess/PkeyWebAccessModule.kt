package expo.modules.pkeywebaccess

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PkeyWebAccessModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PkeyWebAccess")

    AsyncFunction("startForegroundService") { title: String, body: String ->
      val context = appContext.reactContext ?: return@AsyncFunction null
      val intent = Intent(context, WebAccessForegroundService::class.java).apply {
        putExtra("title", title)
        putExtra("body", body)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      null
    }

    AsyncFunction("stopForegroundService") {
      val context = appContext.reactContext
      if (context != null) {
        context.stopService(Intent(context, WebAccessForegroundService::class.java))
      }
      null
    }

    AsyncFunction("updateNotification") { body: String ->
      val context = appContext.reactContext ?: return@AsyncFunction null
      val intent = Intent(context, WebAccessForegroundService::class.java).apply {
        putExtra("body", body)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      null
    }

    /**
     * Process-level reclaim of the web-sync listen port after JS reload.
     * Closes orphan native TcpSocketServer entries bound to [port].
     */
    AsyncFunction("releaseWebSyncPort") { port: Int ->
      val released = WebSyncPortOwner.releasePort(port)
      mapOf(
        "mapSize" to released.mapSize,
        "serverCount" to released.serverCount,
        "closedCount" to released.closedCount,
        "closedIds" to released.closedIds,
      )
    }
  }
}
