/*
 * Tvheadend TV - EPG data access (Tvheadend JSON API).
 * Fetches a channel's event list and filters now/next client-side.
 */
(function (window, undefined) {
  'use strict';

  var CACHE_MS = 600000;
  var cache = {};

  function fetchEvents(settings, channelId, callback) {
    var entry = cache[channelId];
    var now = Date.now();
    if (entry && (now - entry.at) < CACHE_MS) {
      callback(null, entry.events);
      return;
    }
    var base = window.TvhSettings.normalizeServer(settings.server);
    var url = base + '/api/epg/events/grid?channel=' + encodeURIComponent(channelId) + '&limit=1000&start=0';
    var requestUrl = window.TvhSettings.withCredentials(url, settings);

    var xhr = new XMLHttpRequest();
    try {
      xhr.open('GET', requestUrl, true);
    } catch (error) {
      callback(new Error('Invalid EPG URL'));
      return;
    }
    xhr.timeout = 15000;
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) {
        return;
      }
      if (xhr.status === 200) {
        var events = [];
        try {
          var data = JSON.parse(xhr.responseText);
          if (data && data.entries && data.entries.length) {
            events = data.entries;
          }
        } catch (parseError) {
          events = [];
        }
        cache[channelId] = { at: now, events: events };
        callback(null, events);
        return;
      }
      callback(new Error('EPG request failed (HTTP ' + xhr.status + ')'));
    };
    xhr.ontimeout = function () {
      callback(new Error('EPG request timed out'));
    };
    try {
      xhr.send(null);
    } catch (sendError) {
      callback(new Error('EPG request failed'));
    }
  }

  /* Returns { now: <current event|null>, next: <next event|null> }. */
  function nowNext(events, nowMs) {
    var nowSec = Math.floor(nowMs / 1000);
    var current = null;
    var next = null;
    var i;
    for (i = 0; i < events.length; i++) {
      var event = events[i];
      if (event.start <= nowSec && nowSec < event.stop) {
        current = event;
      } else if (!next && event.start >= nowSec) {
        next = event;
      }
    }
    return { now: current, next: next };
  }

  /* Events overlapping [startSec, endSec], sorted by start. */
  function inWindow(events, startSec, endSec) {
    var result = [];
    var i;
    for (i = 0; i < events.length; i++) {
      var event = events[i];
      if (event.stop >= startSec && event.start <= endSec) {
        result.push(event);
      }
    }
    return result;
  }

  /*
   * Fetches the near-term events for ALL channels in one request
   * (the grid endpoint returns events from "now" onward without a channel
   * filter). Used for the per-channel now/next rows in the guide.
   */
  var gridCache = null;

  function fetchGrid(settings, callback) {
    var now = Date.now();
    if (gridCache && (now - gridCache.at) < CACHE_MS) {
      callback(null, gridCache);
      return;
    }
    var base = window.TvhSettings.normalizeServer(settings.server);
    var url = base + '/api/epg/events/grid?limit=5000&start=0';
    var requestUrl = window.TvhSettings.withCredentials(url, settings);

    var xhr = new XMLHttpRequest();
    try {
      xhr.open('GET', requestUrl, true);
    } catch (error) {
      callback(new Error('Invalid EPG URL'));
      return;
    }
    xhr.timeout = 20000;
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) {
        return;
      }
      if (xhr.status === 200) {
        var events = [];
        try {
          var data = JSON.parse(xhr.responseText);
          if (data && data.entries) {
            events = data.entries;
          }
        } catch (parseError) {
          events = [];
        }
        var byChannel = {};
        var i;
        for (i = 0; i < events.length; i++) {
          var channelUuid = events[i].channelUuid;
          if (!byChannel[channelUuid]) {
            byChannel[channelUuid] = [];
          }
          byChannel[channelUuid].push(events[i]);
        }
        gridCache = { at: now, events: events, byChannel: byChannel };
        callback(null, gridCache);
        return;
      }
      callback(new Error('EPG grid request failed (HTTP ' + xhr.status + ')'));
    };
    xhr.ontimeout = function () {
      callback(new Error('EPG grid request timed out'));
    };
    try {
      xhr.send(null);
    } catch (sendError) {
      callback(new Error('EPG grid request failed'));
    }
  }

  function gridNowNext(grid, channelUuid, nowSec) {
    var list = grid && grid.byChannel ? (grid.byChannel[channelUuid] || []) : [];
    var current = null;
    var next = null;
    var i;
    for (i = 0; i < list.length; i++) {
      var event = list[i];
      if (event.start <= nowSec && nowSec < event.stop) {
        current = event;
      } else if (!next && event.start >= nowSec) {
        next = event;
      }
    }
    return { now: current, next: next };
  }

  window.TvhEpg = {
    fetch: fetchEvents,
    nowNext: nowNext,
    inWindow: inWindow,
    fetchGrid: fetchGrid,
    gridNowNext: gridNowNext
  };
})(window);
