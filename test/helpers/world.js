// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake guide server (a fetch
// stand-in serving the fixtures, with ETag), a store in memory, a clock under
// control, and the integration wired on top through registerHandlers — the
// same wiring as index.js.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { MemoryStore } from '../../src/store.js';

// The integration logs its lifecycle: keep the test output readable (the
// level is read on every log call). LOG_LEVEL=debug npm test shows them.
process.env.LOG_LEVEL ??= 'silent';
// The time zone of the French fixtures, as the supervisor would inject it.
process.env.TZ = 'Europe/Paris';

export const fixture = (name) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

export const FR_URL = 'https://guides.example.org/xmltv_fr.xml.gz';
export const UK_URL = 'https://guides.example.org/uk.xml';

/** Sunday 15 November 2026, 20:50 in Paris: the fixtures cover that day. */
export const SUNDAY_2050 = Date.parse('2026-11-15T19:50:00Z');

/**
 * A fetch stand-in: path → { body, etag?, status? }. Counts the requests and
 * answers 304 when the If-None-Match matches.
 */
export function createFakeServer(routes = {}) {
  const server = {
    routes: {
      [FR_URL]: { body: gzipSync(fixture('xmltvfr-tf1-france2.xml')), etag: '"fr-1"' },
      [UK_URL]: { body: fixture('epgshare-uk-bbc-one.xml') },
      ...routes,
    },
    requests: [],
    async fetch(url, init = {}) {
      server.requests.push({ url, headers: init.headers ?? {} });
      const route = server.routes[url];
      if (!route) {
        return new Response('Not found', { status: 404 });
      }
      if (route.error) {
        throw route.error;
      }
      if (route.etag && init.headers?.['If-None-Match'] === route.etag) {
        return new Response(null, { status: 304 });
      }
      const headers = route.etag ? { etag: route.etag } : {};
      return new Response(route.body, { status: route.status ?? 200, headers });
    },
  };
  return server;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {object} [options.storeData] content of /data
 * @param {number} [options.now] start time
 * @param {object} [options.server] from createFakeServer
 * @param {boolean} [options.connect]
 */
export async function createWorld({
  config = { guide_url: FR_URL, channels: 'TF1.fr, France 2' },
  devices = [],
  storeData = {},
  now = SUNDAY_2050,
  server = createFakeServer(),
  connect = true,
} = {}) {
  const clock = { now };
  const gladys = createFakeGladys({ config, devices });
  const store = new MemoryStore(storeData);
  const app = registerHandlers(gladys, {
    store,
    timers: false,
    now: () => clock.now,
    fetchImpl: server.fetch,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
    // With a cache, the download runs in the background: wait for it.
    await app.hub.refreshing;
  }
  const world = {
    gladys,
    fake: gladys.fake,
    app,
    hub: app.hub,
    store,
    server,
    clock,
    /** The discovered device of a channel id. */
    device: (channelId) =>
      gladys.fake.discoveredDevices.find((d) =>
        d.params.some((p) => p.name === 'channel_id' && p.value === channelId),
      ),
    /** Add every discovered device to Gladys, as the user would. */
    async createAll() {
      for (const device of gladys.fake.discoveredDevices) {
        await gladys.fake.deviceCreated(device);
      }
    },
    /** Last state of a feature of a channel. */
    state(channelId, key) {
      const device = world.device(channelId);
      return gladys.fake.lastState(`${device.external_id}:${key}`);
    },
    /** Move the clock and run the minute update. */
    async at(time) {
      clock.now = time;
      await app.hub.tick();
    },
    close: () => app.stop(),
  };
  return world;
}
