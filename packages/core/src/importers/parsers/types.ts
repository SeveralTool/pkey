import type { ColumnMapping, ImportFormat, ParsedImport } from '../types';

export interface ParsedResult extends ParsedImport {}

export interface Parser {
  readonly format: ImportFormat;
  parse(content: string | Uint8Array, fileName?: string): ParsedResult;
}
