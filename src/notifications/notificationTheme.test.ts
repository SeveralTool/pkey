import { notificationThemeFromColors } from './notificationTheme';

describe('notificationThemeFromColors', () => {
  it('falls back when colors are missing', () => {
    const theme = notificationThemeFromColors(undefined);
    expect(theme.cardBg).toBeTruthy();
    expect(theme.accentSoft).toMatch(/^#/);
  });

  it('uses provided card colors', () => {
    const theme = notificationThemeFromColors({
      cardBg: '#111111',
      text: '#eeeeee',
      textMuted: '#aaaaaa',
      border: '#222222',
      accent: '#87cb28',
      accentHover: '#87cb28',
      success: '#87cb28',
      warning: '#FFC107',
      danger: '#D75A4D',
      bg: '#000000',
    });
    expect(theme.cardBg).toBe('#111111');
    expect(theme.accentSoft).toBe('#87cb281A');
  });
});
