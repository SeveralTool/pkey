import { describe, it, expect } from 'vitest';
import { mapFieldToPkey, inferMappingFromHeaders } from '..';

describe('fieldNormalizers', () => {
  it('maps known aliases to pkey fields', () => {
    expect(mapFieldToPkey('Username')).toBe('username');
    expect(mapFieldToPkey('URL')).toBe('link');
    expect(mapFieldToPkey('pass')).toBe('passwordList');
    expect(mapFieldToPkey('unknown_col')).toBe('skip');
  });

  it('infers mapping from headers', () => {
    const mapping = inferMappingFromHeaders(['title', 'email', 'password', 'website']);
    expect(mapping).toEqual([
      { sourceHeader: 'title', targetField: 'title' },
      { sourceHeader: 'email', targetField: 'username' },
      { sourceHeader: 'password', targetField: 'passwordList' },
      { sourceHeader: 'website', targetField: 'link' },
    ]);
  });
});
