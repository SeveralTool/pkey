/**
 * @fileoverview Cards tab: collapsed list, then a native editor for one key.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Freeze } from 'react-freeze';
import { CardsList } from '../components/cards/CardsList';
import { useCoreState } from '../context/CoreStateContext';
import { useSettings } from '../context/SettingsContext';
import { useUI } from '../context/UIContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  CARD_EDITOR_ROUTE,
  CARDS_LIST_ROUTE,
  cardsListCoveredAfter,
  isCardReadyToOpen,
  shouldFreezeCardsList,
  type CardsStackParamList,
} from '../navigation/cardsStack';
import { FrozenDashboardTab } from '../navigation/FrozenDashboardTab';
import { CardEditorScreen } from './CardEditorScreen';
import { globalStyles as styles } from '../styles/globalStyles';

const Stack = createNativeStackNavigator<CardsStackParamList>();

type CardsNav = NativeStackNavigationProp<CardsStackParamList>;

/**
 * Suspends the list only after the editor has finished covering it.
 * Freezing on blur blanks the rows before `slide_from_right` starts, so the
 * open cuts away the list and only the editor slides. The pop already slides
 * both screens; keeping the list painted makes the push do the same.
 */
function useFreezeCardsList(navigation: CardsNav, focused: boolean, revealed: boolean): boolean {
  const [covered, setCovered] = useState(false);
  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  useEffect(() => {
    if (focused) setCovered(false);
  }, [focused]);

  useEffect(() => {
    const apply =
      (phase: 'start' | 'end') =>
      (event: { readonly data: { readonly closing: boolean } }) => {
        if (focusedRef.current) return;
        const next = cardsListCoveredAfter(phase, event.data.closing);
        if (next !== null) setCovered(next);
      };
    const unsubStart = navigation.addListener('transitionStart', apply('start'));
    const unsubEnd = navigation.addListener('transitionEnd', apply('end'));
    return () => {
      unsubStart();
      unsubEnd();
    };
  }, [navigation]);

  return shouldFreezeCardsList(revealed, focused, covered);
}

/**
 * Opens the editor once the vault actually contains `expandedCardId`.
 * Create-card sets the id before the write lands, so this waits for the row.
 */
function CardsListScreen(): React.JSX.Element {
  const navigation = useNavigation<CardsNav>();
  const { expandedCardId } = useUI();
  const { db } = useCoreState();
  const cardReady = isCardReadyToOpen(
    expandedCardId,
    db.cards.map((card) => card.id)
  );
  const focused = useIsFocused();
  const revealedRef = useRef(false);
  if (focused) revealedRef.current = true;
  const freezeList = useFreezeCardsList(navigation, focused, revealedRef.current);

  useEffect(() => {
    if (!expandedCardId || !cardReady) return;
    const state = navigation.getState();
    const current = state.routes[state.index];
    if (current?.name === CARD_EDITOR_ROUTE && current.params?.cardId === expandedCardId) return;
    navigation.navigate(CARD_EDITOR_ROUTE, { cardId: expandedCardId });
  }, [cardReady, expandedCardId, navigation]);

  return (
    <Freeze freeze={freezeList}>
      <View style={styles.fullWidthHeightFlex}>
        <CardsList />
      </View>
    </Freeze>
  );
}

/**
 * Cards tab. The list suspends while another dashboard tab is focused, and
 * again while the editor covers it, so keystrokes do not rebuild the list.
 */
export function CardsTab(): React.JSX.Element {
  const { c } = useSettings();
  const reduceMotion = useReducedMotion();

  return (
    <FrozenDashboardTab>
      <View style={styles.fullWidthHeightFlex}>
        <Stack.Navigator
          initialRouteName={CARDS_LIST_ROUTE}
          screenOptions={{
            headerShown: false,
            animation: reduceMotion ? 'none' : 'slide_from_right',
            contentStyle: { backgroundColor: c.bg },
          }}
        >
          <Stack.Screen name={CARDS_LIST_ROUTE} component={CardsListScreen} />
          <Stack.Screen name={CARD_EDITOR_ROUTE} component={CardEditorScreen} />
        </Stack.Navigator>
      </View>
    </FrozenDashboardTab>
  );
}
