import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import { z } from 'zod';
import { applyImportMapping } from '../pipeline';
import type { ColumnMapping } from '../types';
import type { Parser } from '../parsers/types';
import { hostnameFromUrl } from '../formatDetectors/utils';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(__dirname, '..', '__fixtures__');

export const FixtureCardSchema = z.object({
  title: z.string(),
  username: z.string(),
  passwordList: z.array(z.string()),
  link: z.string().optional(),
  notes: z.string().optional(),
  otpSecret: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const FixtureSchema = z.array(FixtureCardSchema);

export type FixtureCard = z.infer<typeof FixtureCardSchema>;

export function loadFixtureSample(format: string, fileName = 'sample'): string {
  const dir = join(fixturesRoot, format);
  const extensions = ['json', 'csv', '1pif'];
  for (const ext of extensions) {
    const path = join(dir, `${fileName}.${ext}`);
    try {
      return readFileSync(path, 'utf8');
    } catch {
      /* try next */
    }
  }
  throw new Error(`No sample fixture for format: ${format}`);
}

export function loadFixtureExpected(format: string): FixtureCard[] {
  const raw = JSON.parse(readFileSync(join(fixturesRoot, format, 'expected.json'), 'utf8'));
  return FixtureSchema.parse(raw);
}

export function cardsFromParser(
  parser: Parser,
  content: string,
  mapping?: ColumnMapping[]
): ReturnType<typeof applyImportMapping>['cards'] {
  const result = parser.parse(content);
  const map = mapping ?? result.suggestedMapping ?? [];
  return applyImportMapping(result.rows, map).cards;
}

export function assertCardsMatchExpected(
  cards: ReturnType<typeof applyImportMapping>['cards'],
  expected: FixtureCard[],
  options?: { titleFromLink?: boolean }
) {
  expect(cards).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i]!;
    const card = cards[i]!;
    if (options?.titleFromLink && exp.link) {
      expect(card.title).toBe(hostnameFromUrl(exp.link));
    } else {
      expect(card.title).toBe(exp.title);
    }
    expect(card.username).toBe(exp.username);
    expect(card.passwordList[0]).toBe(exp.passwordList[0]);
    if (exp.link !== undefined) expect(card.link).toBe(exp.link);
    if (exp.notes !== undefined) expect(card.notes ?? '').toBe(exp.notes);
    if (exp.otpSecret !== undefined) expect(card.otpSecret ?? '').toBe(exp.otpSecret);
    if (exp.tags !== undefined) expect(card.tags ?? []).toEqual(exp.tags);
  }
}
