/**
 * @fileoverview Renderable component for a single password card item.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { PasswordCard, AppSettings } from '../../types';
import { copySecret } from '../../services/secureClipboard';
import { getVaultSecretStore } from '../../services/vaultSecrets';
import type { DuplicateIndex } from '../../hooks/useCardAnalysis';
import { useOpenCardLink } from '../../hooks/useOpenCardLink';
import { notifications } from '../../notifications/notificationRef';
import { globalStyles as styles } from '../../styles/globalStyles';
import { SwipeableCardShell } from './SwipeableCardShell';
import { getCardCopyPayload, buildCopySuccessMessage } from './swipeActions';
import { CardCollapsedHeader } from './CardCollapsedHeader';
import { CardExpandedBody } from './CardExpandedBody';
import type { CollapsedSubtitleMode } from './collapsedSubtitle';

export interface CardItemProps {
  item: PasswordCard;
  expanded: boolean;
  autoCollapse: boolean;
  isDark: boolean;
  c: Record<string, string>;
  t: Record<string, string>;
  appSettings: AppSettings;
  customPromptVisible: boolean;
  alertQueueBlocking: boolean;
  usernameIndex: DuplicateIndex;
  passwordIndex: DuplicateIndex;
  onToggle: () => void;
  onSetCustomIconModal: (modal: { visible: boolean; cardId: string | null }) => void;
  onUpdateCardValue: (cardId: string, field: keyof PasswordCard, value: unknown) => void;
  onUpdatePasswordListItem: (cardId: string, index: number, value: string) => void;
  onAddPasswordListItem: (cardId: string) => void;
  onSaveCard: (cardId: string) => void;
  onSaveCardWithFields: (cardId: string, fields?: Partial<PasswordCard>) => void;
  onDeleteCard: (cardId: string) => void;
  onBiometricCheck: (onSuccess: () => void, prompt: string) => void;
  onQrScannerActiveChange?: (active: boolean) => void;
  hibpEnabled: boolean;
  hibpChecking: boolean;
  onCheckHibp: (cardId: string) => void;
  /** Grouped members show username on the collapsed row; singles keep the URL. */
  subtitleMode?: CollapsedSubtitleMode;
}

/**
 * Interactive card: light collapsed row for list scroll; heavy editor mounts on expand.
 */
