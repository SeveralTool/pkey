import ExpoModulesCore
import LocalAuthentication
import Security
import UIKit

public class PkeyVaultKeysModule: Module {
  private let bundleAccount = "pkey_unlock_bundle_v3"
  private let secretAccount = "pkey_device_secret_v1"
  private let service = "com.severaltool.pkey.vaultkeys"

  public func definition() -> ModuleDefinition {
    Name("PkeyVaultKeys")

    AsyncFunction("storeUnlockBundle") { (json: String, promptTitle: String) in
      try self.storeKeychain(account: self.bundleAccount, data: Data(json.utf8), prompt: promptTitle)
    }

    AsyncFunction("loadUnlockBundle") { (promptTitle: String) -> String? in
      guard let data = try self.loadKeychain(account: self.bundleAccount, prompt: promptTitle) else {
        return nil
      }
      return String(data: data, encoding: .utf8)
    }

    AsyncFunction("clearUnlockBundle") {
      self.deleteKeychain(account: self.bundleAccount)
    }

    AsyncFunction("hasUnlockBundle") { () -> Bool in
      self.keychainExists(account: self.bundleAccount)
    }

    AsyncFunction("isHardwareBacked") { () -> String in
      "keychain"
    }

    AsyncFunction("detectCompromisedDevice") { () -> [String: Any] in
      let signals = JailbreakDetector.signals()
      return ["compromised": !signals.isEmpty, "signals": signals]
    }

    AsyncFunction("storeDeviceSecret") { (hex: String, promptTitle: String) in
      guard let data = Self.hexToData(hex) else {
        throw Exception(name: "E_HEX", description: "Invalid device secret hex")
      }
      try self.storeKeychain(account: self.secretAccount, data: data, prompt: promptTitle)
    }

    AsyncFunction("loadDeviceSecret") { (promptTitle: String) -> String? in
      guard let data = try self.loadKeychain(account: self.secretAccount, prompt: promptTitle) else {
        return nil
      }
      return Self.dataToHex(data)
    }

    AsyncFunction("clearDeviceSecret") {
      self.deleteKeychain(account: self.secretAccount)
    }

    AsyncFunction("hasDeviceSecret") { () -> Bool in
      self.keychainExists(account: self.secretAccount)
    }
  }

  private func accessControl() throws -> SecAccessControl {
    var error: Unmanaged<CFError>?
    guard let access = SecAccessControlCreateWithFlags(
      nil,
      kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
      .biometryCurrentSet,
      &error
    ) else {
      throw Exception(name: "E_ACCESS", description: error?.takeRetainedValue().localizedDescription ?? "access control")
    }
    return access
  }

  private func storeKeychain(account: String, data: Data, prompt: String) throws {
    deleteKeychain(account: account)
    let access = try accessControl()
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecValueData as String: data,
      kSecAttrAccessControl as String: access,
      kSecUseAuthenticationUI as String: kSecUseAuthenticationUIAllow,
    ]
    let status = SecItemAdd(query as CFDictionary, nil)
    if status != errSecSuccess {
      throw Exception(name: "E_STORE", description: "SecItemAdd \(status)")
    }
    _ = prompt
  }

  private func loadKeychain(account: String, prompt: String) throws -> Data? {
    let context = LAContext()
    context.localizedReason = prompt
    var authError: NSError?
    guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &authError) else {
      throw Exception(name: "E_BIO", description: authError?.localizedDescription ?? "biometrics unavailable")
    }
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
      kSecUseAuthenticationContext as String: context,
      kSecUseOperationPrompt as String: prompt,
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound { return nil }
    if status != errSecSuccess {
      throw Exception(name: "E_LOAD", description: "SecItemCopyMatching \(status)")
    }
    return item as? Data
  }

  private func deleteKeychain(account: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    SecItemDelete(query as CFDictionary)
  }

  private func keychainExists(account: String) -> Bool {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: false,
      kSecMatchLimit as String: kSecMatchLimitOne,
      kSecUseAuthenticationUI as String: kSecUseAuthenticationUIFail,
    ]
    let status = SecItemCopyMatching(query as CFDictionary, nil)
    return status == errSecSuccess || status == errSecInteractionNotAllowed
  }

  private static func hexToData(_ hex: String) -> Data? {
    let clean = hex.lowercased()
    guard clean.count % 2 == 0 else { return nil }
    var data = Data()
    var index = clean.startIndex
    while index < clean.endIndex {
      let next = clean.index(index, offsetBy: 2)
      guard let b = UInt8(clean[index..<next], radix: 16) else { return nil }
      data.append(b)
      index = next
    }
    return data
  }

  private static func dataToHex(_ data: Data) -> String {
    data.map { String(format: "%02x", $0) }.joined()
  }
}

enum JailbreakDetector {
  static func signals() -> [String] {
    var out: [String] = []
    let paths = [
      "/Applications/Cydia.app",
      "/Library/MobileSubstrate/MobileSubstrate.dylib",
      "/bin/bash",
      "/usr/sbin/sshd",
      "/etc/apt",
      "/private/var/lib/apt/",
    ]
    for path in paths where FileManager.default.fileExists(atPath: path) {
      out.append("path:\(path)")
      break
    }
    if let url = URL(string: "cydia://package/com.example.package"),
       UIApplication.shared.canOpenURL(url) {
      out.append("scheme:cydia")
    }
    let probe = "/private/pkey_jb_probe_\(UUID().uuidString)"
    do {
      try "x".write(toFile: probe, atomically: true, encoding: .utf8)
      try FileManager.default.removeItem(atPath: probe)
      out.append("sandbox-escape")
    } catch {
    }
    return out
  }
}
