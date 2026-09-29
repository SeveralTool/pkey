import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'index.css'), 'utf8');

describe('compact UI CSS contract', () => {
  it('defines the existing type scale without a 16px banner size', () => {
    expect(css).toContain('--text-2xs: 9px');
    expect(css).toContain('--text-xs: 11px');
    expect(css).toContain('--text-sm: 12px');
    expect(css).toContain('--text-md: 14px');
    expect(css).toContain('--banner-fs: var(--text-sm)');
    expect(css).not.toMatch(/--banner-fs:[^;]*16px/);
  });

  it('keeps danger banner tints as tokens', () => {
    expect(css).toContain('--danger-banner-bg');
    expect(css).toContain('--danger-banner-border');
  });
});
