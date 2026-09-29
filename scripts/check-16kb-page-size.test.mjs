import assert from 'node:assert/strict';
import { inspectElf16k } from './check-16kb-page-size.mjs';
import { test } from 'node:test';

function elf64WithAlign(align) {
  const buf = Buffer.alloc(64 + 56);
  buf[0] = 0x7f;
  buf[1] = 0x45;
  buf[2] = 0x4c;
  buf[3] = 0x46;
  buf[4] = 2;
  buf[5] = 1;
  buf[6] = 1;
  buf.writeUInt16LE(3, 16);
  buf.writeUInt16LE(62, 18);
  buf.writeUInt32LE(1, 20);
  buf.writeBigUInt64LE(64n, 32);
  buf.writeUInt16LE(64, 52);
  buf.writeUInt16LE(56, 54);
  buf.writeUInt16LE(1, 56);
  buf.writeUInt32LE(1, 64);
  buf.writeBigUInt64LE(0x1000n, 64 + 40);
  buf.writeBigUInt64LE(BigInt(align), 64 + 48);
  return buf;
}

test('accepts 16 KB LOAD alignment', () => {
  const r = inspectElf16k(elf64WithAlign(16384), 'ok.so');
  assert.equal(r.ok, true);
});

test('rejects 4 KB LOAD alignment', () => {
  const r = inspectElf16k(elf64WithAlign(4096), 'bad.so');
  assert.equal(r.ok, false);
  assert.match(r.detail, /4096/);
});

test('rejects non-ELF', () => {
  const r = inspectElf16k(Buffer.from('not elf'), 'x');
  assert.equal(r.ok, false);
});
