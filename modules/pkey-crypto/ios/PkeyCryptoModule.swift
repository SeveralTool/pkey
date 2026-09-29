import ExpoModulesCore
import CryptoKit
import Foundation

/// Native Argon2id (phc-winner-argon2) + HKDF-SHA256 + zeroizable key holder.
/// AEAD stays in JS (`@pkey/core`) until a 16 KB-aligned XChaCha binary ships.
/// `selfTestAeadKat` is always false; `hotPathCaps.aead` is false.
public class PkeyCryptoModule: Module {
  private var keys: [String: Data] = [:]
  private let lock = NSLock()

  private static let rfc9106Expected = "0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659"
  private static let prodProbeExpected = "5b83956135427d78c6e0bb6a9e1b4e6b051b031d7db2b5bac47a7b74aa727076"
  private static let hkdfAuthKat = "8287d5f3969993b060e90dc5661f72d4775236e6cb3d0dfd5268895cb43a2313"

  public func definition() -> ModuleDefinition {
    Name("PkeyCrypto")

    Function("hotPathCaps") {
      ["kdf": true, "aead": false]
    }

    AsyncFunction("deriveRootKey") { (password: String, saltHex: String, m: Int, t: Int, p: Int) -> String in
      guard let salt = Self.hexToData(saltHex) else {
        throw Exception(name: "E_HEX", description: "invalid salt hex")
      }
      let pwd = Data(password.utf8)
      guard let out = PkeyArgon2id(
        pwd,
        salt,
        UInt32(m),
        UInt32(t),
        UInt32(p),
        32,
        nil,
        nil
      ) else {
        throw Exception(name: "E_ARGON2", description: "argon2id failed")
      }
      return self.importKeyData(out)
    }

    AsyncFunction("importKey") { (keyHex: String) -> String in
      guard let data = Self.hexToData(keyHex) else {
        throw Exception(name: "E_HEX", description: "invalid key hex")
      }
      return self.importKeyData(data)
    }

    AsyncFunction("exportKey") { (handle: String) -> String in
      self.lock.lock()
      let data = self.keys[handle]
      self.lock.unlock()
      guard let data else {
        throw Exception(name: "E_HANDLE", description: "unknown key handle")
      }
      return Self.dataToHex(data)
    }

    AsyncFunction("hkdfExpand") { (handle: String, info: String) -> String in
      self.lock.lock()
      let data = self.keys[handle]
      self.lock.unlock()
      guard let data else {
        throw Exception(name: "E_HANDLE", description: "unknown key handle")
      }
      return Self.dataToHex(Self.hkdfExpand(prk: data, info: info))
    }

    AsyncFunction("encryptVault") { (_handle: String, _plaintext: String, _aad: String) -> String in
      throw Exception(name: "E_USE_JS", description: "iOS AEAD is JS (noble)")
    }

    AsyncFunction("decryptVault") { (_handle: String, _envelope: String, _aad: String) -> String? in
      throw Exception(name: "E_USE_JS", description: "iOS AEAD is JS (noble)")
    }

    AsyncFunction("dropKey") { (handle: String) in
      self.lock.lock()
      if var data = self.keys.removeValue(forKey: handle) {
        data.resetBytes(in: 0..<data.count)
      }
      self.lock.unlock()
    }

    AsyncFunction("selfTestKdfKat") { () -> Bool in
      Self.selfTestKdfKat()
    }

    AsyncFunction("selfTestAeadKat") { () -> Bool in
      false
    }

    AsyncFunction("selfTestKat") { () -> Bool in
      Self.selfTestKat()
    }
  }

  private func importKeyData(_ data: Data) -> String {
    let handle = UUID().uuidString
    self.lock.lock()
    self.keys[handle] = data
    self.lock.unlock()
    return handle
  }

  static func hkdfExpand(prk: Data, info: String) -> Data {
    let key = SymmetricKey(data: prk)
    var message = Data(info.utf8)
    message.append(1)
    let mac = HMAC<SHA256>.authenticationCode(for: message, using: key)
    return Data(mac)
  }

  static func selfTestKdfKat() -> Bool {
    let pwd = Data(repeating: 0x01, count: 32)
    let salt = Data(repeating: 0x02, count: 16)
    let secret = Data(repeating: 0x03, count: 8)
    let ad = Data(repeating: 0x04, count: 12)

    guard let rfc = PkeyArgon2id(pwd, salt, 32, 3, 4, 32, secret, ad),
          dataToHex(rfc) == rfc9106Expected else {
      return false
    }

    let prodPwd = Data("password".utf8)
    guard let prod = PkeyArgon2id(prodPwd, salt, 32, 3, 1, 32, nil, nil),
          dataToHex(prod) == prodProbeExpected else {
      return false
    }

    let prk = Data(repeating: 0x11, count: 32)
    let hkdf = hkdfExpand(prk: prk, info: "pkey-auth-verify-v1")
    return dataToHex(hkdf) == hkdfAuthKat
  }

  static func selfTestKat() -> Bool {
    selfTestKdfKat()
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
