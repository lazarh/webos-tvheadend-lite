/*
 * Tvheadend TV - settings storage and URL helpers.
 * Plain ES5 so it runs on webOS TV 3.x (Chromium 38) and later.
 */
(function (window, undefined) {
  'use strict';

  var STORAGE_KEY = 'tvh.lite.settings.v1';

  var DEFAULTS = {
    server: 'http://192.168.0.100:9981',
    username: '',
    password: '',
    profile: 'pass',
    fallbackProfile: 'webtv-h264-aac-mpegts',
    authMode: 'auth'
  };

  var PROFILES = ['pass', 'webtv-h264-aac-mpegts', 'htsp'];

  /* Values for the fallback profile field ('' = no fallback). */
  var FALLBACKS = ['webtv-h264-aac-mpegts', 'pass', 'htsp', ''];

  /*
   * How the TV authenticates stream requests:
   *   auth   - persistent token: playlist URLs carry ?auth=<token>, no
   *            credentials are needed for playback (enable "Persistent
   *            authentication" for the user in Tvheadend).
   *   ticket - short-lived tickets: playlist URLs carry ?ticket=<token>,
   *            valid ~5 minutes; the app refreshes the playlist automatically.
   *   url    - Basic auth embedded in the stream URL (works on standard
   *            webOS; NOT on webOS TV Lite, whose media element strips it).
   */
  var AUTH_MODES = ['auth', 'ticket', 'url'];

  function clone(object) {
    var copy = {};
    var key;
    for (key in object) {
      if (object.hasOwnProperty(key)) {
        copy[key] = object[key];
      }
    }
    return copy;
  }

  function trim(value) {
    return String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '');
  }

  function normalizeServer(server) {
    var url = trim(server);
    if (!url) {
      return '';
    }
    if (!/^https?:\/\//i.test(url)) {
      url = 'http://' + url;
    }
    return url.replace(/\/+$/, '');
  }

  function normalizeProfile(profile) {
    var value = trim(profile);
    return value || DEFAULTS.profile;
  }

  function validate(settings) {
    var server = normalizeServer(settings.server);
    if (!server) {
      return 'Enter the Tvheadend server URL (for example http://tvheadend.local:9981)';
    }
    if (!/^https?:\/\/[^\/\s]+/i.test(server)) {
      return 'The server URL does not look valid - use http://host:port';
    }
    return null;
  }

  function load() {
    var stored = null;
    var settings = clone(DEFAULTS);
    var config = window.TVH_CONFIG;
    if (config && typeof config === 'object') {
      if (typeof config.server === 'string') {
        settings.server = config.server;
      }
      if (typeof config.username === 'string') {
        settings.username = config.username;
      }
      if (typeof config.profile === 'string' && trim(config.profile)) {
        settings.profile = trim(config.profile);
      }
      if (typeof config.fallbackProfile === 'string') {
        settings.fallbackProfile = trim(config.fallbackProfile);
      }
      if (AUTH_MODES.indexOf(config.authMode) !== -1) {
        settings.authMode = config.authMode;
      }
    }
    try {
      stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (error) {
      stored = null;
    }
    if (stored && typeof stored === 'object') {
      if (typeof stored.server === 'string') {
        settings.server = stored.server;
      }
      if (typeof stored.username === 'string') {
        settings.username = stored.username;
      }
      if (typeof stored.password === 'string') {
        settings.password = stored.password;
      }
      if (typeof stored.profile === 'string' && trim(stored.profile)) {
        settings.profile = trim(stored.profile);
        /* legacy: the WebM profile crashes webOS TV Lite - coerce away */
        if (settings.profile === 'webtv-vp8-vorbis-webm') {
          settings.profile = 'pass';
        }
      }
      if (typeof stored.fallbackProfile === 'string') {
        settings.fallbackProfile = trim(stored.fallbackProfile);
        if (settings.fallbackProfile === 'webtv-vp8-vorbis-webm') {
          settings.fallbackProfile = DEFAULTS.fallbackProfile;
        }
      }
      if (AUTH_MODES.indexOf(stored.authMode) !== -1) {
        settings.authMode = stored.authMode;
      }
    }
    settings.server = normalizeServer(settings.server);
    return settings;
  }

  function save(settings) {
    var clean = {
      server: normalizeServer(settings.server),
      username: trim(settings.username),
      password: String(settings.password === undefined || settings.password === null ? '' : settings.password),
      profile: normalizeProfile(settings.profile),
      fallbackProfile: trim(settings.fallbackProfile),
      authMode: AUTH_MODES.indexOf(settings.authMode) !== -1 ? settings.authMode : DEFAULTS.authMode
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch (error) {
      /* storage may be unavailable - keep going with in-memory settings */
    }
    return clean;
  }

  function hasSettings() {
    try {
      return !!window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return false;
    }
  }

  /*
   * Adds HTTP Basic Auth credentials to a URL. Used for the playlist XHR
   * request (the <video> element cannot send an Authorization header).
   */
  function withCredentials(url, settings) {
    if (!url || !settings || !settings.username) {
      return url;
    }
    var match = String(url).match(/^(https?:\/\/)([^\/?#]*)(.*)$/i);
    if (!match) {
      return url;
    }
    var hostPart = match[2];
    var at = hostPart.lastIndexOf('@');
    if (at !== -1) {
      hostPart = hostPart.slice(at + 1);
    }
    var auth = encodeURIComponent(settings.username) + ':' + encodeURIComponent(settings.password || '');
    return match[1] + auth + '@' + hostPart + match[3];
  }

  function playlistUrl(settings) {
    var base = normalizeServer(settings.server);
    var profile = normalizeProfile(settings.profile);
    var mode = AUTH_MODES.indexOf(settings.authMode) !== -1 ? settings.authMode : DEFAULTS.authMode;
    var type = mode === 'auth' ? '/auth' : (mode === 'ticket' ? '/ticket' : '');
    return base + '/playlist' + type + '/channels.m3u?profile=' + encodeURIComponent(profile);
  }

  /*
   * Replaces (or appends) the profile parameter of a Tvheadend stream URL.
   */
  function withProfile(url, profile) {
    if (!url || !profile) {
      return url;
    }
    if (/[?&]profile=/.test(url)) {
      return url.replace(/([?&]profile=)[^&]*/i, '$1' + encodeURIComponent(profile));
    }
    return url + (url.indexOf('?') !== -1 ? '&' : '?') + 'profile=' + encodeURIComponent(profile);
  }

  /*
   * Returns the URL the <video> element should use for a stream.
   * For auth/ticket modes the playlist URLs already contain the token and no
   * credentials may be added (webOS TV Lite strips Basic auth from media
   * URLs). For url mode the credentials are embedded in the URL.
   */
  function streamUrl(url, settings) {
    var mode = AUTH_MODES.indexOf(settings.authMode) !== -1 ? settings.authMode : DEFAULTS.authMode;
    if (mode === 'url') {
      return withCredentials(url, settings);
    }
    return url;
  }

  window.TvhSettings = {
    DEFAULTS: DEFAULTS,
    PROFILES: PROFILES,
    FALLBACKS: FALLBACKS,
    AUTH_MODES: AUTH_MODES,
    load: load,
    save: save,
    hasSettings: hasSettings,
    validate: validate,
    normalizeServer: normalizeServer,
    withCredentials: withCredentials,
    playlistUrl: playlistUrl,
    streamUrl: streamUrl,
    withProfile: withProfile
  };
})(window);
