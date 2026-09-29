package expo.modules.pkeyautofill

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.service.autofill.Dataset
import android.view.autofill.AutofillId
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

/**
 * Biometric gate before an autofill dataset reveals the password (audit M4).
 */
class AutofillAuthActivity : FragmentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val entryId = intent.getStringExtra(EXTRA_ENTRY_ID) ?: run {
      finish()
      return
    }
    val title = intent.getStringExtra(EXTRA_TITLE) ?: "PKEY"
    val username = intent.getStringExtra(EXTRA_USERNAME) ?: ""
    val userId = extraId(EXTRA_USER_ID)
    val passId = extraId(EXTRA_PASS_ID)

    val executor = ContextCompat.getMainExecutor(this)
    val prompt = BiometricPrompt(
      this,
      executor,
      object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
          deliverDataset(entryId, title, username, userId, passId)
        }

        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
          setResult(Activity.RESULT_CANCELED)
          finish()
        }
      },
    )
    val info = BiometricPrompt.PromptInfo.Builder()
      .setTitle(title)
      .setNegativeButtonText("Cancel")
      .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
      .build()
    prompt.authenticate(info)
  }

  private fun extraId(name: String): AutofillId? {
    return if (android.os.Build.VERSION.SDK_INT >= 33) {
      intent.getParcelableExtra(name, AutofillId::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(name)
    }
  }

  private fun deliverDataset(
    entryId: String,
    title: String,
    username: String,
    userId: AutofillId?,
    passId: AutofillId?,
  ) {
    val password = AutofillCache.passwordFor(entryId)
    val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
      setTextViewText(android.R.id.text1, title.ifBlank { username })
    }
    val dataset = Dataset.Builder(presentation)
    userId?.let { dataset.setValue(it, AutofillValue.forText(username), presentation) }
    passId?.let { dataset.setValue(it, AutofillValue.forText(password), presentation) }
    val reply = Intent().putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, dataset.build())
    setResult(Activity.RESULT_OK, reply)
    finish()
  }

  companion object {
    const val EXTRA_ENTRY_ID = "pkey.autofill.entry_id"
    const val EXTRA_USER_ID = "pkey.autofill.user_id"
    const val EXTRA_PASS_ID = "pkey.autofill.pass_id"
    const val EXTRA_USERNAME = "pkey.autofill.username"
    const val EXTRA_TITLE = "pkey.autofill.title"
  }
}
