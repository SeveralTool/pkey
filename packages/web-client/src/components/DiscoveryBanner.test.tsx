import { describe, it, expect } from 'vitest';
import { render } from '@solidjs/testing-library';
import { DiscoveryBanner } from './DiscoveryBanner';

describe('DiscoveryBanner', () => {
  it('renders no chrome when discovery is idle', () => {
    const { container } = render(() => <DiscoveryBanner />);
    expect(container.querySelector('.banner, .notice')).toBeNull();
  });
});
