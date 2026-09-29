package expo.modules.pkeyautofill

import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Intent
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.Dataset
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import android.view.View
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews

class PkeyAutofillService : AutofillService() {
  override fun onFillRequest(
    request: FillRequest,
    cancellationSignal: CancellationSignal,
    callback: FillCallback,
  ) {
    try {
      val structure = request.fillContexts.lastOrNull()?.structure
      if (structure == null) {
        callback.onSuccess(null)
        return
      }

      val parsed = parseStructure(structure)
      val entries = AutofillCache.read(applicationContext)
      val matches = AutofillCache.match(entries, parsed.webDomain, parsed.packageName)

      if (matches.isEmpty() || (parsed.usernameId == null && parsed.passwordId == null)) {
        callback.onSuccess(null)
        return
      }

      val response = FillResponse.Builder()
      for (entry in matches) {
        val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
          setTextViewText(android.R.id.text1, entry.title.ifBlank { entry.username })
        }
        val dataset = Dataset.Builder(presentation)
        parsed.usernameId?.let {
          dataset.setValue(it, AutofillValue.forText(entry.username), presentation)
        }
        parsed.passwordId?.let {
          dataset.setValue(it, AutofillValue.forText(""), presentation)
        }
        val auth = Intent(this, AutofillAuthActivity::class.java).apply {
          putExtra(AutofillAuthActivity.EXTRA_ENTRY_ID, entry.id)
          parsed.usernameId?.let { putExtra(AutofillAuthActivity.EXTRA_USER_ID, it) }
          parsed.passwordId?.let { putExtra(AutofillAuthActivity.EXTRA_PASS_ID, it) }
          putExtra(AutofillAuthActivity.EXTRA_USERNAME, entry.username)
          putExtra(AutofillAuthActivity.EXTRA_TITLE, entry.title)
        }
        val flags = PendingIntent.FLAG_CANCEL_CURRENT or
          if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
        val pi = PendingIntent.getActivity(this, entry.id.hashCode(), auth, flags)
        dataset.setAuthentication(pi.intentSender)
        response.addDataset(dataset.build())
      }
      callback.onSuccess(response.build())
    } catch (_: Exception) {
      callback.onSuccess(null)
    }
  }

  override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
    callback.onSuccess()
  }

  override fun onDisconnected() {
    AutofillCache.wipeSession(applicationContext)
  }

  override fun onDestroy() {
    AutofillCache.wipeSession(applicationContext)
    super.onDestroy()
  }

  private data class Parsed(
    val webDomain: String?,
    val packageName: String?,
    val usernameId: AutofillId?,
    val passwordId: AutofillId?,
  )

  private fun parseStructure(structure: AssistStructure): Parsed {
    var webDomain: String? = null
    var packageName: String? = structure.activityComponent?.packageName
    var usernameId: AutofillId? = null
    var passwordId: AutofillId? = null

    fun walk(node: AssistStructure.ViewNode) {
      val hints = node.autofillHints?.map { it.lowercase() } ?: emptyList()
      val idEntry = node.idEntry?.lowercase() ?: ""
      val html = node.htmlInfo
      val inputType = node.inputType

      if (webDomain == null) {
        node.webDomain?.let { if (it.isNotBlank()) webDomain = it.lowercase() }
      }

      val looksUser =
        hints.any { it.contains("username") || it.contains("email") || it == View.AUTOFILL_HINT_USERNAME } ||
          idEntry.contains("user") ||
          idEntry.contains("email") ||
          html?.attributes?.any { (it.first.equals("type", true) && it.second.equals("email", true)) } == true

      val looksPass =
        hints.any { it.contains("password") || it == View.AUTOFILL_HINT_PASSWORD } ||
          idEntry.contains("pass") ||
          (inputType and android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD) != 0 ||
          (inputType and android.text.InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD) != 0 ||
          html?.attributes?.any { (it.first.equals("type", true) && it.second.equals("password", true)) } == true

      if (looksUser && usernameId == null) usernameId = node.autofillId
      if (looksPass && passwordId == null) passwordId = node.autofillId

      for (i in 0 until node.childCount) {
        walk(node.getChildAt(i))
      }
    }

    for (i in 0 until structure.windowNodeCount) {
      walk(structure.getWindowNodeAt(i).rootViewNode)
    }

    return Parsed(webDomain, packageName, usernameId, passwordId)
  }
}
