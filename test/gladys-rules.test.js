// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// guides: French channels (xmltvfr.fr), a British one (epgshare01), a channel
// id with characters an external id should not hold — in every language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { buildDevice, buildStates, platformId } from '../src/devices.js';
import { createWorld, FR_URL, UK_URL } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

function checkDevice(device) {
  const where = device.name;

  // should_poll: true if and only if poll_frequency is provided, in ms.
  if (device.poll_frequency === undefined) {
    assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
  } else {
    assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
    assert.ok(
      table.poll_frequencies_ms.includes(device.poll_frequency),
      `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
    );
  }

  assert.ok(device.features.length > 0, `${where}: no feature`);
  const externalIds = new Set();
  const names = new Set();
  for (const feature of device.features) {
    const at = `${where} / ${feature.name}`;
    assert.ok(
      table.categories.includes(feature.category),
      `${at}: unknown category ${feature.category}`,
    );
    const pair = table.pairs[`${feature.category}/${feature.type}`];
    assert.ok(pair, `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`);
    assert.ok(pair.label_en && pair.label_fr && pair.icon, `${at}: couple without label or icon`);

    assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
    assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
    assert.ok(
      Number.isFinite(feature.min) && Number.isFinite(feature.max),
      `${at}: finite min/max`,
    );
    assert.ok(feature.min <= feature.max, `${at}: min > max`);
    assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
    assert.equal(typeof feature.has_feedback, 'boolean', `${at}: has_feedback must be a boolean`);
    if (feature.unit !== undefined) {
      assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
    }

    assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
    externalIds.add(feature.external_id);
    assert.ok(feature.external_id.startsWith(`${device.external_id}:`), `${at}: foreign id`);
    assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
    names.add(feature.name);
  }
}

const channels = [
  { id: 'TF1.fr', name: 'TF1' },
  { id: 'BBC.One.Lon.HD.uk', name: 'BBC One Lon HD' },
  { id: 'SkySp+HD.uk', name: 'Sky Sports+ HD' },
  { id: 'I10108.json.schedulesdirect.org', name: 'Das Erste' },
];

for (const language of ['en', 'fr', 'de', 'es']) {
  test(`every built device follows the Gladys rules (${language})`, () => {
    const gladys = createFakeGladys();
    for (const channel of channels) {
      checkDevice(buildDevice(gladys, channel, language));
    }
  });
}

test('channel ids become distinct, stable external ids', () => {
  assert.equal(platformId('TF1.fr'), 'TF1.fr');
  assert.equal(platformId('SkySp+HD.uk'), 'SkySp-2bHD.uk');
  assert.equal(platformId('a:b c'), 'a-3ab-20c');
  assert.notEqual(platformId('Sky+'), platformId('Sky '));
});

for (const [label, config] of [
  ['French guide', { guide_url: FR_URL, channels: 'TF1.fr, France 2' }],
  ['British guide', { guide_url: UK_URL, channels: 'BBC One Lon HD' }],
]) {
  test(`every discovered device and state follows the Gladys rules (${label}, end to end)`, async () => {
    const world = await createWorld({ config });
    try {
      const devices = world.fake.discoveredDevices;
      assert.ok(devices.length > 0);
      devices.forEach(checkDevice);
      // The fake core validated the list like Gladys does, and accepted it.
      assert.ok(
        world.fake.requests.some((r) => r.path.endsWith('/discovered_device') && r.status === 200),
      );
      await world.createAll();
      // Every state targets a published feature; texts are never empty.
      const features = new Set(devices.flatMap((d) => d.features.map((f) => f.external_id)));
      assert.ok(world.fake.states.length >= devices.length * 5);
      for (const state of world.fake.states) {
        assert.ok(features.has(state.device_feature_external_id));
        if ('text' in state) {
          assert.ok(state.text.trim() !== '' && state.text.length <= 200);
        } else {
          assert.ok(Number.isInteger(state.state) && state.state >= 0 && state.state <= 1440);
        }
      }
    } finally {
      await world.close();
    }
  });
}

test('the states of a channel without programmes are still valid texts', () => {
  const gladys = createFakeGladys();
  const states = buildStates(
    gladys,
    'TF1.fr',
    { current: null, next: null, tonight: null },
    0,
    'fr',
  );
  assert.deepEqual(
    states.map((s) => s.text ?? s.state),
    ['Aucun programme', '-', 0, 'Aucun programme', 'Aucun programme'],
  );
});
