/**
 * @fileoverview Core stylesheet for the entire application.
 * All styling rules are centralized here to maintain a consistent UX and ease of maintenance.
 */
import { StyleSheet, Dimensions } from 'react-native';

/** 4px-based spacing scale used across the app. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

/**
 * Global stylesheet containing React Native CSS-in-JS style definitions.
 */
export const globalStyles = StyleSheet.create({
  rootWrap: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollInnerCenter: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  brandingHeaderContainer: {
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  visualLogoRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderStyle: 'dashed',
  },
  brandingLogoText: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 4,
  },
  brandingDescSubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    letterSpacing: 0.8,
  },
  boxCardContainer: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  loginTransparencyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    marginBottom: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  formHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  formDescriptionNormal: {
    fontSize: 13,
    marginBottom: 20,
    lineHeight: 18,
  },
  baseInputStyle: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    marginVertical: 8,
  },
  validationInlineError: {
    fontSize: 12,
    fontWeight: '600',
    marginVertical: 4,
    paddingLeft: 4,
  },
  warningBoxBorderAlert: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginVertical: 14,
  },
  inlineWarningHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  warningHeaderTitleSpan: {
    fontWeight: '800',
    fontSize: 12,
    marginLeft: 6,
    letterSpacing: 0.5,
  },
  warningBodyDescription: {
    fontSize: 11,
    lineHeight: 15,
  },
  primaryActActionButton: {
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 18,
  },
  primaryActActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  secGhostOutlineButton: {
    borderWidth: 1,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 14,
  },
  secGhostOutlineText: {
    fontSize: 13,
    fontWeight: '600',
  },
  unifiedPanelHeaderFrame: {
    paddingHorizontal: 6,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  layoutGroupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBannerTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  appHeaderMiniSecurityPill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 2,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  headerSubDescription: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  centerFlexFrame: {
    flex: 1,
  },
  fullWidthHeightFlex: {
    flex: 1,
  },
  searchBarBorderContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  searchBarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  cardsList: {
    flex: 1,
  },
  cardsListContent: {
    paddingHorizontal: spacing.lg,
    // paddingBottom is applied at runtime from estimateCardsListBottomPadding
  },
  searchPillInputLayout: {
    height: 40,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    flex: 9,
    minWidth: 0,
  },
  searchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchSortButton: {
    flex: 1,
    minWidth: 44,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInputTextEditable: {
    flex: 1,
    fontSize: 13,
    height: '100%',
    paddingHorizontal: 4,
  },
  centeredInfoEmptyBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 24,
  },
  emptyLabelNotice: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },

  collapsedOuterInteractiveCardContainer: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardListItemShell: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  cardHeaderOuterRowClickable: {
    flexDirection: 'row',
    padding: spacing.sm,
  },
  iconModifierButtonLeft: {
    width: 36,
    height: 36,
    borderRadius: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfoTitleAndLinkRight: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingLeft: spacing.sm,
    justifyContent: 'center',
  },
  cardTitleDisplayHBold: {
    fontSize: 14,
    fontWeight: '700',
  },
  cardSubLinkLabelMuted: {
    fontSize: 11,
    marginTop: spacing.xs / 2,
  },
  expandedBodyPanelFrame: {
    borderTopWidth: 1,
    padding: spacing.md,
  },
  inputFieldBlockGroup: {
    marginBottom: spacing.sm,
  },
  cardFieldInputStyle: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    marginTop: spacing.xs,
    marginBottom: 0,
  },
  smallLabelUppercase: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  horizontalWrapFlexRowPicker: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  pickerCellTabOption: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  pickerCellText: {
    fontSize: 11,
    fontWeight: '700',
  },
  relativeInputGroupRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  absoluteInlineInputIconPositionButton: {
    position: 'absolute',
    right: 14,
    height: '100%',
    justifyContent: 'center',
  },
  tagLineRowFlex: {
    flexDirection: 'row',
    marginTop: spacing.xs + 2,
    flexWrap: 'wrap',
    width: '100%',
    minWidth: 0,
  },
  warningInLineTagFrame: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 6,
    marginBottom: 4,
  },
  warningInLineText: {
    fontSize: 9,
    fontWeight: '700',
    marginLeft: 4,
  },
  tagChipFrame: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 4,
    marginBottom: 4,
  },
  tagChipText: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  tagsEditorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tagsEditorHint: {
    fontSize: 10,
    marginTop: spacing.xs,
  },
  seedPhraseWordInputBlockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  seedIndexerCountLabel: {
    fontSize: 11,
    fontWeight: '800',
    width: 24,
  },
  bottomCardActionsGroupLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  actionsLineHorizontalContainer: {
    flexDirection: 'row',
  },
  smallActionButtonRounded: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  otpDisplayBlock: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  otpCodeToolbar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  otpCodeCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  otpCodeColumn: {
    flex: 1,
    gap: spacing.xs,
  },
  otpCodeField: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpCodeText: {
    fontFamily: 'monospace',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 3,
    textAlign: 'center',
  },
  otpToolbarButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpOffsetLabel: {
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
  otpActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  otpCountdownText: {
    fontSize: 12,
    textAlign: 'center',
  },
  saveActionButtonStylePill: {
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveActionTextPill: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  creationLogLabelRow: {
    marginTop: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: '#374151',
    paddingTop: spacing.sm,
    alignItems: 'flex-start',
  },
  metadataFooterCardDate: {
    fontSize: 9,
    fontWeight: '600',
  },

  floatingPlusFabMainAction: {
    position: 'absolute',
    bottom: 95,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },

  statsPanelContainerScrollBody: {
    padding: 16,
    // paddingBottom is applied at runtime from estimateTabBarScrollPadding
  },
  statsCategoryCardSection: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  statsSectionHeaderHeadingLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statsHLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  statsMultiMetricsFlexRows: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  singleMetricOutputBox: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  metricHighlightOutputMainValue: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 4,
  },
  metricLabelMutedDesc: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  textStackLoggerGroupLines: {
    marginVertical: 4,
  },
  spacedTextMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  metaStaticTxt: {
    fontSize: 12,
    fontWeight: '600',
  },
  metaDynamicTxt: {
    fontSize: 12,
    fontWeight: '700',
  },
  metaRowHintTxt: {
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
    fontWeight: '500',
  },

  settingsInternalSectorTitleLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 16,
  },
  settingInterativeRowSelectorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingTextGroupingLeftColumn: {
    flex: 1,
    paddingRight: 12,
  },
  settingRowLabelBoldTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  settingRowMutedSubTextDesc: {
    fontSize: 10,
    marginTop: 2,
    lineHeight: 14,
  },
  horizontalPillsSegmentControls: {
    flexDirection: 'row',
  },
  segmentButtonOption: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    marginLeft: 6,
    minWidth: 40,
    alignItems: 'center',
  },
  segmentOptionTextLabel: {
    fontSize: 9,
    fontWeight: '800',
  },

  modalBgBackdropCenteredOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalBoxContainer: {
    width: Dimensions.get('window').width - 48,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
  },
  modalHeadingTextTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalPresetIconsFlexGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalPresetIconBoxItem: {
    width: '30%',
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    padding: 8,
  },
  modalIconItemTextLabel: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 4,
  },
});
