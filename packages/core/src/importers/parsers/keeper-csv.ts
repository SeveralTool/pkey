import type { ColumnMapping } from '../types';
import { BaseCsvParser } from './base-csv';

const KEEPER_CSV_TEMPLATE: ColumnMapping[] = [
  { sourceHeader: 'title', targetField: 'title' },
  { sourceHeader: 'login', targetField: 'username' },
  { sourceHeader: 'password', targetField: 'passwordList' },
  { sourceHeader: 'login url', targetField: 'link' },
  { sourceHeader: 'notes', targetField: 'notes' },
];

export class KeeperCsvParser extends BaseCsvParser {
  readonly format = 'keeper-csv' as const;
  readonly columnMapping = KEEPER_CSV_TEMPLATE;
}
