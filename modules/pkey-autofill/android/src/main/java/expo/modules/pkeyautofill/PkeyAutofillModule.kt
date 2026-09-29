package expo.modules.pkeyautofill

import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.view.autofill.AutofillManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PkeyAutofillModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PkeyAutofill")

    AsyncFunction("syncCache") { entriesJson: String ->
      val context = appContext.reactContext ?: return@AsyncFunction null
      AutofillCache.write(context, entriesJson)
      null
    }

    AsyncFunction("clearCache") {
      val context = appContext.reactContext ?: return@AsyncFunction null
      AutofillCache.wipeSession(context)
      null
    }

    AsyncFunction("openAutofillSettings") {
      val context = appContext.reactContext ?: return@AsyncFunction null
      // OS requires user confirmation — this opens the system picker with PKEY offered.
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE).apply {
          data = android.net.Uri.parse("package:${context.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
      } else {
        Intent(Settings.ACTION_SETTINGS).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
      }
      context.startActivity(intent)
      null
    }

    AsyncFunction("isAutofillSupported") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@AsyncFunction false
      val context = appContext.reactContext ?: return@AsyncFunction false
      val am = context.getSystemService(AutofillManager::class.java)
      am != null
    }

    /** True when the user already selected PKEY as the active Autofill service. */
    AsyncFunction("isServiceEnabled") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@AsyncFunction false
      val context = appContext.reactContext ?: return@AsyncFunction false
      val am = context.getSystemService(AutofillManager::class.java) ?: return@AsyncFunction false
      if (!am.hasEnabledAutofillServices()) return@AsyncFunction false
      val component = am.autofillServiceComponentName ?: return@AsyncFunction false
      component.packageName == context.packageName
    }
  }
}
