import type { ColumnMapping } from '../types';
import { BaseCsvParser } from './base-csv';

const DASHLANE_TEMPLATE: ColumnMapping[] = [
  { sourceHeader: 'username', targetField: 'username' },
  { sourceHeader: 'username1', targetField: 'username' },
  { sourceHeader: 'username2', targetField: 'notes' },
  { sourceHeader: 'title', targetField: 'title' },
  { sourceHeader: 'url', targetField: 'link' },
  { sourceHeader: 'password', targetField: 'passwordList' },
  { sourceHeader: 'note', targetField: 'notes' },
  { sourceHeader: 'otpSecret', targetField: 'otpSecret' },
];

export class DashlaneParser extends BaseCsvParser {
  readonly format = 'dashlane' as const;
  readonly columnMapping = DASHLANE_TEMPLATE;
}

/** @deprecated Use DashlaneParser */
export function parseDashlaneCsv(content: string) {
  return new DashlaneParser().parse(content);
}
