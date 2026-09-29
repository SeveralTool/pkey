import { resolvePwaOsIntentAction } from './pwaOsIntentAction';

describe('resolvePwaOsIntentAction', () => {
  it('starts auth when the live prompt matches the tap', () => {
    expect(resolvePwaOsIntentAction('open', 'req-1', 'req-1')).toBe('begin-auth');
    expect(resolvePwaOsIntentAction('open', 'req-1', null)).toBe('begin-auth');
  });

  it('denies when the live prompt matches', () => {
    expect(resolvePwaOsIntentAction('deny', 'req-1', 'req-1')).toBe('deny');
  });

  it('ignores a stale requestId while another prompt is live', () => {
    expect(resolvePwaOsIntentAction('open', 'req-live', 'req-old')).toBe('ignore');
    expect(resolvePwaOsIntentAction('deny', 'req-live', 'req-old')).toBe('ignore');
  });

  it('treats a body tap as expired when the prompt was torn down', () => {
    expect(resolvePwaOsIntentAction('open', null, 'req-1')).toBe('expired');
  });

  it('ignores deny when nothing is pending', () => {
    expect(resolvePwaOsIntentAction('deny', null, 'req-1')).toBe('ignore');
  });
});
