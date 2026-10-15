/**
 * @fileoverview Transient UI state: search, cards filter, list sort, expanded card,
 * and the custom-icon modal.
 *
 * The active dashboard tab lives in its own context so a tab switch does not
 * re-render the cards list, database, or auth trees. Search keystrokes live in
 * a third context so typing does not re-render tab chrome or SyncProvider.
 * Prompt state stays in CoreState (auth/database flows own it) and is
 * re-exposed here as a facade.
 */
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { CardsListSortMode } from '@pkey/core';
import { useCoreState, type CardsListFilter, type CustomPromptState } from './CoreStateContext';
import { navigateDashboardTab } from '../navigation/dashboardNav';
import type { DashboardTabName } from '../navigation/types';

export type UIContextData = Readonly<{
  /** Optional health/type filter from Stats → Cards navigation. */
  cardsFilter: CardsListFilter;
  setCardsFilter: React.Dispatch<React.SetStateAction<CardsListFilter>>;
  /** Presentation-only list sort; resets to `updated` on lock/logout. */
  cardsSortMode: CardsListSortMode;
  setCardsSortMode: React.Dispatch<React.SetStateAction<CardsListSortMode>>;
  expandedCardId: string | null;
  setExpandedCardId: React.Dispatch<React.SetStateAction<string | null>>;
  customIconModal: { visible: boolean; cardId: string | null };
  setCustomIconModal: React.Dispatch<
    React.SetStateAction<{ visible: boolean; cardId: string | null }>
  >;
  customPrompt: CustomPromptState;
  setCustomPrompt: React.Dispatch<React.SetStateAction<CustomPromptState>>;
  customPromptInput: string;
  setCustomPromptInput: (input: string) => void;
}>;

export type UISearchContextData = Readonly<{
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
}>;

const UIContext = createContext<UIContextData>({} as UIContextData);
const UISearchContext = createContext<UISearchContextData>({} as UISearchContextData);
const DashboardTabStateContext = createContext<DashboardTabName | null>(null);
const DashboardTabActionsContext = createContext<React.Dispatch<
  React.SetStateAction<DashboardTabName>
> | null>(null);

/** Consumes filter, expand, and prompt UI state from `UIProvider`. */
export const useUI = () => useContext(UIContext);

/** Consumes the cards search field. Isolated so keystrokes do not fan out. */
export const useUISearch = () => useContext(UISearchContext);

/** Active dashboard tab. Subscribing re-renders on every tab switch. */
export function useDashboardTabName(): DashboardTabName {
  const currentTab = useContext(DashboardTabStateContext);
  if (currentTab === null) {
    throw new Error('useDashboardTabName must be used within UIProvider');
  }
  return currentTab;
}

/**
 * Stable tab setter. Does not subscribe to the active tab, so callers such as
 * `App` do not re-render when the user changes tabs.
 */
export function useSetDashboardTab(): React.Dispatch<React.SetStateAction<DashboardTabName>> {
  const setCurrentTab = useContext(DashboardTabActionsContext);
  if (setCurrentTab === null) {
    throw new Error('useSetDashboardTab must be used within UIProvider');
  }
  return setCurrentTab;
}

/** Owns high-churn UI state, isolated from the core store to limit re-renders. */
export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { customPrompt, setCustomPrompt, customPromptInput, setCustomPromptInput } = useCoreState();

  const [currentTab, setCurrentTabState] = useState<DashboardTabName>('cards');
  const currentTabRef = useRef(currentTab);
  currentTabRef.current = currentTab;

  const setCurrentTab = useCallback((action: React.SetStateAction<DashboardTabName>) => {
    const prev = currentTabRef.current;
    const next = typeof action === 'function' ? action(prev) : action;
    if (next !== prev) {
      currentTabRef.current = next;
      setCurrentTabState(next);
    }
    navigateDashboardTab(next);
  }, []);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cardsFilter, setCardsFilter] = useState<CardsListFilter>(null);
  const [cardsSortMode, setCardsSortMode] = useState<CardsListSortMode>('updated');
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [customIconModal, setCustomIconModal] = useState<{
    visible: boolean;
    cardId: string | null;
  }>({ visible: false, cardId: null });

  const value = useMemo(
    () => ({
      cardsFilter,
      setCardsFilter,
      cardsSortMode,
      setCardsSortMode,
      expandedCardId,
      setExpandedCardId,
      customIconModal,
      setCustomIconModal,
      customPrompt,
      setCustomPrompt,
      customPromptInput,
      setCustomPromptInput,
    }),
    [
      cardsFilter,
      cardsSortMode,
      expandedCardId,
      customIconModal,
      customPrompt,
      setCustomPrompt,
      customPromptInput,
      setCustomPromptInput,
    ]
  );

  const searchValue = useMemo(() => ({ searchQuery, setSearchQuery }), [searchQuery]);

  return (
    <DashboardTabActionsContext.Provider value={setCurrentTab}>
      <DashboardTabStateContext.Provider value={currentTab}>
        <UIContext.Provider value={value}>
          <UISearchContext.Provider value={searchValue}>{children}</UISearchContext.Provider>
        </UIContext.Provider>
      </DashboardTabStateContext.Provider>
    </DashboardTabActionsContext.Provider>
  );
};
