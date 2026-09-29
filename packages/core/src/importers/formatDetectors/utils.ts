import { unzipSync } from 'fflate';

export function asText(content: string | Uint8Array): string {
  return typeof content === 'string' ? content : new TextDecoder().decode(content);
}

export function firstCsvLine(text: string): string {
  return (
    text
      .replace(/^\uFEFF/, '')
      .trim()
      .split(/\r?\n/)[0] ?? ''
  );
}

export function csvHeaderColumns(text: string): string[] {
  const line = firstCsvLine(text);
  const delimiter = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
  return line.split(delimiter).map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
}

export function csvHeadersInclude(text: string, headers: string[]): boolean {
  const cols = csvHeaderColumns(text);
  return headers.every((h) => cols.includes(h.toLowerCase()));
}

export function isZipMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function zipContains1pif(bytes: Uint8Array): boolean {
  if (!isZipMagic(bytes)) return false;
  try {
    const files = unzipSync(bytes);
    return Object.keys(files).some((name) => name.endsWith('.1pif'));
  } catch {
    return false;
  }
}

export function looksLikeCsv(text: string): boolean {
  return isPlausibleTabularText(text);
}

/**
 * True when text looks like a real delimited table (not binary noise with commas).
 * Requires ≥2 fields on a line and a consistent delimiter across the first rows.
 */
export function isPlausibleTabularText(text: string): boolean {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return false;

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 8);
  if (!lines.length) return false;

  const pickDelimiter = (line: string): string | null => {
    const counts: Array<[string, number]> = [
      ['\t', (line.match(/\t/g) ?? []).length],
      [';', (line.match(/;/g) ?? []).length],
      [',', (line.match(/,/g) ?? []).length],
    ];
    counts.sort((a, b) => b[1] - a[1]);
    const [delim, count] = counts[0]!;
    return count >= 1 ? delim : null;
  };

  const delim = pickDelimiter(lines[0]!);
  if (!delim) return false;

  const fieldCount = (line: string) => line.split(delim).length;
  const firstFields = fieldCount(lines[0]!);
  if (firstFields < 2) return false;

  // At least half of sampled lines should share the same delimiter with ≥2 fields
  // and a field count within ±2 of the header/first row (tolerates ragged CSV).
  let matching = 0;
  for (const line of lines) {
    if (!line.includes(delim)) continue;
    const n = fieldCount(line);
    if (n >= 2 && Math.abs(n - firstFields) <= 2) matching++;
  }
  return matching >= Math.max(1, Math.ceil(lines.length * 0.5));
}

export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}
