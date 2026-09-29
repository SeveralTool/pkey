/**
 * Multi-step import wizard for third-party password managers.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import {
  ImportOrchestrator,
  applyHeaderlessImport,
  type ColumnMapping,
  type PkeyField,
  type ParsedImport,
  type ImportFormat,
  type ImportAnalysisError,
  type ImportSkippedCard,
  type ImportFieldWarning,
  type ImportWarningKind,
  type PasswordCard,
} from '@pkey/core';
import { useCoreState } from '../../context/CoreStateContext';
import { useSettings } from '../../context/SettingsContext';
import type { LocaleStrings } from '../../constants/localization';
import { globalStyles as styles } from '../../styles/globalStyles';
import { yieldToUi } from '../../utils/yieldToUi';
import { suppressAutoLogout } from '../../utils/autoLogoutGuard';
import { getDisplayUrl } from '../../utils/openExternalLink';
import { notifications } from '../../notifications/notificationRef';

const PKEY_FIELDS: PkeyField[] = [
  'title',
  'username',
  'passwordList',
  'link',
  'notes',
  'otpSecret',
  'tags',
  'skip',
];

const PREVIEW_LIST_CAP = 40;

type BusyPhase = null | 'reading' | 'parsing' | 'preview';

interface Props {
  visible: boolean;
  onClose: () => void;
  onImport: (cards: PasswordCard[]) => Promise<void>;
}

const ImportLoadingPanel: React.FC<{ message: string; color: string; muted: string }> = ({
  message,
  color,
  muted,
}) => (
  <View style={{ alignItems: 'center', paddingVertical: 28, paddingHorizontal: 12 }}>
    <ActivityIndicator size="large" color={color} />
    <Text
      style={{ color: muted, marginTop: 14, fontSize: 14, textAlign: 'center', lineHeight: 20 }}
    >
      {message}
    </Text>
  </View>
);

const SectionLabel: React.FC<{ children: string; color: string }> = ({ children, color }) => (
  <Text
    style={{
      color,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 6,
      marginTop: 4,
    }}
  >
    {children}
  </Text>
);

const ImportCardRow: React.FC<{
  card: PasswordCard;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  badge?: string;
  badgeColor?: string;
  hint?: string;
}> = ({ card, textColor, mutedColor, borderColor, badge, badgeColor, hint }) => (
  <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: borderColor }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <Text
        style={{ color: textColor, fontWeight: '600', fontSize: 14, flex: 1 }}
        numberOfLines={1}
      >
        {card.title?.trim() || '—'}
      </Text>
      {badge ? (
        <Text style={{ fontSize: 10, fontWeight: '600', color: badgeColor, flexShrink: 0 }}>
          {badge}
        </Text>
      ) : null}
    </View>
    {card.username?.trim() ? (
      <Text style={{ color: mutedColor, fontSize: 12, marginTop: 3 }} numberOfLines={1}>
        {card.username.trim()}
      </Text>
    ) : null}
    {card.link?.trim() ? (
      <Text
        style={{ color: mutedColor, fontSize: 11, marginTop: 2, opacity: 0.9 }}
        numberOfLines={1}
      >
        {getDisplayUrl(card.link)}
      </Text>
    ) : null}
    {hint ? (
      <Text
        style={{ color: mutedColor, fontSize: 11, marginTop: 4, fontStyle: 'italic' }}
        numberOfLines={2}
      >
        {hint}
      </Text>
    ) : null}
  </View>
);

const orchestrator = new ImportOrchestrator();

function formatImportLabel(format: ImportFormat, t: LocaleStrings): string {
  switch (format) {
    case 'bitwarden':
      return t.import_manager_format_bitwarden;
    case 'onepassword':
      return t.import_manager_format_onepassword;
    case 'dashlane':
      return t.import_manager_format_dashlane;
    case 'nordpass':
      return t.import_manager_format_nordpass;
    case 'keeper-json':
    case 'keeper-csv':
      return t.import_manager_format_keeper;
    case 'chrome':
      return t.import_manager_format_chrome;
    case 'firefox':
      return t.import_manager_format_firefox;
    case 'lastpass':
      return t.import_manager_format_lastpass;
    case 'enpass':
      return t.import_manager_format_enpass;
    case 'csv':
      return t.import_manager_format_csv;
    default:
      return t.import_manager_format_unknown;
  }
}

function analysisErrorLabel(error: ImportAnalysisError, t: LocaleStrings): string {
  if (error === 'missing_binary_content') return t.import_manager_error_missing_binary;
  if (error === 'unsupported_onepassword_format') return t.import_manager_error_unsupported_1p;
  if (error === 'parse_failed') return t.import_manager_error_parse_failed;
  if (error === 'unsupported_format') return t.import_manager_error_unsupported_format;
  return error;
}

/** MIME types accepted by the import-from-manager picker (core still validates). */
const IMPORT_MANAGER_PICKER_TYPES = [
  'text/csv',
  'text/comma-separated-values',
  'application/json',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
] as const;

