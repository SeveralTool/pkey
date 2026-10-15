/**
 * @fileoverview Collapsed vault row. Editing happens on the card editor screen.
 */
import React, { useCallback } from 'react';
import { View } from 'react-native';
import { PasswordCard, AppSettings } from '../../types';
import type { LocaleStrings } from '../../constants/localization';
import type { ThemeColors } from '../../styles/colors';
import { copySecret } from '../../services/secureClipboard';
import { getVaultSecretStore } from '../../services/vaultSecrets';
import { useOpenCardLink } from '../../hooks/useOpenCardLink';
import { notifications } from '../../notifications/notificationRef';
import { globalStyles as styles } from '../../styles/globalStyles';
import { SwipeableCardShell } from './SwipeableCardShell';
import { getCardCopyPayload, buildCopySuccessMessage } from './swipeActions';
import { CardCollapsedHeader } from './CardCollapsedHeader';
import type { CollapsedSubtitleMode } from './collapsedSubtitle';

export interface CardItemProps {
  item: PasswordCard;
  isDark: boolean;
  c: ThemeColors;
  t: LocaleStrings;
  appSettings: AppSettings;
  customPromptVisible: boolean;
  alertQueueBlocking: boolean;
  onOpen: () => void;
  onSetCustomIconModal: (modal: { visible: boolean; cardId: string | null }) => void;
  onDeleteCard: (cardId: string) => void;
  onBiometricCheck: (onSuccess: () => void, prompt: string) => void;
  /** Grouped members show username on the collapsed row; singles keep the URL. */
  subtitleMode?: CollapsedSubtitleMode;
}

/**
 * List row: swipe to copy or delete, tap to open the editor.
 */
export const CardItem = React.memo(
  function CardItem({
    item,
    isDark,
    c,
    t,
    appSettings,
    customPromptVisible,
    alertQueueBlocking,
    onOpen,
    onSetCustomIconModal,
    onDeleteCard,
    onBiometricCheck,
    subtitleMode = 'link',
  }: CardItemProps) {
    const { handleOpenCardLink, isOpeningLink } = useOpenCardLink({
      openLinksInAppBrowser: !!appSettings.openLinksInAppBrowser,
      t,
    });

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

    return (
      <SwipeableCardShell
        enabled={!hasBlockingModal}
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
            isDark={isDark}
            c={c}
            t={t}
            isOpeningLink={isOpeningLink}
            onOpen={onOpen}
            onOpenLink={() => handleOpenCardLink(item.link)}
            onSetCustomIconModal={onSetCustomIconModal}
            subtitleMode={subtitleMode}
          />
        </View>
      </SwipeableCardShell>
    );
  },
  (prev, next) =>
    prev.item === next.item &&
    prev.customPromptVisible === next.customPromptVisible &&
    prev.alertQueueBlocking === next.alertQueueBlocking &&
    (prev.subtitleMode ?? 'link') === (next.subtitleMode ?? 'link')
);
