package expo.modules.pkeyvaultkeys

import androidx.fragment.app.FragmentActivity
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PkeyVaultKeysModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PkeyVaultKeys")

    AsyncFunction("storeUnlockBundle") { json: String, promptTitle: String, promise: Promise ->
      val activity = currentActivity()
      val files = filesDir()
      if (activity == null || files == null) {
        promise.reject("E_NO_ACTIVITY", "No current activity", null)
        return@AsyncFunction
      }
      UnlockKeystore.store(activity, files, UnlockKeystore.fromUtf8(json), promptTitle, false) { result ->
        result.fold(
          onSuccess = { promise.resolve(null) },
          onFailure = { rejectVaultAuth(promise, "E_STORE", it) },
        )
      }
    }

    AsyncFunction("loadUnlockBundle") { promptTitle: String, promise: Promise ->
      val activity = currentActivity()
      val files = filesDir()
      if (activity == null || files == null) {
        promise.reject("E_NO_ACTIVITY", "No current activity", null)
        return@AsyncFunction
      }
      UnlockKeystore.load(activity, files, promptTitle, false) { result ->
        result.fold(
          onSuccess = { promise.resolve(UnlockKeystore.utf8(it)) },
          onFailure = {
            if (it.message == "missing") promise.resolve(null)
            else rejectVaultAuth(promise, "E_LOAD", it)
          },
        )
      }
    }

    AsyncFunction("clearUnlockBundle") {
      filesDir()?.let { UnlockKeystore.clearUnlockBundle(it) }
      null
    }

    AsyncFunction("hasUnlockBundle") {
      val files = filesDir() ?: return@AsyncFunction false
      UnlockKeystore.hasUnlockBundle(files)
    }

    AsyncFunction("isHardwareBacked") {
      UnlockKeystore.hardwareKind()
    }

    AsyncFunction("detectCompromisedDevice") {
      val context = appContext.reactContext ?: return@AsyncFunction mapOf(
        "compromised" to false,
        "signals" to emptyList<String>(),
      )
      val (compromised, signals) = RootDetector.inspect(context)
      mapOf("compromised" to compromised, "signals" to signals)
    }

    AsyncFunction("storeDeviceSecret") { hex: String, promptTitle: String, promise: Promise ->
      val activity = currentActivity()
      val files = filesDir()
      if (activity == null || files == null) {
        promise.reject("E_NO_ACTIVITY", "No current activity", null)
        return@AsyncFunction
      }
      UnlockKeystore.store(activity, files, UnlockKeystore.hexToBytes(hex), promptTitle, true) { result ->
        result.fold(
          onSuccess = { promise.resolve(null) },
          onFailure = { rejectVaultAuth(promise, "E_STORE_SECRET", it) },
        )
      }
    }

    AsyncFunction("loadDeviceSecret") { promptTitle: String, promise: Promise ->
      val activity = currentActivity()
      val files = filesDir()
      if (activity == null || files == null) {
        promise.reject("E_NO_ACTIVITY", "No current activity", null)
        return@AsyncFunction
      }
      UnlockKeystore.load(activity, files, promptTitle, true) { result ->
        result.fold(
          onSuccess = { promise.resolve(UnlockKeystore.bytesToHex(it)) },
          onFailure = {
            if (it.message == "missing") promise.resolve(null)
            else rejectVaultAuth(promise, "E_LOAD_SECRET", it)
          },
        )
      }
    }

    AsyncFunction("clearDeviceSecret") {
      filesDir()?.let { UnlockKeystore.clearDeviceSecret(it) }
      null
    }

    AsyncFunction("hasDeviceSecret") {
      val files = filesDir() ?: return@AsyncFunction false
      UnlockKeystore.hasDeviceSecret(files)
    }
  }

  private fun currentActivity(): FragmentActivity? =
    appContext.currentActivity as? FragmentActivity

  private fun filesDir() = appContext.reactContext?.filesDir

  private fun rejectVaultAuth(promise: Promise, failureCode: String, err: Throwable) {
    if (err is UnlockKeystore.UserCanceledException) {
      promise.reject("E_USER_CANCELED", err.message, err)
    } else {
      promise.reject(failureCode, err.message, err)
    }
  }
}
