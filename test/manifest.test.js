// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/app.js';
import {
  ADVANCE_MINUTES,
  DEFAULT_CONFIG,
  EVENING_TIMES,
  LANGUAGES,
  REFRESH_HOURS,
} from '../src/config.js';
import { TRIGGER_KEY } from '../src/hub.js';
import { MOMENTS } from '../src/scenes.js';
import { MemoryStore } from '../src/store.js';
import { VIEWS, WIDGETS } from '../src/widgets.js';
import './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];
const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const optionsOf = (field) => field.options.map((option) => option.value);

/** The handlers the integration registers, by kind. */
function registered() {
  const gladys = createFakeGladys();
  const keys = { action: [], sceneAction: [], widgetGet: [], widgetAction: [] };
  for (const kind of Object.keys(keys)) {
    const method = `on${kind[0].toUpperCase()}${kind.slice(1)}`;
    const original = gladys[method].bind(gladys);
    gladys[method] = (key, handler) => {
      keys[kind].push(key);
      return original(key, handler);
    };
  }
  registerHandlers(gladys, { store: new MemoryStore(), timers: false });
  return keys;
}

const handlers = registered();

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

const isAtLeast = (version, required) => {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
};

test('identity: name, type, catalog category, local transport', () => {
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  assert.equal(manifest.type, 'device');
  assert.deepEqual(manifest.categories, ['multimedia']);
  assert.deepEqual(manifest.transports, ['local']);
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-xmltv:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-xmltv/main/cover.png',
  );
});

test('every manifest action, scene action and widget has its handler, and vice versa', () => {
  assert.deepEqual(handlers.action.sort(), keysOf(manifest.actions).sort());
  assert.deepEqual(handlers.sceneAction.sort(), keysOf(manifest.scene_actions).sort());
  assert.deepEqual(handlers.widgetGet.sort(), keysOf(manifest.widgets).sort());
  assert.deepEqual(handlers.widgetAction, [], 'the widget has no button');
  assert.deepEqual(Object.keys(WIDGETS), keysOf(manifest.widgets));
});

test('the keys are the published ones (forever)', () => {
  assert.deepEqual(keysOf(manifest.actions), ['test_guide', 'list_channels']);
  assert.deepEqual(keysOf(manifest.scene_actions), ['whats_on', 'find_programme']);
  assert.deepEqual(keysOf(manifest.scene_triggers), [TRIGGER_KEY]);
  assert.deepEqual(keysOf(manifest.widgets), ['tv_guide']);
});

test('the scene fields and outputs are the ones the code reads and returns', () => {
  const [trigger] = manifest.scene_triggers;
  assert.deepEqual(keysOf(trigger.fields), ['keyword', 'channel', 'moment']);
  assert.deepEqual(optionsOf(trigger.fields[2]), ['start', 'before']);
  assert.deepEqual(keysOf(trigger.variables), [
    'keyword',
    'channel_name',
    'title',
    'subtitle',
    'category',
    'start',
    'end',
    'duration',
  ]);
  const [whatsOn, find] = manifest.scene_actions;
  assert.deepEqual(keysOf(whatsOn.fields), ['channel', 'moment']);
  assert.deepEqual(optionsOf(whatsOn.fields[1]), MOMENTS);
  assert.deepEqual(keysOf(find.fields), ['keyword']);
  const outputs = [
    'found',
    'channel',
    'title',
    'subtitle',
    'category',
    'day',
    'start',
    'end',
    'minutes',
  ];
  assert.deepEqual(keysOf(whatsOn.outputs), outputs);
  assert.deepEqual(keysOf(find.outputs), outputs);
  // An action applies no default but requires its required fields (Gladys#3155).
  for (const action of manifest.scene_actions) {
    for (const field of action.fields) {
      assert.equal(field.default, undefined, `${action.key}.${field.key}`);
    }
  }
});

test('the widget settings are the ones the code reads', () => {
  const [widget] = manifest.widgets;
  assert.deepEqual(keysOf(widget.settings), ['channels', 'view', 'show_badge']);
  assert.deepEqual(optionsOf(widget.settings[1]), VIEWS);
});

test('capabilities and categories require the right Gladys version', () => {
  assert.ok(isAtLeast(minGladysVersion(), [5, 1, 0]), 'widgets and scenes need 5.1.0');
});

test('config_schema defaults and options stay consistent with the code', () => {
  const configKeys = manifest.config_schema.filter((f) => f.type !== 'section').map((f) => f.key);
  assert.deepEqual(configKeys.sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `default of ${field.key}`);
    }
  }
  const options = (key) => optionsOf(manifest.config_schema.find((f) => f.key === key));
  assert.deepEqual(options('evening_time'), EVENING_TIMES);
  assert.deepEqual(options('refresh_hours'), REFRESH_HOURS);
  assert.deepEqual(options('advance_minutes'), ADVANCE_MINUTES);
  assert.deepEqual(options('language'), LANGUAGES);
});

test('section fields are purely presentational', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('dynamic selects declare the devices source and no static options', () => {
  const dynamicSelects = allFields.filter((f) => f.source !== undefined);
  assert.equal(dynamicSelects.length, 3);
  for (const field of dynamicSelects) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined);
  }
});

test('no secret and no number field anywhere (rendered without step)', () => {
  for (const field of allFields) {
    assert.notEqual(field.type, 'secret', field.key);
    assert.notEqual(field.type, 'number', field.key);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});
