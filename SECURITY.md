# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **The guide address**, kept by Gladys in the integration configuration. An
  IPTV provider's address may hold a user name and a password: the integration
  never logs it nor writes it under `/data` (only its host name appears in the
  logs, and a hash of it in the cache).
- **`/data/xmltv-guide.json`**: the channel list and the programmes of the
  followed channels from the last guide read, and the HTTP validators (ETag,
  Last-Modified). No secret.
- **Network**: outgoing HTTP(S) requests to the guide address only, a few
  times a day. No port is opened, nothing is sent but the request itself.
- **Input**: the guide is untrusted data. It is read as a stream with bounds
  (element size, 1 GB uncompressed, 10-minute timeout), and its texts are only
  published as plain text.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the guide publishers.
