import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { CreateSessionLegalGates } from './CreateSessionLegalGates';

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: { out: (e: unknown) => e, inOut: (e: unknown) => e, quad: {} },
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: unknown) => ({ value }),
    withSequence: (...args: unknown[]) => args,
    withTiming: (value: unknown) => value,
    createAnimatedComponent: (component: unknown) => component,
  };
});

jest.mock('../../hooks/useValidationAttention', () => ({
  useValidationAttention: () => ({
    trigger: jest.fn(),
    shakeStyle: {},
    flashStyle: { opacity: 0 },
  }),
}));

jest.mock('@expo/vector-icons', () => {
  const ReactActual = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => ReactActual.createElement(Text, null, name),
  };
});

const colors = {
  bg: '#F0F2F5',
  cardBg: '#FFFFFF',
  text: '#2D3A3F',
  textMuted: '#6A6A6A',
  border: '#E0E0E0',
  accent: '#87cb28',
  accentHover: '#6BBF78',
  success: '#87cb28',
  warning: '#FFC107',
  danger: '#D75A4D',
};

jest.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({
    t: {
      login_legal_accept: 'I have read the privacy text and the terms',
      login_legal_open_privacy: 'Open privacy policy',
      login_legal_open_terms: 'Open terms of use',
      legal_privacy_title: 'Privacy',
      legal_terms_title: 'Terms',
    },
    c: colors,
    isDark: false,
  }),
}));

const noop = () => {};

function flattenStyle(style: unknown): Record<string, unknown> {
  return StyleSheet.flatten(style as never) as Record<string, unknown>;
}

describe('CreateSessionLegalGates', () => {
  it('keeps a neutral panel when there is no error', () => {
    const { getByTestId, queryByTestId } = render(
      <CreateSessionLegalGates
        acceptedLegal={false}
        onAcceptedLegalChange={noop}
        error=""
        onOpenDocument={noop}
      />
    );

    expect(queryByTestId('legal-gates-alert')).toBeNull();
    expect(queryByTestId('legal-gate-age')).toBeNull();
    expect(flattenStyle(getByTestId('create-session-legal-gates').props.style).borderColor).toBe(
      colors.border
    );
    expect(getByTestId('create-session-legal-gates').props.accessibilityState.invalid).toBe(false);
    expect(getByTestId('legal-gate-terms').props.accessibilityState.checked).toBe(false);
    expect(getByTestId('legal-gate-terms-wrap').props.accessibilityState.invalid).toBe(false);
    expect(flattenStyle(getByTestId('legal-gate-doc-links').props.style).flexDirection).toBe('row');
    expect(flattenStyle(getByTestId('legal-gate-doc-links').props.style).flexWrap).toBe('wrap');
  });

  it('marks the panel and the unchecked row invalid when gated', () => {
    const { getByTestId, getByText } = render(
      <CreateSessionLegalGates
        acceptedLegal={false}
        onAcceptedLegalChange={noop}
        error="Read the legal texts first."
        attentionKey={1}
        onOpenDocument={noop}
      />
    );

    expect(flattenStyle(getByTestId('create-session-legal-gates').props.style).borderColor).toBe(
      colors.danger
    );
    expect(getByTestId('create-session-legal-gates').props.accessibilityState.invalid).toBe(true);
    expect(getByTestId('legal-gate-terms').props.accessibilityState.checked).toBe(false);
    expect(getByTestId('legal-gate-terms-wrap').props.accessibilityState.invalid).toBe(true);
    expect(flattenStyle(getByTestId('legal-gate-terms-wrap').props.style).borderColor).toBe(
      'rgba(215,90,77,0.4)'
    );
    expect(getByText('Read the legal texts first.')).toBeTruthy();
    expect(getByTestId('legal-gates-alert').props.accessibilityRole).toBe('alert');
  });

  it('does not flag the row once the legal texts are accepted', () => {
    const { getByTestId } = render(
      <CreateSessionLegalGates
        acceptedLegal={true}
        onAcceptedLegalChange={noop}
        error="Read the legal texts first."
        attentionKey={1}
        onOpenDocument={noop}
      />
    );

    expect(getByTestId('legal-gate-terms').props.accessibilityState.checked).toBe(true);
    expect(getByTestId('legal-gate-terms-wrap').props.accessibilityState.invalid).toBe(false);
  });

  it('toggles the legal row from the full label hit target', () => {
    const onAcceptedLegalChange = jest.fn();
    const { getByTestId } = render(
      <CreateSessionLegalGates
        acceptedLegal={false}
        onAcceptedLegalChange={onAcceptedLegalChange}
        error=""
        onOpenDocument={noop}
      />
    );

    fireEvent.press(getByTestId('legal-gate-terms'));
    expect(onAcceptedLegalChange).toHaveBeenCalledWith(true);
  });
});
