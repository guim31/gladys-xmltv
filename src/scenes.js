// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`). They read the guide in memory, in
// the language of the configuration (a scene action does not receive the
// user's language), and return flat outputs for the next actions of the scene
// ("Tonight on France 2: {{title}} at {{start}}").
// -----------------------------------------------------------------------------

import { formatDay, formatTime, langOf } from './i18n.js';

export const MOMENTS = ['now', 'next', 'tonight'];

const MINUTE_MS = 60_000;

const notFound = () => ({
  found: 0,
  channel: '',
  title: '',
  subtitle: '',
  category: '',
  day: '',
  start: '',
  end: '',
  minutes: -1,
});

function describe(hub, channelName, programme, minutes) {
  const lang = langOf(hub.config.language);
  return {
    found: 1,
    channel: channelName,
    title: programme.title,
    subtitle: programme.subtitle ?? '',
    category: programme.category ?? '',
    day: formatDay(programme.start, lang),
    start: formatTime(programme.start, lang),
    end: formatTime(programme.stop, lang),
    minutes,
  };
}

const minutesUntil = (from, to) => Math.max(0, Math.ceil((to - from) / MINUTE_MS));

export const SCENE_ACTIONS = {
  /** What is on a channel now, next or tonight. */
  whats_on(hub, { fields = {} }) {
    if (!hub.guide) {
      throw new Error('No guide read yet');
    }
    const channel = hub.channelByDevice(fields.channel);
    if (!channel) {
      return notFound();
    }
    const name =
      hub.createdChannels().find((created) => created.id === channel.id)?.name ?? channel.name;
    const now = hub.now();
    const view = hub.view(channel.id, now);
    const moment = MOMENTS.includes(fields.moment) ? fields.moment : 'now';
    if (moment === 'now') {
      return view.current
        ? describe(hub, name, view.current, minutesUntil(now, view.current.stop))
        : notFound();
    }
    if (moment === 'next') {
      return view.next
        ? describe(hub, name, view.next, minutesUntil(now, view.next.start))
        : notFound();
    }
    return view.tonight
      ? describe(hub, name, view.tonight.programme, minutesUntil(now, view.tonight.programme.start))
      : notFound();
  },

  /** The next airing of a title on the followed channels. */
  find_programme(hub, { fields = {} }) {
    if (!hub.guide) {
      throw new Error('No guide read yet');
    }
    const keyword = typeof fields.keyword === 'string' ? fields.keyword : '';
    const now = hub.now();
    const result = hub.guide.find(
      keyword,
      hub.followed.map((channel) => channel.id),
      now,
    );
    if (!result) {
      return notFound();
    }
    const channel = hub.followed.find((item) => item.id === result.channelId);
    const name =
      hub.createdChannels().find((created) => created.id === channel.id)?.name ?? channel.name;
    return describe(hub, name, result.programme, minutesUntil(now, result.programme.start));
  },
};
