// -----------------------------------------------------------------------------
// The XMLTV reader: dates and time zones, the streaming scanner (elements cut
// across chunks, entities, CDATA, languages), gzip, encodings, and the broken
// inputs (truncated, not XMLTV, broken gzip, unreachable server).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseXmltvDate } from '../src/xmltv/time.js';
import { createXmltvParser, decodeText } from '../src/xmltv/parser.js';
import { readGuide, sourceLabel } from '../src/xmltv/source.js';
import { parseSource } from '../src/config.js';
import { createFakeServer, fixture, FR_URL, UK_URL } from './helpers/world.js';

test('XMLTV dates: offsets, missing parts, rubbish', () => {
  assert.equal(parseXmltvDate('20261115210000 +0100'), Date.parse('2026-11-15T20:00:00Z'));
  assert.equal(parseXmltvDate('20261115210000 -0500'), Date.parse('2026-11-16T02:00:00Z'));
  assert.equal(parseXmltvDate('20261115210000 +01:00'), Date.parse('2026-11-15T20:00:00Z'));
  assert.equal(parseXmltvDate('20261115210000'), Date.parse('2026-11-15T21:00:00Z'), 'UTC');
  assert.equal(parseXmltvDate('202611152100 Z'), Date.parse('2026-11-15T21:00:00Z'));
  assert.equal(parseXmltvDate('20261115 +0000'), Date.parse('2026-11-15T00:00:00Z'));
  assert.equal(parseXmltvDate('20261115210000 +0530'), Date.parse('2026-11-15T15:30:00Z'));
  for (const bad of [undefined, '', 'tomorrow', '20261315210000 +0100', '20261115210000 CET']) {
    assert.equal(parseXmltvDate(bad), null, String(bad));
  }
});

test('texts: entities, numeric references, CDATA, spaces', () => {
  assert.equal(decodeText('Tom &amp; Jerry &#233;t&#xE9; &apos;x&apos;'), "Tom & Jerry été 'x'");
  assert.equal(decodeText('<![CDATA[A & B <i>]]>'), 'A & B <i>');
  assert.equal(decodeText('  two\n   lines '), 'two lines');
  assert.equal(decodeText('&unknown;'), '&unknown;');
});

function parseAll(xml, { wants = () => true, chunk = 7, language = 'fr' } = {}) {
  const channels = [];
  const programmes = [];
  const parser = createXmltvParser({
    language,
    wants,
    onChannel: (c) => channels.push(c),
    onProgramme: (p) => programmes.push(p),
  });
  for (let i = 0; i < xml.length; i += chunk) {
    parser.write(xml.slice(i, i + chunk));
  }
  return { channels, programmes, stats: parser.end() };
}

test('the scanner reads a real guide cut in tiny chunks like in one piece', () => {
  const xml = fixture('xmltvfr-tf1-france2.xml');
  const small = parseAll(xml, { chunk: 7 });
  const whole = parseAll(xml, { chunk: xml.length });
  assert.deepEqual(small, whole);
  assert.equal(whole.stats.channels, 5);
  assert.deepEqual(
    whole.channels.find((c) => c.id === 'TF1.fr'),
    { id: 'TF1.fr', names: ['TF1'] },
  );
  const film = whole.programmes.find((p) => p.title === 'La traversée de Paris');
  assert.deepEqual(film, {
    channel: 'France2.fr',
    start: Date.parse('2026-11-15T20:10:00Z'),
    stop: Date.parse('2026-11-15T21:35:00Z'),
    title: 'La traversée de Paris',
    subtitle: null,
    category: 'Comédie dramatique',
  });
});

test('only the followed channels are kept; the others are skipped unread', () => {
  const { programmes, stats } = parseAll(fixture('xmltvfr-tf1-france2.xml'), {
    wants: (id) => id === 'TF1.fr',
  });
  assert.ok(programmes.length > 0);
  assert.ok(programmes.every((p) => p.channel === 'TF1.fr'));
  assert.ok(stats.programmes > stats.kept);
});

test('the title in the preferred language, else the first one', () => {
  const xml = `<?xml version="1.0"?><tv>
  <channel id="a"><display-name lang="de">Das Erste</display-name><display-name>ARD</display-name></channel>
  <programme start="20261115200000 +0100" channel="a"><title lang="de">Tatort</title><title lang="fr">Le Tatort</title><sub-title/></programme>
  <programme start="20261115213000 +0100" stop="20261115220000 +0100" channel="a"><title>Tagesthemen</title></programme>
  <programme start="nonsense" channel="a"><title>Skipped</title></programme>
  <programme start="20261115220000 +0100" channel="a"/>
  </tv>`;
  const { channels, programmes } = parseAll(xml, { language: 'fr' });
  const empty = parseAll(
    '<tv><programme start="20261115200000" channel="a"><title lang="fr"/><sub-title lang="fr"/><title>T</title><sub-title>S</sub-title></programme></tv>',
  );
  assert.deepEqual([empty.programmes[0].title, empty.programmes[0].subtitle], ['T', 'S']);
  assert.deepEqual(channels, [{ id: 'a', names: ['Das Erste', 'ARD'] }]);
  assert.deepEqual(
    programmes.map((p) => [p.title, p.subtitle, p.stop]),
    [
      ['Le Tatort', null, null],
      ['Tagesthemen', null, Date.parse('2026-11-15T21:00:00Z')],
    ],
  );
  assert.equal(parseAll(xml, { language: 'es' }).programmes[0].title, 'Tatort');
});

