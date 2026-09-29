/**
 * @fileoverview Curated Android package → web host / label map and heuristics.
 */

/** At least two Java package segments; only [a-zA-Z0-9_]; no ".." or empty segments. */
export const PACKAGE_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)+$/;

/** Known Android package → web host (favicon) and display label. */
export const ANDROID_PACKAGE_META: Record<string, { host: string; label: string }> = {
  'com.instagram.android': { host: 'instagram.com', label: 'Instagram' },
  'com.spotify.music': { host: 'spotify.com', label: 'Spotify' },
  'com.netflix.mediaclient': { host: 'netflix.com', label: 'Netflix' },
  'com.discord': { host: 'discord.com', label: 'Discord' },
  'com.binance.dev': { host: 'binance.com', label: 'Binance' },
  'com.facebook.katana': { host: 'facebook.com', label: 'Facebook' },
  'com.facebook.orca': { host: 'facebook.com', label: 'Messenger' },
  'com.twitter.android': { host: 'x.com', label: 'X' },
  'com.google.android.gm': { host: 'gmail.com', label: 'Gmail' },
  'com.whatsapp': { host: 'whatsapp.com', label: 'WhatsApp' },
  'com.amazon.mShop.android.shopping': { host: 'amazon.com', label: 'Amazon' },
  'com.mercadolibre': { host: 'mercadolibre.com', label: 'Mercado Libre' },
  'com.mercadopago.wallet': { host: 'mercadopago.com', label: 'Mercado Pago' },
  'com.google.android.youtube': { host: 'youtube.com', label: 'YouTube' },
  'com.linkedin.android': { host: 'linkedin.com', label: 'LinkedIn' },
  'com.microsoft.office.outlook': { host: 'outlook.com', label: 'Outlook' },
  'com.paypal.android.p2pmobile': { host: 'paypal.com', label: 'PayPal' },
  'com.ubercab': { host: 'uber.com', label: 'Uber' },
  'com.tinder': { host: 'tinder.com', label: 'Tinder' },
  'com.snapchat.android': { host: 'snapchat.com', label: 'Snapchat' },
  'com.reddit.frontpage': { host: 'reddit.com', label: 'Reddit' },
  'com.pinterest': { host: 'pinterest.com', label: 'Pinterest' },
  'com.tiktok.android': { host: 'tiktok.com', label: 'TikTok' },
  'com.zhiliaoapp.musically': { host: 'tiktok.com', label: 'TikTok' },
};

/** Lowercases and validates a Java/Android package name. */
export function normalizePackage(pkg: string): string | null {
  const lower = pkg.trim().toLowerCase();
  if (!PACKAGE_REGEX.test(lower)) return null;
  return lower;
}

function heuristicPackageToHost(pkg: string): string | null {
  const parts = pkg.split('.');
  if (parts.length < 3 || parts[0] !== 'com') return null;
  const candidate = parts.slice(1).join('.');
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(candidate)) return candidate;
  if (parts.length >= 3) {
    const short = `${parts[1]}.${parts[2]}`;
    if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(short)) return short;
  }
  return null;
}

/** Known map first, then a conservative `com.brand.tld` heuristic. */
export function packageToWebHost(pkg: string): string | null {
  const known = ANDROID_PACKAGE_META[pkg];
  if (known) return known.host;
  return heuristicPackageToHost(pkg);
}

export function packageToDisplayLabel(pkg: string): string {
  return ANDROID_PACKAGE_META[pkg]?.label ?? pkg;
}

/** iOS bundle ids look like packages (`com.burbn.instagram`). */
export function normalizeIosAppId(raw: string): string | null {
  const trimmed = raw.trim();
  // apple-app://TEAMID.com.bundle.id — drop a leading 10-char team id if present.
  const withoutTeam = trimmed.replace(/^[A-Z0-9]{8,12}\./, '');
  return normalizePackage(withoutTeam) ?? normalizePackage(trimmed);
}
