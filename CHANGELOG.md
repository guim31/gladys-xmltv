# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-15

### Added

- What is on now, next and tonight on the followed TV channels, read from any
  XMLTV guide (an http(s) address or a file of the data volume, `.xml` or
  `.xml.gz`), streamed so that guides of hundreds of megabytes fit in the
  sandbox.
- One device per followed channel (20 at most, by id or by name): on now, end
  of the current programme, time left in minutes, next, tonight (evening start
  configurable, 21:00 by default).
- Scene trigger "Programme with a keyword", at the start or a few minutes
  before; scene actions "Read a channel's programme" (now, next, tonight) and
  "Find a programme".
- Dashboard widget "TV guide": now and next, or tonight, on up to 8 channels.
- "Test the guide" and "List the channels" buttons in the configuration.
- Conditional downloads every 6, 12 or 24 hours, and a cache under `/data` so
  a restart does not download the guide again.
- Every text in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-xmltv/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-xmltv/releases/tag/v1.0.0
