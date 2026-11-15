// -----------------------------------------------------------------------------
// The guide in memory: the channel list of the last guide read, and the
// programmes of the followed channels only, sorted by start. Everything the
// devices, the widget and the scenes show is computed from it, without any
// download: what is on now, next and tonight, a programme by keyword.
// -----------------------------------------------------------------------------

// Programmes kept: from one hour ago to this many days ahead.
export const KEEP_PAST_MS = 60 * 60_000;
export const KEEP_AHEAD_MS = 8 * 24 * 60 * 60_000;
// Longest guess for a programme without `stop` and without a successor.
const DEFAULT_LENGTH_MS = 60 * 60_000;
// "Tonight": the first programme starting from 10 minutes before the evening
// time and lasting at least 20 minutes (skips the weather and the trailers).
const EVENING_EARLY_MS = 10 * 60_000;
const EVENING_LATE_MS = 90 * 60_000;
const EVENING_MIN_LENGTH_MS = 20 * 60_000;
export const MAX_CHANNEL_LIST = 20000;

/** Lower case, no accent: "Koh-Lanta" and "koh lanta" stay different, "Été" = "ete". */
export const fold = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

/** Followed entries (ids or names typed by the user) → channel ids of the guide. */
export function resolveChannels(entries, channels) {
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  const byFoldedId = new Map(channels.map((channel) => [fold(channel.id), channel]));
  const byName = new Map();
  for (const channel of channels) {
    for (const name of channel.names) {
      if (!byName.has(fold(name))) {
        byName.set(fold(name), channel);
      }
    }
  }
  const found = [];
  const missing = [];
  const seen = new Set();
  for (const entry of entries) {
    const channel = byId.get(entry) ?? byFoldedId.get(fold(entry)) ?? byName.get(fold(entry));
    if (!channel) {
      missing.push(entry);
    } else if (!seen.has(channel.id)) {
      seen.add(channel.id);
      found.push({ id: channel.id, name: channel.names[0] ?? channel.id });
    }
  }
  return { found, missing };
}

/** Whether a programme may matter: not over for an hour, starting within 8 days. */
export const inWindow = (programme, now) =>
  programme.start < now + KEEP_AHEAD_MS &&
  (programme.stop === null || programme.stop > now - KEEP_PAST_MS);

/** Sort, fill the missing ends, drop what is out of the window. Linear after the sort. */
export function tidyProgrammes(list, now) {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  // Same start twice (two sources merged): keep the first.
  const unique = sorted.filter(
    (programme, index) => index === 0 || programme.start !== sorted[index - 1].start,
  );
  return unique
    .map((programme, index) => {
      const next = unique[index + 1];
      const stop = programme.stop ?? (next ? next.start : programme.start + DEFAULT_LENGTH_MS);
      return { ...programme, stop };
    })
    .filter((programme) => inWindow(programme, now));
}

/** Midnight-based local date (time zone of Gladys) at a number of minutes. */
function localTime(reference, dayOffset, minutes) {
  const date = new Date(reference);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  date.setMinutes(minutes);
  return date.getTime();
}

export class Guide {
  /**
   * @param {object} data
   * @param {{ id: string, names: string[] }[]} data.channels every channel of the guide
   * @param {Record<string, object[]>} data.programmes followed channel id → programmes
   * @param {number} data.fetchedAt
   */
  constructor({ channels = [], programmes = {}, fetchedAt = 0 } = {}) {
    this.channels = channels;
    this.programmes = programmes;
    this.fetchedAt = fetchedAt;
  }

  list(channelId) {
    return this.programmes[channelId] ?? [];
  }

  /** The programme on air at `now`, or null. */
  current(channelId, now) {
    let found = null;
    for (const programme of this.list(channelId)) {
      if (programme.start > now) {
        break;
      }
      if (programme.stop > now) {
        found = programme;
      }
    }
    return found;
  }

  /** The programme after the current one (or the first to come). */
  next(channelId, now) {
    const current = this.current(channelId, now);
    const from = current ? current.stop : now;
    return (
      this.list(channelId).find(
        (programme) => programme.start >= from && programme !== current && programme.start > now,
      ) ?? null
    );
  }

  /** The evening programme of a day (0 = today, 1 = tomorrow). */
  evening(channelId, now, eveningMinutes, dayOffset) {
    const target = localTime(now, dayOffset, eveningMinutes);
    const list = this.list(channelId);
    const first = list.find(
      (programme) =>
        programme.start >= target - EVENING_EARLY_MS &&
        programme.start < target + EVENING_LATE_MS &&
        programme.stop - programme.start >= EVENING_MIN_LENGTH_MS,
    );
    if (first) {
      return first;
    }
    return list.find((programme) => programme.start <= target && programme.stop > target) ?? null;
  }

  /**
   * Tonight's programme; once it is over, tomorrow evening's.
   * @returns {{ programme: object, tomorrow: boolean } | null}
   */
  tonight(channelId, now, eveningMinutes) {
    const today = this.evening(channelId, now, eveningMinutes, 0);
    if (today && today.stop > now) {
      return { programme: today, tomorrow: false };
    }
    const tomorrow = this.evening(channelId, now, eveningMinutes, 1);
    return tomorrow ? { programme: tomorrow, tomorrow: true } : null;
  }

  /**
   * The first programme on air or to come whose title holds the keyword, on
   * the given channels.
   * @returns {{ channelId: string, programme: object } | null}
   */
  find(keyword, channelIds, now) {
    const needle = fold(keyword).trim();
    if (!needle) {
      return null;
    }
    let best = null;
    for (const channelId of channelIds) {
      const programme = this.list(channelId).find(
        (item) => item.stop > now && fold(item.title).includes(needle),
      );
      if (programme && (!best || programme.start < best.programme.start)) {
        best = { channelId, programme };
      }
    }
    return best;
  }

  /** The guide covers programmes until this time (0 when empty). */
  coversUntil() {
    let last = 0;
    for (const list of Object.values(this.programmes)) {
      if (list.length > 0) {
        last = Math.max(last, list[list.length - 1].stop);
      }
    }
    return last;
  }

  toJSON() {
    return { channels: this.channels, programmes: this.programmes, fetchedAt: this.fetchedAt };
  }
}