export const CardItem = React.memo(
  function CardItem({
    item,
    expanded,
    autoCollapse,
    isDark,
    c,
    t,
    appSettings,
    customPromptVisible,
    alertQueueBlocking,
    usernameIndex,
    passwordIndex,
    onToggle,
    onSetCustomIconModal,
    onUpdateCardValue,
    onUpdatePasswordListItem,
    onAddPasswordListItem,
    onSaveCard,
    onSaveCardWithFields,
    onDeleteCard,
    onBiometricCheck,
    onQrScannerActiveChange,
    hibpEnabled,
    hibpChecking,
    onCheckHibp,
    subtitleMode = 'link',
  }: CardItemProps) {
    // Mount expanded body immediately when created already-open (avoids late height jump after scroll).
    const [localExpanded, setLocalExpanded] = useState<boolean>(expanded);
    const [bodyLoading, setBodyLoading] = useState(!!expanded);
    const [showExpandedBody, setShowExpandedBody] = useState(!!expanded);

    const { handleOpenCardLink, isOpeningLink } = useOpenCardLink({
      openLinksInAppBrowser: !!appSettings.openLinksInAppBrowser,
      t,
    });

    useEffect(() => {
      if (autoCollapse) {
        setLocalExpanded(expanded);
      }
    }, [expanded, autoCollapse]);

    const isExpanded = autoCollapse ? expanded : localExpanded;

    // Only react to real expand/collapse transitions. On first mount the
    // initial state already mirrors `expanded`, and the body's onReady clears
    // `bodyLoading`; re-running this effect on mount would re-enable the
    // loader after the body reported ready (stuck spinner when a row remounts
    // already-open, e.g. FlashList recycling).
    const prevExpandedRef = useRef(isExpanded);
    useEffect(() => {
      const prev = prevExpandedRef.current;
      prevExpandedRef.current = isExpanded;
      if (prev === isExpanded) return;
      if (isExpanded) {
        setBodyLoading(true);
        // Immediate mount (no startTransition): deferred body growth was shifting FlashList offset
        // after create-card scroll-to-top, leaving the viewport on the bottom of the new card.
        setShowExpandedBody(true);
      } else {
        setShowExpandedBody(false);
        setBodyLoading(false);
      }
    }, [isExpanded]);

    const handleBodyReady = useCallback(() => {
      setBodyLoading(false);
    }, []);

    const handleToggleExpand = useCallback(() => {
      if (autoCollapse) {
        onToggle();
      } else {
        setLocalExpanded((prev) => !prev);
      }
    }, [autoCollapse, onToggle]);

    const handleCollapseAfterSave = useCallback(() => {
      setLocalExpanded(false);
    }, []);

    const handleSecureCopyText = useCallback(
      (val: string, label: string) => {
        const trimmed = val.trim();
        if (!trimmed) {
          notifications.toast({
            title: t.notif_copy_empty_title,
            message: t.notif_copy_empty_message,
            variant: 'warning',
            duration: 4000,
          });
          return;
        }
        onBiometricCheck(() => {
          void copySecret(trimmed, {
            onCopied: () => {
              notifications.toast({
                title: t.notif_copy_success_title,
                message: buildCopySuccessMessage(t, label, item.title),
                variant: 'success',
                duration: 5000,
              });
            },
            onCleared: () => {
              notifications.toast({
                title: t.notif_copy_cleared,
                message: t.notif_copy_cleared_message,
                variant: 'info',
                duration: 2000,
              });
            },
          });
        }, t.require_auth_clipboard);
      },
      [item.title, onBiometricCheck, t]
    );

    const secretItem = getVaultSecretStore().cardWithSecrets(item);

    const handleCopyCard = useCallback(() => {
      const label =
        item.type === 'NOTE'
          ? t.copy_label_note
          : item.type === 'SECRET_PHRASE'
            ? t.copy_label_seed
            : t.copy_label_password;
      handleSecureCopyText(getCardCopyPayload(secretItem), label);
    }, [handleSecureCopyText, item.type, secretItem, t]);

    const hasBlockingModal = customPromptVisible || alertQueueBlocking;
    const swipeEnabled = !isExpanded && !hasBlockingModal;

    return (
      <SwipeableCardShell
        enabled={swipeEnabled}
        successColor={c.success}
        dangerColor={c.danger}
        onSwipeRight={handleCopyCard}
        onSwipeLeft={() => onDeleteCard(item.id)}
        accessibilityLabel={t.card_swipe_a11y}
      >
        <View
          style={[
            styles.collapsedOuterInteractiveCardContainer,
            { backgroundColor: c.cardBg, borderColor: c.border, borderWidth: 1 },
          ]}
        >
          <CardCollapsedHeader
            item={item}
            isExpanded={isExpanded}
            bodyLoading={bodyLoading && isExpanded}
            isDark={isDark}
            c={c}
            t={t}
            isOpeningLink={isOpeningLink}
            onToggleExpand={handleToggleExpand}
            onOpenLink={() => handleOpenCardLink(item.link)}
            onSetCustomIconModal={onSetCustomIconModal}
            subtitleMode={subtitleMode}
          />

          {showExpandedBody && (
            <CardExpandedBody
              item={secretItem}
              isDark={isDark}
              c={c}
              t={t}
              appSettings={appSettings}
              usernameIndex={usernameIndex}
              passwordIndex={passwordIndex}
              autoCollapse={autoCollapse}
              onCollapseAfterSave={handleCollapseAfterSave}
              onUpdateCardValue={onUpdateCardValue}
              onUpdatePasswordListItem={onUpdatePasswordListItem}
              onAddPasswordListItem={onAddPasswordListItem}
              onSaveCard={onSaveCard}
              onSaveCardWithFields={onSaveCardWithFields}
              onDeleteCard={onDeleteCard}
              onBiometricCheck={onBiometricCheck}
              onQrScannerActiveChange={onQrScannerActiveChange}
              hibpEnabled={hibpEnabled}
              hibpChecking={hibpChecking}
              onCheckHibp={onCheckHibp}
              onReady={handleBodyReady}
            />
          )}
        </View>
      </SwipeableCardShell>
    );
  },
  (prev, next) =>
    prev.item === next.item &&
    prev.expanded === next.expanded &&
    prev.autoCollapse === next.autoCollapse &&
    prev.customPromptVisible === next.customPromptVisible &&
    prev.alertQueueBlocking === next.alertQueueBlocking &&
    prev.usernameIndex === next.usernameIndex &&
    prev.passwordIndex === next.passwordIndex &&
    prev.hibpEnabled === next.hibpEnabled &&
    prev.hibpChecking === next.hibpChecking &&
    (prev.subtitleMode ?? 'link') === (next.subtitleMode ?? 'link')
);
