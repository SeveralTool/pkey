import ExpoModulesCore
import UIKit

/**
 * iOS counterpart to the Android foreground-service helpers.
 *
 * iOS cannot keep a LAN TCP server alive indefinitely in the background.
 * This module starts a `UIBackgroundTask` when web access is active so the
 * listen socket survives a short grace period after the app is minimized.
 *
 * Product OS notifications (e.g. new browser synced) are sent from JS via
 * expo-notifications — this module does not post local notifications.
 */
public class PkeyWebAccessModule: Module {
  private var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid

  public func definition() -> ModuleDefinition {
    Name("PkeyWebAccess")

    Events("onBackgroundTimeExpiring")

    AsyncFunction("startForegroundService") { (_title: String, _body: String) in
      self.beginBackgroundTask()
    }

    AsyncFunction("stopForegroundService") {
      self.endBackgroundTask()
    }

    AsyncFunction("updateNotification") { (_body: String) in
      // No sticky/status notifications on iOS.
    }

    /**
     * Android closes orphan tcp-socket listen entries. On iOS there is no
     * equivalent process-level map reclaim — return empty diagnostics.
     */
    AsyncFunction("releaseWebSyncPort") { (_port: Int) -> [String: Any] in
      [
        "mapSize": 0,
        "serverCount": 0,
        "closedCount": 0,
        "closedIds": [] as [Int],
      ]
    }
  }

  private func beginBackgroundTask() {
    let start = {
      if self.backgroundTaskId != .invalid {
        return
      }

      self.backgroundTaskId = UIApplication.shared.beginBackgroundTask(withName: "pkey-web-access") { [weak self] in
        guard let self else { return }
        self.sendEvent("onBackgroundTimeExpiring", [:])
        self.endBackgroundTask()
      }
    }

    if Thread.isMainThread {
      start()
    } else {
      DispatchQueue.main.sync(execute: start)
    }
  }

  private func endBackgroundTask() {
    let end = {
      guard self.backgroundTaskId != .invalid else { return }
      let id = self.backgroundTaskId
      self.backgroundTaskId = .invalid
      UIApplication.shared.endBackgroundTask(id)
    }

    if Thread.isMainThread {
      end()
    } else {
      DispatchQueue.main.sync(execute: end)
    }
  }
}
