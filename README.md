# Tvheadend TV (webOS)

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

Two quick presets are available in the panel: the LAN server
(`http://tvheadend.local:9981`) and the internet/nginx proxy
(`https://tvheadend.example`).

### Stream profiles

- **`pass`** - no transcoding. Best quality and lowest CPU load; the TV must be
  able to decode the broadcast codecs (webOS handles H.264/AAC MPEG-TS via its
  native media pipeline).
- **`webtv-h264-aac-mpegts`** - transcodes to H.264 + AAC in MPEG-TS. Use it for
  channels whose codecs the TV cannot decode.
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
Chromium 53 / webOS 3.x.
