package expo.modules.pkeycrypto

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class PkeyCryptoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PkeyCrypto")

    AsyncFunction("deriveRootKey") { password: String, saltHex: String, memoryKiB: Int, timeCost: Int, parallelism: Int ->
      NativeCrypto.deriveRootKey(password, NativeCrypto.hexToBytes(saltHex), memoryKiB, timeCost, parallelism)
    }

    AsyncFunction("importKey") { keyHex: String ->
      NativeCrypto.importKey(NativeCrypto.hexToBytes(keyHex))
    }

    AsyncFunction("exportKey") { handle: String ->
      NativeCrypto.exportKey(handle)
    }

    AsyncFunction("hkdfExpand") { handle: String, info: String ->
      NativeCrypto.bytesToHex(NativeCrypto.hkdfExpand(handle, info))
    }

    AsyncFunction("encryptVault") { handle: String, plaintextUtf8: String, aadUtf8: String ->
      val packed = NativeCrypto.encrypt(
        handle,
        plaintextUtf8.toByteArray(Charsets.UTF_8),
        aadUtf8.toByteArray(Charsets.UTF_8),
      )
      val nonce = packed.copyOfRange(0, 24)
      val ct = packed.copyOfRange(24, packed.size)
      JSONObject()
        .put("nonce", NativeCrypto.bytesToHex(nonce))
        .put("ciphertext", NativeCrypto.bytesToHex(ct))
        .toString()
    }

    AsyncFunction("decryptVault") { handle: String, envelopeJson: String, aadUtf8: String ->
      val obj = JSONObject(envelopeJson)
      val nonce = NativeCrypto.hexToBytes(obj.getString("nonce"))
      val ct = NativeCrypto.hexToBytes(obj.getString("ciphertext"))
      val packed = nonce + ct
      val plain = NativeCrypto.decrypt(handle, packed, aadUtf8.toByteArray(Charsets.UTF_8)) ?: return@AsyncFunction null
      String(plain, Charsets.UTF_8)
    }

    AsyncFunction("dropKey") { handle: String ->
      NativeCrypto.dropKey(handle)
      null
    }

    AsyncFunction("selfTestKdfKat") {
      NativeCrypto.selfTestKdfKat()
    }

    AsyncFunction("selfTestAeadKat") {
      NativeCrypto.selfTestAeadKat()
    }

    AsyncFunction("selfTestKat") {
      NativeCrypto.selfTestKat()
    }

    Function("hotPathCaps") {
      mapOf("kdf" to true, "aead" to true)
    }
  }
}
