import type { ColumnMapping } from '../types';
import { BaseCsvParser } from './base-csv';

const LASTPASS_TEMPLATE: ColumnMapping[] = [
  { sourceHeader: 'name', targetField: 'title' },
  { sourceHeader: 'url', targetField: 'link' },
  { sourceHeader: 'username', targetField: 'username' },
  { sourceHeader: 'password', targetField: 'passwordList' },
  { sourceHeader: 'extra', targetField: 'notes' },
  { sourceHeader: 'grouping', targetField: 'tags' },
];

export class LastPassCsvParser extends BaseCsvParser {
  readonly format = 'lastpass' as const;
  readonly columnMapping = LASTPASS_TEMPLATE;
}
