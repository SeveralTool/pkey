/** Minimal CSV/TSV parser with quoted field support (including multiline fields). */

/**
 * Parses CSV/TSV text into headers and row objects.
 * Quoted fields may contain newlines; delimiter is detected from the first logical row.
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const normalized = text.replace(/^\uFEFF/, '');
  if (!normalized.trim()) return { headers: [], rows: [] };

  const delimiter = detectDelimiterFromText(normalized);
  const records = parseCsvRecords(normalized, delimiter);
  if (!records.length) return { headers: [], rows: [] };

  const headers = records[0]!.map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < records.length; i++) {
    const cols = records[i]!;
    if (cols.every((c) => !c.trim())) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx]?.trim() ?? '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

function detectDelimiterFromText(text: string): string {
  let inQuotes = false;
  let header = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        header += '""';
        i++;
      } else {
        inQuotes = !inQuotes;
        header += ch;
      }
      continue;
    }
    if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    header += ch;
  }
  return detectDelimiter(header);
}

function detectDelimiter(headerLine: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (let i = 0; i < headerLine.length; i++) {
    const ch = headerLine[i]!;
    if (ch === '"') {
      if (inQuotes && headerLine[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && (ch === ',' || ch === ';' || ch === '\t')) {
      counts[ch] = (counts[ch] ?? 0) + 1;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0]!;
}

/** Parse full CSV into records (rows of cells), respecting quoted newlines. */
function parseCsvRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delimiter) {
      row.push(cur);
      cur = '';
      continue;
    }
    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      cur = '';
      if (!(row.length === 1 && row[0] === '')) {
        records.push(row);
      }
      row = [];
      continue;
    }
    cur += ch;
  }

  if (cur.length || row.length) {
    row.push(cur);
    if (!(row.length === 1 && row[0] === '')) {
      records.push(row);
    }
  }

  return records;
}

/** Parse a single CSV line (no embedded newlines). Exported for unit tests. */
export function parseCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
