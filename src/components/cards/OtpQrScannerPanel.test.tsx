import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { OtpQrScannerPanel } from './OtpQrScannerPanel';
import { processOtpBarcodeScan } from './otpQrScan';

const labels = {
  title: 'Scan QR',
  cancel: 'Cancel',
  hint: 'Point at an otpauth QR code',
  permission: 'Camera permission',
};

const mockRequestPermission = jest.fn();

jest.mock('../../utils/autoLogoutGuard', () => ({
  suppressAutoLogout: jest.fn(),
}));

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CameraView: (props: Record<string, unknown>) => <View testID="mock-camera" {...props} />,
    useCameraPermissions: jest.fn(() => [
      { granted: false, canAskAgain: true, status: 'undetermined' },
      mockRequestPermission,
    ]),
  };
});

describe('OtpQrScannerPanel', () => {
  beforeEach(() => {
    mockRequestPermission.mockReset();
    mockRequestPermission.mockResolvedValue({
      granted: true,
      status: 'granted',
      canAskAgain: true,
    });
  });

  it('shows permission button before camera is granted', () => {
    const { getByText, queryByTestId } = render(
      <OtpQrScannerPanel
        onClose={jest.fn()}
        onScan={jest.fn()}
        labels={labels}
        text="#111"
        textMuted="#666"
        cardBg="#eee"
        borderColor="#ccc"
      />
    );

    expect(getByText('Scan QR')).toBeTruthy();
    expect(getByText('Camera permission')).toBeTruthy();
    expect(queryByTestId('mock-camera')).toBeNull();
  });

  it('requests permission via hook when button pressed', async () => {
    const { getByText } = render(
      <OtpQrScannerPanel
        onClose={jest.fn()}
        onScan={jest.fn()}
        labels={labels}
        text="#111"
        textMuted="#666"
        cardBg="#eee"
        borderColor="#ccc"
      />
    );

    fireEvent.press(getByText('Camera permission'));
    expect(mockRequestPermission).toHaveBeenCalled();
  });

  it('processOtpBarcodeScan validates otpauth payload', () => {
    const result = processOtpBarcodeScan('otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP');
    expect(result.kind).toBe('valid');
    if (result.kind === 'valid') {
      expect(result.parsed.secret).toBe('JBSWY3DPEHPK3PXP');
    }
  });
});
