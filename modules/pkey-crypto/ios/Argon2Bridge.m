#import "Argon2Bridge.h"
#include "argon2.h"
#include <string.h>

NSData *_Nullable PkeyArgon2id(
    NSData *password,
    NSData *salt,
    uint32_t memoryKiB,
    uint32_t timeCost,
    uint32_t parallelism,
    uint32_t dkLen,
    NSData *_Nullable secret,
    NSData *_Nullable associatedData
) {
  if (password == nil || salt == nil || dkLen == 0) {
    return nil;
  }

  NSMutableData *pwdCopy = [password mutableCopy];
  NSMutableData *saltCopy = [salt mutableCopy];
  NSMutableData *secretCopy = secret ? [secret mutableCopy] : nil;
  NSMutableData *adCopy = associatedData ? [associatedData mutableCopy] : nil;
  NSMutableData *out = [NSMutableData dataWithLength:dkLen];
  if (!pwdCopy || !saltCopy || !out) {
    return nil;
  }

  argon2_context ctx;
  memset(&ctx, 0, sizeof(ctx));
  ctx.out = out.mutableBytes;
  ctx.outlen = dkLen;
  ctx.pwd = pwdCopy.mutableBytes;
  ctx.pwdlen = (uint32_t)pwdCopy.length;
  ctx.salt = saltCopy.mutableBytes;
  ctx.saltlen = (uint32_t)saltCopy.length;
  ctx.secret = secretCopy ? secretCopy.mutableBytes : NULL;
  ctx.secretlen = secretCopy ? (uint32_t)secretCopy.length : 0;
  ctx.ad = adCopy ? adCopy.mutableBytes : NULL;
  ctx.adlen = adCopy ? (uint32_t)adCopy.length : 0;
  ctx.t_cost = timeCost;
  ctx.m_cost = memoryKiB;
  ctx.lanes = parallelism;
  ctx.threads = parallelism;
  ctx.version = ARGON2_VERSION_13;
  ctx.flags = ARGON2_DEFAULT_FLAGS;

  int rc = argon2_ctx(&ctx, Argon2_id);
  if (rc != ARGON2_OK) {
    return nil;
  }
  return [out copy];
}
