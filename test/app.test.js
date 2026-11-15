// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and a fake guide
// server: discovery, states, the cache under /data, conditional downloads,
// failures, the keyword trigger, the minute timer, calm logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/app.js';
import { MESSAGES } from '../src/i18n.js';
import { MemoryStore } from '../src/store.js';
import { createFakeServer, createWorld, FR_URL, SUNDAY_2050, UK_URL } from './helpers/world.js';

const at = (iso) => Date.parse(iso);

test('one device per followed channel, by id or by name, in the configured language', async () => {
  const world = await createWorld({
    config: { guide_url: FR_URL, channels: 'TF1.fr, france 2, Canal Inconnu', language: 'de' },
  });
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => [d.name, d.external_id]),
    [
      ['TF1', 'ext:test-integration:channel:TF1.fr'],
      ['France 2', 'ext:test-integration:channel:France2.fr'],
    ],
  );
  assert.deepEqual(
    devices[0].features.map((f) => f.name),
    ['Läuft gerade', 'Ende der laufenden Sendung', 'Restzeit', 'Danach', 'Heute Abend'],
  );
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  assert.deepEqual(world.hub.missing, ['Canal Inconnu']);
  await world.close();
});

test('the states of the channels added to Gladys: now, end, time left, next, tonight', async () => {
  const world = await createWorld();
  assert.equal(world.fake.states.length, 0, 'nothing published before the user adds a channel');
  await world.createAll();
  assert.equal(world.state('France2.fr', 'now_title'), '20h30, le dimanche');
  assert.equal(world.state('France2.fr', 'now_end'), '21:00');
  assert.equal(world.state('France2.fr', 'now_remaining'), 10);
  assert.equal(world.state('France2.fr', 'next_title'), '21:00 · Journal Météo Climat');
  // The weather and a 5-minute magazine are skipped: the evening film.
  assert.equal(world.state('France2.fr', 'tonight_title'), '21:10 · La traversée de Paris');
  // TF1 airs a match from 20:35 to 23:00: it is tonight's programme.
  assert.equal(
    world.state('TF1.fr', 'tonight_title'),
    '20:35 · Football : Ligue des Nations UEFA | France / Turquie',
  );

  // A minute later only the time left changes.
  const before = world.fake.states.length;
  await world.at(SUNDAY_2050 + 60_000);
  const sent = world.fake.states.slice(before).map((s) => s.device_feature_external_id);
  assert.deepEqual(
    sent.map((id) => id.split(':').pop()),
    ['now_remaining', 'now_remaining'],
  );

  // After the film, tonight becomes tomorrow evening.
  await world.at(at('2026-11-15T21:40:00Z'));
  assert.match(world.state('France2.fr', 'tonight_title'), /^demain \d\d:\d\d · /);
  await world.close();
});

test('a channel added later gets all its states at once, and the widget is nudged', async () => {
  const world = await createWorld();
  const refreshes = world.fake.widgetRefreshes.length;
  await world.fake.deviceCreated(world.device('TF1.fr'));
  const ids = world.fake.states.map((s) => s.device_feature_external_id.split(':').pop());
  assert.deepEqual(ids, ['now_title', 'now_end', 'now_remaining', 'next_title', 'tonight_title']);
  assert.ok(world.fake.widgetRefreshes.length > refreshes);
  await world.close();
});

test('a restart uses the cache under /data: no download before the refresh is due', async () => {
  const server = createFakeServer();
  const first = await createWorld({ server });
  assert.equal(server.requests.length, 1);
  const storeData = first.store.data;
  assert.doesNotMatch(JSON.stringify(storeData), /guides\.example\.org/, 'no address stored');
  await first.close();

  const second = await createWorld({ server, storeData, now: SUNDAY_2050 + 3_600_000 });
  assert.equal(server.requests.length, 1, 'served from the cache');
  assert.equal(second.fake.discoveredDevices.length, 2);
  await second.close();

  // 12 hours later the guide is asked again, conditionally: 304, kept.
  const third = await createWorld({ server, storeData, now: SUNDAY_2050 + 13 * 3_600_000 });
  assert.equal(server.requests.length, 2);
  assert.equal(server.requests[1].headers['If-None-Match'], '"fr-1"');
  assert.equal(third.fake.discoveredDevices.length, 2);
  await third.close();

  // Another followed channel: its programmes are not cached, full download.
  const fourth = await createWorld({
    server,
    storeData,
    now: SUNDAY_2050 + 3_600_000,
    config: { guide_url: FR_URL, channels: 'TF1.fr, France 2, M6' },
  });
  assert.equal(server.requests.length, 3);
  assert.equal(server.requests[2].headers['If-None-Match'], undefined);
  assert.equal(fourth.fake.discoveredDevices.length, 3);
  await fourth.close();
});

