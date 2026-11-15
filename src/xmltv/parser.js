// -----------------------------------------------------------------------------
// Streaming XMLTV reader.
//
// A full guide weighs tens to hundreds of megabytes (the complete xmltvfr.fr
// guide: 146 MB, 1.4 million lines), the container 256 MB: the text is read
// chunk by chunk and only the `<channel>` and `<programme>` elements are cut
// out of it, one at a time. A programme of a channel nobody follows is
// skipped after reading its start tag, without touching its content.
//
// XMLTV is a flat, regular format (DTD: `tv` holds `channel*` then
// `programme*`), so a small scanner is enough and far lighter than a general
// XML parser: no dependency, about 1 s per 100 MB.
// -----------------------------------------------------------------------------

import { parseXmltvDate } from './time.js';

// An element that never ends (truncated or broken file) must not swallow the
// memory: no real channel or programme comes close to this size.
const MAX_ELEMENT_LENGTH = 512 * 1024;
const MAX_TEXT = 300;

const ELEMENT_START = /<(channel|programme)(?=[\s/>])/g;
const ATTRIBUTE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code =
        name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** Text content of an element: entities decoded, CDATA kept as is, spaces collapsed. */
export function decodeText(raw) {
  const parts = raw.split(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  const text = parts
    .map((part, index) => (index % 2 === 1 ? part : decodeEntities(part.replace(/<[^>]*>/g, ''))))
    .join('');
  return text.replace(/\s+/g, ' ').trim();
}

export function parseAttributes(tag) {
  const attributes = {};
  ATTRIBUTE.lastIndex = 0;
  let match;
  while ((match = ATTRIBUTE.exec(tag)) !== null) {
    attributes[match[1]] = decodeEntities(match[2] ?? match[3] ?? '');
  }
  return attributes;
}

/**
 * The texts of the children `name` of an element, with their `lang`.
 * @returns {{ text: string, lang: string|null }[]}
 */
function children(body, name) {
  const found = [];
  const pattern = new RegExp(`<${name}(\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${name}>)`, 'g');
  let match;
  while ((match = pattern.exec(body)) !== null) {
    const text = decodeText(match[2] ?? '');
    if (text) {
      found.push({ text, lang: match[1] ? (parseAttributes(match[1]).lang ?? null) : null });
    }
  }
  return found;
}

/** The text in the preferred language, else the first one. */
function pickText(list, language) {
  if (list.length === 0) {
    return null;
  }
  const preferred =
    list.find((item) => item.lang && item.lang.toLowerCase().startsWith(language)) ?? list[0];
  return preferred.text.slice(0, MAX_TEXT);
}

export class XmltvError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * @param {object} options
 * @param {(channel: { id: string, names: string[] }) => void} options.onChannel
 * @param {(channelId: string) => boolean} options.wants whether a channel's programmes are kept
 * @param {(programme: object) => void} options.onProgramme
 * @param {string} [options.language] preferred language of the titles
 */
export function createXmltvParser({ onChannel, wants, onProgramme, language = 'en' }) {
  let buffer = '';
  let sawRoot = false;
  const stats = { channels: 0, programmes: 0, kept: 0 };

  function element(kind, text) {
    const tagEnd = text.indexOf('>');
    const attributes = parseAttributes(text.slice(0, tagEnd));
    if (kind === 'channel') {
      stats.channels += 1;
      const id = attributes.id?.trim();
      if (id) {
        const names = children(text.slice(tagEnd + 1), 'display-name').map((item) => item.text);
        onChannel({ id, names: names.slice(0, 5) });
      }
      return;
    }
    stats.programmes += 1;
    const channel = attributes.channel?.trim();
    if (!channel || !wants(channel)) {
      return;
    }
    const start = parseXmltvDate(attributes.start);
    if (start === null) {
      return;
    }
    const stop = parseXmltvDate(attributes.stop);
    const body = text.slice(tagEnd + 1);
    const title = pickText(children(body, 'title'), language);
    if (!title) {
      return;
    }
    stats.kept += 1;
    onProgramme({
      channel,
      start,
      stop: stop !== null && stop > start ? stop : null,
      title,
      subtitle: pickText(children(body, 'sub-title'), language),
      category: pickText(children(body, 'category'), language),
    });
  }

  function scan(final) {
    if (!sawRoot && /<tv[\s>]/.test(buffer)) {
      sawRoot = true;
    }
    let position = 0;
    for (;;) {
      ELEMENT_START.lastIndex = position;
      const match = ELEMENT_START.exec(buffer);
      if (!match) {
        // Keep a tail: a start tag may be cut between two chunks.
        position = Math.max(position, buffer.length - 16);
        break;
      }
      const kind = match[1];
      const tagEnd = buffer.indexOf('>', match.index);
      if (tagEnd === -1) {
        position = match.index;
        break;
      }
      let end;
      if (buffer[tagEnd - 1] === '/') {
        end = tagEnd + 1;
      } else {
        const close = buffer.indexOf(`</${kind}>`, tagEnd);
        if (close === -1) {
          position = match.index;
          break;
        }
        end = close + kind.length + 3;
      }
      element(kind, buffer.slice(match.index, end));
      position = end;
    }
    buffer = buffer.slice(position);
    if (buffer.length > MAX_ELEMENT_LENGTH) {
      throw new XmltvError('malformed', 'An element of the guide never ends');
    }
    if (final && /<(channel|programme)[\s/>]/.test(buffer)) {
      throw new XmltvError('malformed', 'The guide ends in the middle of an element');
    }
  }

  return {
    stats,
    write(text) {
      buffer += text;
      scan(false);
    },
    end() {
      scan(true);
      if (!sawRoot || (stats.channels === 0 && stats.programmes === 0)) {
        throw new XmltvError('not_xmltv', 'Not an XMLTV guide');
      }
      return stats;
    },
  };
}
