package expo.modules.pkeywebaccess

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Sticky FG service so :7392 can survive backgrounding.
 * Android requires an ongoing notification while the service runs — kept
 * minimal/silent. Product alerts (new browser synced) are sent from JS.
 */
class WebAccessForegroundService : Service() {
  companion object {
    const val CHANNEL_ID = "pkey_web_access_fg"
    const val NOTIFICATION_ID = 7392
    var titleText: String = "PKEY"
    var bodyText: String = ""
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    intent?.getStringExtra("title")?.let { titleText = it }
    intent?.getStringExtra("body")?.let { bodyText = it }
    startInForeground()
    return START_STICKY
  }

  override fun onDestroy() {
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  private fun startInForeground() {
    createChannel()
    val notification = buildNotification(titleText, bodyText)
    startForeground(NOTIFICATION_ID, notification)
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "PKEY",
        NotificationManager.IMPORTANCE_MIN
      ).apply {
        setShowBadge(false)
        description = "Required while LAN web access keep-alive is running"
      }
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(channel)
    }
  }

  private fun buildNotification(title: String, body: String): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pending = PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val iconRes = applicationInfo.icon

    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setSmallIcon(iconRes)
      .setContentIntent(pending)
      .setOngoing(true)
      .setSilent(true)
      .setShowWhen(false)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)

    if (body.isNotBlank()) {
      builder.setContentText(body)
    }

    return builder.build()
  }
}
