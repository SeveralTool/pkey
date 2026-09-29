import {
  buildAlertItem,
  buildToastItem,
  DEFAULT_TOAST_DURATION,
  enqueueNotification,
  getPositionForVariant,
  MAX_VISIBLE_NOTIFICATIONS,
  removeNotification,
} from './inAppNotifications';

describe('inAppNotifications queue', () => {
  it('builds toast with default duration', () => {
    const item = buildToastItem({ title: 'Hello' });
    expect(item.mode).toBe('toast');
    expect(item.duration).toBe(DEFAULT_TOAST_DURATION);
    expect(item.actions).toEqual([]);
  });

  it('maps variant to default position', () => {
    expect(getPositionForVariant('error')).toBe('top');
    expect(getPositionForVariant('warning')).toBe('top');
    expect(getPositionForVariant('success')).toBe('bottom');
    expect(getPositionForVariant('info')).toBe('bottom');
  });

  it('defaults toast position by variant and honors explicit override', () => {
    expect(buildToastItem({ title: 'A', variant: 'error' }).position).toBe('top');
    expect(buildToastItem({ title: 'B', variant: 'success' }).position).toBe('bottom');
    expect(buildToastItem({ title: 'C', variant: 'error', position: 'bottom' }).position).toBe(
      'bottom'
    );
  });

  it('marks sensitive items and keeps default false', () => {
    expect(buildToastItem({ title: 'S', sensitive: true }).sensitive).toBe(true);
    expect(buildToastItem({ title: 'N' }).sensitive).toBe(false);
  });

  it('builds alert with actions and no default auto-dismiss', () => {
    const item = buildAlertItem({
      title: 'Confirm',
      actions: [{ text: 'OK' }],
    });
    expect(item.mode).toBe('alert');
    expect(item.duration).toBe(0);
    expect(item.actions).toHaveLength(1);
  });

  it('limits visible queue size', () => {
    let queue = [] as ReturnType<typeof buildToastItem>[];
    for (let i = 0; i < MAX_VISIBLE_NOTIFICATIONS + 2; i++) {
      queue = enqueueNotification(queue, buildToastItem({ title: `Item ${i}` }));
    }
    expect(queue).toHaveLength(MAX_VISIBLE_NOTIFICATIONS);
    expect(queue[0].title).toBe('Item 2');
  });

  it('removes notification by id', () => {
    const a = buildToastItem({ title: 'A' });
    const b = buildToastItem({ title: 'B' });
    const queue = removeNotification([a, b], a.id);
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(b.id);
  });
});