function FileInfoBanner({
  fileName,
  parsed,
  t,
  muted,
  border,
  accent,
}: {
  fileName: string;
  parsed: ParsedImport;
  t: LocaleStrings;
  muted: string;
  border: string;
  accent: string;
}) {
  const info = t.import_manager_file_info
    .replace('{name}', fileName)
    .replace('{format}', formatImportLabel(parsed.format, t))
    .replace('{n}', String(parsed.rows.length));
  return (
    <View
      style={{
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: border,
        backgroundColor: 'rgba(128,128,128,0.06)',
        marginBottom: 12,
      }}
    >
      <Text style={{ color: accent, fontSize: 12, fontWeight: '600' }} numberOfLines={2}>
        {info}
      </Text>
    </View>
  );
}

function warningKindLabel(kind: ImportWarningKind, t: LocaleStrings): string {
  switch (kind) {
    case 'empty_password':
      return t.import_manager_warn_empty_password;
    case 'truncated_title':
      return t.import_manager_warn_truncated_title;
    case 'truncated_link':
      return t.import_manager_warn_truncated_link;
    case 'truncated_password':
      return t.import_manager_warn_truncated_password;
    case 'truncated_username':
      return t.import_manager_warn_truncated_username;
    case 'truncated_notes':
      return t.import_manager_warn_truncated_notes;
    default:
      return kind;
  }
}

function groupWarnings(
  warnings: ImportFieldWarning[]
): Map<ImportWarningKind, ImportFieldWarning[]> {
  const map = new Map<ImportWarningKind, ImportFieldWarning[]>();
  for (const w of warnings) {
    const list = map.get(w.kind) ?? [];
    list.push(w);
    map.set(w.kind, list);
  }
  return map;
}

