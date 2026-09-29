/**
 * @fileoverview Native PBKDF2 installer: known-answer gate before replacing JS KDF.
 */

const RFC6070_C1 = '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b';

describe('installNativePbkdf2', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('react-native-quick-crypto');
    jest.dontMock('@pkey/core');
  });

  it('keeps the JS fallback when the native module cannot be loaded', () => {
    jest.resetModules();
    jest.doMock('react-native-quick-crypto', () => {
      throw new Error('native missing');
    });
    jest.doMock('@pkey/core', () => ({ setPbkdf2Provider: jest.fn() }));
    jest.spyOn(console, 'info').mockImplementation(() => undefined);

    const { installNativePbkdf2 } = require('./nativePbkdf2') as typeof import('./nativePbkdf2');
    expect(installNativePbkdf2()).toBe(false);
  });

  it('rejects a native module that fails the known-answer self-test', () => {
    jest.resetModules();
    jest.doMock('react-native-quick-crypto', () => ({
      pbkdf2Sync: () => ({ toString: () => '00'.repeat(32) }),
    }));
    const setPbkdf2Provider = jest.fn();
    jest.doMock('@pkey/core', () => ({ setPbkdf2Provider }));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { installNativePbkdf2 } = require('./nativePbkdf2') as typeof import('./nativePbkdf2');
    expect(installNativePbkdf2()).toBe(false);
    expect(setPbkdf2Provider).not.toHaveBeenCalled();
  });

  it('installs the native provider after a matching RFC6070 vector', () => {
    jest.resetModules();
    const pbkdf2Sync = jest.fn(() => ({ toString: () => RFC6070_C1 }));
    jest.doMock('react-native-quick-crypto', () => ({ pbkdf2Sync }));
    const setPbkdf2Provider = jest.fn();
    jest.doMock('@pkey/core', () => ({ setPbkdf2Provider }));

    const { installNativePbkdf2 } = require('./nativePbkdf2') as typeof import('./nativePbkdf2');
    expect(installNativePbkdf2()).toBe(true);
    expect(setPbkdf2Provider).toHaveBeenCalled();
  });
});
