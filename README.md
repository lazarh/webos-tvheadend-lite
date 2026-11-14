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
- Selectable stream profiles: `pass`, `webtv-h264-aac-mpegts`, `htsp`.
- Full Magic Remote / D-pad control with an on-screen keyboard for settings.
- Channel info OSD with a 4 second auto-hide, live status and error reporting.
- Direct channel entry with the number keys.
- Server URL, credentials and profile stored in `localStorage`.

## Remote control

| Key | Action |
| --- | --- |
| `Up` / `Channel Up` (427) | Next channel |
| `Down` / `Channel Down` (428) | Previous channel |
| `Enter` | Open / select in the channel list |
| `Back` (461) | Close overlay (app exits when nothing is open) |
| `0`-`9` | Direct channel entry (tunes after 1.8 s) |
| `Red` (403) | Open settings |

Inside the channel list: `Up`/`Down` browse, `Enter` watches, `Back` closes.
Settings and the on-screen keyboard are fully D-pad operable.

## Configuration

The Settings panel (Red button) stores:

| Setting | Default |
| --- | --- |
| Server URL | `http://tvheadend.local:9981` |
| Username | *(empty)* |
| Password | *(empty)* |
| Stream profile | `pass` |
| Stream auth | `persistent token` |

Two quick presets are available in the panel: the LAN server
(`http://tvheadend.local:9981`) and the internet/nginx proxy
(`https://tvheadend.example`).

The **Stream profile** field cycles through the built-in profile names with
Left/Right; press **ENTER** to type any custom Tvheadend profile name.

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

### Stream profiles

- **`pass`** - no transcoding. Best quality and lowest CPU load; the TV must be
  able to decode the broadcast codecs.
- **`webtv-h264-aac-mpegts`** - transcodes to H.264 + AAC in MPEG-TS. This is
  the profile to use on **webOS TV Lite** TVs (Chromium 38): it plays reliably
  and zaps correctly.
- **`webtv-vp8-vorbis-webm`** - transcodes to WebM (VP8 + Vorbis). Avoid on
  webOS TV Lite: live WebM streams were observed to crash the app when
  switching channels.
- **`htsp`** - produces `htsp://` URLs, which the HTML5 video element cannot
  play. The app detects this and shows a clear error instead of a black screen.

### Notes

- `#EXTM3U` parsing uses the `tvg-chno` attribute for channel numbers and falls
  back to the playlist position.
- Credentials are injected into stream URLs (`http://user:pass@host/...`)
  because a `<video>` element cannot send an `Authorization` header. Chromium 53
  still supports userinfo in URLs.
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

### Installer troubleshooting

- **`ares-install` crashes with `isDate is not a function`** on Node 22/24:
  ares-cli 2.4.0 depends on `ssh2-streams` 0.8, which uses the removed
  `util.isDate` API. Use Node 20, or patch
  `…/ares-cli/node_modules/ssh2-streams/lib/sftp.js`:
  `var isDate = util.isDate || function(v) { return v instanceof Date; };`
- **`rm: can't remove '/media/developer/temp': Permission denied`**: some TVs
  mount `/media/developer` `root:root 775`, so the `prisoner` user cannot
  recreate the temp folder. Point ares at a writable staging path in
  `…/ares-cli/files/conf/config.json`:
  `"tempDirForIpk": "/tmp/developer/temp"`.

## Install on the TV

1. Enable **Developer Mode** on the TV (Developer Mode app) and install the
   webOS CLI (`ares-cli`) on your computer, or use the
   [webOS Dev Mode](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app).
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
- Live WebM (VP8) streams crash the app when switching channels; MPEG-TS
  H.264/AAC is the reliable format.
- HLS (`.m3u8`) plays natively, but Tvheadend has no HLS output, so the
  transcoding profiles above are used instead.
