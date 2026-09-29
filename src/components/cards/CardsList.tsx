/**
 * @fileoverview Component managing the list of all stored password cards.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCoreState, type CardsListFilter } from '../../context/CoreStateContext';
import { useUI, useUISearch } from '../../context/UIContext';
import { useDatabase } from '../../context/DatabaseContext';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { usePressScale, useReducedMotion } from '../../hooks';
import { CardItem } from './CardItem';
import { LinkGroupCard } from './LinkGroupCard';
import type { CollapsedSubtitleMode } from './collapsedSubtitle';
import { globalStyles as styles, spacing } from '../../styles/globalStyles';
import { estimateCardsListBottomPadding, estimateFabBottom } from '../../navigation/tabBarInset';
import { buildDuplicateIndices } from '../../hooks/useCardAnalysis';
import { cardsWithVaultSecrets } from '../../services/vaultSecrets';
import {
  matchLoginCandidates,
  groupCardsByLinkKey,
  linkGroupKey,
  applyCardsListOrder,
  sortCardLinkListRows,
  toggleCardsListSortMode,
  type CardLinkListRow,
} from '@pkey/core';
import type { PasswordCard } from '../../types';

/** Fallback until the search header reports its real height via onLayout. */
const SEARCH_HEADER_FALLBACK_HEIGHT = 56;

function looksLikeUrlOrHost(q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return false;
  if (s.includes('://') || s.startsWith('www.')) return true;
  if (s.includes('.') && !s.includes(' ')) return true;
  if (s.startsWith('android-app://')) return true;
  return /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(s);
}

function matchesCardsFilter(card: PasswordCard, filter: CardsListFilter): boolean {
  if (!filter) return true;
  if (filter.cardIds) return filter.cardIds.includes(card.id);

  switch (filter.kind) {
    case 'password':
      return card.type === 'PASSWORD';
    case 'secret_phrase':
      return card.type === 'SECRET_PHRASE';
    case 'note':
      return card.type === 'NOTE';
    case 'reused_username':
      return false;
    case 'no_otp':
      return card.type === 'PASSWORD' && !card.otpSecret?.trim();
    case 'empty_username':
      return !card.username.trim();
    case 'empty_password':
      return card.type === 'PASSWORD' && !(card.passwordList[0] ?? '').trim();
    case 'empty_link':
      return !card.link.trim();
    case 'untagged':
      return !(card.tags ?? []).some((tag) => tag.trim());
    case 'stale': {
      const t = Date.parse(card.last_update);
      return !Number.isNaN(t) && Date.now() - t > 90 * 24 * 60 * 60 * 1000;
    }
    case 'duplicates':
    case 'weak':
    case 'hibp_checked':
    case 'hibp_breached':
      // Prefer precomputed cardIds from Stats for these kinds.
      return false;
    default:
      return true;
  }
}

function filterLabel(filter: NonNullable<CardsListFilter>, t: Record<string, string>): string {
  switch (filter.kind) {
    case 'duplicates':
      return t.stat_duplicated_pass;
    case 'weak':
      return t.stat_weak_pass;
    case 'stale':
      return t.stat_stale_pass;
    case 'no_otp':
      return t.stat_otp_without;
    case 'empty_username':
      return t.stat_empty_username;
    case 'empty_password':
      return t.stat_empty_password;
    case 'empty_link':
      return t.stat_empty_link;
    case 'untagged':
      return t.stat_untagged;
    case 'password':
      return t.stat_type_password;
    case 'secret_phrase':
      return t.stat_type_secret;
    case 'note':
      return t.stat_type_note;
    case 'reused_username':
      return t.stat_reused_username;
    case 'hibp_checked':
      return t.stat_hibp_checked;
    case 'hibp_breached':
      return t.stat_hibp_breached;
    default:
      return t.stats_filter_active;
  }
}

type ListRow = CardLinkListRow<PasswordCard>;

type CardsEmptyStateProps = Readonly<{
  mutedColor: string;
  accentColor: string;
  emptyLabel: string;
  addLabel?: string;
  onCreate?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}>;

