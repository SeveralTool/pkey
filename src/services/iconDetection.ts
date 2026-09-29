/**
 * @fileoverview Re-exports shared icon detection from @pkey/core (single source of truth).
 */
import {
  detectIcon,
  faviconIconFromLink,
  clearIconCache,
  invalidateIconCacheFor,
  PRESET_ICONS,
  resolveCardIcon,
  resolveIoniconName,
  shouldKeepStoredIcon,
  DEFAULT_CARD_ICON,
  detectPresetFromLink,
  type DetectionResult,
} from '@pkey/core';

export {
  detectIcon,
  faviconIconFromLink,
  clearIconCache,
  invalidateIconCacheFor,
  PRESET_ICONS,
  resolveCardIcon,
  resolveIoniconName,
  shouldKeepStoredIcon,
  DEFAULT_CARD_ICON,
  detectPresetFromLink,
  type DetectionResult,
};

/** @deprecated Cache stats are internal to @pkey/core */
export const getIconCacheStats = () => ({
  size: 0,
  maxSize: 0,
  ttl: 24 * 60 * 60 * 1000,
});

export const iconDetectionService = {
  detectIcon,
  clearIconCache,
  getIconCacheStats,
};
