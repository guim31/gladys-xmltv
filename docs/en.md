# XMLTV TV guide

What is on **now, next and tonight** on the TV channels you follow, read from
any **XMLTV guide**: a device per channel, a dashboard widget, a scene trigger
on keywords ("Top 14", "Koh-Lanta") and two scene actions.

Tested against real public guides (xmltvfr.fr, epgshare01), not yet on many
Gladys installations: feedback welcome on the Gladys forum.

## What you need

- Gladys Assistant **5.1.0** or later.
- The address of an XMLTV guide covering your channels, `.xml` or `.xml.gz`
  (see below). No account, no API key.

## Find a guide

- **France, Belgium, Switzerland, French-speaking Africa**:
  [xmltvfr.fr](https://xmltvfr.fr) publishes free guides rebuilt every day,
  for instance `https://xmltvfr.fr/xmltv/xmltv_tnt.xml.gz` (French DTT
  channels, 1 MB) or `https://xmltvfr.fr/xmltv/xmltv.xml.gz` (every channel,
  18 MB).
- **Other countries**: the [iptv-org/epg](https://github.com/iptv-org/epg)
  project lists the sources and the tools to build a guide; community sites
  publish ready-made guides per country.
- **Your IPTV box or provider**: many give an XMLTV address (often
  `…/xmltv.php?username=…&password=…`). It is accepted as is, and never
  written in the logs.
- **A file**: a guide copied into the data volume of the integration is read
  with an address such as `/data/guide.xml.gz`.

## Set up

1. In **Integrations → XMLTV TV guide → Configuration**, enter the **guide
   address**.
2. In **Followed channels**, list the channels, separated by commas, 20 at
   most: their **id** in the guide (`TF1.fr`) or their **name** (`France 2`).
   Press **List the channels** (with a search such as `bbc`) to see the ids
   and names of the guide.
3. Choose the **evening start** (21:00 by default) and how often the guide is
   **downloaded** (every 12 hours by default).
4. Optionally, enter **keywords** for the scenes and the **advance warning**.
5. Press **Test the guide**: it downloads the guide and says which followed
   channels it holds and until when.
6. In the **Discovery** tab, add the channels you want in Gladys.

The **language of the texts** sets the feature names, the published texts and
the scene outputs (French by default).

## The device of each channel

| Feature                      | Example                         |
| ---------------------------- | ------------------------------- |
| On now                       | `La traversée de Paris`         |
| End of the current programme | `22:35`                         |
| Time left (minutes)          | `42`                            |
| Next                         | `22:35 · Les enfants du siècle` |
| Tonight                      | `21:10 · La traversée de Paris` |

"Tonight" is the first programme of at least 20 minutes starting from
10 minutes before the evening start (weather and trailers are skipped), or the
programme on air at that time. Once it is over, it shows tomorrow evening's,
prefixed with "tomorrow". Times are in the time zone of Gladys.

## Dashboard

The **TV guide** widget lists up to 8 channels added to Gladys, under the name
you gave them: what is on now with the time left, or (setting **Show**) tonight
with its start time. The badge can be hidden. Tapping a channel shows now,
next and tonight, with their times, episode and category.

## Scenes

### Triggers

**Programme with a keyword**: a programme whose title holds one of the
configured **keywords** starts on a followed channel (accents and case
ignored). Filters: the keyword (as written in the configuration), the channel,
and the moment — **at the start**, or **before the start** by the advance
warning set in the configuration. Variables: keyword, channel, title,
subtitle, category, start, end, duration. A programme already started when the
integration starts does not fire.

### Actions

- **Read a channel's programme**: now, next or tonight on a channel. Outputs:
  found (1 or 0), channel, title, subtitle, category, day, start, end, and the
  minutes until it starts (or left, for now).
- **Find a programme**: the next airing of a title (or part of it) on the
  followed channels, same outputs.

### Scene ideas

- At 20:00, say "Tonight on France 2: {{title}} at {{start}}".
- "Top 14" starts in 10 minutes: send a message and switch the TV on.
- Every Saturday morning, find "Koh-Lanta" and announce its day.

## Downloads and load

- The guide is downloaded at start, then every 6, 12 or 24 hours, with a
  conditional request: an unchanged guide is not downloaded again. A failed
  download is retried after 30 minutes, and the programmes already known keep
  being shown.
- The guide is read as a stream, even when it weighs hundreds of megabytes:
  only the followed channels are kept (about 100 MB of memory at most while
  reading the complete xmltvfr.fr guide, less than 60 MB at rest).
- The programmes of the followed channels are cached in the data volume: a
  restart does not download the guide again before its refresh is due.
- The states are computed every minute from memory, and published only when
  they change.

Please respect the terms of the guide you use: the free guides are rebuilt
once or twice a day, downloading them more often brings nothing.

## Troubleshooting

- **"The address does not lead to an XMLTV guide"**: the address returns a web
  page (login, error). Open it in a browser: it must download a `.xml` or
  `.xml.gz` file.
- **A followed channel is "not found"**: use **List the channels** with part
  of its name, and copy its id.
- **"No programme"**: the guide holds no programme for that channel at that
  time; some guides only cover a few days.
- **Wrong times**: check the time zone of Gladys; the guide dates carry their
  own offset.

## Limits

- XMLTV only (`.xml` or gzip `.xml.gz`; not `.zip` or `.xz`).
- 20 followed channels, programmes kept up to 8 days ahead.
- No picture, no description, no recording: it is a guide, not a receiver
  (see the Enigma2 integration for the receivers).
