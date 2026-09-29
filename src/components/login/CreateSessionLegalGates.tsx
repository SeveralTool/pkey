/**
 * First-use legal gate on the create-session screen.
 *
 * Failed submit (restore / receive / create) turns the panel into an invalid
 * state: danger border, highlight on the still-unchecked row, and a one-shot
 * shake + outline flash (skipped when Reduce Motion is on).
 */
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../../context/SettingsContext';
import { useValidationAttention } from '../../hooks/useValidationAttention';
import type { LegalDocumentId } from '../../constants/legalContent';

export interface CreateSessionLegalGatesProps {
  acceptedLegal: boolean;
  onAcceptedLegalChange: (value: boolean) => void;
  error: string;
  /** Increment to retrigger attention when the same error is shown again. */
  attentionKey?: number;
  onOpenDocument: (id: Extract<LegalDocumentId, 'privacy' | 'terms'>) => void;
}

const CHECK_SLOT = 28;
const PANEL_RADIUS = 12;

/** Mix a `#RRGGBB` token with an alpha channel. */
function withAlpha(hex: string, alpha: number): string {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return hex;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const CreateSessionLegalGates: React.FC<CreateSessionLegalGatesProps> = ({
  acceptedLegal,
  onAcceptedLegalChange,
  error,
  attentionKey = 0,
  onOpenDocument,
}) => {
  const { c, t, isDark } = useSettings();
  const { trigger, shakeStyle, flashStyle } = useValidationAttention();
  const invalid = error.length > 0;
  const legalPending = invalid && !acceptedLegal;

  useEffect(() => {
    if (attentionKey === 0) return;
    trigger();
  }, [attentionKey, trigger]);

  const chipTone = {
    borderColor: isDark ? 'rgba(135,203,40,0.35)' : 'rgba(135,203,40,0.4)',
    backgroundColor: isDark ? 'rgba(135,203,40,0.08)' : 'rgba(135,203,40,0.1)',
  };
  const idleFill = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(45,58,63,0.04)';
  const dangerFill = withAlpha(c.danger, isDark ? 0.12 : 0.08);
  const dangerRowFill = withAlpha(c.danger, isDark ? 0.16 : 0.1);
  const dangerRowBorder = withAlpha(c.danger, isDark ? 0.45 : 0.4);

  return (
    <Animated.View style={shakeStyle}>
      <View
        testID="create-session-legal-gates"
        accessibilityState={{ invalid }}
        style={[
          styles.panel,
          {
            borderColor: invalid ? c.danger : c.border,
            backgroundColor: invalid ? dangerFill : idleFill,
          },
        ]}
      >
        <LegalGateRow
          checked={acceptedLegal}
          pending={legalPending}
          label={t.login_legal_accept}
          accessibilityLabel={t.login_legal_accept}
          testID="legal-gate-terms"
          iconColor={acceptedLegal ? c.accent : legalPending ? c.danger : c.textMuted}
          textColor={acceptedLegal ? c.text : legalPending ? c.danger : c.textMuted}
          pendingFill={dangerRowFill}
          pendingBorder={dangerRowBorder}
          onToggle={() => onAcceptedLegalChange(!acceptedLegal)}
        >
          <View style={styles.links} testID="legal-gate-doc-links">
            <TouchableOpacity
              style={[styles.linkChip, chipTone]}
              onPress={() => onOpenDocument('privacy')}
              accessibilityRole="button"
              accessibilityLabel={t.login_legal_open_privacy}
              hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
            >
              <Ionicons name="document-text-outline" size={12} color={c.accent} />
              <Text style={[styles.link, { color: c.accent }]} numberOfLines={1}>
                {t.legal_privacy_title}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.linkChip, chipTone]}
              onPress={() => onOpenDocument('terms')}
              accessibilityRole="button"
              accessibilityLabel={t.login_legal_open_terms}
              hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
            >
              <Ionicons name="document-outline" size={12} color={c.accent} />
              <Text style={[styles.link, { color: c.accent }]} numberOfLines={1}>
                {t.legal_terms_title}
              </Text>
            </TouchableOpacity>
          </View>
        </LegalGateRow>

        {invalid ? (
          <View
            testID="legal-gates-alert"
            style={[styles.alert, { backgroundColor: dangerRowFill, borderColor: dangerRowBorder }]}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            <Ionicons name="alert-circle" size={16} color={c.danger} />
            <Text style={[styles.error, { color: c.danger }]}>{error}</Text>
          </View>
        ) : null}

        <Animated.View
          pointerEvents="none"
          style={[styles.flashRing, { borderColor: c.danger }, flashStyle]}
        />
      </View>
    </Animated.View>
  );
};

type LegalGateRowProps = {
  checked: boolean;
  pending: boolean;
  label: string;
  accessibilityLabel: string;
  testID: string;
  iconColor: string;
  textColor: string;
  pendingFill: string;
  pendingBorder: string;
  onToggle: () => void;
  children?: React.ReactNode;
};

const LegalGateRow: React.FC<LegalGateRowProps> = ({
  checked,
  pending,
  label,
  accessibilityLabel,
  testID,
  iconColor,
  textColor,
  pendingFill,
  pendingBorder,
  onToggle,
  children,
}) => (
  <View
    testID={`${testID}-wrap`}
    accessibilityState={{ invalid: pending }}
    style={[
      styles.item,
      pending && {
        backgroundColor: pendingFill,
        borderColor: pendingBorder,
      },
      !pending && styles.itemIdle,
    ]}
  >
    <Pressable
      testID={testID}
      style={styles.row}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
    >
      <View
        style={[
          styles.checkFrame,
          pending && { borderColor: pendingBorder, backgroundColor: pendingFill },
        ]}
      >
        <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={20} color={iconColor} />
      </View>
      <Text style={[styles.label, { color: textColor }]} accessible={false}>
        {label}
      </Text>
    </Pressable>
    {children}
  </View>
);

const styles = StyleSheet.create({
  panel: {
    marginTop: 14,
    marginBottom: 2,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: PANEL_RADIUS,
    borderWidth: 1,
    gap: 8,
  },
  flashRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: PANEL_RADIUS,
    borderWidth: 2,
  },
  item: {
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  itemIdle: {
    borderColor: 'transparent',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkFrame: {
    width: CHECK_SLOT,
    height: CHECK_SLOT,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    alignContent: 'flex-start',
    columnGap: 6,
    rowGap: 6,
    paddingLeft: CHECK_SLOT + 8,
    paddingBottom: 2,
  },
  linkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexGrow: 0,
    flexShrink: 0,
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 7,
    borderWidth: 1,
  },
  link: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 0,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  error: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
});
