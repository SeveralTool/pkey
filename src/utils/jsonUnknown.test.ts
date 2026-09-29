/**
 * @fileoverview Tests for untyped JSON parse helpers.
 */
import { isRecord, parseJsonUnknown, tryParseJson } from './jsonUnknown';

describe('jsonUnknown', () => {
  it('tryParseJson distinguishes invalid JSON from JSON null', () => {
    expect(tryParseJson('null')).toEqual({ ok: true, value: null });
    expect(tryParseJson('{').ok).toBe(false);
  });

  it('parseJsonUnknown returns parsed objects', () => {
    expect(parseJsonUnknown('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonUnknown('{')).toBeNull();
  });

  it('isRecord rejects arrays and primitives', () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
  });
});
