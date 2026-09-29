/**
 * Cross-validates @pkey/core TOTP against otplib (reference implementation).
 */
import { generateSync } from 'otplib';
import { randomInt } from 'node:crypto';
import { generateTotp } from '../packages/core/src/crypto/totp';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function randomBase32(charCount = 32): string {
  // Uses node:crypto CSPRNG. Aunque este script no es de prod, mantener la
  // regla "todo lo que huele a secreto usa CSPRNG" evita reintroducir
  // Math.random en rutas sensibles.
  let out = '';
  for (let i = 0; i < charCount; i++) {
    out += BASE32[randomInt(32)];
  }
  return out;
}

type Case = {
  secret: string;
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  digits: 6 | 8;
  period: number;
  epochSeconds: number;
};

const cases: Case[] = [];
for (let i = 0; i < 20; i++) {
  for (const algorithm of ['SHA1', 'SHA256', 'SHA512'] as const) {
    for (const digits of [6, 8] as const) {
      for (const period of [30, 60]) {
        cases.push({
          secret: randomBase32(32),
          algorithm,
          digits,
          period,
          epochSeconds: 1_700_000_000 + i * 37,
        });
      }
    }
  }
}

let failures = 0;

for (const c of cases) {
  const ours = generateTotp(c.secret, {
    algorithm: c.algorithm,
    digits: c.digits,
    period: c.period,
    timestamp: c.epochSeconds * 1000,
  });

  const theirs = generateSync({
    secret: c.secret,
    strategy: 'totp',
    algorithm: c.algorithm.toLowerCase() as 'sha1' | 'sha256' | 'sha512',
    digits: c.digits,
    period: c.period,
    epoch: c.epochSeconds,
  });

  if (ours !== theirs) {
    failures++;
    console.error('Mismatch:', { ...c, ours, theirs });
  }
}

if (failures > 0) {
  console.error(`${failures} / ${cases.length} comparisons failed`);
  process.exit(1);
}

console.log(`validate-otp: ${cases.length} comparisons passed`);
