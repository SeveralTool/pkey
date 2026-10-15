import { msUntilPwaPromptExpiry } from './pwaPromptClock';

const ABSOLUTE = 120_000;
const RESPOND = 90_000;

describe('msUntilPwaPromptExpiry', () => {
  const base = {
    requestedAt: 1_000_000,
    absoluteMs: ABSOLUTE,
    respondWindowMs: RESPOND,
  };

  it('does not burn the respond window while the app cannot authenticate', () => {
    const wait = msUntilPwaPromptExpiry({
      ...base,
      now: base.requestedAt + 60_000,
      canRespond: false,
      respondSince: null,
    });
    expect(wait).toBe(60_000);
  });

  it('expires at the absolute cap if the user never comes back', () => {
    expect(
      msUntilPwaPromptExpiry({
        ...base,
        now: base.requestedAt + ABSOLUTE,
        canRespond: false,
        respondSince: null,
      })
    ).toBe('expire');
  });

  it('starts the respond window when the vault is unlocked in front', () => {
    const openedAt = base.requestedAt + 100_000;
    const wait = msUntilPwaPromptExpiry({
      ...base,
      now: openedAt,
      canRespond: true,
      respondSince: openedAt,
    });
    expect(wait).toBe(RESPOND);
  });

  it('keeps the respond window while the OS biometric dialog marks the app inactive', () => {
    const openedAt = base.requestedAt + 100_000;
    const wait = msUntilPwaPromptExpiry({
      ...base,
      now: openedAt + 2_000,
      canRespond: false,
      respondSince: openedAt,
    });
    expect(wait).toBe(RESPOND - 2_000);
  });

  it('expires after the respond window even if the absolute cap has time left', () => {
    const openedAt = base.requestedAt;
    expect(
      msUntilPwaPromptExpiry({
        ...base,
        now: openedAt + RESPOND,
        canRespond: true,
        respondSince: openedAt,
      })
    ).toBe('expire');
  });
});
