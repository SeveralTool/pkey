package expo.modules.pkeycrypto

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeCryptoTest {
  @Test
  fun xchachaRoundTripAndDropKey() {
    val key = ByteArray(32) { 7 }
    val handle = NativeCrypto.importKey(key)
    val aad = "header".toByteArray()
    val packed = NativeCrypto.encrypt(handle, "vault".toByteArray(), aad)
    val opened = NativeCrypto.decrypt(handle, packed, aad)
    assertArrayEquals("vault".toByteArray(), opened)
    NativeCrypto.dropKey(handle)
    assertNull(NativeCrypto.decrypt(handle, packed, aad))
  }

  @Test
  fun argon2idIsDeterministic() {
    val a = NativeCrypto.argon2id("pw".toByteArray(), ByteArray(16) { 1 }, 8, 1, 1, 32)
    val b = NativeCrypto.argon2id("pw".toByteArray(), ByteArray(16) { 1 }, 8, 1, 1, 32)
    assertArrayEquals(a, b)
    assertEquals(32, a.size)
  }

  @Test
  fun rfc9106Argon2idAppendixA3() {
    assertEquals(
      NativeCrypto.RFC9106_ARGON2ID_EXPECTED,
      NativeCrypto.bytesToHex(NativeCrypto.rfc9106Argon2idKat()),
    )
  }

  @Test
  fun selfTestKatPassesRfcAndAeadAndHkdf() {
    assertTrue(NativeCrypto.selfTestKat())
  }

  @Test
  fun hchacha20MatchesDraftIrtfCfrgXchacha() {
    val key = NativeCrypto.hexToBytes("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f")
    val nonce16 = NativeCrypto.hexToBytes("000000090000004a0000000031415927")
    assertEquals(NativeCrypto.HCHACHA20_RFC_EXPECTED, NativeCrypto.bytesToHex(NativeCrypto.hchacha20(key, nonce16)))
  }

  @Test
  fun selfTestKdfKatIndependentOfAead() {
    assertTrue(NativeCrypto.selfTestKdfKat())
  }

  @Test
  fun exportKeyDoesNotDropHandle() {
    val handle = NativeCrypto.importKey(ByteArray(32) { 0x11 })
    assertEquals("11".repeat(32), NativeCrypto.exportKey(handle))
    val hkdf = NativeCrypto.hkdfExpand(handle, "pkey-auth-verify-v1")
    assertEquals(NativeCrypto.HKDF_AUTH_KAT, NativeCrypto.bytesToHex(hkdf))
    NativeCrypto.dropKey(handle)
  }
}
