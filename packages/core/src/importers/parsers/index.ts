import type { ImportFormat } from '../types';
import type { Parser } from './types';
import { BitwardenParser } from './bitwarden';
import { DashlaneParser } from './dashlane';
import { OnePasswordParser } from './onepassword';
import { NordPassParser } from './nordpass';
import { EnpassParser } from './enpass';
import { KeeperJsonParser } from './keeper-json';
import { KeeperCsvParser } from './keeper-csv';
import { ChromeCsvParser } from './chrome';
import { FirefoxCsvParser } from './firefox';
import { LastPassCsvParser } from './lastpass';
import { GenericCsvParser } from './generic-csv';

const PARSERS: Parser[] = [
  new BitwardenParser(),
  new OnePasswordParser(),
  new DashlaneParser(),
  new NordPassParser(),
  new EnpassParser(),
  new KeeperJsonParser(),
  new KeeperCsvParser(),
  new ChromeCsvParser(),
  new FirefoxCsvParser(),
  new LastPassCsvParser(),
  new GenericCsvParser(),
];

const parserByFormat = new Map<ImportFormat, Parser>(PARSERS.map((p) => [p.format, p]));

export function getParser(format: ImportFormat): Parser {
  return parserByFormat.get(format) ?? new GenericCsvParser();
}

export {
  BitwardenParser,
  DashlaneParser,
  OnePasswordParser,
  NordPassParser,
  EnpassParser,
  KeeperJsonParser,
  KeeperCsvParser,
  ChromeCsvParser,
  FirefoxCsvParser,
  LastPassCsvParser,
  GenericCsvParser,
};
