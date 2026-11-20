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
  var BUFFER_START = 1.5;   /* seconds of buffer before starting playback */
  var BUFFER_TIMEOUT = 10000;

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
        emit('status', 'Buffering...');
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

  Player.prototype.tune = function (channel, handlers, delayMs) {
    var self = this;
    this.tuneId++;
    var id = this.tuneId;
    this.handlers = handlers || {};
    var cooldown = typeof delayMs === 'number' && delayMs > 0 ? delayMs : TUNE_COOLDOWN;

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
        self.handlers.status('Buffering...');
      }
      self.video.src = url;
      self.video.load();
      self.startWhenBuffered(id);
    }, cooldown);
  };

  /*
   * Starts playback only after enough data is buffered. Calling play()
   * immediately makes the player show a frame, underrun and stall for many
   * seconds on live transcoded streams; waiting for a small buffer first
   * avoids that stall.
   */
  Player.prototype.startWhenBuffered = function (id) {
    var self = this;
    var started = false;
    var poll = null;
    var deadline = null;

    function bufferedAhead() {
      var video = self.video;
      try {
        if (!video.buffered.length) {
          return 0;
        }
        return video.buffered.end(video.buffered.length - 1) - video.buffered.start(0);
      } catch (error) {
        return 0;
      }
    }

    function onCanPlay() {
      finish();
    }

    function finish() {
      if (started) {
        return;
      }
      started = true;
      self.video.removeEventListener('canplay', onCanPlay, false);
      if (poll) {
        window.clearInterval(poll);
      }
      if (deadline) {
        window.clearTimeout(deadline);
      }
      if (id !== self.tuneId) {
        return;
      }
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
    }

    /* start as soon as the element can play (or a small buffer is ready),
       with a safety deadline in case canplay never fires */
    self.video.addEventListener('canplay', onCanPlay, false);
    poll = window.setInterval(function () {
      if (id !== self.tuneId) {
        window.clearInterval(poll);
        return;
      }
      if (bufferedAhead() >= BUFFER_START) {
        finish();
      }
    }, 250);
    deadline = window.setTimeout(finish, BUFFER_TIMEOUT);
  };

  window.TvhPlayer = Player;
})(window);
