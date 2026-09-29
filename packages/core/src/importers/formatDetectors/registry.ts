import { parseCsv } from '../csv-generic';
import type { ImportFormat, ImportFileInput } from '../types';
import type { FormatDetector } from './types';
import { OnePasswordDetector } from './onepassword';
import { BitwardenJsonDetector } from './bitwarden';
import { NordPassJsonDetector } from './nordpass';
import { EnpassJsonDetector } from './enpass';
import { KeeperJsonDetector } from './keeper';
import {
  DashlaneCsvDetector,
  ChromeCsvDetector,
  FirefoxCsvDetector,
  LastPassCsvDetector,
  KeeperCsvDetector,
  GenericCsvDetector,
} from './csv';
import { createImportLogger } from '../orchestrator/logger';

const log = createImportLogger();

export const FORMAT_DETECTORS: FormatDetector[] = [
  new OnePasswordDetector(),
  new NordPassJsonDetector(),
  new EnpassJsonDetector(),
  new KeeperJsonDetector(),
  new BitwardenJsonDetector(),
  new DashlaneCsvDetector(),
  new KeeperCsvDetector(),
  new LastPassCsvDetector(),
  new ChromeCsvDetector(),
  new FirefoxCsvDetector(),
  new GenericCsvDetector(),
];

export function detectFormatFromRegistry(
  content: string | Uint8Array,
  fileName?: string
): ImportFormat | null {
  for (const detector of FORMAT_DETECTORS) {
    try {
      if (detector.detect(content, fileName)) {
        log.debug('format detected', detector.format);
        return detector.format;
      }
    } catch (e) {
      log.debug('detector failed', detector.format, e);
    }
  }
  return null;
}

export function detectFormat(input: ImportFileInput): ImportFormat {
  const content = input.bytes?.length ? input.bytes : input.content;
  const detected = detectFormatFromRegistry(content, input.name);
  if (detected) return detected;

  const { rows } = parseCsv(input.content);
  if (rows.length) return 'csv';
  return 'unknown';
}
