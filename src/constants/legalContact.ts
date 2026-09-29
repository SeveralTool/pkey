/**
 * Official repository URLs for Build Integrity and the source-license screen.
 * Privacy, terms, and official-app bodies must not interpolate these names or URLs.
 */
export const OFFICIAL_REPO_URL = 'https://github.com/SeveralTool/pkey';

export const OFFICIAL_REPO_SECURITY_URL = 'https://github.com/SeveralTool/pkey/security/advisories';

/**
 * Releases page listing signed APKs / IPAs with SHA-256 checksums.
 * Surfaced in the Build Integrity settings section (audit A7 + B3) so users
 * can independently verify the binary they installed.
 */
export const OFFICIAL_REPO_RELEASES_URL = 'https://github.com/SeveralTool/pkey/releases';

/** Public HTTPS host for Play Store and the in-app “view online” buttons. */
export const LEGAL_PAGES_ORIGIN = 'https://severaltool.github.io/pkey';

export const LEGAL_WEB_URLS: Record<
  'privacy' | 'terms' | 'third_party' | 'official_app' | 'source_license',
  string
> = {
  privacy: `${LEGAL_PAGES_ORIGIN}/privacy.html`,
  terms: `${LEGAL_PAGES_ORIGIN}/terms.html`,
  third_party: `${LEGAL_PAGES_ORIGIN}/third-party.html`,
  official_app: `${LEGAL_PAGES_ORIGIN}/official-app.html`,
  source_license: `${LEGAL_PAGES_ORIGIN}/source-license.html`,
};
