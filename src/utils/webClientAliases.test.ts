import { parseWebClientAliases, applyWebClientAlias } from './webClientAliases';

describe('parseWebClientAliases', () => {
  it('returns empty for null / invalid JSON', () => {
    expect(parseWebClientAliases(null)).toEqual({});
    expect(parseWebClientAliases('not-json')).toEqual({});
    expect(parseWebClientAliases('[]')).toEqual({});
  });

  it('keeps only persistable keys and sanitized aliases', () => {
    const hugeKey = 'a'.repeat(200);
    expect(
      parseWebClientAliases(
        JSON.stringify({
          'web-ok-abc12345': '  PC  ',
          'probe-x': 'Nope',
          [hugeKey]: 'Huge',
          bad: 12,
        })
      )
    ).toEqual({ 'web-ok-abc12345': 'PC' });
  });
});

describe('applyWebClientAlias', () => {
  it('sets, replaces, and clears aliases', () => {
    const once = applyWebClientAlias({}, 'web-ok-abc12345', 'Notebook');
    expect(once).toEqual({ 'web-ok-abc12345': 'Notebook' });
    const twice = applyWebClientAlias(once, 'web-ok-abc12345', 'Sala');
    expect(twice).toEqual({ 'web-ok-abc12345': 'Sala' });
    expect(applyWebClientAlias(twice, 'web-ok-abc12345', '  ')).toEqual({});
  });

  it('ignores probe ids', () => {
    expect(applyWebClientAlias({}, 'probe-1', 'X')).toEqual({});
  });
});
