/** Typed errors thrown by import parsers for orchestrator handling. */

export class ImportParseError extends Error {
  readonly code: 'parse_failed' | 'unsupported_onepassword_format';

  constructor(code: 'parse_failed' | 'unsupported_onepassword_format', message?: string) {
    super(message ?? code);
    this.name = 'ImportParseError';
    this.code = code;
  }
}
