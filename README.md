# Tvheadend TV (webOS)

[![Build webOS IPK](https://github.com/lazarh/webos-tvheadend-lite/actions/workflows/build.yml/badge.svg)](https://github.com/lazarh/webos-tvheadend-lite/actions/workflows/build.yml)

A lightweight, native LG webOS TV app for watching live TV channels from a
[Tvheadend](https://tvheadend.org/) server. Streams are played by the TV's
native, hardware-accelerated HTML5 `<video>` element - no web wrapper, no
Electron, no separate streaming proxy.

Built for **webOS TV 3.x (Chromium 38)** - the engine used by webOS TV Lite -
and verified on an LG **UJ635V** running **webOS TV Lite 3.9.3** (Chromium 38).

## Features

- Loads the channel list from Tvheadend's M3U playlist endpoint
  `<server>/playlist/auth/channels.m3u?profile=<profile>`.
- Stream auth via Tvheadend persistent tokens; the playlist fetch uses Basic
  auth. Credentials are stored on the TV only.
- Selectable stream profiles: `webtv-h264-aac-mpegts` (default), `pass`,
  `htsp`.
- Full EPG: now/next program info on the OSD (title, progress bar,
  description) and a full-screen TV guide with program browsing.
- Full Magic Remote / D-pad control, using the TV's system keyboard for text
  entry.
- Channel info OSD with a 4 second auto-hide, live status and error reporting.
- Direct channel entry with the number keys.
- Server URL, credentials, profile and switch delay stored in `localStorage`.

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
> channel list), **Blue** (close guide/settings) and **Left/Right while
> watching** (reopen channel list) instead. On standard webOS, `Back` (461)
> also closes overlays.
>
> On webOS TV Lite, `CH+`/`CH−` arrive as `PageUp`/`PageDown` (33/34) - both
> codes are mapped.

Inside the channel list: `Up`/`Down` browse, `OK`/`Right` watches, `Left`
closes, `Info` opens the guide. Inside the guide: `Up`/`Down` change channel
(or program when the schedule pane is active), `Left`/`Right` switch panes,
`OK` watches, `Blue` closes. Settings fields use the TV's system virtual
keyboard: press **OK** on a field to type.

## Getting started

1. **Tvheadend**: enable the persistent authentication token for the user the
   TV will use - see [Stream authentication](#stream-authentication-required).
2. **TV**: enable Developer Mode and install the `.ipk`:

   ```sh
   npm install -g @webos-tools/cli
   ares-setup-device          # add the TV (IP + passphrase)
   ares-install dist/com.lazarh.tvheadend_1.3.0_all.ipk
   ```

   See the [webOS CLI installation guide](https://webostv.developer.lge.com/develop/tools/cli-installation)
   and the [webOS Dev Mode](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app)
   guide. Rooted / homebrew-enabled TVs can also install the `.ipk` with the
   usual `ipkg install` tooling.
3. **App**: open Settings (**Red**) and enter the server URL, username and
   password, then **Save & reload**.

To skip step 3 entirely, bake the server into the package at build time - see
[Pre-configure the server at build time](#pre-configure-the-server-at-build-time).

## Configuration

The Settings panel (Red button) stores:

| Setting | Default |
| --- | --- |
| Server URL | `http://192.168.0.100:9981` |
| Username | *(empty)* |
| Password | *(empty)* |
| Stream profile | `webtv-h264-aac-mpegts` |
| Switch delay | `3 s` |

Enter the URL of your Tvheadend server, for example
`http://tvheadend.local:9981` (or your internet/nginx proxy URL).

The **Stream profile** field cycles through the built-in names with Left/Right;
press **OK** to type any custom Tvheadend profile name.

The **Switch delay** field (1-5 s, Left/Right to change) is the pause the app
waits between stopping the old stream and starting the new one. It exists
because the TV's media pipeline crashes if a new live stream starts
immediately after another one stopped. Lower it for faster zapping; raise it
back if you ever see crashes.

## Stream profiles

- **`webtv-h264-aac-mpegts`** (default) - transcodes every channel to H.264 +
  AAC in MPEG-TS. The reliable format on **webOS TV Lite** (Chromium 38); DVB
  and IPTV channels both play.
- **`pass`** - no transcoding: best quality, zero CPU, but only for channels
  the TV can decode directly (typically DVB). IPTV channels in MPEG-2/HEVC will
  show a decode error.
- **`htsp`** - produces `htsp://` URLs, which the HTML5 video element cannot
  play. The app detects this and shows a clear error instead of a black screen.

## Stream authentication (required)

The app always uses Tvheadend's **persistent authentication token**:

1. **Tvheadend**: *Configuration → Users → Passwords → edit the user → tick
   **Persistent authentication** → Save.* The user's password entry gets a
   permanent authcode.
2. **App**: enter that user's **username and password** (used for the
   playlist fetch).

The playlist is fetched over XHR with Basic auth, and every stream URL carries
a permanent `?auth=<token>` - so the `<video>` element itself never needs
credentials. This is essential on webOS TV Lite, where the media element strips
Basic auth from media URLs. The token is bound to that Tvheadend user;
unticking the option revokes it.

## Recommended Tvheadend setup

These are the settings verified on a webOS TV Lite 3.9.3 (Chromium 38) with a
modest 2-vCPU container: DVB channels need no transcoding, and the transcode
profile stays under ~10% CPU.

Set **View level → Expert** (top-right of the Tvheadend web UI) first, or the
fields below stay hidden.

**Configuration → Stream → Codec Profiles → `webtv-h264` (used by the
transcode stream profile):**

| Field | Value |
| --- | --- |
| Height | `720` |
| Bitrate | `2000` kb/s |
| Preset | `ultrafast` |
| B-frames | `0` |
| Deinterlace | `No` |
| Hardware acceleration | `No` (enable only with `/dev/dri` passthrough) |

**Configuration → Stream → Stream Profiles → `webtv-h264-aac-mpegts`:**

| Field | Value |
| --- | --- |
| Video codec profile | `webtv-h264` |
| Audio codec | `Copy` (use `aac` @ 128 only if audio misbehaves) |
| Container | `mpegts` |

Notes:

- The built-in AAC encoder in some builds produces noise during silence; in
  that case prefer `Copy` for audio (MP2/AAC sources play natively).
- With `pass`, the IPTV source's own timestamps can cause periodic re-buffers
  on some channels; the transcode profile re-times the stream and is smoother.
- If the server is CPU-starved, give the container 3-4 vCPUs - `ultrafast` +
  720p is roughly 3-4x cheaper than the default preset and resolution.
- Log spam like `libav ... specified frame type is not compatible with max
  B-frames` means B-frames are still enabled somewhere - setting **B-frames
  to 0** fixes both the spam and the transcode startup delay.

## Live TV startup time

Measured on the LG UJ635V (webOS TV Lite 3.9.3), a channel change takes about:

| Phase | Time | Controllable? |
| --- | --- | --- |
| Switch delay (app setting) | 3 s | Yes - *Switch delay* in Settings |
| Tvheadend tune + first data | ~3 s | Server/tuner side |
| Player pre-buffering | ~10 s | No (see below) |

The ~10 s is the TV's media engine filling its **hard-coded ideal buffer of
10 seconds** (Chromium's `kBufferDuration = 10s`). Live data only arrives at
realtime speed, so filling it takes ~10 s no matter what the app does. It is a
compile-time constant in the web engine - there is no HTML attribute, webOS
API, or system setting that changes it (the HTML `preload` attribute only
hints how much may be fetched). This is also why a laptop/VLC starts the same
stream in a second or two: different player, different buffer policy.

Practical options to shorten it further:

- **Switch delay** - already exposed in Settings (the 3 s above).
- **HLS** - segmented playback starts after a couple of 2 s segments instead
  of a 10 s fill (starts in ~5 s on this TV). Needs a small ffmpeg segmenter
  in front of Tvheadend.
- **Burst / ring-buffer proxy** - a small service that keeps the last ~15 s
  of each channel cached and sends it at full speed on connect, so the
  player's 10 s buffer fills in under a second (starts in ~2-3 s).

Transcoding adds its own startup on top of the table above; the B-frames fix
in the previous section removes most of it.

## Build the `.ipk`

No LG SDK is required. The package is assembled with standard `ar` + `tar`:

```sh
./package.sh
# -> dist/com.lazarh.tvheadend_1.3.0_all.ipk
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
TVH_SERVER=http://192.168.0.100:9981 \
TVH_USERNAME=user \
TVH_PROFILE=webtv-h264-aac-mpegts \
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

## CI

`.github/workflows/build.yml` builds the IPK on every push and pull request,
uploads it as an artifact, and attaches it to a GitHub Release when a `v*` tag
is pushed:

```sh
git tag v1.3.0 && git push origin v1.3.0
```

## Project layout

```
appinfo.json              webOS app manifest
index.html                video element + all overlays
css/app.css               TV UI (flexbox only, Chromium 38 safe)
js/settings.js            localStorage settings + URL helpers
js/config.js              build-time defaults (optional)
js/playlist.js            XHR + #EXTM3U parser
js/player.js              <video> wrapper (native pipeline, status/errors)
js/osd.js                 channel OSD, channel list, message screen
js/epg.js                 EPG data (now/next, grid, per-channel events)
js/guide.js               TV guide overlay
js/app.js                 bootstrap, key routing, tuning state machine
package.sh                ar + tar IPK builder
tools/make_icons.sh       placeholder icon generator (ImageMagick)
```

## Compatibility

The JavaScript intentionally avoids optional chaining, nullish coalescing,
`async`/`await`, `fetch`, ES modules and CSS grid so the app runs on
**Chromium 38** (webOS TV 3.x and webOS TV Lite) as well as Chromium 53
(webOS TV 4.x).

Notes verified on an LG **UJ635V / webOS TV Lite 3.9.3** (Chromium 38) TV:

- The media element does not send Basic auth from URL userinfo - streams use
  `?auth=` tokens instead (see *Stream authentication*).
- The native media pipeline crashes if a new live stream starts immediately
  after another one stopped. The app therefore waits (the *Switch delay*
  setting) between stopping and starting a stream.
- Live WebM (VP8) streams crash the app on channel switch - the app no longer
  offers that profile; MPEG-TS H.264/AAC is the reliable format.
- HLS (`.m3u8`) plays natively, but Tvheadend has no HLS output, so the
  transcoding profiles above are used instead.