test('a download failure keeps the known programmes; without them, a clear status', async () => {
  const server = createFakeServer();
  const world = await createWorld({ server });
  server.routes[FR_URL] = { status: 503, body: 'down' };
  const report = await world.fake.action('test_guide', {});
  assert.match(report.data.message.en, /^Failure: The guide server refused/);
  assert.match(report.data.message.en, /Followed: TF1 \(TF1\.fr\)/);
  assert.deepEqual(world.fake.connectionStatus, { connected: true });
  assert.equal(world.fake.discoveredDevices.length, 2);
  await world.close();

  const empty = await createWorld({ server });
  assert.deepEqual(empty.fake.connectionStatus, { connected: false, message: MESSAGES.http });
  assert.equal(empty.fake.discoveredDevices.length, 0);
  await empty.close();
});

test('no address, a wrong address, a page that is not a guide, no channel found', async () => {
  const none = await createWorld({ config: {} });
  assert.deepEqual(none.fake.connectionStatus, { connected: false, message: MESSAGES.noSource });
  assert.deepEqual((await none.fake.action('test_guide', {})).data.message, MESSAGES.noSource);
  assert.deepEqual((await none.fake.action('list_channels', {})).data.message, MESSAGES.noGuideYet);

  const wrong = await createWorld({ config: { guide_url: 'xmltvfr.fr', channels: 'TF1' } });
  assert.deepEqual(wrong.fake.connectionStatus, { connected: false, message: MESSAGES.badSource });

  const html = await createWorld({
    config: { guide_url: 'https://guides.example.org/login', channels: 'TF1' },
    server: createFakeServer({
      'https://guides.example.org/login': { body: '<html>Login</html>' },
    }),
  });
  assert.deepEqual(html.fake.connectionStatus, { connected: false, message: MESSAGES.not_xmltv });

  const nothing = await createWorld({ config: { guide_url: UK_URL, channels: 'TF1' } });
  assert.deepEqual(nothing.fake.connectionStatus, {
    connected: false,
    message: MESSAGES.noChannel,
  });
  const listed = await nothing.fake.action('list_channels', { filter: 'bbc' });
  assert.equal(
    listed.data.message.en,
    '2 of 2 channels (id: name):\nBBC.One.Lon.HD.uk: BBC One Lon HD\nBBC.Two.HD.uk: BBC Two HD',
  );
});

test('changing the configuration re-reads the guide and the devices', async () => {
  const world = await createWorld();
  await world.fake.configUpdated({ guide_url: UK_URL, channels: 'BBC One Lon HD' });
  assert.deepEqual(
    world.fake.discoveredDevices.map((d) => d.external_id),
    ['ext:test-integration:channel:BBC.One.Lon.HD.uk'],
  );
  // A new address that fails: the old guide is not kept, the error shows.
  await world.fake.configUpdated({ guide_url: 'https://guides.example.org/gone', channels: 'TF1' });
  assert.equal(world.hub.guide, null);
  assert.deepEqual(world.fake.discoveredDevices, []);
  assert.deepEqual(world.fake.connectionStatus, { connected: false, message: MESSAGES.http });
  // Cleared address, then Gladys restarts: still an error.
  await world.fake.configUpdated({});
  await world.gladys.disconnect();
  await world.gladys.connect();
  assert.deepEqual(world.fake.connectionStatus, { connected: false, message: MESSAGES.noSource });
  await world.close();
});

test('a language change downloads the guide again, without the old ETag', async () => {
  const server = createFakeServer();
  const world = await createWorld({ server });
  await world.fake.configUpdated({ guide_url: FR_URL, channels: 'TF1.fr', language: 'de' });
  assert.equal(server.requests.length, 2);
  assert.equal(server.requests[1].headers['If-None-Match'], undefined);
  assert.equal(world.store.data.language, 'de');
  await world.close();
});

