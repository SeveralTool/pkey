package expo.modules.pkeywebaccess

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Sticky-enough foreground service so the 1-minute JS backup timer is not
 * frozen after the user leaves PKEY. It does not copy the vault itself and
 * does not open the LAN port. Android requires an ongoing notification while
 * a foreground service runs; this one stays silent and minimal.
 *
 * Swiping PKEY away stops the service (the JS timer is gone with the
 * activity). WorkManager remains the fallback, at the OS 15-minute floor.
 */
class BackupKeepAliveService : Service() {
  companion object {
    const val CHANNEL_ID = "pkey_auto_backup_fg"
    const val NOTIFICATION_ID = 7401
    var titleText: String = "PKEY"
    var bodyText: String = ""
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    intent?.getStringExtra("title")?.let { titleText = it }
    intent?.getStringExtra("body")?.let { bodyText = it }
    startInForeground()
    return START_NOT_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  override fun onTimeout(startId: Int) {
    stopSelf()
  }

  override fun onDestroy() {
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  private fun startInForeground() {
    createChannel()
    val notification = buildNotification(titleText, bodyText)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "PKEY",
        NotificationManager.IMPORTANCE_MIN
      ).apply {
        setShowBadge(false)
        description = "Required while 1-minute automatic backup is running"
      }
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(channel)
    }
  }

  private fun buildNotification(title: String, body: String): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pending = PendingIntent.getActivity(
      this,
      1,
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
