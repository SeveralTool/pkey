import { collapsedSubtitleText, type CollapsedSubtitleCopy } from './collapsedSubtitle';

const t: CollapsedSubtitleCopy = {
  no_link_placeholder: 'No link configured',
  stat_empty_username: 'Empty username',
};

const formatLink = (link: string) => `display:${link}`;

describe('collapsedSubtitleText', () => {
  it('shows the formatted URL for single cards', () => {
    expect(
      collapsedSubtitleText(
        { username: 'alice@example.com', link: 'https://mail.example.com/login' },
        'link',
        t,
        formatLink
      )
    ).toBe('display:https://mail.example.com/login');
  });

  it('shows the placeholder when a single card has no link', () => {
    expect(
      collapsedSubtitleText({ username: 'alice', link: '   ' }, 'link', t, formatLink)
    ).toBe('No link configured');
  });

  it('shows username for grouped members instead of the shared host', () => {
    expect(
      collapsedSubtitleText(
        { username: 'work@example.com', link: 'https://google.com' },
        'username',
        t,
        formatLink
      )
    ).toBe('work@example.com');
  });

  it('trims username whitespace in grouped members', () => {
    expect(
      collapsedSubtitleText(
        { username: '  bob  ', link: 'https://google.com' },
        'username',
        t,
        formatLink
      )
    ).toBe('bob');
  });

  it('falls back to empty-username copy when a grouped member has no login', () => {
    expect(
      collapsedSubtitleText(
        { username: '   ', link: 'https://google.com' },
        'username',
        t,
        formatLink
      )
    ).toBe('Empty username');
  });

  it('does not fall back to the URL when grouped username is empty', () => {
    const text = collapsedSubtitleText(
      { username: '', link: 'https://accounts.google.com' },
      'username',
      t,
      formatLink
    );
    expect(text).not.toContain('google');
    expect(text).toBe('Empty username');
  });
});
