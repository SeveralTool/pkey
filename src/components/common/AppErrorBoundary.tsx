import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { copyPublic } from '../../services/secureClipboard';
import { getLocale } from '../../constants/localization';

/**
 * Top-level error boundary shown when the React tree throws during render.
 *
 * Rationale (audit finding M4):
 *  - Displaying `error.message` directly can leak sensitive substrings if the
 *    thrower interpolated card ids, decrypted fields or file paths into the
 *    message (see e.g. `Failed to persist card <id>: <plaintext>`).
 *  - The UI now shows a generic recovery blurb + the error *class name* (safe:
 *    `TypeError`, `SyntaxError`, `PKeyCryptoError`) and hides the raw message
 *    behind an explicit user action ("Copy technical details"). The copy uses
 *    the public-clipboard helper (no auto-clear) since diagnostic text is not
 *    itself a secret, but users are warned it may contain incidental data.
 */

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  detailsCopied: boolean;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, detailsCopied: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, detailsCopied: false };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Native crash reporters still see the full detail via console.error —
    // babel-plugin-transform-remove-console keeps error/warn in production.
    console.error('[AppErrorBoundary]', error?.message ?? 'unknown', info.componentStack);
  }

  private handleCopyDetails = () => {
    if (!this.state.error) return;
    const payload = [
      `class: ${this.state.error.name ?? 'Error'}`,
      `message: ${String(this.state.error.message ?? '')}`,
      `stack: ${String(this.state.error.stack ?? '<no stack>')}`,
    ].join('\n');
    void copyPublic(payload).then(() => this.setState({ detailsCopied: true }));
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const t = getLocale();
    const errorClass = this.state.error.name || 'Error';

    return (
      <View style={{ flex: 1, padding: 20, justifyContent: 'center', backgroundColor: '#111' }}>
        <Text style={{ color: '#f87171', fontWeight: '700', fontSize: 18, marginBottom: 8 }}>
          {t.crash_title}
        </Text>
        <Text style={{ color: '#fff', fontSize: 14, lineHeight: 20, marginBottom: 16 }}>
          {t.crash_body}
        </Text>
        <View
          style={{
            padding: 10,
            borderRadius: 8,
            backgroundColor: 'rgba(255,255,255,0.05)',
            marginBottom: 16,
          }}
        >
          <Text style={{ color: '#9ca3af', fontFamily: 'monospace', fontSize: 12 }}>
            error class: {errorClass}
          </Text>
        </View>
        <Pressable
          onPress={this.handleCopyDetails}
          accessibilityRole="button"
          accessibilityLabel={t.crash_copy_details}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#374151',
            alignSelf: 'flex-start',
          }}
        >
          <Text style={{ color: '#e5e7eb', fontSize: 13, fontWeight: '600' }}>
            {this.state.detailsCopied ? t.crash_copied : t.crash_copy_details}
          </Text>
        </Pressable>
        {this.state.detailsCopied ? (
          <ScrollView style={{ maxHeight: 220, marginTop: 12 }}>
            <Text
              style={{
                color: '#9ca3af',
                fontFamily: 'monospace',
                fontSize: 11,
                lineHeight: 15,
              }}
              // Reveal the raw text only after the user explicitly copied it —
              // avoids passively rendering it in screenshots / bug reports.
            >
              {String(this.state.error.message ?? '')}
            </Text>
          </ScrollView>
        ) : null}
      </View>
    );
  }
}
