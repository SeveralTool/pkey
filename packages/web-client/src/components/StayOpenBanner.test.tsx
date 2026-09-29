import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@solidjs/testing-library';
import { StayOpenBanner } from './StayOpenBanner';

describe('StayOpenBanner', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('renders as a 12px vault Banner, not a 16px discovery strip', () => {
    const { container } = render(() => <StayOpenBanner />);
    const el = container.querySelector('.banner.tone-info.stack');
    expect(el).toBeTruthy();
    expect(container.querySelector('.stay-open-banner')).toBeNull();
  });
});
