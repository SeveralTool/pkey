/**
 * @fileoverview One vault key, on its own screen.
 *
 * The list row stays collapsed. The identity card paints immediately from the
 * display record. The form (secrets, duplicate scan) waits until the push
 * transition finishes, and a loader covers that wait on a slow device.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardEditorIdentity } from '../components/cards/CardEditorIdentity';
import { CardExpandedBody } from '../components/cards/CardExpandedBody';
import { useAuth } from '../context/AuthContext';
import { useCoreState } from '../context/CoreStateContext';
import { useDatabase } from '../context/DatabaseContext';
import { useSettings } from '../context/SettingsContext';
import { useUI } from '../context/UIContext';
import { useOpenCardLink } from '../hooks/useOpenCardLink';
import { retainDuplicateIndices, type DuplicateIndex } from '../hooks/useCardAnalysis';
import { CARD_EDITOR_ROUTE, type CardsStackParamList } from '../navigation/cardsStack';
import { estimateTabBarScrollPadding } from '../navigation/tabBarInset';
import { useParkScrollOnBlur } from '../navigation/useParkScrollOnBlur';
import { reuseHydratedCards, type HydratedCardCache } from '../services/vaultSecrets';
import { globalStyles as styles, spacing } from '../styles/globalStyles';

type EditorNav = NativeStackNavigationProp<CardsStackParamList, typeof CARD_EDITOR_ROUTE>;
type EditorRoute = RouteProp<CardsStackParamList, typeof CARD_EDITOR_ROUTE>;

/** If the native transition never reports an end, still open the form. */
const EDITOR_FORM_FALLBACK_MS = 400;

type EditorGate = {
  id: string;
  awaiting: boolean;
  released: boolean;
};

/**
 * Pushed from the Cards list when `expandedCardId` matches a vault key.
 */