export const ImportWizardModal: React.FC<Props> = ({ visible, onClose, onImport }) => {
  const { db, importStatusMessage } = useCoreState();
  const { c, t } = useSettings();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetMaxHeight = windowHeight * 0.85;
  const sheetBottomPad = Math.max(insets.bottom, 16);
  const [step, setStep] = useState<'pick' | 'map' | 'preview' | 'importing'>('pick');
  const [busyPhase, setBusyPhase] = useState<BusyPhase>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [parsedOriginal, setParsedOriginal] = useState<ParsedImport | null>(null);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [previewCards, setPreviewCards] = useState<PasswordCard[]>([]);
  const [skippedCards, setSkippedCards] = useState<ImportSkippedCard[]>([]);
  const [importWarnings, setImportWarnings] = useState<ImportFieldWarning[]>([]);
  const [headerlessMode, setHeaderlessMode] = useState(false);
  const [totalParsed, setTotalParsed] = useState(0);
  const [analysisErrors, setAnalysisErrors] = useState<ImportAnalysisError[]>([]);

  const isBusy = busyPhase !== null;
  const skippedCount = skippedCards.length;

  const busyMessage = (() => {
    switch (busyPhase) {
      case 'reading':
        return t.import_manager_reading;
      case 'parsing':
        return t.import_manager_parsing;
      case 'preview':
        return t.import_manager_building_preview;
      default:
        return '';
    }
  })();

  const reset = () => {
    setStep('pick');
    setParsed(null);
    setParsedOriginal(null);
    setFileName('');
    setMapping([]);
    setPreviewCards([]);
    setSkippedCards([]);
    setImportWarnings([]);
    setHeaderlessMode(false);
    setTotalParsed(0);
    setAnalysisErrors([]);
    setBusyPhase(null);
  };

  const handleClose = () => {
    if (isBusy || step === 'importing') return;
    reset();
    onClose();
  };

  const buildPreview = async (data: ParsedImport, map: ColumnMapping[]) => {
    setBusyPhase('preview');
    await yieldToUi();
    const preview = orchestrator.buildPreview({
      parsed: data,
      mapping: map,
      existingCards: db.cards,
    });
    setTotalParsed(preview.total);
    setPreviewCards(preview.toImport);
    setSkippedCards(preview.skippedCards);
    setImportWarnings(preview.warnings);
    setStep('preview');
    setBusyPhase(null);
  };

  const toggleHeaderless = () => {
    if (!parsedOriginal || isBusy) return;
    const next = !headerlessMode;
    setHeaderlessMode(next);
    const adjusted = next ? applyHeaderlessImport(parsedOriginal) : parsedOriginal;
    setParsed(adjusted);
    setMapping(
      adjusted.suggestedMapping ??
        adjusted.headers.map((h) => ({ sourceHeader: h, targetField: 'skip' as PkeyField }))
    );
  };

  const pickFile = async () => {
    setBusyPhase('reading');
    suppressAutoLogout(120_000);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...IMPORT_MANAGER_PICKER_TYPES],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) {
        setBusyPhase(null);
        return;
      }
      const { uri, name } = result.assets[0];
      setFileName(name ?? 'import');
      await yieldToUi();
      const content = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      let bytes: Uint8Array | undefined;
      try {
        const b64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      } catch {
        /* text-only */
      }

      setBusyPhase('parsing');
      await yieldToUi();
      const analysis = orchestrator.analyze({ name: name ?? 'import', content, bytes });
      if (analysis.analysisErrors?.length) {
        setAnalysisErrors(analysis.analysisErrors);
        setParsedOriginal(analysis.parsed);
        setParsed(analysis.parsed);
        setBusyPhase(null);
        notifications.alert({
          title: t.alert_error_title,
          message: analysis.analysisErrors.map((e) => analysisErrorLabel(e, t)).join('\n'),
          variant: 'error',
        });
        return;
      }
      setAnalysisErrors([]);
      const data = analysis.parsed;
      const initialMapping = analysis.suggestedMapping.length
        ? analysis.suggestedMapping
        : data.headers.map((h) => ({ sourceHeader: h, targetField: 'skip' as PkeyField }));
      setParsedOriginal(data);
      setParsed(data);
      setMapping(initialMapping);

      if (analysis.needsMapping) {
        setStep('map');
        setBusyPhase(null);
        return;
      }

      await buildPreview(data, initialMapping);
    } catch (e) {
      setBusyPhase(null);
      notifications.alert({
        title: t.alert_error_title,
        message: String(e),
        variant: 'error',
      });
    }
  };

  const applyMappingStep = async () => {
    if (!parsed || isBusy) return;
    try {
      await buildPreview(parsed, mapping);
    } catch (e) {
      setBusyPhase(null);
      notifications.alert({
        title: t.alert_error_title,
        message: String(e),
        variant: 'error',
      });
    }
  };

  const confirmImport = async () => {
    setStep('importing');
    try {
      await onImport(previewCards);
      const doneMsg =
        skippedCount > 0
          ? `${t.import_manager_done.replace('{n}', String(previewCards.length))} ${t.import_manager_preview_skipped.replace('{n}', String(skippedCount))}`
          : t.import_manager_done.replace('{n}', String(previewCards.length));
      notifications.alert({
        title: t.alert_ok_title,
        message: doneMsg,
        variant: 'success',
      });
      reset();
      onClose();
    } catch (e) {
      notifications.alert({
        title: t.alert_error_title,
        message: String(e),
        variant: 'error',
      });
      setStep('preview');
    }
  };

  const cycleField = (header: string) => {
    if (isBusy) return;
    setMapping((prev) =>
      prev.map((m) => {
        if (m.sourceHeader !== header) return m;
        const idx = PKEY_FIELDS.indexOf(m.targetField);
        return { ...m, targetField: PKEY_FIELDS[(idx + 1) % PKEY_FIELDS.length]! };
      })
    );
  };

  const summaryLine = t.import_manager_summary
    .replace('{total}', String(totalParsed))
    .replace('{importing}', String(previewCards.length))
    .replace('{skipped}', String(skippedCount));

  const visibleImport = previewCards.slice(0, PREVIEW_LIST_CAP);
  const moreImport = previewCards.length - visibleImport.length;
  const visibleSkipped = skippedCards.slice(0, PREVIEW_LIST_CAP);
  const moreSkipped = skippedCards.length - visibleSkipped.length;
  const warningGroups = groupWarnings(importWarnings);
  const hasWarnings = importWarnings.length > 0;
  const useTallSheet = step === 'map' || step === 'preview';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: c.cardBg,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: sheetMaxHeight,
            height: useTallSheet ? sheetMaxHeight : undefined,
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: sheetBottomPad,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>
              {t.import_manager_title}
            </Text>
            <TouchableOpacity
              onPress={handleClose}
              disabled={isBusy || step === 'importing'}
              accessibilityRole="button"
              accessibilityLabel={t.cancel_button}
              style={{ opacity: isBusy || step === 'importing' ? 0.35 : 1 }}
            >
              <Ionicons name="close" size={24} color={c.textMuted} />
            </TouchableOpacity>
          </View>

          {step === 'pick' && (
            <View>
              {isBusy ? (
                <ImportLoadingPanel message={busyMessage} color={c.accent} muted={c.textMuted} />
              ) : (
                <>
                  <Text
                    style={{
                      color: c.textMuted,
                      fontSize: 13,
                      lineHeight: 18,
                      marginBottom: 14,
                    }}
                  >
                    {t.import_manager_formats_hint}
                  </Text>
                  <TouchableOpacity
                    style={[styles.primaryActActionButton, { backgroundColor: c.accent }]}
                    onPress={pickFile}
                  >
                    <Ionicons
                      name="folder-open-outline"
                      size={18}
                      color="#FFF"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.primaryActActionText}>{t.import_manager_pick}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {step === 'map' &&
            parsed &&
            (isBusy ? (
              <ImportLoadingPanel message={busyMessage} color={c.accent} muted={c.textMuted} />
            ) : (
              <View style={{ flex: 1, minHeight: 0 }}>
                <ScrollView
                  style={{ flex: 1 }}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: 8 }}
                >
                  {fileName ? (
                    <FileInfoBanner
                      fileName={fileName}
                      parsed={parsed}
                      t={t}
                      muted={c.textMuted}
                      border={c.border}
                      accent={c.accent}
                    />
                  ) : null}
                  <Text style={{ color: c.textMuted, marginBottom: 8 }}>
                    {t.import_manager_map}
                  </Text>
                  {parsed.headers.length > 0 ? (
                    <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 10 }}>
                      {t.import_manager_headers_found.replace('{n}', String(parsed.headers.length))}
                    </Text>
                  ) : null}
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 10,
                      marginBottom: 8,
                    }}
                    onPress={toggleHeaderless}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: headerlessMode }}
                  >
                    <Ionicons
                      name={headerlessMode ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={headerlessMode ? c.accent : c.textMuted}
                    />
                    <Text style={{ color: c.text, flex: 1, fontSize: 13 }}>
                      {t.import_manager_headerless}
                    </Text>
                  </TouchableOpacity>
                  {mapping.map((m) => (
                    <TouchableOpacity
                      key={m.sourceHeader}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        paddingVertical: 10,
                        borderBottomWidth: 1,
                        borderColor: c.border,
                      }}
                      onPress={() => cycleField(m.sourceHeader)}
                    >
                      <Text style={{ color: c.text, flex: 1 }}>{m.sourceHeader}</Text>
                      <Text style={{ color: c.accent, fontWeight: '600' }}>→ {m.targetField}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={[
                    styles.primaryActActionButton,
                    { backgroundColor: c.accent, marginTop: 12, flexShrink: 0 },
                  ]}
                  onPress={() => void applyMappingStep()}
                >
                  <Text style={styles.primaryActActionText}>{t.import_manager_preview}</Text>
                </TouchableOpacity>
              </View>
            ))}

          {step === 'preview' &&
            (isBusy ? (
              <ImportLoadingPanel message={busyMessage} color={c.accent} muted={c.textMuted} />
            ) : (
              <View style={{ flex: 1, minHeight: 0 }}>
                <ScrollView
                  style={{ flex: 1 }}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: 8 }}
                >
                  {parsed && fileName ? (
                    <FileInfoBanner
                      fileName={fileName}
                      parsed={parsed}
                      t={t}
                      muted={c.textMuted}
                      border={c.border}
                      accent={c.accent}
                    />
                  ) : null}
                  <Text
                    style={{ color: c.text, fontSize: 14, fontWeight: '600', marginBottom: 10 }}
                  >
                    {summaryLine}
                  </Text>
                  {hasWarnings ? (
                    <View
                      style={{
                        marginBottom: 12,
                        padding: 10,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: c.warning,
                        backgroundColor: 'rgba(245, 158, 11, 0.06)',
                      }}
                    >
                      <SectionLabel color={c.warning}>
                        {t.import_manager_warnings_title}
                      </SectionLabel>
                      {Array.from(warningGroups.entries()).map(([kind, items]) => {
                        const visible = items.slice(0, PREVIEW_LIST_CAP);
                        const more = items.length - visible.length;
                        return (
                          <View key={kind} style={{ marginBottom: 8 }}>
                            <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>
                              {t.import_manager_warn_count
                                .replace('{n}', String(items.length))
                                .replace('{kind}', warningKindLabel(kind, t))}
                            </Text>
                            {visible.map((w, i) => (
                              <Text
                                key={`${kind}-${w.rowIndex}-${i}`}
                                style={{ color: c.textMuted, fontSize: 12, marginTop: 3 }}
                                numberOfLines={1}
                              >
                                {`· ${w.preview}`}
                              </Text>
                            ))}
                            {more > 0 ? (
                              <Text style={{ color: c.textMuted, fontSize: 11, marginTop: 4 }}>
                                {t.import_manager_list_more.replace('{n}', String(more))}
                              </Text>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                  {previewCards.length > 0 ? (
                    <>
                      <SectionLabel color={c.textMuted}>
                        {`${t.import_manager_will_import} (${previewCards.length})`}
                      </SectionLabel>
                      {visibleImport.map((card) => (
                        <ImportCardRow
                          key={card.id}
                          card={card}
                          textColor={c.text}
                          mutedColor={c.textMuted}
                          borderColor={c.border}
                        />
                      ))}
                      {moreImport > 0 ? (
                        <Text style={{ color: c.textMuted, fontSize: 12, paddingVertical: 8 }}>
                          {t.import_manager_list_more.replace('{n}', String(moreImport))}
                        </Text>
                      ) : null}
                    </>
                  ) : null}

                  {skippedCount > 0 ? (
                    <>
                      <SectionLabel color={c.warning}>
                        {`${t.import_manager_skipped_title} (${skippedCount})`}
                      </SectionLabel>
                      {visibleSkipped.map((entry, index) => (
                        <ImportCardRow
                          key={`${entry.card.id}-skip-${index}`}
                          card={entry.card}
                          textColor={c.text}
                          mutedColor={c.textMuted}
                          borderColor={c.border}
                          badge={
                            entry.reason === 'password_mismatch'
                              ? t.import_manager_skip_password_mismatch
                              : entry.reason === 'duplicate_in_vault'
                                ? t.import_manager_skip_vault
                                : t.import_manager_skip_file
                          }
                          badgeColor={c.warning}
                          hint={
                            entry.reason === 'password_mismatch' && entry.existingTitle
                              ? t.import_manager_skip_password_mismatch_hint.replace(
                                  '{title}',
                                  entry.existingTitle
                                )
                              : entry.reason === 'duplicate_in_vault' && entry.existingTitle
                                ? t.import_manager_skip_vault_hint.replace(
                                    '{title}',
                                    entry.existingTitle
                                  )
                                : undefined
                          }
                        />
                      ))}
                      {moreSkipped > 0 ? (
                        <Text style={{ color: c.textMuted, fontSize: 12, paddingVertical: 8 }}>
                          {t.import_manager_list_more.replace('{n}', String(moreSkipped))}
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                </ScrollView>
                <TouchableOpacity
                  style={{
                    paddingVertical: 12,
                    marginTop: 8,
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                  onPress={() => setStep('map')}
                  disabled={!parsed?.headers.length}
                >
                  <Text style={{ color: c.accent, fontSize: 14, fontWeight: '600' }}>
                    {t.import_manager_edit_mapping}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.primaryActActionButton,
                    { backgroundColor: c.success, marginTop: 4, flexShrink: 0 },
                  ]}
                  onPress={confirmImport}
                  disabled={previewCards.length === 0}
                >
                  <Text style={styles.primaryActActionText}>
                    {previewCards.length > 0
                      ? t.import_manager_confirm
                      : t.import_manager_count.replace('{n}', '0')}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}

          {step === 'importing' && (
            <ImportLoadingPanel
              message={importStatusMessage || t.import_manager_loading}
              color={c.accent}
              muted={c.textMuted}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};
