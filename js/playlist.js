/*
 * Tvheadend TV - M3U playlist fetching and parsing.
 * Uses XMLHttpRequest (not fetch) for maximum Chromium 53 compatibility.
 */
(function (window, undefined) {
  'use strict';

  var ATTRIBUTE_PATTERN = /([A-Za-z0-9_-]+)="([^"]*)"/g;

  function parseAttributes(line) {
    var attributes = {};
    var match;
    ATTRIBUTE_PATTERN.lastIndex = 0;
    while ((match = ATTRIBUTE_PATTERN.exec(line)) !== null) {
      attributes[match[1].toLowerCase()] = match[2];
    }
    return attributes;
  }

  function nameFromExtinf(line) {
    var comma = line.lastIndexOf(',');
    if (comma === -1) {
      return '';
    }
    return line.slice(comma + 1).replace(/^\s+|\s+$/g, '');
  }

  /*
   * Parses a Tvheadend channels.m3u playlist into:
   *   { number: Number, name: String, url: String, logo: String }
   * Channel numbers come from tvg-chno when present, otherwise the
   * position in the playlist is used.
   */
  function parse(text) {
    var lines = String(text).split(/\r?\n/);
    var channels = [];
    var pending = null;
    var index;
    var line;
    var attributes;
    var name;
    var number;
    var channel;

    for (index = 0; index < lines.length; index++) {
      line = lines[index].replace(/^\s+|\s+$/g, '');
      if (!line) {
        continue;
      }
      if (line.indexOf('#EXTINF:') === 0) {
        attributes = parseAttributes(line);
        name = nameFromExtinf(line) || attributes['tvg-name'] || ('Channel ' + (channels.length + 1));
        pending = { name: name, attributes: attributes };
        continue;
      }
      if (line.charAt(0) === '#') {
        continue;
      }
      if (!pending) {
        continue;
      }
      number = parseInt(pending.attributes['tvg-chno'], 10);
      if (isNaN(number)) {
        number = parseInt(pending.attributes['channel-number'], 10);
      }
      if (isNaN(number)) {
        number = channels.length + 1;
      }
      channel = {
        number: number,
        name: pending.name,
        url: line,
        logo: pending.attributes['tvg-logo'] || ''
      };
      channels.push(channel);
      pending = null;
    }
    return channels;
  }

  function fetchChannels(settings, callback) {
    var url = window.TvhSettings.playlistUrl(settings);
    var requestUrl = window.TvhSettings.withCredentials(url, settings);
    var request = new XMLHttpRequest();
    var finished = false;

    function finish(error, channels) {
      if (finished) {
        return;
      }
      finished = true;
      callback(error, channels);
    }

    try {
      request.open('GET', requestUrl, true);
    } catch (error) {
      finish(new Error('Invalid server URL'), null);
      return;
    }

    request.timeout = 20000;

    request.onreadystatechange = function () {
      if (request.readyState !== 4) {
        return;
      }
      if (request.status === 200) {
        var channels = parse(request.responseText);
        if (!channels.length) {
          finish(new Error('The playlist did not contain any channels'), null);
        } else {
          finish(null, channels);
        }
        return;
      }
      if (request.status === 401 || request.status === 403) {
        finish(new Error('Authentication failed - check the username and password'), null);
        return;
      }
      if (request.status === 0) {
        finish(new Error('Cannot reach the server (network error or CORS blocked)'), null);
        return;
      }
      finish(new Error('The server returned HTTP ' + request.status), null);
    };

    request.ontimeout = function () {
      finish(new Error('The request to the server timed out'), null);
    };

    try {
      request.setRequestHeader('Accept', 'text/plain, */*');
    } catch (error) {
      /* ignore - not all XHR implementations allow headers */
    }

    try {
      request.send(null);
    } catch (sendError) {
      finish(new Error('The playlist request could not be sent'), null);
    }
  }

  window.TvhPlaylist = {
    parse: parse,
    fetch: fetchChannels
  };
})(window);
