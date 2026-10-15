/**
 * @fileoverview Scroll-phase transitions used to park a fling on tab blur.
 */
import {
  nextScrollActivity,
  SCROLL_MOMENTUM_VELOCITY,
  shouldParkScrollOnBlur,
} from './scrollActivity';

describe('nextScrollActivity', () => {
  it('tracks a drag that settles without a fling', () => {
    const dragging = nextScrollActivity('idle', 'begin-drag');
    expect(dragging).toBe('drag');
    expect(nextScrollActivity(dragging, 'end-drag', 0)).toBe('idle');
    expect(nextScrollActivity(dragging, 'end-drag', SCROLL_MOMENTUM_VELOCITY / 2)).toBe('idle');
  });

  it('keeps momentum after a fast release until the fling ends', () => {
    const dragging = nextScrollActivity('idle', 'begin-drag');
    const flinging = nextScrollActivity(dragging, 'end-drag', -2);
    expect(flinging).toBe('momentum');
    expect(nextScrollActivity('idle', 'momentum-begin')).toBe('momentum');
    expect(nextScrollActivity(flinging, 'momentum-end')).toBe('idle');
  });
});

describe('shouldParkScrollOnBlur', () => {
  it('parks only while the offset can still move', () => {
    expect(shouldParkScrollOnBlur('idle')).toBe(false);
    expect(shouldParkScrollOnBlur('drag')).toBe(true);
    expect(shouldParkScrollOnBlur('momentum')).toBe(true);
  });
});
