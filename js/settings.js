/*
 * Tvheadend TV - settings storage and URL helpers.
 * Plain ES5 so it runs on webOS 3.x (Chromium 53).
 */
(function (window, undefined) {
  'use strict';

  var STORAGE_KEY = 'tvh.lite.settings.v1';

  var DEFAULTS = {
    server: 'http://tvheadend.local:9981',
    username: '',
    password: '',
    profile: 'pass'
  };

  var PROFILES = ['pass', 'webtv-h264-aac-mpegts', 'webtv-vp8-vorbis-webm', 'htsp'];

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
      profile: normalizeProfile(settings.profile)
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
   * Adds HTTP Basic Auth credentials to a URL (the <video> element cannot
   * send an Authorization header, so credentials must live in the URL).
   * Chromium 53 still supports userinfo in URLs.
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
    return base + '/playlist/channels.m3u?profile=' + encodeURIComponent(profile);
  }

  window.TvhSettings = {
    DEFAULTS: DEFAULTS,
    PROFILES: PROFILES,
    load: load,
    save: save,
    hasSettings: hasSettings,
    validate: validate,
    normalizeServer: normalizeServer,
    withCredentials: withCredentials,
    playlistUrl: playlistUrl
  };
})(window);
