import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStatsSnapshots, maybeRecordStatsSnapshot } from './statsSnapshots';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('statsSnapshots', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('records first snapshot and skips identical ones within interval', async () => {
    const metrics = { healthScore: 90, weakCount: 1, staleCount: 2, duplicatedCount: 0 };
    const first = await maybeRecordStatsSnapshot(metrics, Date.parse('2026-01-01T00:00:00.000Z'));
    expect(first).toHaveLength(1);

    const skipped = await maybeRecordStatsSnapshot(
      metrics,
      Date.parse('2026-01-01T01:00:00.000Z')
    );
    expect(skipped).toHaveLength(1);

    const changed = await maybeRecordStatsSnapshot(
      { ...metrics, weakCount: 3 },
      Date.parse('2026-01-01T01:30:00.000Z')
    );
    expect(changed).toHaveLength(2);
    expect((await getStatsSnapshots())[0]?.weakCount).toBe(3);
  });
});
