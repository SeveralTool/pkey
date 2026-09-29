import type { ColumnMapping } from '../types';
import { BaseCsvParser } from './base-csv';

const CHROME_TEMPLATE: ColumnMapping[] = [
  { sourceHeader: 'name', targetField: 'title' },
  { sourceHeader: 'url', targetField: 'link' },
  { sourceHeader: 'username', targetField: 'username' },
  { sourceHeader: 'password', targetField: 'passwordList' },
];

export class ChromeCsvParser extends BaseCsvParser {
  readonly format = 'chrome' as const;
  readonly columnMapping = CHROME_TEMPLATE;
}
