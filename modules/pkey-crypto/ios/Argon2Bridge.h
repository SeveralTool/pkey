#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Argon2id (RFC 9106 version 0x13). Returns nil on failure.
NSData *_Nullable PkeyArgon2id(
    NSData *password,
    NSData *salt,
    uint32_t memoryKiB,
    uint32_t timeCost,
    uint32_t parallelism,
    uint32_t dkLen,
    NSData *_Nullable secret,
    NSData *_Nullable associatedData
);

NS_ASSUME_NONNULL_END
