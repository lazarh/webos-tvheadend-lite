/*
 * Tvheadend TV - native HTML5 <video> player wrapper.
 * The webOS media pipeline plays MPEG-TS streams in the video element.
 */
(function (window, undefined) {
  'use strict';

  function Player(video) {
    this.video = video;
    this.handlers = {};
    this.tuneId = 0;
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
        emit('error', self.describeError());
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
      return 'Format not supported - try another stream profile';
    }
    return 'Playback error (' + error.code + ')';
  };

  Player.prototype.isHtsp = function (url) {
    return /^htsp:\/\//i.test(url || '');
  };

  Player.prototype.stop = function () {
    this.tuneId++;
    this.handlers = {};
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

  Player.prototype.tune = function (channel, settings, handlers) {
    var self = this;
    this.tuneId++;
    var id = this.tuneId;
    this.handlers = handlers || {};

    if (this.isHtsp(channel.url)) {
      this.stop();
      if (typeof handlers.error === 'function') {
        handlers.error('HTSP streams cannot be played by the HTML5 video element - choose the "pass" profile');
      }
      return;
    }

    var url = window.TvhSettings.withCredentials(channel.url, settings);

    try {
      this.video.pause();
    } catch (pauseError) {
      /* ignore */
    }
    this.video.removeAttribute('src');
    this.video.load();
    this.video.src = url;
    this.video.load();

    var promise = this.video.play();
    if (promise && typeof promise.catch === 'function') {
      promise.catch(function () {
        if (id !== self.tuneId) {
          return;
        }
        if (typeof handlers.error === 'function') {
          handlers.error('Autoplay was blocked - press ENTER to retry');
        }
      });
    }
  };

  window.TvhPlayer = Player;
})(window);
