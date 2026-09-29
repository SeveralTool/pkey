/**
 * @fileoverview Shared types for the password-manager import pipeline.
 */

/** Target vault field a source column may map to (`skip` ignores the column). */
export type PkeyField =
  'title' | 'username' | 'passwordList' | 'link' | 'notes' | 'otpSecret' | 'tags' | 'skip';

/** Detected or declared import file format. */
export type ImportFormat =
  | 'bitwarden'
  | 'onepassword'
  | 'dashlane'
  | 'nordpass'
  | 'keeper-json'
  | 'keeper-csv'
  | 'chrome'
  | 'firefox'
  | 'lastpass'
  | 'enpass'
  | 'csv'
  | 'unknown';

/** Mapping from a source CSV/JSON header to a PKEY field. */
export interface ColumnMapping {
  sourceHeader: string;
  targetField: PkeyField;
}

/** Intermediate parse result before column mapping is applied. */
export interface ParsedImport {
  headers: string[];
  rows: Record<string, string>[];
  format: ImportFormat;
  suggestedMapping?: ColumnMapping[];
}

import type { PasswordCard } from '../types';

/** Why an incoming card was skipped during dedupe. */
export type ImportSkipReason =
  | 'duplicate_in_vault'
  | 'duplicate_in_file'
  | 'password_mismatch';

/** A card excluded from import together with the skip reason. */
export interface ImportSkippedCard {
  card: PasswordCard;
  reason: ImportSkipReason;
  /** Title of the existing vault card when `reason` is `duplicate_in_vault`. */
  existingTitle?: string;
}

/** Raw file input accepted by parsers and the orchestrator. */
export interface ImportFileInput {
  name: string;
  content: string;
  /** Binary bytes required for some formats (e.g. 1Password `.1pux`). */
  bytes?: Uint8Array;
}

/** Non-fatal field issues encountered while mapping rows to cards. */
export type ImportWarningKind =
  | 'empty_password'
  | 'truncated_title'
  | 'truncated_username'
  | 'truncated_link'
  | 'truncated_password'
  | 'truncated_notes'
  | 'invalid_otp';

/** Fatal analysis errors that block a clean parse. */
export type ImportAnalysisError =
  | 'missing_binary_content'
  | 'unsupported_onepassword_format'
  | 'parse_failed'
  | 'unsupported_format';

/** Warning attached to a specific import row. */
export interface ImportFieldWarning {
  rowIndex: number;
  kind: ImportWarningKind;
  preview: string;
}

/** Cards produced by applying a column mapping, plus field warnings. */
export interface ApplyImportMappingResult {
  cards: PasswordCard[];
  warnings: ImportFieldWarning[];
}

/** Result of analyzing an import file before user confirmation. */
export interface ImportAnalysis {
  format: ImportFormat;
  headers: string[];
  previewRows: Record<string, string>[];
  suggestedMapping: ColumnMapping[];
  needsMapping: boolean;
  analysisErrors?: ImportAnalysisError[];
  parsed: ParsedImport;
}

/** Preview of what will be imported after mapping and dedupe. */
export interface ImportPreview {
  toImport: PasswordCard[];
  skipped: number;
  skippedCards: ImportSkippedCard[];
  warnings: ImportFieldWarning[];
  total: number;
}
