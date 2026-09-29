/** Parses 1Password .1pif entry lines (JSON lines format). */

export function parseOnePasswordEntry(text: string): Record<string, string> | null {
  const rows = parseOnePasswordEntries(text);
  return rows[0] ?? null;
}

/** Parses all login-like entries from .1pif text (one JSON object per line). */
export function parseOnePasswordEntries(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const rows: Record<string, string>[] = [];

  for (const line of lines) {
    // Skip UUID separator lines common in .1pif exports
    if (/^[A-F0-9-]{36}$/i.test(line.trim())) continue;
    try {
      const obj = JSON.parse(line);
      if (!(obj.title || obj.secureContents || obj.location || obj.fields)) continue;

      const loginFields = obj.secureContents?.fields ?? obj.fields ?? obj.form?.fields ?? [];
      let username = '';
      let password = '';
      let notes = obj.secureContents?.notesPlain ?? obj.notesPlain ?? '';
      for (const f of loginFields) {
        const designation = (f.designation ?? f.type ?? f.name ?? '').toString().toLowerCase();
        const value = String(f.value ?? f.v ?? f.t ?? '');
        if (
          designation.includes('username') ||
          designation === 't' ||
          designation === 'email' ||
          designation.includes('user')
        ) {
          username = value;
        }
        if (designation.includes('password') || designation === 'p') {
          password = value;
        }
        if (designation.includes('notes') || designation === 'notes') {
          notes = notes || value;
        }
      }
      const urlList: string[] = [];
      const locUrls = obj.location?.urls;
      if (Array.isArray(locUrls)) {
        for (const u of locUrls) {
          const href = typeof u === 'string' ? u : u?.url;
          if (href) urlList.push(String(href));
        }
      }
      if (typeof obj.location === 'string' && obj.location) urlList.push(obj.location);
      if (obj.location?.hostname) urlList.push(String(obj.location.hostname));
      const link = urlList[0] ?? '';
      rows.push({
        title: obj.title ?? obj.location?.hostname ?? 'Untitled',
        username,
        password,
        link,
        ...(urlList.length > 1 ? { uris: urlList.slice(1).join('\n') } : {}),
        notes,
      });
    } catch {
      /* skip line */
    }
  }

  return rows;
}
