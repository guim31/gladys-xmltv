// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`): now and next, or tonight, on the
// channels added to Gladys, one row per channel (a `card-list`, 8 rows at
// most), under the name given in Gladys. Tapping a row opens the core's detail
// panel: now, next and tonight with their times, subtitle and category.
//
// Built from memory, in the dashboard language. The badge (time left, or the
// start time tonight) can be hidden.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from './hub.js';
import { MESSAGES, TEXT, formatTime, langOf, pick } from './i18n.js';

export const TTL_SECONDS = 60;
export const VIEWS = ['now', 'tonight'];
const MAX_ROWS = 8;

const sentence = (message, language) => ({
  ttl_seconds: TTL_SECONDS,
  components: [{ type: 'text', variant: 'body', text: pick(message, language) }],
});

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function line(label, programme, lang, { tomorrow = false } = {}) {
  const t = TEXT[lang];
  if (!programme) {
    return `${label}: ${t.none}`;
  }
  const when = `${tomorrow ? `${t.tomorrow} ` : ''}${formatTime(programme.start, lang)}–${formatTime(programme.stop, lang)}`;
  const details = [programme.subtitle, programme.category].filter(Boolean).join(' · ');
  return `${label} (${when}): ${programme.title}${details ? `\n${details}` : ''}`;
}

/** One row of the list. */
export function buildRow(channelName, view, now, lang, { mode, showBadge }) {
  const t = TEXT[lang];
  const { current, next, tonight } = view;
  const row = { title: clip(channelName, 60) };
  if (mode === 'tonight') {
    row.subtitle = clip(tonight?.programme.title ?? t.none, 60);
    if (showBadge && tonight) {
      row.badge = {
        text: clip(
          `${tonight.tomorrow ? `${t.tomorrow} ` : ''}${formatTime(tonight.programme.start, lang)}`,
          16,
        ),
        color: WIDGET_COLORS.PRIMARY,
      };
    }
  } else {
    row.subtitle = clip(current?.title ?? t.none, 60);
    if (showBadge && current) {
      const left = Math.max(0, Math.ceil((current.stop - now) / 60_000));
      row.badge = { text: clip(`${left} ${t.minutes}`, 16), color: WIDGET_COLORS.INFO };
    }
  }
  row.description = [
    line(t.now, current, lang),
    line(t.next, next, lang),
    line(t.tonight, tonight?.programme, lang, { tomorrow: tonight?.tomorrow }),
  ]
    .join('\n\n')
    .slice(0, 2000);
  return row;
}

export function buildContent(hub, { settings = {}, language }) {
  const lang = langOf(language);
  if (!hub.guide) {
    return sentence(MESSAGES.noGuideYet, lang);
  }
  let channels = hub.createdChannels();
  const chosen = Array.isArray(settings.channels) ? settings.channels : [];
  if (chosen.length > 0) {
    channels = chosen
      .map((externalId) => channels.find((channel) => channel.externalId === externalId))
      .filter(Boolean);
  }
  if (channels.length === 0) {
    return sentence(MESSAGES.addChannels, lang);
  }
  const now = hub.now();
  const mode = VIEWS.includes(settings.view) ? settings.view : 'now';
  const showBadge = settings.show_badge !== false;
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      {
        type: 'card-list',
        display: 'list',
        items: channels
          .slice(0, MAX_ROWS)
          .map((channel) =>
            buildRow(channel.name, hub.view(channel.id, now), now, lang, { mode, showBadge }),
          ),
      },
    ],
  };
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    get: (hub, request) => buildContent(hub, request),
  },
};
