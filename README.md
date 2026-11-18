# Tvheadend TV (webOS)

[![Build webOS IPK](https://github.com/lazarh/webos-tvheadend-lite/actions/workflows/build.yml/badge.svg)](https://github.com/lazarh/webos-tvheadend-lite/actions/workflows/build.yml)

A lightweight, native LG webOS TV app for watching live TV channels from a
[Tvheadend](https://tvheadend.org/) server. Streams are played by the TV's
native, hardware-accelerated HTML5 `<video>` element - no transcoding server,
no web wrapper, no Electron.

Built for **webOS 3.x (Chromium 53)** and tested against webOS 3.9.3.

## Features

- Loads the channel list from Tvheadend's M3U playlist endpoint
  `<server>/playlist/channels.m3u?profile=<profile>`.
- HTTP Basic Auth support (username/password are stored on the TV only).
- Selectable stream profiles: `pass`, `webtv-h264-aac-mpegts`, `htsp`, plus an
  automatic **fallback profile** for channels the main profile cannot play.
- Full EPG: now/next program info on the OSD (title, description, progress
  bar) and a full-screen TV guide with program browsing.
- Full Magic Remote / D-pad control with an on-screen keyboard for settings.
- Channel info OSD with a 4 second auto-hide, live status and error reporting.
- Direct channel entry with the number keys.
- Server URL, credentials, profile, fallback and auth mode stored in
  `localStorage`.

## Remote control

| Key | Action |
| --- | --- |
| `Up` / `CH+` | Next channel |
| `Down` / `CH−` | Previous channel |
| `OK` / `Left` / `Right` | Open the channel list |
| `Info` (457) | Open the TV guide (also an entry at the top of the channel list) |
| `Red` (403) | Open settings |
| `Blue` (406) | Close the current overlay / cancel |
| `0`-`9` | Direct channel entry (tunes after 1.8 s) |

> The **Back** button never reaches the app on webOS TV Lite - the platform
> intercepts it and shows its own menu. The app therefore uses **Left** (close
> channel list), **Blue** (close guide/settings/keyboard) and
> **Left/Right while watching** (reopen channel list) instead. On standard
> webOS, `Back` (461) also closes overlays.
>
> On webOS TV Lite, `CH+`/`CH−` arrive as `PageUp`/`PageDown` (33/34) - both
> codes are mapped.

Inside the channel list: `Up`/`Down` browse, `OK`/`Right` watches,
`Left` closes, `Info` opens the guide.
Inside the guide: `Up`/`Down` change channel (or program when the schedule
pane is active), `Left`/`Right` switch between the channel list and the day
schedule pane, `OK` watches, `Blue` closes.
Settings fields use the TV's **system virtual keyboard** (webOS TV): press
**OK** on a field to start typing. Left/Right cycles the profile/auth values;
**Blue** cancels.

## Configuration

The Settings panel (Red button) stores:

| Setting | Default |
| --- | --- |
| Server URL | *(empty)* |
| Username | *(empty)* |
| Password | *(empty)* |
| Stream profile | `pass` |
| Fallback profile | `webtv-h264-aac-mpegts` |
| Stream auth | `persistent token` |

Enter the URL of your Tvheadend server, for example
`http://tvheadend.local:9981` (or your internet/nginx proxy URL).

The **Stream profile** field cycles through the built-in profile names with
Left/Right; press **ENTER** to type any custom Tvheadend profile name.

The **Fallback profile** (Left/Right to change, ENTER to type a custom name) is
tried automatically when a channel cannot be played with the main profile -
for example DVB channels play with `pass` (zero server CPU) while IPTV
channels in MPEG-2/HEVC are automatically retried with the transcoding
profile. The choice is remembered per channel for the session. Select *(off)*
to disable the fallback.

The **Stream auth** field (Left/Right to change) controls how the TV
authenticates stream requests:

- **persistent token** (default, recommended) - the channel playlist carries
  permanent `?auth=` tokens, so the `<video>` element needs no credentials.
  Enable it in Tvheadend: *Configuration → Users → Passwords → edit the user →
  tick **Persistent authentication** → Save*.
- **5-minute tickets** - uses `?ticket=` tokens; works without any server-side
  change. The app refreshes the playlist automatically every 4 minutes and
  retries once on a failed tune.
- **Basic in URL** - embeds `user:pass` in the stream URL. Fine on standard
  webOS, but **webOS TV Lite strips credentials from media URLs**, so use one
  of the token modes there.

### Recommended Tvheadend setup

These are the settings verified on a webOS TV Lite 3.9.3 (Chromium 38) with a
2-vCPU LXC: DVB channels need no transcoding, and the transcode profile stays
under ~10% CPU.

Set **View level → Expert** (top-right of the Tvheadend web UI) first, or the
fields below stay hidden.

**Configuration → Stream → Codec Profiles → `webtv-h264` (used by the
transcode stream profile):**

| Field | Value |
| --- | --- |
| Height | `720` |
| Bitrate | `2000` kb/s |
| Preset | `ultrafast` |
| Deinterlace | `No` |
| Hardware acceleration | `No` (enable only with `/dev/dri` passthrough) |

**Configuration → Stream → Stream Profiles → `webtv-h264-aac-mpegts`:**

| Field | Value |
| --- | --- |
| Video codec profile | `webtv-h264` |
| Audio codec | `Copy` (use `aac` @ 128 only if audio misbehaves) |
| Container | `mpegts` |

Notes:

- The IPTV source's own timestamps can cause periodic 2–7 s re-buffers with
  `pass`; the transcode profile re-times the stream and is smoother.
- If the server is CPU-starved, give the LXC 3–4 vCPUs — x264 uses x264
  threads, and `ultrafast` + 720p is roughly 3–4× cheaper than the defaults.
- The built-in AAC encoder in some builds produces noise during silence; in
  that case prefer `Copy` for audio (MP2/AAC sources play natively).

### Stream profiles

- **`pass`** - no transcoding. Best quality and zero CPU load; DVB channels
  usually play directly while IPTV channels whose codecs the TV cannot decode
  fall back to the transcode profile automatically.
- **`webtv-h264-aac-mpegts`** - transcodes to H.264 + AAC in MPEG-TS. The
  reliable format on **webOS TV Lite** (Chromium 38); used as the fallback
  profile by default.
- **`htsp`** - produces `htsp://` URLs, which the HTML5 video element cannot
  play. The app detects this and shows a clear error instead of a black screen.

### Notes

- `#EXTM3U` parsing uses the `tvg-chno` attribute for channel numbers and falls
  back to the playlist position.
- The playlist is fetched over XHR (Basic auth works there); stream URLs carry
  auth tokens (see *Stream auth* above) because a `<video>` element cannot send
  an `Authorization` header - and webOS TV Lite strips credentials from media
  URLs entirely.
- If the channel list cannot be fetched, the app reports whether it was an
  authentication, network/CORS or HTTP error. When using an nginx reverse proxy,
  make sure it forwards `/playlist` and `/stream` and does not strip the
  `Authorization` header. If CORS is enforced in your setup, add
  `add_header Access-Control-Allow-Origin *;` to the proxy responses.
- The app never ships credentials in the repository; they live only in the TV's
  `localStorage`.

## Build the `.ipk`

No LG SDK is required. The package is assembled with standard `ar` + `tar`:

```sh
./package.sh
# -> dist/com.lazarh.tvheadend_1.0.0_all.ipk
```

The script produces a Debian-style IPK (`debian-binary`, `control.tar.gz`,
`data.tar.gz`) with the app installed to
`usr/palm/applications/com.lazarh.tvheadend/`, and verifies the archive
structure afterwards. Icons are regenerated with ImageMagick if missing
(`tools/make_icons.sh`).

> The ar container is written directly with `printf`/`cat` instead of GNU
> `ar` because the webOS install service expects ares-package's header layout
> (mode `100644`, space-padded names, no trailing `/`) and rejects archives
> built by GNU `ar` with "Failed to extract package". Only `tar`, `gzip` and
> coreutils are required.

### Pre-configure the server at build time

Bake the server settings into the package so nothing has to be typed on the
TV (the **password is never baked in**):

```sh
TVH_SERVER=http://192.168.88.220:9981 \
TVH_USERNAME=user \
TVH_PROFILE=pass \
TVH_AUTH_MODE=auth \
TVH_FALLBACK_PROFILE=webtv-h264-aac-mpegts \
./package.sh
```

The values are written to `js/config.js` inside the packaged app and used as
first-run defaults; they remain editable in the TV's Settings panel. On the
first start the app reports an authentication error until the password is
entered once on the TV.

### Installer troubleshooting

- **`ares-install` crashes with `isDate is not a function`** on Node 22/24:
  this affects the deprecated `@webosose/ares-cli` 2.4.0, which depends on
  `ssh2-streams` 0.8 (removed `util.isDate` API). Install the maintained
  `@webos-tools/cli` instead - it supports current Node versions. If you must
  stay on the old package, use Node 20 or patch
  `…/ssh2-streams/lib/sftp.js`:
  `var isDate = util.isDate || function(v) { return v instanceof Date; };`
- **`rm: can't remove '/media/developer/temp': Permission denied`**: some TVs
  mount `/media/developer` `root:root 775`, so the `prisoner` user cannot
  recreate the temp folder. Point the CLI at a writable staging path in its
  `files/conf/config.json`:
  `"tempDirForIpk": "/tmp/developer/temp"`.

## Install on the TV

1. Enable **Developer Mode** on the TV (Developer Mode app) and install the
   webOS CLI on your computer:

   ```sh
   npm install -g @webos-tools/cli
   ```

   See the [webOS CLI installation guide](https://webostv.developer.lge.com/develop/tools/cli-installation)
   and the [webOS Dev Mode](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app)
   guide. `@webos-tools/cli` is the maintained CLI; it replaced
   `@webosose/ares-cli` in 2024.
2. Connect and install:

   ```sh
   ares-setup-device          # add the TV (IP + passphrase)
   ares-install dist/com.lazarh.tvheadend_1.0.0_all.ipk
   ```

3. Launch **Tvheadend TV** from the TV launcher and configure the server.

> Rooted / homebrew-enabled TVs can also install the `.ipk` with the usual
> `ipkg install` tooling.

## CI

`.github/workflows/build.yml` builds the IPK on every push and pull request,
uploads it as an artifact, and attaches it to a GitHub Release when a `v*` tag is
pushed:

```sh
git tag v1.0.0 && git push origin v1.0.0
```

## Project layout

```
appinfo.json              webOS app manifest
index.html                video element + all overlays
css/app.css               TV UI (flexbox only, Chromium 53 safe)
js/settings.js            localStorage settings + URL helpers
js/playlist.js            XHR + #EXTM3U parser
js/player.js              <video> wrapper (native pipeline, status/errors)
js/keyboard.js            D-pad on-screen keyboard
js/osd.js                 channel OSD, channel list, message screen
js/app.js                 bootstrap, key routing, tuning state machine
package.sh                ar + tar IPK builder
tools/make_icons.sh       placeholder icon generator (ImageMagick)
```

## Compatibility

The JavaScript intentionally avoids optional chaining, nullish coalescing,
`async`/`await`, `fetch`, ES modules and CSS grid so the app runs on
Chromium 38/53 (webOS TV 3.x / 4.x).

Notes verified on an LG **webOS TV Lite 3.9.3** (Chromium 38) TV:

- The media element does not send Basic auth from URL userinfo - always use
  the token modes (persistent token or tickets) on this platform.
- The native media pipeline crashes if a new live stream starts immediately
  after another one stopped. The app therefore waits ~3 s between stopping and
  starting a stream (the OSD shows *Switching...* while it waits).
- Live WebM (VP8) streams crash the app on channel switch - the app no longer
  offers that profile; MPEG-TS H.264/AAC is the reliable format.
- HLS (`.m3u8`) plays natively, but Tvheadend has no HLS output, so the
  transcoding profiles above are used instead.
