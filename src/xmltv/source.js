// -----------------------------------------------------------------------------
// Reading a guide: an http(s) URL or a file of the data volume, plain or
// gzip-compressed (detected by its magic bytes, whatever the extension),
// streamed into the XMLTV parser. Nothing holds the whole file in memory.
//
// HTTP: conditional requests (ETag / Last-Modified) so an unchanged guide is
// not downloaded again, a timeout, a size limit, and a User-Agent naming the
// integration, as the guide publishers ask.
//
// The guide address may hold an IPTV password (`xmltv.php?username=…`): it is
// never logged nor put in an error message, only its host name.
// -----------------------------------------------------------------------------

import { createReadStream } from 'node:fs';
import { Readable, pipeline } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { XmltvError, createXmltvParser } from './parser.js';

export const USER_AGENT = 'gladys-xmltv (+https://github.com/guim31/gladys-xmltv)';
const TIMEOUT_MS = 10 * 60_000;
// Uncompressed bytes read at most: well above the largest public guides.
const MAX_BYTES = 1024 * 1024 * 1024;

/** The host of an http source, the only part of it ever shown. */
export function sourceLabel(source) {
  if (!source) {
    return '-';
  }
  return source.kind === 'file' ? source.path : new URL(source.url).host;
}

async function* gunzipIfNeeded(chunks) {
  const iterator = chunks[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) {
    return;
  }
  const rest = (async function* () {
    yield first.value;
    for (;;) {
      const next = await iterator.next();
      if (next.done) {
        return;
      }
      yield next.value;
    }
  })();
  const head = Buffer.from(first.value);
  if (head[0] === 0x1f && head[1] === 0x8b) {
    const gunzip = createGunzip();
    pipeline(Readable.from(rest), gunzip, () => {});
    try {
      yield* gunzip;
    } catch (err) {
      throw new XmltvError('malformed', `Broken gzip data (${err.code ?? err.message})`);
    }
  } else {
    yield* rest;
  }
}

/** The text decoder of the declared encoding (UTF-8 by default). */
function decoderFor(head) {
  const declared = /<\?xml[^>]*encoding\s*=\s*["']([\w.:-]+)["']/i.exec(
    Buffer.from(head).subarray(0, 300).toString('latin1'),
  );
  try {
    return new TextDecoder(declared ? declared[1] : 'utf-8');
  } catch {
    return new TextDecoder('utf-8');
  }
}

async function openHttp(source, { fetchImpl, validators, signal }) {
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/xml, application/gzip, */*' };
  if (validators?.etag) {
    headers['If-None-Match'] = validators.etag;
  }
  if (validators?.lastModified) {
    headers['If-Modified-Since'] = validators.lastModified;
  }
  let response;
  try {
    response = await fetchImpl(source.url, { headers, signal, redirect: 'follow' });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new XmltvError('timeout', 'The guide server did not answer in time');
    }
    const code = err.cause?.code ?? err.code ?? 'network';
    throw new XmltvError('unreachable', `The guide server cannot be reached (${code})`);
  }
  if (response.status === 304) {
    await response.body?.cancel().catch(() => {});
    return { notModified: true };
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new XmltvError('http', `The guide server answered HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new XmltvError('not_xmltv', 'Empty answer');
  }
  return {
    notModified: false,
    chunks: Readable.fromWeb(response.body),
    validators: {
      etag: response.headers.get('etag') ?? null,
      lastModified: response.headers.get('last-modified') ?? null,
    },
  };
}

function openFile(source) {
  const stream = createReadStream(source.path);
  return new Promise((resolve, reject) => {
    stream.once('open', () =>
      resolve({
        notModified: false,
        chunks: stream,
        validators: { etag: null, lastModified: null },
      }),
    );
    stream.once('error', (err) =>
      reject(new XmltvError('file', `Cannot read the guide file (${err.code ?? err.message})`)),
    );
  });
}

/**
 * Read a guide.
 * @param {object} source from parseSource
 * @param {object} options
 * @param {object} options.parser createXmltvParser options (onChannel, wants, onProgramme, language)
 * @param {object} [options.validators] { etag, lastModified } of the last download
 * @param {Function} [options.fetchImpl]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ notModified: true } | { notModified: false, validators, stats, bytes }>}
 */
export async function readGuide(source, options) {
  const { fetchImpl = globalThis.fetch, validators, timeoutMs = TIMEOUT_MS } = options;
  const signal = AbortSignal.timeout(timeoutMs);
  const opened =
    source.kind === 'file'
      ? await openFile(source)
      : await openHttp(source, { fetchImpl, validators, signal });
  if (opened.notModified) {
    return opened;
  }
  const parser = createXmltvParser(options.parser);
  let decoder = null;
  let bytes = 0;
  try {
    for await (const chunk of gunzipIfNeeded(opened.chunks)) {
      decoder ??= decoderFor(chunk);
      bytes += chunk.length;
      if (bytes > MAX_BYTES) {
        throw new XmltvError('too_big', 'The guide is larger than 1 GB');
      }
      parser.write(decoder.decode(chunk, { stream: true }));
    }
  } catch (err) {
    if (err instanceof XmltvError) {
      throw err;
    }
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new XmltvError('timeout', 'The guide download took too long');
    }
    throw new XmltvError('unreachable', `The guide download failed (${err.code ?? err.message})`);
  } finally {
    opened.chunks.destroy?.();
  }
  if (decoder) {
    parser.write(decoder.decode());
  }
  const stats = parser.end();
  return { notModified: false, validators: opened.validators, stats, bytes };
}
