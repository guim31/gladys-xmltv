// -----------------------------------------------------------------------------
// A followed channel → its Gladys device, and its states.
//
// One device per channel, keyed on the channel id of the guide (`TF1.fr`,
// `BBC.One.Lon.HD.uk`): the id is what XMLTV guides keep stable, the display
// name changes. The features are read-only: titles as texts, the end time as
// a text, the time left in minutes (a number, for scene conditions).
//
// No `poll_frequency`: the integration recomputes the states every minute by
// itself (no request, the guide is in memory), and Gladys 5.2.x does not
// poll external devices reliably anyway (Gladys#3198).
//
// The feature keys are forever (external ids): never rename one.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORY,
  DEVICE_FEATURE_TYPES as TYPE,
  DEVICE_FEATURE_UNITS as UNIT,
} from '@gladysassistant/integration-sdk';
import { NAMES, TEXT, formatTime, langOf, slotText } from './i18n.js';

export const DEVICE_TYPE = 'channel';

export const FEATURE = {
  NOW_TITLE: 'now_title',
  NOW_END: 'now_end',
  NOW_REMAINING: 'now_remaining',
  NEXT_TITLE: 'next_title',
  TONIGHT_TITLE: 'tonight_title',
};

// The longest programme counted, in minutes (a 24-hour loop channel).
export const MAX_REMAINING = 1440;

const text = () => ({
  category: CATEGORY.TEXT,
  type: TYPE.TEXT.TEXT,
  read_only: true,
  has_feedback: false,
  keep_history: false,
  // NOT NULL in the core: without them, "Add to Gladys" fails with a 422.
  min: 0,
  max: 0,
});

const FEATURES = {
  [FEATURE.NOW_TITLE]: text(),
  [FEATURE.NOW_END]: text(),
  [FEATURE.NOW_REMAINING]: {
    category: CATEGORY.DURATION,
    type: TYPE.DURATION.INTEGER,
    unit: UNIT.MINUTES,
    read_only: true,
    has_feedback: false,
    keep_history: false,
    min: 0,
    max: MAX_REMAINING,
  },
  [FEATURE.NEXT_TITLE]: text(),
  [FEATURE.TONIGHT_TITLE]: text(),
};

export const FEATURE_KEYS = Object.keys(FEATURES);

/**
 * The platform id of a channel: its guide id, with the characters an
 * external id should not hold (`:`, spaces, `+`…) written as `-<hex>`.
 */
export const platformId = (channelId) =>
  channelId
    .slice(0, 120)
    .replace(/[^A-Za-z0-9._-]/g, (char) => `-${char.codePointAt(0).toString(16)}`);

export const channelIds = (gladys, channelId) =>
  gladys.externalIds(DEVICE_TYPE, platformId(channelId));

/**
 * @param {object} gladys GladysIntegration
 * @param {{ id: string, name: string }} channel
 * @param {string} language feature names
 */
export function buildDevice(gladys, channel, language) {
  const ids = channelIds(gladys, channel.id);
  const names = NAMES[langOf(language)];
  return {
    name: channel.name.slice(0, 100),
    external_id: ids.device,
    should_poll: false,
    params: [{ name: 'channel_id', value: channel.id }],
    features: FEATURE_KEYS.map((key) => ({
      ...FEATURES[key],
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

/**
 * What a channel shows at `now`.
 * @returns {{ current, next, tonight: { programme, tomorrow } | null }}
 */
export function channelView(guide, channelId, now, eveningMinutes) {
  return {
    current: guide.current(channelId, now),
    next: guide.next(channelId, now),
    tonight: guide.tonight(channelId, now, eveningMinutes),
  };
}

/** The states of a channel device. Texts are never empty (the core drops them). */
export function buildStates(gladys, channelId, view, now, language) {
  const lang = langOf(language);
  const ids = channelIds(gladys, channelId);
  const { current, next, tonight } = view;
  const remaining = current
    ? Math.min(MAX_REMAINING, Math.max(0, Math.ceil((current.stop - now) / 60_000)))
    : 0;
  return [
    {
      device_feature_external_id: ids.feature(FEATURE.NOW_TITLE),
      text: current?.title ?? TEXT[lang].none,
    },
    {
      device_feature_external_id: ids.feature(FEATURE.NOW_END),
      text: current ? formatTime(current.stop, lang) : '-',
    },
    { device_feature_external_id: ids.feature(FEATURE.NOW_REMAINING), state: remaining },
    { device_feature_external_id: ids.feature(FEATURE.NEXT_TITLE), text: slotText(next, lang) },
    {
      device_feature_external_id: ids.feature(FEATURE.TONIGHT_TITLE),
      text: slotText(tonight?.programme, lang, { tomorrow: tonight?.tomorrow }),
    },
  ];
}
