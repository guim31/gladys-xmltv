# XMLTV TV guide for Gladys Assistant

What is on **now, next and tonight** on the TV channels you follow, in
[Gladys Assistant](https://gladysassistant.com), read from **any XMLTV guide**:
[xmltvfr.fr](https://xmltvfr.fr) for France, Belgium and Switzerland, the
guides listed by [iptv-org/epg](https://github.com/iptv-org/epg) for other
countries, the guide of an IPTV box, or a file.

> Tested against real public guides (the complete xmltvfr.fr guide, a British
> guide from epgshare01), not yet on many Gladys installations: feedback
> welcome on the [Gladys forum](https://community.gladysassistant.com) or in
> the [issues](https://github.com/guim31/gladys-xmltv/issues).

## Features

- **One device per followed channel** (20 at most, chosen by id or by name):
  on now, end of the current programme, time left in minutes, next, and
  tonight (the evening programme, start time configurable, 21:00 by default).
- **Scene trigger** "Programme with a keyword": a programme whose title holds
  one of your keywords ("Top 14", "Koh-Lanta") starts, or starts in 5, 10, 15
  or 30 minutes.
- **Scene actions**: _read a channel's programme_ (now, next or tonight) and
  _find a programme_ (next airing of a title), with flat outputs for a message
  or a spoken announcement.
- **Dashboard widget**: now and next, or tonight, on up to 8 channels, under
  the names given in Gladys.
- **Test the guide** and **List the channels** buttons in the configuration.
- Every text in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later.
- The address of an XMLTV guide (`.xml` or `.xml.gz`). No account.

## Installation

In Gladys: **Integrations → Install from GitHub**, enter
`https://github.com/guim31/gladys-xmltv`, then fill the **Configuration** tab
(guide address, followed channels), press **Test the guide**, and add the
channels from the **Discovery** tab. The full user guide is in
[`docs/en.md`](docs/en.md) (also in [French](docs/fr.md),
[German](docs/de.md) and [Spanish](docs/es.md)).

## How it works

- The guide is downloaded at start, then every 6, 12 or 24 hours, with
  conditional requests (ETag, Last-Modified) and a User-Agent naming the
  integration. A failure is retried after 30 minutes; the known programmes
  stay shown meanwhile.
- It is read **as a stream**, gzip detected by its magic bytes: only the
  `<channel>` and `<programme>` elements are cut out, and the programmes of
  the channels nobody follows are skipped after their start tag. The complete
  xmltvfr.fr guide (18 MB compressed, 146 MB of XML, 211 000 programmes) is
  read in about one second, under 100 MB of memory.
- The channel list and the programmes of the followed channels (up to 8 days
  ahead) are cached in `/data/xmltv-guide.json`; the guide address itself is
  never written there nor logged (an IPTV address may hold a password).
- Every minute the states of the channels added to Gladys are computed from
  memory and published when they change (heartbeat every six hours). The
  devices are published without `poll_frequency`: nothing to fetch, and Gladys
  5.2.x does not poll external devices reliably (GladysAssistant/Gladys#3198).
- XMLTV dates carry their offset (`20261115210000 +0100`); "tonight" and the
  times shown follow the time zone of Gladys (`TZ`).
- No dependency besides the Gladys SDK.

## Limitations

- XMLTV only: `.xml` or `.xml.gz` (no `.zip`, no `.xz`).
- 20 followed channels; no picture, no description, no recording. For the
  receivers themselves, see [gladys-enigma2](https://github.com/guim31/gladys-enigma2).
- The keyword trigger matches a substring of the title, accents and case
  ignored; it never fires for a programme already started when the
  integration starts.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run the integration on the fake Gladys of the SDK
(`@gladysassistant/integration-sdk/testing`) with a fake guide server serving
excerpts of real guides (`test/fixtures/`: xmltvfr.fr, French channels;
epgshare01, BBC One; descriptions removed). See [`CLAUDE.md`](CLAUDE.md) for
the project rules.

Versions are published by the **Release** workflow (Actions → Release), which
bumps `package.json`, the manifest and the image tag together. Pushing a tag by
hand is possible only after bumping those three to the same version.

## Credits

- The [XMLTV](https://github.com/XMLTV/xmltv) format and its DTD.
- [XML TV Fr](https://github.com/racacax/XML-TV-Fr) (xmltvfr.fr) by racacax,
  and [epgshare01](https://epgshare01.online): the real guides the fixtures
  are taken from.
- [iptv-org/epg](https://github.com/iptv-org/epg), for the guides of other
  countries.
- The architecture and the conformity tests follow
  [gladys-enigma2](https://github.com/guim31/gladys-enigma2) and
  [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by the XMLTV
project, xmltvfr.fr, iptv-org, epgshare01 nor any TV channel. Channel names and
programme data belong to their owners.

## License

Apache-2.0 (see [LICENSE](LICENSE)).
