import { describe, it, expect } from 'vitest';
import { discoveryUiMode } from './discoveryUi';

describe('discoveryUiMode', () => {
  it('hides chrome while authenticated', () => {
    expect(discoveryUiMode('active', true, 'authenticated')).toBe('hidden');
  });

  it('shows searching while discovery is active and the master is missing', () => {
    expect(discoveryUiMode('active', false, 'disconnected')).toBe('searching');
    expect(discoveryUiMode('active', true, 'offline')).toBe('searching');
  });

  it('shows guidance after the search gives up', () => {
    expect(discoveryUiMode('idle', true, 'disconnected')).toBe('guidance');
    expect(discoveryUiMode('found', true, 'offline')).toBe('guidance');
  });

  it('stays hidden before a search starts or after it finds a host', () => {
    expect(discoveryUiMode('idle', false, 'disconnected')).toBe('hidden');
    expect(discoveryUiMode('found', false, 'connecting')).toBe('hidden');
  });
});
