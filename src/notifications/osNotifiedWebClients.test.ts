import {
  clearNotifiedWebClients,
  rememberNotifiedWebClient,
  seedNotifiedWebClients,
} from './osNotifiedWebClients';

describe('osNotifiedWebClients', () => {
  afterEach(() => {
    clearNotifiedWebClients();
  });

  it('notifies each id once until cleared', () => {
    expect(rememberNotifiedWebClient('a')).toBe(true);
    expect(rememberNotifiedWebClient('a')).toBe(false);
    clearNotifiedWebClients();
    expect(rememberNotifiedWebClient('a')).toBe(true);
  });

  it('seed suppresses alerts for existing clients', () => {
    seedNotifiedWebClients(['a', 'b']);
    expect(rememberNotifiedWebClient('a')).toBe(false);
    expect(rememberNotifiedWebClient('c')).toBe(true);
  });
});
