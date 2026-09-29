package expo.modules.pkeyautofill

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Session autofill cache must not survive reboot (audit M4). */
class AutofillBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_LOCKED_BOOT_COMPLETED) {
      AutofillCache.wipeSession(context.applicationContext)
    }
  }
}