test('a truncated guide, an HTML page, an endless element are errors', () => {
  const xml = fixture('xmltvfr-tf1-france2.xml');
  const cut = xml.slice(0, xml.indexOf('</programme>', 20000) - 10);
  assert.throws(() => parseAll(cut), { code: 'malformed' });
  assert.throws(() => parseAll('<html><body>Login</body></html>'), { code: 'not_xmltv' });
  assert.throws(() => parseAll('<tv></tv>'), { code: 'not_xmltv' });
  assert.throws(
    () =>
      parseAll(`<tv><programme start="1" channel="a"><title>${'x'.repeat(600_000)}`, {
        chunk: 65536,
      }),
    { code: 'malformed' },
  );
});

const collect = () => {
  const out = { channels: [], programmes: [] };
  out.parser = {
    language: 'en',
    wants: () => true,
    onChannel: (c) => out.channels.push(c),
    onProgramme: (p) => out.programmes.push(p),
  };
  return out;
};

test('HTTP: gzip by magic bytes, plain XML, ETag sent back, 304, User-Agent', async () => {
  const server = createFakeServer();
  const fr = collect();
  const first = await readGuide(parseSource(FR_URL), {
    parser: fr.parser,
    fetchImpl: server.fetch,
  });
  assert.equal(first.notModified, false);
  assert.equal(first.validators.etag, '"fr-1"');
  assert.equal(fr.channels.length, 5);
  assert.match(server.requests[0].headers['User-Agent'], /gladys-xmltv/);

  const again = await readGuide(parseSource(FR_URL), {
    parser: collect().parser,
    fetchImpl: server.fetch,
    validators: first.validators,
  });
  assert.deepEqual(again, { notModified: true });

  const uk = collect();
  await readGuide(parseSource(UK_URL), { parser: uk.parser, fetchImpl: server.fetch });
  assert.equal(uk.channels.length, 3);
  assert.ok(uk.programmes.some((p) => p.title === 'Blue Planet III'));
});

test('HTTP errors: 404, unreachable, timeout, broken gzip — never the address', async () => {
  const secret = 'https://iptv.example.net/xmltv.php?username=me&password=hunter2';
  const server = createFakeServer({
    [secret]: {
      error: Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
    },
    'https://guides.example.org/broken.xml.gz': { body: gzipSync('<tv>').subarray(0, 15) },
    'https://guides.example.org/slow.xml': { error: new DOMException('timeout', 'TimeoutError') },
  });
  const read = (url) =>
    readGuide(parseSource(url), { parser: collect().parser, fetchImpl: server.fetch });
  await assert.rejects(read('https://guides.example.org/missing.xml'), { code: 'http' });
  await assert.rejects(read(secret), (err) => {
    assert.equal(err.code, 'unreachable');
    assert.doesNotMatch(err.message, /hunter2|username/);
    return true;
  });
  await assert.rejects(read('https://guides.example.org/broken.xml.gz'), { code: 'malformed' });
  await assert.rejects(read('https://guides.example.org/slow.xml'), { code: 'timeout' });
  assert.equal(sourceLabel(parseSource(secret)), 'iptv.example.net');
  // Credentials in the address become a Basic header, out of the URL.
  const basic = createFakeServer({
    'https://guides.example.org/uk.xml': { body: fixture('epgshare-uk-bbc-one.xml') },
  });
  await readGuide(parseSource('https://me:p%40ss@guides.example.org/uk.xml'), {
    parser: collect().parser,
    fetchImpl: basic.fetch,
  });
  assert.equal(basic.requests[0].url, 'https://guides.example.org/uk.xml');
  assert.equal(
    basic.requests[0].headers.Authorization,
    `Basic ${Buffer.from('me:p@ss').toString('base64')}`,
  );
});

test('a guide file of the data volume, in ISO-8859-1', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gladys-xmltv-'));
  const path = join(dir, 'guide.xml');
  const xml = `<?xml version="1.0" encoding="ISO-8859-1"?><tv><channel id="c"><display-name>Télé</display-name></channel><programme start="20261115200000 +0100" channel="c"><title>Été</title></programme></tv>`;
  await writeFile(path, Buffer.from(xml, 'latin1'));
  const out = collect();
  await readGuide({ kind: 'file', path }, { parser: out.parser });
  assert.equal(out.channels[0].names[0], 'Télé');
  assert.equal(out.programmes[0].title, 'Été');
  await assert.rejects(
    readGuide({ kind: 'file', path: join(dir, 'none.xml') }, { parser: out.parser }),
    {
      code: 'file',
    },
  );
});

test('guide addresses: http(s) or the data volume only', () => {
  assert.deepEqual(parseSource(' https://xmltvfr.fr/xmltv/xmltv.xml.gz '), {
    kind: 'http',
    url: 'https://xmltvfr.fr/xmltv/xmltv.xml.gz',
  });
  assert.deepEqual(parseSource('/data/guide.xml'), { kind: 'file', path: '/data/guide.xml' });
  for (const bad of ['', 'ftp://x/y', '/etc/passwd', '/data/../etc/passwd', 'xmltvfr.fr', null]) {
    assert.equal(parseSource(bad), null, String(bad));
  }
});
