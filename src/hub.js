// -----------------------------------------------------------------------------
// The integration's state machine: reads the guide, keeps the programmes of the
// followed channels, publishes one device per followed channel, recomputes the
// states every minute, fires the keyword trigger.
//
// Two timers, both inside the container:
//   - the guide is downloaded at start, then every `refresh_hours` (6, 12 or
//     24 h), conditionally (ETag / Last-Modified); a failure retries after
//     30 minutes and keeps the programmes already known;
//   - every minute, the states of the channels added to Gladys are computed
//     from memory (no request) and published when they change, with a
//     heartbeat every six hours.
//
// The programmes are cached under /data, so a restart does not download the
// guide again before its refresh is due.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';
import { MAX_CHANNELS } from './config.js';
import { FEATURE, buildDevice, buildStates, channelIds, channelView } from './devices.js';
import {
  Guide,
  MAX_CHANNEL_LIST,
  fold,
  inWindow,
  resolveChannels,
  tidyProgrammes,
} from './guide.js';
import { MESSAGES, TEXT, channelList, formatTime, langOf, testReport } from './i18n.js';
import { createIssueLog } from './issues.js';
import { XmltvError } from './xmltv/parser.js';
import { readGuide, sourceLabel } from './xmltv/source.js';

const logger = createLogger({ name: 'xmltv' });

export const WIDGET_KEY = 'tv_guide';
export const TRIGGER_KEY = 'keyword_programme';
export const HEARTBEAT_MS = 6 * 60 * 60_000;
const RETRY_MS = 30 * 60_000;
const TRIGGER_CATCH_UP_MS = 5 * 60_000;
const MINUTE_MS = 60_000;
const CACHE_VERSION = 1;
const MAX_LISTED_CHANNELS = 60;

/** A hash of the source: the cache knows which guide it holds, never its address. */
const sourceKey = (source) =>
  source
    ? createHash('sha256')
        .update(source.kind === 'file' ? source.path : source.url)
        .digest('hex')
        .slice(0, 32)
    : null;