const CardsEmptyState = React.memo(function CardsEmptyState({
  mutedColor,
  accentColor,
  emptyLabel,
  addLabel,
  onCreate,
  actionLabel,
  onAction,
}: CardsEmptyStateProps) {
  return (
    <View style={styles.centeredInfoEmptyBlock}>
      <Ionicons name="folder-open-outline" size={48} color={mutedColor} />
      <Text style={[styles.emptyLabelNotice, { color: mutedColor }]}>{emptyLabel}</Text>
      {onCreate && addLabel ? (
        <TouchableOpacity
          style={[
            styles.primaryActActionButton,
            { paddingHorizontal: 24, marginTop: 14, backgroundColor: accentColor },
          ]}
          onPress={onCreate}
          accessibilityRole="button"
          accessibilityLabel={addLabel}
        >
          <Text style={styles.primaryActActionText}>{addLabel}</Text>
        </TouchableOpacity>
      ) : null}
      {onAction && actionLabel ? (
        <TouchableOpacity
          style={[
            styles.secGhostOutlineButton,
            { paddingHorizontal: 24, marginTop: 14, borderColor: accentColor },
          ]}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={[styles.secGhostOutlineText, { color: accentColor }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

export const CardsList = () => {
  const { db, customPrompt } = useCoreState();
  const { searchQuery, setSearchQuery } = useUISearch();
  const {
    cardsFilter,
    setCardsFilter,
    cardsSortMode,
    setCardsSortMode,
    expandedCardId,
    setExpandedCardId,
    setCustomIconModal,
  } = useUI();
  const {
    handleCreateNewCard,
    handleUpdateCardValue,
    handleUpdatePasswordListItem,
    handleAddPasswordListItem,
    handleSaveCard,
    handleSaveCardWithFields,
    handleDeleteCard,
    handleCheckCardPassword,
    hibpPendingIds,
  } = useDatabase();
  const { c, t, isDark } = useSettings();
  const { performBiometricOrPasswordCheck } = useAuth();
  const { queue } = useNotifications();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const {
    onPressIn: onFabPressIn,
    onPressOut: onFabPressOut,
    playEntrance: playFabEntrance,
    animatedStyle: fabAnimatedStyle,
  } = usePressScale(0.97, 0);

  const listRef = useRef<FlashListRef<ListRow>>(null);
  /** While true, keep forcing contentOffset=0 through expand/layout races. */
  const pinScrollTopRef = useRef(false);
  const pinScrollTopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Finger / fling only — FlashList also emits onScroll during data relayout (sort). */
  const userScrollingRef = useRef(false);
  /**
   * After a sort while parked at the top, FlashList often nudges contentOffset by a
   * few px (first-item offset vs paddingTop under the search overlay). Snap back
   * only if it actually drifted — calling scrollToOffset(0) while already at 0
   * jumps to the first card (skipFirstItemOffset).
   */
  const sortTopLockRef = useRef(false);
  const sortTopLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [headerHeight, setHeaderHeight] = useState(SEARCH_HEADER_FALLBACK_HEIGHT);
  const [headerPointerEvents, setHeaderPointerEvents] = useState<'auto' | 'none'>('auto');

  const headerHeightSV = useSharedValue(SEARCH_HEADER_FALLBACK_HEIGHT);
  const headerTranslate = useSharedValue(0);
  const prevScrollY = useSharedValue(0);
  const reduceMotionSV = useSharedValue(reduceMotion);

  useEffect(() => {
    return () => {
      if (pinScrollTopTimerRef.current) clearTimeout(pinScrollTopTimerRef.current);
      if (sortTopLockTimerRef.current) clearTimeout(sortTopLockTimerRef.current);
    };
  }, []);

  useEffect(() => {
    reduceMotionSV.value = reduceMotion;
    if (reduceMotion) {
      headerTranslate.value = 0;
      prevScrollY.value = 0;
      setHeaderPointerEvents('auto');
    }
  }, [reduceMotion]);

  const hasCards = db.cards.length > 0;

  useEffect(() => {
    if (hasCards) {
      playFabEntrance();
    }
  }, [hasCards, playFabEntrance]);

  const autoCollapse = !!db.settings?.autoCollapse;
  const groupByLink = !!db.settings?.groupCardsByLink;
  const hibpEnabled = !!db.settings?.enableHibpCheck;
  const customPromptVisible = customPrompt.visible;
  const alertQueueBlocking = queue.some((n) => n.mode === 'alert');
  const [qrScannerActive, setQrScannerActive] = useState(false);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);

  const handleQrScannerActiveChange = useCallback((active: boolean) => {
    setQrScannerActive(active);
  }, []);

  const secretCards = useMemo(() => cardsWithVaultSecrets(db.cards), [db.cards]);

  const { usernameIndex, passwordIndex } = useMemo(
    () => buildDuplicateIndices(secretCards),
    [secretCards]
  );

  const filteredCards = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const base = secretCards.filter((card) => matchesCardsFilter(card, cardsFilter));
    if (!q) return { cards: base, urlRanked: false };

    if (looksLikeUrlOrHost(q)) {
      const ranked = matchLoginCandidates(base, { urlOrHost: q, packageName: q, limit: 100 });
      if (ranked.length > 0) return { cards: ranked.map((r) => r.card), urlRanked: true };
    }

    return {
      cards: base.filter((card) => {
        return (
          card.title.toLowerCase().includes(q) ||
          card.username.toLowerCase().includes(q) ||
          card.link.toLowerCase().includes(q) ||
          (card.tags ?? []).some((tag) => tag.includes(q)) ||
          (card.type === 'NOTE' && (card.notes || '').toLowerCase().includes(q))
        );
      }),
      urlRanked: false,
    };
  }, [secretCards, searchQuery, cardsFilter]);

  const orderedCards = useMemo(
    () =>
      applyCardsListOrder(filteredCards.cards, {
        mode: cardsSortMode,
        expandedId: expandedCardId,
        skipSort: filteredCards.urlRanked,
      }),
    [filteredCards, cardsSortMode, expandedCardId]
  );

  const listRows: ListRow[] = useMemo(() => {
    if (!groupByLink) {
      return orderedCards.map((card) => ({ kind: 'single' as const, card }));
    }
    const grouped = groupCardsByLinkKey(orderedCards);
    if (filteredCards.urlRanked) return grouped;
    return sortCardLinkListRows(grouped, cardsSortMode);
  }, [orderedCards, groupByLink, filteredCards.urlRanked, cardsSortMode]);

  // Stats / create deep-link: open the parent group when a member is expanded.
  useEffect(() => {
    if (!groupByLink || !expandedCardId) return;
    const card = secretCards.find((cardRow) => cardRow.id === expandedCardId);
    if (!card) return;
    const key = linkGroupKey(card.link || '');
    if (key) setExpandedGroupKey(key);
  }, [expandedCardId, groupByLink, secretCards]);

  useEffect(() => {
    if (!groupByLink) setExpandedGroupKey(null);
  }, [groupByLink]);

  const resetSearchHeader = useCallback(() => {
    headerTranslate.value = 0;
    prevScrollY.value = 0;
    setHeaderPointerEvents('auto');
  }, []);

  const handleHeaderLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.ceil(e.nativeEvent.layout.height);
    if (next <= 0) return;
    setHeaderHeight((prev) => (prev === next ? prev : next));
    headerHeightSV.value = next;
    const current = headerTranslate.value;
    headerTranslate.value = Math.min(next, Math.max(0, current));
  }, []);

  const forceScrollAbsoluteTop = useCallback(() => {
    // Absolute top of the scroll content (includes list paddingTop under search overlay).
    listRef.current?.scrollToOffset({
      offset: 0,
      animated: false,
      skipFirstItemOffset: false,
    });
    headerTranslate.value = 0;
    prevScrollY.value = 0;
  }, [headerTranslate, prevScrollY]);

  const beginPinScrollTop = useCallback(() => {
    pinScrollTopRef.current = true;
    resetSearchHeader();
    forceScrollAbsoluteTop();
    if (pinScrollTopTimerRef.current) clearTimeout(pinScrollTopTimerRef.current);
    // Cover FlashList recycle + expanded body mount + any late contentSizeChange.
    pinScrollTopTimerRef.current = setTimeout(() => {
      forceScrollAbsoluteTop();
      pinScrollTopRef.current = false;
      pinScrollTopTimerRef.current = null;
    }, 500);
  }, [forceScrollAbsoluteTop, resetSearchHeader]);

  // FlashList is not a Reanimated host: useAnimatedScrollHandler crashes in RN _handleScroll.
  // JS onScroll + shared values still drives the collapsing header via useAnimatedStyle.
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const yRaw = event.nativeEvent.contentOffset.y;
      // Create-card / pin mode: reject drift from prepend+expand layout adjustments.
      if (pinScrollTopRef.current) {
        if (yRaw > 0.5) {
          forceScrollAbsoluteTop();
        } else {
          headerTranslate.value = 0;
          prevScrollY.value = 0;
        }
        return;
      }
      if (reduceMotionSV.value) {
        headerTranslate.value = 0;
        prevScrollY.value = Math.max(0, yRaw);
        return;
      }
      const y = Math.max(0, yRaw);
      // Relayout after reorder fires onScroll without a drag. Applying that dy
      // slides the overlay header a few px and feels like a mini list jump.
      if (!userScrollingRef.current) {
        if (sortTopLockRef.current && yRaw > 0.5) {
          listRef.current?.scrollToOffset({
            offset: 0,
            animated: false,
            skipFirstItemOffset: false,
          });
          prevScrollY.value = 0;
          headerTranslate.value = 0;
          return;
        }
        prevScrollY.value = y;
        return;
      }
      const dy = y - prevScrollY.value;
      prevScrollY.value = y;
      headerTranslate.value = Math.min(
        headerHeightSV.value,
        Math.max(0, headerTranslate.value + dy)
      );
    },
    [forceScrollAbsoluteTop, headerHeightSV, headerTranslate, prevScrollY, reduceMotionSV]
  );

  const onScrollBeginDrag = useCallback(() => {
    userScrollingRef.current = true;
    sortTopLockRef.current = false;
    if (sortTopLockTimerRef.current) {
      clearTimeout(sortTopLockTimerRef.current);
      sortTopLockTimerRef.current = null;
    }
  }, []);

  const onScrollEndDrag = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const velocity = event.nativeEvent.velocity?.y ?? 0;
    if (Math.abs(velocity) < 0.05) {
      userScrollingRef.current = false;
    }
  }, []);

  const onMomentumScrollEnd = useCallback(() => {
    userScrollingRef.current = false;
  }, []);

  const onContentSizeChange = useCallback(() => {
    if (pinScrollTopRef.current) {
      forceScrollAbsoluteTop();
    }
  }, [forceScrollAbsoluteTop]);

  useAnimatedReaction(
    () => {
      if (reduceMotionSV.value) return false;
      return headerTranslate.value >= headerHeightSV.value - 1;
    },
    (hidden, prev) => {
      if (hidden !== prev) {
        runOnJS(setHeaderPointerEvents)(hidden ? 'none' : 'auto');
      }
    }
  );

  const headerAnimatedStyle = useAnimatedStyle(() => {
    if (reduceMotionSV.value) {
      return { transform: [{ translateY: 0 }], opacity: 1 };
    }
    const h = Math.max(1, headerHeightSV.value);
    return {
      transform: [{ translateY: -headerTranslate.value }],
      opacity: interpolate(
        headerTranslate.value,
        [0, h * 0.85, h],
        [1, 0.55, 0],
        Extrapolation.CLAMP
      ),
    };
  });

  const handleToggleSortMode = useCallback(() => {
    if (prevScrollY.value <= 8) {
      sortTopLockRef.current = true;
      if (sortTopLockTimerRef.current) clearTimeout(sortTopLockTimerRef.current);
      sortTopLockTimerRef.current = setTimeout(() => {
        sortTopLockRef.current = false;
        sortTopLockTimerRef.current = null;
      }, 320);
    }
    setCardsSortMode((prev) => toggleCardsListSortMode(prev));
  }, [prevScrollY, setCardsSortMode]);

  const handleCreateNewCardWithAnimation = useCallback(() => {
    setSearchQuery('');
    setCardsFilter(null);
    // Pin before await: FlashList may shift offset as soon as the prepend hits `data`.
    // No LayoutAnimation here — it fights scroll anchoring with a tall expanded first row.
    beginPinScrollTop();
    void handleCreateNewCard().then(() => {
      forceScrollAbsoluteTop();
      requestAnimationFrame(() => {
        forceScrollAbsoluteTop();
        requestAnimationFrame(forceScrollAbsoluteTop);
      });
    });
  }, [
    beginPinScrollTop,
    forceScrollAbsoluteTop,
    handleCreateNewCard,
    setCardsFilter,
    setSearchQuery,
  ]);

  const handleToggle = useCallback(
    (cardId: string) => {
      if (autoCollapse) {
        setExpandedCardId(expandedCardId === cardId ? null : cardId);
      }
    },
    [autoCollapse, expandedCardId, setExpandedCardId]
  );

  const handleToggleGroup = useCallback((key: string) => {
    setExpandedGroupKey((prev) => (prev === key ? null : key));
  }, []);

  const renderCardItem = useCallback(
    (item: PasswordCard, subtitleMode: CollapsedSubtitleMode = 'link') => (
      <CardItem
        item={item}
        expanded={expandedCardId === item.id}
        autoCollapse={autoCollapse}
        isDark={isDark}
        c={c}
        t={t}
        appSettings={db.settings}
        customPromptVisible={customPromptVisible}
        alertQueueBlocking={alertQueueBlocking}
        usernameIndex={usernameIndex}
        passwordIndex={passwordIndex}
        onToggle={() => handleToggle(item.id)}
        onSetCustomIconModal={setCustomIconModal}
        onUpdateCardValue={handleUpdateCardValue}
        onUpdatePasswordListItem={handleUpdatePasswordListItem}
        onAddPasswordListItem={handleAddPasswordListItem}
        onSaveCard={handleSaveCard}
        onSaveCardWithFields={handleSaveCardWithFields}
        onDeleteCard={handleDeleteCard}
        onBiometricCheck={performBiometricOrPasswordCheck}
        onQrScannerActiveChange={handleQrScannerActiveChange}
        hibpEnabled={hibpEnabled}
        hibpChecking={hibpPendingIds.includes(item.id)}
        onCheckHibp={handleCheckCardPassword}
        subtitleMode={subtitleMode}
      />
    ),
    [
      expandedCardId,
      autoCollapse,
      isDark,
      c,
      t,
      db.settings,
      customPromptVisible,
      alertQueueBlocking,
      usernameIndex,
      passwordIndex,
      handleToggle,
      setCustomIconModal,
      handleUpdateCardValue,
      handleUpdatePasswordListItem,
      handleAddPasswordListItem,
      handleSaveCard,
      handleSaveCardWithFields,
      handleDeleteCard,
      performBiometricOrPasswordCheck,
      handleQrScannerActiveChange,
      hibpEnabled,
      hibpPendingIds,
      handleCheckCardPassword,
    ]
  );

  const renderItem = useCallback(
    ({ item }: { item: ListRow }) => {
      if (item.kind === 'single') {
        return renderCardItem(item.card);
      }
      const groupExpanded = expandedGroupKey === item.key;
      return (
        <LinkGroupCard
          label={item.label}
          count={item.cards.length}
          icon={item.cards[0]?.icon ?? { type: 'icon', value: 'key-outline' }}
          link={item.cards[0]?.link ?? item.label}
          expanded={groupExpanded}
          isDark={isDark}
          c={c}
          t={t}
          onToggle={() => handleToggleGroup(item.key)}
        >
          {item.cards.map((member) => (
            <View key={member.id}>{renderCardItem(member, 'username')}</View>
          ))}
        </LinkGroupCard>
      );
    },
    [renderCardItem, expandedGroupKey, isDark, c, t, handleToggleGroup]
  );

  const keyExtractor = useCallback((item: ListRow) => {
    if (item.kind === 'single') return item.card.id;
    return `group:${item.key}`;
  }, []);

  // Separate recycle pools for collapsed vs expanded vs group rows.
  const getItemType = useCallback(
    (item: ListRow) => {
      if (item.kind === 'group') return 'group';
      if (expandedCardId && item.card.id === expandedCardId) return 'expanded';
      return 'collapsed';
    },
    [expandedCardId]
  );

  return (
    <View style={styles.centerFlexFrame}>
      <FlashList
        ref={listRef}
        data={listRows}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemType={getItemType}
        extraData={{ expandedCardId, expandedGroupKey, qrScannerActive, groupByLink }}
        style={styles.cardsList}
        contentContainerStyle={[
          styles.cardsListContent,
          { paddingBottom: estimateCardsListBottomPadding(insets.bottom) },
          hasCards ? { paddingTop: headerHeight } : null,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onContentSizeChange={onContentSizeChange}
        scrollEventThrottle={16}
        ListEmptyComponent={
          hasCards ? (
            <CardsEmptyState
              mutedColor={c.textMuted}
              accentColor={c.accent}
              emptyLabel={t.empty_cards_no_match}
              actionLabel={t.empty_cards_clear}
              onAction={() => {
                setSearchQuery('');
                setCardsFilter(null);
              }}
            />
          ) : (
            <CardsEmptyState
              mutedColor={c.textMuted}
              accentColor={c.accent}
              emptyLabel={t.empty_cards}
              addLabel={t.add_first_card}
              onCreate={handleCreateNewCardWithAnimation}
            />
          )
        }
      />

      {hasCards && (
        <Animated.View
          pointerEvents={headerPointerEvents}
          onLayout={handleHeaderLayout}
          style={[
            styles.searchBarBorderContainer,
            styles.searchBarOverlay,
            {
              backgroundColor: c.bg,
              // Extend under the translucent status bar; list scrolls behind when collapsed.
              paddingTop: insets.top + spacing.sm,
            },
            headerAnimatedStyle,
          ]}
        >
          <View style={styles.searchHeaderRow}>
            <View
              style={[
                styles.searchPillInputLayout,
                { backgroundColor: c.cardBg, borderColor: c.border, borderWidth: 1 },
              ]}
            >
              <Ionicons
                name="search"
                size={18}
                color={c.textMuted}
                style={{ marginLeft: 12, marginRight: 6 }}
              />
              <TextInput
                style={[styles.searchInputTextEditable, { color: c.text }]}
                placeholder={t.search_placeholder}
                placeholderTextColor={c.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                accessibilityRole="search"
                accessibilityLabel={t.search_placeholder}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  style={{ padding: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={t.a11y_clear_search}
                >
                  <Ionicons name="close-circle" size={16} color={c.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              onPress={handleToggleSortMode}
              style={[
                styles.searchSortButton,
                { backgroundColor: c.cardBg, borderColor: c.border },
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                cardsSortMode === 'title' ? t.a11y_sort_cards_title : t.a11y_sort_cards_updated
              }
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Ionicons
                name={cardsSortMode === 'title' ? 'text-outline' : 'time-outline'}
                size={20}
                color={c.accent}
              />
            </TouchableOpacity>
          </View>
          {cardsFilter && (
            <TouchableOpacity
              onPress={() => setCardsFilter(null)}
              accessibilityRole="button"
              accessibilityLabel={`${t.a11y_clear_filter}: ${filterLabel(cardsFilter, t)}`}
              style={{
                marginTop: 8,
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.cardBg,
              }}
            >
              <Ionicons name="filter" size={14} color={c.accent} style={{ marginRight: 6 }} />
              <Text style={{ color: c.text, fontSize: 12, fontWeight: '600', flexShrink: 1 }}>
                {filterLabel(cardsFilter, t)}
              </Text>
              <Ionicons name="close" size={14} color={c.textMuted} style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {hasCards && (
        <Animated.View
          style={[
            styles.floatingPlusFabMainAction,
            fabAnimatedStyle,
            {
              backgroundColor: c.accent,
              bottom: estimateFabBottom(insets.bottom),
            },
          ]}
        >
          <TouchableOpacity
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 28,
              justifyContent: 'center',
              alignItems: 'center',
            }}
            onPressIn={onFabPressIn}
            onPressOut={onFabPressOut}
            onPress={handleCreateNewCardWithAnimation}
            accessibilityRole="button"
            accessibilityLabel={t.a11y_add_card}
          >
            <Ionicons name="add" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
};
