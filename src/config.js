// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Evening ("tonight") start times offered, local time of Gladys.
export const EVENING_TIMES = [
  '19:30',
  '19:45',
  '20:00',
  '20:15',
  '20:30',
  '20:45',
  '21:00',
  '21:15',
  '21:30',
  '21:45',
  '22:00',
  '22:15',
  '22:30',
];

// Hours between two downloads of the guide: a guide covers several days and
// its publishers rebuild it once or twice a day.
export const REFRESH_HOURS = ['6', '12', '24'];

// Minutes before a programme start at which the "before" trigger fires.
export const ADVANCE_MINUTES = ['0', '5', '10', '15', '30'];

export const MAX_CHANNELS = 20;
export const MAX_KEYWORDS = 20;
const MAX_KEYWORD_LENGTH = 60;

export const DEFAULT_CONFIG = {
  guide_url: '',
  channels: '',
  evening_time: '21:00',
  refresh_hours: '12',
  keywords: '',
  advance_minutes: '5',
  language: 'fr',
};

// Files the user dropped in the data volume of the integration.
export const DATA_PREFIX = '/data/';

/**
 * The guide source typed by the user: an http(s) URL, or a file of the data
 * volume (`/data/guide.xml.gz`).
 * @param {unknown} raw
 * @returns {{ kind: 'http', url: string } | { kind: 'file', path: string } | null}
 */
export function parseSource(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  if (text.startsWith(DATA_PREFIX)) {
    // No way out of the volume: no `..` segment.
    if (text.split('/').some((segment) => segment === '..') || text.length > 500) {
      return null;
    }
    return { kind: 'file', path: text };
  }
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return { kind: 'http', url: url.href };
  } catch {
    return null;
  }
}

/** A comma (or line) separated list, trimmed, without blanks or duplicates. */
export function splitList(raw, max, maxLength = 200) {
  if (typeof raw !== 'string') {
    return [];
  }
  const seen = new Set();
  const items = [];
  for (const part of raw.split(/[,;\n]/)) {
    const item = part.trim().slice(0, maxLength);
    const key = item.toLowerCase();
    if (item && !seen.has(key)) {
      seen.add(key);
      items.push(item);
    }
  }
  return items.slice(0, max);
}

const pickOption = (value, options, fallback) => {
  const text = typeof value === 'number' ? String(value) : value;
  return options.includes(text) ? text : fallback;
};

/** "21:00" → minutes after midnight. */
const minutesOf = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * @param {object} [raw] the configuration received from Gladys
 */
export function normalizeConfig(raw = {}) {
  const config = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
  const eveningTime = pickOption(config.evening_time, EVENING_TIMES, DEFAULT_CONFIG.evening_time);
  return {
    source: parseSource(config.guide_url),
    // Whether something was typed: an unusable address is not "nothing".
    sourceTyped: typeof config.guide_url === 'string' && config.guide_url.trim() !== '',
    channels: splitList(config.channels, MAX_CHANNELS),
    eveningMinutes: minutesOf(eveningTime),
    refreshHours: Number(pickOption(config.refresh_hours, REFRESH_HOURS, '12')),
    keywords: splitList(config.keywords, MAX_KEYWORDS, MAX_KEYWORD_LENGTH),
    advanceMinutes: Number(pickOption(config.advance_minutes, ADVANCE_MINUTES, '5')),
    language: pickOption(config.language, LANGUAGES, DEFAULT_CONFIG.language),
  };
}
