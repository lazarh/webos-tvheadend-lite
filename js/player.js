/*
 * Tvheadend TV - native HTML5 <video> player wrapper.
 *
 * webOS TV Lite (Chromium 38) notes, established by on-device testing:
 * - The media element does NOT send Basic auth from URL userinfo, so the app
 *   uses Tvheadend persistent auth tokens in the stream URLs (see
 *   settings.js).
 * - The native pipeline crashes if a new live stream starts too soon after
 *   the previous one stopped, so every tune waits TUNE_COOLDOWN after the
 *   stop before starting the new stream.
 * - Live WebM (VP8) streams are unstable on this platform; MPEG-TS H.264/AAC
 *   (profile webtv-h264-aac-mpegts) plays and zaps reliably.
 */
(function (window, undefined) {
  'use strict';

  var TUNE_COOLDOWN = 3000;

  function Player(video) {
    this.video = video;
    this.handlers = {};
    this.tuneId = 0;
    this.timer = null;
    this.bind();
  }

  Player.prototype.bind = function () {
    var self = this;
    var video = this.video;

    function emit(name, value) {
      if (typeof self.handlers[name] === 'function') {
        self.handlers[name](value);
      }
    }

    function hasSource() {
      return !!video.getAttribute('src');
    }

    video.addEventListener('loadstart', function () {
      if (hasSource()) {
        emit('status', 'Connecting...');
      }
    });

    video.addEventListener('waiting', function () {
      if (hasSource()) {
        emit('status', 'Buffering...');
      }
    });

    video.addEventListener('playing', function () {
      if (hasSource()) {
        emit('playing');
      }
    });

    video.addEventListener('stalled', function () {
      if (hasSource()) {
        emit('status', 'Stream stalled - retrying...');
      }
    });

    video.addEventListener('ended', function () {
      if (hasSource()) {
        emit('status', 'Stream ended');
      }
    });

    video.addEventListener('error', function () {
      if (hasSource()) {
        var code = video.error ? video.error.code : 0;
        emit('error', { code: code, text: self.describeError() });
      }
    });
  };

  Player.prototype.describeError = function () {
    var error = this.video.error;
    if (!error) {
      return 'Unknown playback error';
    }
    if (error.code === 1) {
      return 'Playback was aborted';
    }
    if (error.code === 2) {
      return 'Network error - check the server or the credentials';
    }
    if (error.code === 3) {
      return 'Decoding error - the stream may be corrupt';
    }
    if (error.code === 4) {
      return 'The TV cannot decode this stream - try a different stream profile';
    }
    return 'Playback error (' + error.code + ')';
  };

  Player.prototype.stop = function () {
    this.tuneId++;
    this.handlers = {};
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      this.video.pause();
    } catch (error) {
      /* ignore */
    }
    this.video.removeAttribute('src');
    try {
      this.video.load();
    } catch (loadError) {
      /* ignore */
    }
  };

  Player.prototype.isHtsp = function (url) {
    return /^htsp:\/\//i.test(url || '');
  };

  Player.prototype.tune = function (channel, handlers) {
    var self = this;
    this.tuneId++;
    var id = this.tuneId;
    this.handlers = handlers || {};

    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.isHtsp(channel.url)) {
      try {
        this.video.pause();
      } catch (error) {
        /* ignore */
      }
      this.video.removeAttribute('src');
      try {
        this.video.load();
      } catch (loadError) {
        /* ignore */
      }
      if (typeof handlers.error === 'function') {
        handlers.error({ code: 0, text: 'HTSP streams cannot be played by the HTML5 video element - choose a different profile' });
      }
      return;
    }

    var url = channel.url;

    /* stop the current stream first */
    try {
      this.video.pause();
    } catch (error) {
      /* ignore */
    }
    this.video.removeAttribute('src');
    try {
      this.video.load();
    } catch (loadError) {
      /* ignore */
    }

    if (typeof handlers.status === 'function') {
      handlers.status('Switching...');
    }

    /* start the new stream after the cooldown (native player teardown) */
    this.timer = window.setTimeout(function () {
      if (id !== self.tuneId) {
        return;
      }
      if (typeof self.handlers.status === 'function') {
        self.handlers.status('Connecting...');
      }
      self.video.src = url;
      self.video.load();
      var promise = self.video.play();
      if (promise && typeof promise.catch === 'function') {
        promise.catch(function () {
          if (id !== self.tuneId) {
            return;
          }
          if (typeof self.handlers.error === 'function') {
            self.handlers.error({ code: 0, text: 'Playback could not start - press ENTER to retry' });
          }
        });
      }
    }, TUNE_COOLDOWN);
  };

  window.TvhPlayer = Player;
})(window);