export class Hub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration
   * @param {object} options.store Store or MemoryStore
   * @param {boolean} [options.timers] run the timers (false in most tests)
   * @param {() => number} [options.now] clock
   * @param {Function} [options.fetchImpl] fetch, for the tests
   */
  constructor({ gladys, store, timers = true, now = () => Date.now(), fetchImpl }) {
    this.gladys = gladys;
    this.store = store;
    this.useTimers = timers;
    this.now = now;
    this.fetchImpl = fetchImpl;
    this.config = null;
    this.guide = null;
    this.cache = null;
    this.followed = [];
    this.missing = [];
    this.lastError = null;
    this.issues = createIssueLog(logger);
    this.refreshTimer = null;
    this.tickTimer = null;
    this.lastTick = null;
    this.fired = new Map();
    this.refreshing = null;
    this.generation = 0;
  }

  // --- Lifecycle -------------------------------------------------------------

  /**
   * (Re)start with a configuration: cache, download if due, timers. With a
   * usable cache, the download runs in the background (the handlers are
   * served at once); without one, it is awaited.
   */
  async start(config) {
    this.stopTimers();
    this.abort?.abort();
    this.generation += 1;
    this.config = config;
    this.lastTick = this.now();
    this.fired.clear();
    // Nothing of the previous configuration survives: another source, another
    // language or other channels mean another guide.
    this.cache = null;
    this.guide = null;
    this.followed = [];
    this.missing = [];
    if (!config.source) {
      this.lastError = config.sourceTyped ? 'badSource' : 'noSource';
      await this.safely('publish the devices', () => this.publishDevices());
      await this.setStatus(this.lastError);
      return;
    }
    const cache = await this.loadCache(config);
    if (cache) {
      this.useGuide(cache);
    }
    const dueAt = cache ? cache.guide.fetchedAt + config.refreshHours * 3_600_000 : 0;
    this.scheduleTick();
    if (cache && dueAt > this.now()) {
      this.lastError = this.channelError();
      await this.safely('publish the devices', () => this.publishDevices());
      await this.setStatus(this.lastError);
      await this.tick();
      this.scheduleRefresh(dueAt - this.now());
      return;
    }
    if (cache) {
      this.lastError = this.channelError();
      await this.safely('publish the devices', () => this.publishDevices());
      await this.setStatus(this.lastError);
      await this.tick();
      this.refresh().catch((err) => logger.error('Guide refresh failed', err));
      return;
    }
    await this.refresh();
  }

  /** 'noChannel' when channels are followed but none is in the guide. */
  channelError() {
    return this.followed.length === 0 && this.config.channels.length > 0 ? 'noChannel' : null;
  }

  /** Run a call to Gladys; a failure is logged, never thrown (timers keep running). */
  async safely(what, fn) {
    try {
      await fn();
      this.issues.ok(what, `Could ${what} again`);
    } catch (err) {
      this.issues.fail(what, `Cannot ${what}: ${err.message}`);
    }
  }

  /** Gladys restarted: send again what it may have lost. */
  async resync() {
    this.gladys.forgetPublishedStates();
    await this.publishDevices();
    await this.setStatus(this.lastError);
    await this.tick();
  }

  stopTimers() {
    clearTimeout(this.refreshTimer);
    clearTimeout(this.tickTimer);
    this.refreshTimer = null;
    this.tickTimer = null;
  }

  async stop() {
    this.stopTimers();
    this.useTimers = false;
    // A download in progress is aborted: SIGTERM must not wait for it.
    this.abort?.abort();
    await this.refreshing?.catch(() => {});
    await this.store.flush();
  }

  scheduleRefresh(delay) {
    if (!this.useTimers) {
      return;
    }
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(
      () => {
        this.refresh().catch((err) => logger.error('Guide refresh failed', err));
      },
      Math.max(MINUTE_MS, delay),
    );
    this.refreshTimer.unref?.();
  }

  scheduleTick() {
    if (!this.useTimers) {
      return;
    }
    clearTimeout(this.tickTimer);
    // A second after each minute: programmes start on the minute.
    const now = this.now();
    const delay = MINUTE_MS - (now % MINUTE_MS) + 1000;
    this.tickTimer = setTimeout(async () => {
      try {
        await this.tick();
      } catch (err) {
        logger.error('Minute update failed', err);
      }
      this.scheduleTick();
    }, delay);
    this.tickTimer.unref?.();
  }

  // --- Guide -----------------------------------------------------------------

  async loadCache(config) {
    const data = await this.store.load();
    if (
      data?.version !== CACHE_VERSION ||
      data.source !== sourceKey(config.source) ||
      data.language !== config.language ||
      !data.guide ||
      !Array.isArray(data.guide.channels)
    ) {
      return null;
    }
    // The followed channels changed: their programmes are not in the cache.
    const wanted = resolveChannels(config.channels, data.guide.channels).found.map((c) => c.id);
    if (wanted.some((id) => !(id in (data.guide.programmes ?? {})))) {
      return { ...data, guide: { ...data.guide, fetchedAt: 0 }, validators: null };
    }
    return data;
  }

  useGuide(cache) {
    this.cache = cache;
    this.guide = new Guide(cache.guide);
    const { found, missing } = resolveChannels(this.config.channels, this.guide.channels);
    this.followed = found.slice(0, MAX_CHANNELS);
    this.missing = missing;
  }

  /**
   * Download and read the guide now. Concurrent calls share the same run.
   * @returns {Promise<{ unchanged: boolean } | { error: string }>}
   */
  refresh() {
    if (!this.refreshing || this.refreshingGeneration !== this.generation) {
      // A run for an older configuration finishes first (its result is dropped).
      const previous = this.refreshing ?? Promise.resolve();
      const generation = this.generation;
      this.refreshingGeneration = generation;
      const run = previous
        .catch(() => {})
        .then(() => (generation === this.generation ? this.runRefresh() : { stale: true }))
        .finally(() => {
          if (this.refreshing === run) {
            this.refreshing = null;
          }
        });
      this.refreshing = run;
    }
    return this.refreshing;
  }

  async runRefresh() {
    const { config } = this;
    const generation = this.generation;
    const label = sourceLabel(config.source);
    const now = this.now();
    const abort = new AbortController();
    this.abort = abort;
    // Names may only resolve once the channel list is read: the guide lists
    // its channels first (XMLTV DTD), so they are resolved on the first
    // programme.
    const channels = [];
    let wanted = null;
    const programmes = {};
    let result;
    try {
      result = await readGuide(config.source, {
        fetchImpl: this.fetchImpl,
        signal: abort.signal,
        validators: this.cache?.guide.fetchedAt ? this.cache.validators : null,
        parser: {
          language: config.language,
          onChannel: (channel) => {
            if (channels.length < MAX_CHANNEL_LIST) {
              channels.push(channel);
            }
          },
          wants: (channelId) => {
            wanted ??= new Set([
              ...resolveChannels(config.channels, channels).found.map((c) => c.id),
              ...config.channels,
            ]);
            return wanted.has(channelId);
          },
          onProgramme: (programme) => {
            // Only the window kept: a guide of months stays small in memory.
            if (inWindow(programme, now)) {
              (programmes[programme.channel] ??= []).push(programme);
            }
          },
        },
      });
    } catch (err) {
      if (generation !== this.generation || abort.signal.aborted) {
        return { stale: true };
      }
      const code = err instanceof XmltvError ? err.code : 'unreachable';
      if (!(err instanceof XmltvError)) {
        logger.debug('Unexpected guide error', err);
      }
      this.issues.fail('guide', `Cannot read the guide on ${label}: ${err.message}`);
      // The programmes already known keep the devices alive meanwhile.
      this.lastError = this.guide ? this.channelError() : code;
      await this.safely('publish the devices', () => this.publishDevices());
      await this.setStatus(this.lastError);
      this.scheduleRefresh(Math.min(RETRY_MS, config.refreshHours * 3_600_000));
      return { error: code };
    }
    if (generation !== this.generation) {
      return { stale: true };
    }
    this.issues.ok('guide', `Guide read again on ${label}`);
    if (result.notModified) {
      this.cache.guide.fetchedAt = now;
      this.guide.fetchedAt = now;
      await this.store.save(this.cache);
      logger.debug(`Guide unchanged on ${label}`);
      await this.afterRefresh();
      return { unchanged: true };
    }
    // A followed channel listed after its programmes (outside the DTD)
    // resolves here, without programmes.
    const { found } = resolveChannels(config.channels, channels);
    const kept = {};
    for (const channel of found.slice(0, MAX_CHANNELS)) {
      kept[channel.id] = tidyProgrammes(programmes[channel.id] ?? [], now);
    }
    const cache = {
      version: CACHE_VERSION,
      source: sourceKey(config.source),
      language: config.language,
      validators: result.validators,
      guide: { channels, programmes: kept, fetchedAt: now },
    };
    const first = !this.guide;
    this.useGuide(cache);
    await this.store.save(cache);
    const count = Object.values(kept).reduce((sum, list) => sum + list.length, 0);
    const line = `Guide read on ${label}: ${result.stats.channels} channels, ${result.stats.programmes} programmes, ${count} kept for ${found.length} followed channels`;
    if (first) {
      logger.info(line);
    } else {
      logger.debug(line);
    }
    await this.afterRefresh();
    return { unchanged: false };
  }

  async afterRefresh() {
    this.scheduleRefresh(this.config.refreshHours * 3_600_000);
    this.lastError = this.channelError();
    await this.safely('publish the devices', () => this.publishDevices());
    await this.setStatus(this.lastError);
    await this.tick();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  async setStatus(code) {
    try {
      if (code) {
        await this.gladys.setConnectionStatus(false, MESSAGES[code] ?? MESSAGES.unreachable);
      } else {
        await this.gladys.setConnectionStatus(true);
      }
    } catch (err) {
      logger.debug('Cannot set the connection status', err);
    }
  }

  // --- Devices and states ----------------------------------------------------

  devices() {
    return this.followed.map((channel) => buildDevice(this.gladys, channel, this.config.language));
  }

  async publishDevices() {
    await this.gladys.publishDiscoveredDevices(this.devices());
  }

  /** Followed channels the user added to Gladys, with the name given there. */
  createdChannels() {
    const created = new Map((this.gladys.devices ?? []).map((d) => [d.external_id, d]));
    return this.followed
      .map((channel) => ({
        ...channel,
        device: created.get(channelIds(this.gladys, channel.id).device),
      }))
      .filter((channel) => channel.device)
      .map(({ device, ...channel }) => ({
        ...channel,
        name: device.name || channel.name,
        externalId: device.external_id,
      }));
  }

  /** The followed channel of a device external id. */
  channelByDevice(externalId) {
    return (
      this.followed.find((channel) => channelIds(this.gladys, channel.id).device === externalId) ??
      null
    );
  }

  view(channelId, now = this.now()) {
    return channelView(this.guide, channelId, now, this.config.eveningMinutes);
  }

  /** Every minute: states of the created channels, then the trigger. */
  async tick() {
    if (!this.guide || !this.config) {
      return;
    }
    const now = this.now();
    const states = this.createdChannels().flatMap((channel) =>
      buildStates(this.gladys, channel.id, this.view(channel.id, now), now, this.config.language),
    );
    if (states.length > 0) {
      await this.safely('publish the states', () =>
        this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS }),
      );
    }
    await this.fireTriggers(now);
    this.lastTick = now;
  }

  /** The user added (or updated) a channel: send all its states again. */
  async onDeviceCreated(device) {
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
    const channel = this.channelByDevice(device.external_id);
    if (!channel || !this.guide) {
      return;
    }
    const now = this.now();
    this.gladys.forgetPublishedStates(device.external_id);
    await this.safely('publish the states', () =>
      this.gladys.publishChangedStates(
        buildStates(this.gladys, channel.id, this.view(channel.id, now), now, this.config.language),
        { heartbeat: HEARTBEAT_MS },
      ),
    );
  }

  // --- Keyword trigger -------------------------------------------------------

  /**
   * Fire `keyword_programme` for the programmes whose title holds a keyword
   * and whose start (or start minus the advance) fell since the last tick.
   * Never for what started before the integration did.
   */
  async fireTriggers(now) {
    const { keywords, advanceMinutes } = this.config;
    if (keywords.length === 0 || this.lastTick === null || now <= this.lastTick) {
      return;
    }
    // After a stall (suspend, clock jump), only the last minutes count.
    const since = Math.max(this.lastTick, now - TRIGGER_CATCH_UP_MS);
    const moments = [{ moment: 'start', offset: 0 }];
    if (advanceMinutes > 0) {
      moments.push({ moment: 'before', offset: advanceMinutes * MINUTE_MS });
    }
    const folded = keywords.map((keyword) => ({ keyword, needle: fold(keyword) }));
    for (const channel of this.followed) {
      for (const programme of this.guide.list(channel.id)) {
        if (programme.start - advanceMinutes * MINUTE_MS > now) {
          break;
        }
        for (const { moment, offset } of moments) {
          const at = programme.start - offset;
          if (at <= since || at > now) {
            continue;
          }
          for (const { keyword, needle } of folded) {
            if (!fold(programme.title).includes(needle)) {
              continue;
            }
            const key = `${channel.id}|${programme.start}|${moment}|${needle}`;
            if (this.fired.has(key)) {
              continue;
            }
            this.fired.set(key, programme.start);
            await this.publishTrigger(channel, programme, keyword, moment);
          }
        }
      }
    }
    for (const [key, start] of this.fired) {
      if (start < now - 2 * 60 * MINUTE_MS) {
        this.fired.delete(key);
      }
    }
  }

  async publishTrigger(channel, programme, keyword, moment) {
    const lang = langOf(this.config.language);
    const created = this.createdChannels().find((c) => c.id === channel.id);
    try {
      await this.gladys.publishSceneEvent(TRIGGER_KEY, {
        keyword,
        channel: channelIds(this.gladys, channel.id).device,
        moment,
        channel_name: created?.name ?? channel.name,
        title: programme.title,
        subtitle: programme.subtitle ?? '',
        category: programme.category ?? '',
        start: formatTime(programme.start, lang),
        end: formatTime(programme.stop, lang),
        duration: Math.round((programme.stop - programme.start) / MINUTE_MS),
      });
      logger.debug(`Trigger ${moment} for "${keyword}" on ${channel.id}`);
      this.issues.ok('trigger', 'Scene events accepted again');
    } catch (err) {
      this.issues.fail('trigger', `Cannot fire the scene trigger: ${err.message}`);
    }
  }

  // --- Configuration screen actions -------------------------------------------

  /** "Test the guide": download now, then say what was found. */
  async test() {
    if (!this.config.source) {
      return MESSAGES[this.config.sourceTyped ? 'badSource' : 'noSource'];
    }
    const outcome = await this.refresh();
    const programmes = this.guide
      ? Object.values(this.guide.programmes).reduce((sum, list) => sum + list.length, 0)
      : 0;
    return testReport({
      error: outcome.error,
      unchanged: outcome.unchanged === true,
      channels: this.guide?.channels.length ?? 0,
      programmes,
      until: this.guide?.coversUntil() ?? 0,
      found: this.followed,
      missing: this.missing,
    });
  }

  /** "List the channels": the channels of the guide whose id or name holds the filter. */
  listChannels(filter) {
    if (!this.guide) {
      return MESSAGES.noGuideYet;
    }
    const needle = fold(filter ?? '').trim();
    const matches = this.guide.channels.filter(
      (channel) =>
        !needle || [channel.id, ...channel.names].some((name) => fold(name).includes(needle)),
    );
    return channelList(matches, matches.length, MAX_LISTED_CHANNELS);
  }

  /** Short texts in the configured language. */
  text() {
    return TEXT[langOf(this.config?.language)];
  }
}

export { FEATURE };
