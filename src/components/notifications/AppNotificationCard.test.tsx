import React from 'react';
import { fireEvent, render, act } from '@testing-library/react-native';
import { buildToastItem } from '../../notifications/inAppNotifications';
import { NotificationTheme } from '../../notifications/types';
import { AppNotificationCard } from './AppNotificationCard';

const theme: NotificationTheme = {
  cardBg: '#FFFFFF',
  text: '#2D3A3F',
  textMuted: '#6A6A6A',
  border: '#E0E0E0',
  accent: '#87cb28',
  danger: '#D75A4D',
  warning: '#FFC107',
  success: '#87cb28',
  accentSoft: '#87cb281A',
};

const noop = () => {};

describe('AppNotificationCard', () => {
  it('renders with a fallback theme when theme is missing', () => {
    const item = buildToastItem({ title: 'No theme' });
    const { getByText } = render(
      <AppNotificationCard item={item} theme={undefined} onDismiss={noop} />
    );
    expect(getByText('No theme')).toBeTruthy();
  });

  it('renders title, message, brand badge and progress track', () => {
    const item = buildToastItem({ title: 'Saved', message: 'Vault updated', variant: 'success' });
    const { getByTestId, getByText } = render(
      <AppNotificationCard item={item} theme={theme} onDismiss={noop} />
    );
    expect(getByText('Saved')).toBeTruthy();
    expect(getByText('Vault updated')).toBeTruthy();
    expect(getByTestId('notification-brand-badge')).toBeTruthy();
    expect(getByTestId('notification-progress')).toBeTruthy();
  });

  it('renders no progress track when duration is 0', () => {
    const item = buildToastItem({ title: 'Sticky', duration: 0 });
    const { queryByTestId } = render(
      <AppNotificationCard item={item} theme={theme} onDismiss={noop} />
    );
    expect(queryByTestId('notification-progress')).toBeNull();
  });

  it('never renders the message for sensitive items', () => {
    const secret = 'P@ssw0rd-SecretValue';
    const item = buildToastItem({
      title: 'Copied',
      message: secret,
      variant: 'success',
      sensitive: true,
    });
    const { queryByText, getByText } = render(
      <AppNotificationCard item={item} theme={theme} onDismiss={noop} />
    );
    expect(queryByText(secret)).toBeNull();
    expect(getByText('••••••')).toBeTruthy();
  });

  it('announces errors as alerts with a polite live region', () => {
    const item = buildToastItem({ title: 'Auth failed', variant: 'error' });
    const { getByTestId } = render(
      <AppNotificationCard item={item} theme={theme} onDismiss={noop} />
    );
    const card = getByTestId('notification-card');
    expect(card.props.accessibilityRole).toBe('alert');
    expect(card.props.accessibilityLiveRegion).toBe('polite');
  });

  it('dismisses when the close button is pressed', () => {
    const item = buildToastItem({ title: 'Close me', duration: 8000 });
    const onDismiss = jest.fn();
    const { getByLabelText } = render(
      <AppNotificationCard item={item} theme={theme} onDismiss={onDismiss} />
    );
    jest.useFakeTimers();
    act(() => {
      fireEvent.press(getByLabelText(/Close notification|Cerrar notificación/));
      jest.runAllTimers();
    });
    expect(onDismiss).toHaveBeenCalledWith(item.id);
    jest.useRealTimers();
  });
});