export function CardEditorScreen(): React.JSX.Element {
  const navigation = useNavigation<EditorNav>();
  const route = useRoute<EditorRoute>();
  const { cardId } = route.params;
  const insets = useSafeAreaInsets();
  const { c, t, isDark } = useSettings();
  const { db } = useCoreState();
  const { setExpandedCardId, setCustomIconModal } = useUI();
  const { performBiometricOrPasswordCheck } = useAuth();
  const {
    handleUpdateCardValue,
    handleUpdatePasswordListItem,
    handleAddPasswordListItem,
    handleSaveCard,
    handleSaveCardWithFields,
    handleDeleteCard,
    handleCheckCardPassword,
    hibpPendingIds,
  } = useDatabase();
  const { handleOpenCardLink, isOpeningLink } = useOpenCardLink({
    openLinksInAppBrowser: !!db.settings?.openLinksInAppBrowser,
    t,
  });
  const [, startTransition] = useTransition();

  const displayCard = useMemo(
    () => db.cards.find((item) => item.id === cardId) ?? null,
    [db.cards, cardId]
  );

  const [gate, setGate] = useState<EditorGate>({
    id: cardId,
    awaiting: false,
    released: false,
  });
  if (gate.id !== cardId) {
    setGate({ id: cardId, awaiting: false, released: false });
  }
  const gateMatches = gate.id === cardId;
  const awaitingForm = gateMatches && gate.awaiting;
  const formReleased = gateMatches && gate.released;

  const hydratedCacheRef = useRef<HydratedCardCache>(new Map());
  const indexCacheRef = useRef<{
    usernameIndex: DuplicateIndex;
    passwordIndex: DuplicateIndex;
  } | null>(null);
  const form = useMemo(() => {
    if (!formReleased) return null;
    const reused = reuseHydratedCards(db.cards, hydratedCacheRef.current);
    hydratedCacheRef.current = reused.cache;
    const indices = retainDuplicateIndices(indexCacheRef.current, reused.cards);
    indexCacheRef.current = indices;
    const card = reused.cards.find((item) => item.id === cardId) ?? null;
    return card ? { card, indices } : null;
  }, [cardId, db.cards, formReleased]);

  const scrollRef = useRef<ScrollView>(null);
  const offsetYRef = useRef(0);
  const parkScroll = useParkScrollOnBlur(() => {
    scrollRef.current?.scrollTo({ y: offsetYRef.current, animated: false });
  });

  useEffect(() => {
    return navigation.addListener('beforeRemove', () => {
      setExpandedCardId((current) => (current === cardId ? null : current));
    });
  }, [cardId, navigation, setExpandedCardId]);

  useEffect(() => {
    if (displayCard) return;
    if (navigation.canGoBack()) navigation.goBack();
  }, [displayCard, navigation]);

  const releaseStartedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    releaseStartedRef.current = false;
    const release = () => {
      if (cancelled || releaseStartedRef.current) return;
      releaseStartedRef.current = true;
      setGate((current) =>
        current.id !== cardId ? current : { id: cardId, awaiting: true, released: false }
      );
    };
    const unsub = navigation.addListener('transitionEnd', (event) => {
      if (!event.data.closing) release();
    });
    const fallback = setTimeout(release, EDITOR_FORM_FALLBACK_MS);
    return () => {
      cancelled = true;
      clearTimeout(fallback);
      unsub();
    };
  }, [cardId, navigation]);

  useEffect(() => {
    if (!awaitingForm || formReleased) return;
    const frame = requestAnimationFrame(() => {
      startTransition(() => {
        setGate((current) =>
          current.id !== cardId ? current : { id: cardId, awaiting: true, released: true }
        );
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [awaitingForm, cardId, formReleased, startTransition]);

  const handleChangeIcon = useCallback(() => {
    setCustomIconModal({ visible: true, cardId });
  }, [cardId, setCustomIconModal]);

  const title = displayCard?.title.trim() ? displayCard.title.trim() : t.default_card_name;

  return (
    <View style={[styles.fullWidthHeightFlex, { backgroundColor: c.bg }]}>
      <View
        style={[
          styles.editorScreenBar,
          { paddingTop: insets.top, backgroundColor: c.bg, borderBottomColor: c.border },
        ]}
      >
        <View style={styles.editorScreenBarRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t.card_editor_back}
            hitSlop={spacing.sm}
            style={styles.editorScreenBack}
          >
            <Ionicons name="chevron-back" size={22} color={c.text} />
          </TouchableOpacity>
          <Text numberOfLines={1} style={[styles.editorScreenTitle, { color: c.text }]}>
            {title}
          </Text>
        </View>
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.fullWidthHeightFlex}
        contentContainerStyle={[
          styles.editorScrollContent,
          { paddingBottom: estimateTabBarScrollPadding(insets.bottom) },
        ]}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEventThrottle={16}
        onScroll={(event) => {
          offsetYRef.current = event.nativeEvent.contentOffset.y;
        }}
        onScrollBeginDrag={parkScroll.onScrollBeginDrag}
        onScrollEndDrag={(event) => parkScroll.onScrollEndDrag(event.nativeEvent.velocity?.y ?? 0)}
        onMomentumScrollBegin={parkScroll.onMomentumScrollBegin}
        onMomentumScrollEnd={parkScroll.onMomentumScrollEnd}
      >
        {displayCard ? (
          <CardEditorIdentity
            item={displayCard}
            isDark={isDark}
            c={c}
            t={t}
            isOpeningLink={isOpeningLink}
            onOpenLink={handleOpenCardLink}
            onChangeIcon={handleChangeIcon}
          />
        ) : null}
        {form?.card ? (
          <CardExpandedBody
            key={form.card.id}
            item={form.card}
            isDark={isDark}
            c={c}
            t={t}
            appSettings={db.settings}
            usernameIndex={form.indices.usernameIndex}
            passwordIndex={form.indices.passwordIndex}
            autoCollapse={!!db.settings?.autoCollapse}
            onUpdateCardValue={handleUpdateCardValue}
            onUpdatePasswordListItem={handleUpdatePasswordListItem}
            onAddPasswordListItem={handleAddPasswordListItem}
            onSaveCard={handleSaveCard}
            onSaveCardWithFields={handleSaveCardWithFields}
            onDeleteCard={handleDeleteCard}
            onBiometricCheck={performBiometricOrPasswordCheck}
            hibpEnabled={!!db.settings?.enableHibpCheck}
            hibpChecking={hibpPendingIds.includes(form.card.id)}
            onCheckHibp={handleCheckCardPassword}
          />
        ) : (
          <View
            style={[styles.editorLoadingCard, { backgroundColor: c.cardBg, borderColor: c.border }]}
            accessibilityRole="progressbar"
            accessibilityLabel={t.card_editor_loading}
          >
            <ActivityIndicator color={c.accent} />
            <Text style={[styles.editorLoadingText, { color: c.textMuted }]}>
              {t.card_editor_loading}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