test('a failure to reach Gladys after a download keeps the timers armed', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gladys = createFakeGladys({ config: { guide_url: FR_URL, channels: 'France 2' } });
  const app = registerHandlers(gladys, {
    store: new MemoryStore(),
    now: () => SUNDAY_2050,
    fetchImpl: createFakeServer().fetch,
  });
  t.mock.method(gladys, 'publishDiscoveredDevices', async () => {
    throw new Error('Gladys unreachable');
  });
  await gladys.connect();
  await app.ready;
  assert.ok(app.hub.guide, 'the guide is read');
  assert.ok(app.hub.tickTimer && app.hub.refreshTimer, 'timers armed');
  await app.stop();
});

test('stop() aborts a download in progress', async () => {
  let aborted = false;
  const server = {
    fetch: (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          aborted = true;
          reject(init.signal.reason);
        });
      }),
  };
  const world = await createWorld({ server, connect: false });
  // The first download is awaited by the connection: it never ends here.
  const connecting = world.gladys.connect();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await world.close();
  await connecting;
  assert.ok(aborted);
  assert.equal(world.fake.connectionStatus, null, 'an abort is not a guide error');
});

test('the keyword trigger fires at the start and before it, once, never for the past', async () => {
  const world = await createWorld({
    config: {
      guide_url: FR_URL,
      channels: 'TF1.fr, France 2',
      keywords: 'traversee de paris, Football',
      advance_minutes: '10',
    },
  });
  await world.createAll();
  // The match started at 20:35, before the integration: nothing.
  assert.equal(world.fake.sceneEvents.length, 0);
  await world.at(at('2026-11-15T20:00:00Z')); // 21:00, the film starts at 21:10
  assert.deepEqual(world.fake.sceneEvents, [
    {
      key: 'keyword_programme',
      data: {
        keyword: 'traversee de paris',
        channel: 'ext:test-integration:channel:France2.fr',
        moment: 'before',
        channel_name: 'France 2',
        title: 'La traversée de Paris',
        subtitle: '',
        category: 'Comédie dramatique',
        start: '21:10',
        end: '22:35',
        duration: 85,
      },
    },
  ]);
  await world.at(at('2026-11-15T20:05:00Z'));
  await world.at(at('2026-11-15T20:10:00Z'));
  assert.deepEqual(
    world.fake.sceneEvents.map((e) => e.data.moment),
    ['before', 'start'],
  );
  await world.at(at('2026-11-15T20:10:30Z'));
  assert.equal(world.fake.sceneEvents.length, 2, 'once');
  await world.close();
});

test('the integration updates the states by itself every minute (no core poll)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = { now: SUNDAY_2050 };
  const gladys = createFakeGladys({ config: { guide_url: FR_URL, channels: 'France 2' } });
  const app = registerHandlers(gladys, {
    store: new MemoryStore(),
    now: () => clock.now,
    fetchImpl: createFakeServer().fetch,
  });
  await gladys.connect();
  await app.ready;
  await gladys.fake.deviceCreated(gladys.fake.discoveredDevices[0]);
  const id = `${gladys.fake.discoveredDevices[0].external_id}:now_remaining`;
  assert.equal(gladys.fake.lastState(id), 10);
  clock.now += 61_000;
  t.mock.timers.tick(61_000);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gladys.fake.lastState(id), 9);
  await app.stop();
});

test('a normal cycle writes nothing at info level', async (t) => {
  const world = await createWorld();
  await world.createAll();
  const { createLogger } = await import('@gladysassistant/integration-sdk');
  const lines = [];
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'info';
  for (const stream of [process.stdout, process.stderr]) {
    t.mock.method(stream, 'write', (chunk) => {
      lines.push(String(chunk));
      return true;
    });
  }
  try {
    // The capture works: a lifecycle line is seen.
    createLogger({ name: 'control' }).info('control line');
    assert.equal(lines.length, 1);
    lines.length = 0;
    await world.at(SUNDAY_2050 + 60_000);
    await world.at(SUNDAY_2050 + 120_000);
    await world.fake.widgetGet('tv_guide', { settings: {}, language: 'fr' });
    await world.fake.sceneAction('whats_on', {
      channel: world.device('TF1.fr').external_id,
      moment: 'now',
    });
    await world.hub.refresh(); // conditional download, unchanged
  } finally {
    process.env.LOG_LEVEL = previous;
  }
  assert.deepEqual(lines, []);
  await world.close();
});
