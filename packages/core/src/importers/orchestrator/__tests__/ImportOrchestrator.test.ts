import { describe, it, expect } from 'vitest';
import { ImportOrchestrator } from '..';
import { loadFixtureSample } from '../../__tests__/fixtureHelpers';

describe('ImportOrchestrator', () => {
  const orchestrator = new ImportOrchestrator();

  it('analyzes nordpass and skips mapping step', () => {
    const sample = loadFixtureSample('nordpass');
    const analysis = orchestrator.analyze({ name: 'nordpass.json', content: sample });
    expect(analysis.format).toBe('nordpass');
    expect(analysis.needsMapping).toBe(false);
    expect(analysis.suggestedMapping.length).toBeGreaterThan(0);
    expect(analysis.previewRows.length).toBeGreaterThan(0);
  });

  it('requires mapping for generic csv', () => {
    const sample = loadFixtureSample('generic-csv');
    const analysis = orchestrator.analyze({ name: 'data.csv', content: sample });
    expect(analysis.format).toBe('csv');
    expect(analysis.needsMapping).toBe(true);
  });

  it('builds preview with dedupe', () => {
    const sample = loadFixtureSample('chrome');
    const analysis = orchestrator.analyze({ name: 'chrome.csv', content: sample });
    const preview = orchestrator.buildPreview({
      parsed: analysis.parsed,
      mapping: analysis.suggestedMapping,
      existingCards: [],
    });
    expect(preview.toImport.length).toBe(analysis.parsed.rows.length);
    expect(preview.total).toBe(analysis.parsed.rows.length);
  });

  it('reports missing_binary_content for 1password without bytes', () => {
    const analysis = orchestrator.analyze({
      name: 'export.1pif',
      content: '',
    });
    expect(analysis.analysisErrors).toContain('missing_binary_content');
  });
});

describe('import performance', () => {
  it('parses 1000 cards in under 5 seconds', () => {
    const rows = Array.from(
      { length: 1000 },
      (_, i) => `Site${i},user${i}@test.com,pass${i},https://example.com/${i},note`
    );
    const content = ['title,username,password,link,notes', ...rows].join('\n');
    const orchestrator = new ImportOrchestrator();
    const start = performance.now();
    const analysis = orchestrator.analyze({ name: 'bulk.csv', content });
    orchestrator.buildPreview({
      parsed: analysis.parsed,
      mapping: analysis.suggestedMapping,
      existingCards: [],
    });
    expect(performance.now() - start).toBeLessThan(5000);
    expect(analysis.parsed.rows.length).toBe(1000);
  });
});
