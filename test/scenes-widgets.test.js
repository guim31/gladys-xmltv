// -----------------------------------------------------------------------------
// Scene actions and the dashboard widget, from the real French guide.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createWorld } from './helpers/world.js';

test('whats_on: now, next and tonight on a channel', async () => {
  const world = await createWorld();
  await world.createAll();
  const channel = world.device('France2.fr').external_id;
  const run = async (moment) =>
    (await world.fake.sceneAction('whats_on', { channel, moment })).data.outputs;
  assert.deepEqual(await run('now'), {
    found: 1,
    channel: 'France 2',
    title: '20h30, le dimanche',
    subtitle: '',
    category: "Magazine d'information",
    day: 'dimanche 15 novembre',
    start: '20:30',
    end: '21:00',
    minutes: 10,
  });
  assert.equal((await run('next')).title, 'Journal Météo Climat');
  const tonight = await run('tonight');
  assert.equal(tonight.title, 'La traversée de Paris');
  assert.equal(tonight.minutes, 20);
  // The name given in Gladys.
  await world.fake.deviceUpdated({ ...world.device('France2.fr'), name: 'Deux' });
  assert.equal((await run('now')).channel, 'Deux');
  // An unknown device: not found, never an error.
  const unknown = await world.fake.sceneAction('whats_on', { channel: 'nope', moment: 'now' });
  assert.equal(unknown.data.outputs.found, 0);
  await world.close();
});

test('find_programme: the next airing of a title, accents and case ignored', async () => {
  const world = await createWorld({ config: { guide_url: undefined } });
  await world.fake.configUpdated({
    guide_url: 'https://guides.example.org/xmltv_fr.xml.gz',
    channels: 'TF1.fr, France 2',
    language: 'en',
  });
  const find = async (keyword) =>
    (await world.fake.sceneAction('find_programme', { keyword })).data.outputs;
  const film = await find('TRAVERSEE');
  assert.equal(film.title, 'La traversée de Paris');
  assert.equal(film.channel, 'France 2');
  assert.equal(film.day, 'Sunday, November 15');
  assert.equal(film.minutes, 20);
  const match = await find('ligue des nations');
  assert.equal(match.minutes, 0, 'on air');
  assert.equal((await find('Koh-Lanta')).found, 0);
  await world.close();
});

test('the widget: one row per channel, the name given in Gladys, valid content', async () => {
  const world = await createWorld();
  const get = async (settings, language = 'fr') =>
    (await world.fake.widgetGet('tv_guide', { settings, language })).data.content;
  // Nothing added yet.
  assert.match((await get({})).components[0].text, /Découverte/);
  await world.createAll();
  await world.fake.deviceUpdated({ ...world.device('TF1.fr'), name: 'La Une' });

  const now = await get({});
  assert.deepEqual(validateWidgetContent(now), []);
  const [list] = now.components;
  assert.deepEqual(
    list.items.map((item) => [item.title, item.subtitle, item.badge.text]),
    [
      ['La Une', 'Football : Ligue des Nations UEFA | France / Turquie', '130 min'],
      ['France 2', '20h30, le dimanche', '10 min'],
    ],
  );
  assert.match(list.items[1].description, /Ce soir \(21:10–22:35\): La traversée de Paris/);

  const tonight = await get(
    { view: 'tonight', show_badge: false, channels: [world.device('France2.fr').external_id] },
    'es',
  );
  assert.deepEqual(validateWidgetContent(tonight), []);
  assert.deepEqual(tonight.components[0].items.length, 1);
  assert.equal(tonight.components[0].items[0].subtitle, 'La traversée de Paris');
  assert.equal(tonight.components[0].items[0].badge, undefined);
  assert.match(tonight.components[0].items[0].description, /^Ahora \(20:30–21:00\)/);
  await world.close();
});

test('the widget asks for a refresh when a channel is renamed or removed', async () => {
  const world = await createWorld();
  await world.createAll();
  const before = world.fake.widgetRefreshes.length;
  await world.fake.deviceDeleted(world.device('TF1.fr'));
  assert.ok(world.fake.widgetRefreshes.length > before);
  await world.close();
});
