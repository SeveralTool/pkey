import { describe, it, expect } from 'vitest';
import { render } from '@solidjs/testing-library';
import { LoginScreen } from './LoginScreen';

describe('LoginScreen chrome', () => {
  it('uses an inset notice for the LAN warning and a status line, not a vault banner', () => {
    const { container } = render(() => <LoginScreen />);
    const lan = container.querySelector('.notice');
    expect(lan).toBeTruthy();
    expect(lan?.className).not.toContain('banner');
    expect(container.querySelector('.banner')).toBeNull();
    expect(container.querySelector('.status-line.conn-status')).toBeTruthy();
    expect(container.querySelector('.lan-warning')).toBeNull();
  });
});
