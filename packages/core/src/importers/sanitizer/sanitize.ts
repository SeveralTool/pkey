import type { PasswordCard } from '../../types';
import {
  CARD_LINK_MAX,
  CARD_NOTES_MAX,
  CARD_PASSWORD_MAX,
  CARD_TITLE_MAX,
  CARD_USERNAME_MAX,
  clampField,
} from '../../constants/fieldLimits';
import { isValidBase32, normalizeSecret, parseOtpAuthUri } from '../../crypto/totp';
import { normalizeTags } from '../../util/normalizeTags';
import type { ColumnMapping, ImportFieldWarning, ImportWarningKind } from '../types';

export interface SanitizedRow {
  partial: Partial<PasswordCard> & {
    title: string;
    username: string;
    passwordList: string[];
    link: string;
    uris?: string[];
    notes: string;
    tags: string[];
  };
  warnings: ImportFieldWarning[];
}

function rowPreview(partial: SanitizedRow['partial']): string {
  return partial.title?.trim() || partial.username?.trim() || partial.link?.trim() || '—';
}

function pushWarning(
  warnings: ImportFieldWarning[],
  rowIndex: number,
  kind: ImportWarningKind,
  preview: string
): void {
  warnings.push({ rowIndex, kind, preview });
}

function applyOtpValue(
  value: string,
  partial: SanitizedRow['partial'],
  warnings: ImportFieldWarning[],
  rowIndex: number
): void {
  const trimmed = value.trim();
  if (!trimmed) return;

  if (trimmed.toLowerCase().startsWith('otpauth://')) {
    const parsed = parseOtpAuthUri(trimmed);
    if (!parsed) {
      pushWarning(warnings, rowIndex, 'invalid_otp', rowPreview(partial) || trimmed.slice(0, 40));
      return;
    }
    partial.otpSecret = parsed.secret;
    if (parsed.algorithm) partial.otpAlgorithm = parsed.algorithm;
    if (parsed.digits) partial.otpDigits = parsed.digits;
    if (parsed.period) partial.otpPeriod = parsed.period;
    return;
  }

  const secret = normalizeSecret(trimmed);
  if (!isValidBase32(secret)) {
    pushWarning(warnings, rowIndex, 'invalid_otp', rowPreview(partial) || trimmed.slice(0, 40));
    return;
  }
  partial.otpSecret = secret;
}

export function sanitizeRow(
  row: Record<string, string>,
  mapping: ColumnMapping[],
  rowIndex: number
): SanitizedRow {
  const mapByHeader = new Map(mapping.map((m) => [m.sourceHeader, m.targetField]));
  const warnings: ImportFieldWarning[] = [];
  const partial: SanitizedRow['partial'] = {
    title: '',
    username: '',
    passwordList: [''],
    link: '',
    uris: undefined,
    notes: '',
    tags: [],
  };

  for (const [header, value] of Object.entries(row)) {
    const target = mapByHeader.get(header);
    if (!target || target === 'skip' || !value?.trim()) continue;
    switch (target) {
      case 'title': {
        const { value: v, truncated } = clampField(value, CARD_TITLE_MAX);
        partial.title = v;
        if (truncated) pushWarning(warnings, rowIndex, 'truncated_title', v || header);
        break;
      }
      case 'username': {
        const { value: v, truncated } = clampField(value, CARD_USERNAME_MAX);
        partial.username = v;
        if (truncated) pushWarning(warnings, rowIndex, 'truncated_username', v || header);
        break;
      }
      case 'passwordList': {
        const { value: v, truncated } = clampField(value, CARD_PASSWORD_MAX);
        partial.passwordList = [v];
        if (truncated)
          pushWarning(warnings, rowIndex, 'truncated_password', partial.title || header);
        break;
      }
      case 'link': {
        const { value: v, truncated } = clampField(value, CARD_LINK_MAX);
        partial.link = v;
        if (truncated)
          pushWarning(warnings, rowIndex, 'truncated_link', partial.title || v.slice(0, 40));
        break;
      }
      case 'notes': {
        const { value: v, truncated } = clampField(value, CARD_NOTES_MAX);
        partial.notes = v;
        if (truncated) pushWarning(warnings, rowIndex, 'truncated_notes', partial.title || header);
        break;
      }
      case 'otpSecret':
        applyOtpValue(value, partial, warnings, rowIndex);
        break;
      case 'tags':
        partial.tags = normalizeTags(value.split(/[,;]/));
        break;
    }
  }

  const extraUris = (row.uris ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (extraUris.length) {
    partial.uris = extraUris;
  }

  if (!partial.title) {
    partial.title = partial.username || partial.link || 'Imported';
  }

  const pwd = partial.passwordList[0]?.trim() ?? '';
  if (!pwd) {
    pushWarning(warnings, rowIndex, 'empty_password', rowPreview(partial));
  }

  return { partial, warnings };
}

export function sanitizeRows(
  rows: Record<string, string>[],
  mapping: ColumnMapping[]
): { partials: SanitizedRow['partial'][]; warnings: ImportFieldWarning[] } {
  const allWarnings: ImportFieldWarning[] = [];
  const partials = rows.map((row, rowIndex) => {
    const { partial, warnings } = sanitizeRow(row, mapping, rowIndex);
    allWarnings.push(...warnings);
    return partial;
  });
  return { partials, warnings: allWarnings };
}
