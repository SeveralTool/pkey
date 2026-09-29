// ============================================================================
// JEST SETUP - Mock modules and global configuration
// ============================================================================

// Optional testing-library matchers (skip if package not installed)
try {
  require('@testing-library/jest-native/extend-expect');
} catch {
  // jest-native not installed
}

// Mock Expo modules
jest.mock('expo-file-system', () => ({
  __esModule: true,
  default: {
    getDocumentDirectoryAsync: jest.fn(async () => '/mock/docs'),
    readAsStringAsync: jest.fn(async () => '{}'),
    writeAsStringAsync: jest.fn(async () => {}),
    deleteAsync: jest.fn(async () => {}),
    FileSystemSessionType: {},
  },
}));

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  default: {
    setItemAsync: jest.fn(async () => {}),
    getItemAsync: jest.fn(async () => null),
    deleteItemAsync: jest.fn(async () => {}),
  },
}));

jest.mock('expo-local-authentication', () => ({
  __esModule: true,
  default: {
    hasHardwareAsync: jest.fn(async () => false),
    isAvailableAsync: jest.fn(async () => false),
    authenticate: jest.fn(async () => false),
    BiometryType: {
      FINGERPRINT: 1,
      FACE: 2,
      IRIS: 3,
    },
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(async () => {}),
    getItem: jest.fn(async () => null),
    removeItem: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
  },
}));

// Mock React Native modules
jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter');

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  const createPanGesture = () => {
    const handlers = {};
    const gesture = {
      runOnJS: () => gesture,
      activeOffsetX: () => gesture,
      onBegin: (fn) => {
        handlers.onBegin = fn;
        return gesture;
      },
      onUpdate: (fn) => {
        handlers.onUpdate = fn;
        return gesture;
      },
      onEnd: (fn) => {
        handlers.onEnd = fn;
        return gesture;
      },
      onFinalize: (fn) => {
        handlers.onFinalize = fn;
        return gesture;
      },
    };
    return gesture;
  };
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({ children, ...rest }) => React.createElement(View, rest, children),
    Gesture: { Pan: createPanGesture },
    PanGestureHandler: View,
    State: { BEGAN: 2, END: 5, CANCELLED: 3, FAILED: 1 },
  };
});

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CameraView: View,
    useCameraPermissions: jest.fn(() => [{ granted: true }, jest.fn()]),
  };
});

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
}));

jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return {
    GlassView: View,
    isLiquidGlassAvailable: () => false,
    isGlassEffectAPIAvailable: () => false,
  };
});

jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return { BlurView: View };
});

jest.mock('pkey-vault-keys', () => ({
  __esModule: true,
  default: null,
  isPkeyVaultKeysAvailable: () => false,
}));

jest.mock('pkey-crypto', () => {
  const mock = {
    available: false,
    deriveRootKey: jest.fn(),
    importKey: jest.fn(),
    exportKey: jest.fn(),
    hkdfExpand: jest.fn(),
    encryptVault: jest.fn(),
    decryptVault: jest.fn(),
    dropKey: jest.fn(),
    selfTestKdfKat: jest.fn(),
    selfTestAeadKat: jest.fn(),
    selfTestKat: jest.fn(),
    hotPathCaps: jest.fn(),
  };
  return {
    __esModule: true,
    default: mock,
    isPkeyCryptoAvailable: () => mock.available,
    __mock: mock,
  };
});
