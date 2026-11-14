/*
 * Tvheadend TV - EPG guide overlay.
 * Left column: channels. Right side: program strip for the focused channel
 * (now .. now+3h) with a highlighted "now" position.
 */
(function (window, document, undefined) {
  'use strict';

  function byId(id) {
    return document.getElementById(id);
  }

  function pad(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function clock(ms) {
    var date = new Date(ms);
    return pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function Guide() {
    this.root = byId('guide');
    this.clockEl = byId('guide-clock');
    this.channelsEl = byId('guide-channels');
    this.timesEl = byId('guide-times');
    this.stripEl = byId('guide-strip');
    this.infoTitleEl = byId('guide-info-title');
    this.infoTimeEl = byId('guide-info-time');
    this.infoDescEl = byId('guide-info-desc');

    this.channels = [];
    this.rows = [];
    this.index = 0;
    this.programIndex = 0;
    this.events = [];
    this.winStart = 0;
    this.winEnd = 0;
    this.eventsProvider = null;
    this.onPick = null;
    this.tickTimer = null;
    this.bindClicks();
  }

  Guide.prototype.bindClicks = function () {
    var self = this;
    this.channelsEl.addEventListener('click', function (event) {
      var target = event.target;
      while (target && target !== self.channelsEl && !target.getAttribute('data-index')) {
        target = target.parentNode;
      }
      if (!target || target === self.channelsEl) {
        return;
      }
      var picked = parseInt(target.getAttribute('data-index'), 10);
      if (isNaN(picked)) {
        return;
      }
      self.index = picked;
      self.highlight();
      self.loadEvents();
    }, false);
  };

  Guide.prototype.setChannels = function (channels) {
    this.channels = channels || [];
    this.rows = [];
    this.channelsEl.innerHTML = '';

    var fragment = document.createDocumentFragment();
    var i;
    for (i = 0; i < this.channels.length; i++) {
      var row = document.createElement('div');
      row.className = 'guide-ch';
      row.setAttribute('data-index', String(i));

      var numberEl = document.createElement('span');
      numberEl.className = 'guide-num';
      numberEl.textContent = String(this.channels[i].number);

      var nameEl = document.createElement('span');
      nameEl.className = 'guide-name';
      nameEl.textContent = this.channels[i].name;

      row.appendChild(numberEl);
      row.appendChild(nameEl);
      fragment.appendChild(row);
      this.rows.push(row);
    }
    this.channelsEl.appendChild(fragment);
  };

  Guide.prototype.setEventsProvider = function (provider) {
    this.eventsProvider = provider;
  };

  Guide.prototype.isOpen = function () {
    return !this.root.classList.contains('hidden');
  };

  Guide.prototype.open = function (index) {
    if (!this.channels.length) {
      return;
    }
    this.index = index;
    if (this.index < 0 || this.index >= this.channels.length) {
      this.index = 0;
    }
    this.root.classList.remove('hidden');
    this.highlight();
    this.loadEvents();
    this.renderClock();
    var self = this;
    if (this.tickTimer) {
      window.clearInterval(this.tickTimer);
    }
    this.tickTimer = window.setInterval(function () {
      self.renderClock();
      self.positionNowLine();
    }, 30000);
  };

  Guide.prototype.close = function () {
    this.root.classList.add('hidden');
    if (this.tickTimer) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  };

  Guide.prototype.renderClock = function () {
    this.clockEl.textContent = clock(Date.now());
  };

  Guide.prototype.highlight = function () {
    var i;
    for (i = 0; i < this.rows.length; i++) {
      if (i === this.index) {
        this.rows[i].classList.add('active');
      } else {
        this.rows[i].classList.remove('active');
      }
    }
    var row = this.rows[this.index];
    if (!row) {
      return;
    }
    var top = row.offsetTop;
    var bottom = top + row.offsetHeight;
    if (top < this.channelsEl.scrollTop) {
      this.channelsEl.scrollTop = top;
    } else if (bottom > this.channelsEl.scrollTop + this.channelsEl.clientHeight) {
      this.channelsEl.scrollTop = bottom - this.channelsEl.clientHeight;
    }
  };

  Guide.prototype.selectedChannel = function () {
    return this.index;
  };

  Guide.prototype.currentChannel = function () {
    return this.channels[this.index];
  };

  Guide.prototype.moveChannel = function (delta) {
    var count = this.channels.length;
    if (!count) {
      return;
    }
    this.index = ((this.index + delta) % count + count) % count;
    this.programIndex = 0;
    this.highlight();
    this.loadEvents();
  };

  Guide.prototype.moveProgram = function (delta) {
    if (!this.events.length) {
      return;
    }
    this.programIndex = ((this.programIndex + delta) % this.events.length + this.events.length) % this.events.length;
    this.renderStrip();
  };

  Guide.prototype.loadEvents = function () {
    var self = this;
    var channel = this.currentChannel();
    this.events = [];
    this.programIndex = 0;
    this.renderStrip();
    this.renderInfo(null);
    if (!channel || !channel.id || typeof this.eventsProvider !== 'function') {
      this.infoDescEl.textContent = 'No program guide for this channel';
      return;
    }
    this.eventsProvider(channel, function (error, events) {
      if (self.index !== self.channels.indexOf(channel)) {
        return; /* focus moved while loading */
      }
      if (error) {
        self.infoDescEl.textContent = error.message || 'Program guide unavailable';
        return;
      }
      var nowSec = Math.floor(Date.now() / 1000);
      self.winStart = nowSec;
      self.winEnd = nowSec + 2 * 3600;
      self.events = window.TvhEpg.inWindow(events, self.winStart, self.winEnd);
      /* focus the program that is on now */
      var i;
      for (i = 0; i < self.events.length; i++) {
        if (self.events[i].start <= nowSec && nowSec < self.events[i].stop) {
          self.programIndex = i;
          break;
        }
      }
      self.renderStrip();
      self.renderTimes();
    });
  };

  Guide.prototype.renderTimes = function () {
    this.timesEl.innerHTML = '';
    var spanSec = this.winEnd - this.winStart;
    var slot = spanSec / 6; /* 30 minute ticks */
    var i;
    for (i = 0; i <= 6; i++) {
      var tick = document.createElement('span');
      tick.className = 'guide-tick';
      tick.textContent = clock((this.winStart + i * slot) * 1000);
      tick.style.left = ((i / 6) * 100) + '%';
      this.timesEl.appendChild(tick);
    }
  };

  Guide.prototype.positionNowLine = function () {
    var line = byId('guide-nowline');
    if (!line) {
      return;
    }
    var nowSec = Math.floor(Date.now() / 1000);
    var pct = ((nowSec - this.winStart) / (this.winEnd - this.winStart)) * 100;
    if (pct < 0) { pct = 0; }
    if (pct > 100) { pct = 100; }
    line.style.left = pct + '%';
  };

  Guide.prototype.renderStrip = function () {
    var self = this;
    this.stripEl.innerHTML = '';

    var line = document.createElement('div');
    line.id = 'guide-nowline';
    line.className = 'guide-nowline';
    this.stripEl.appendChild(line);

    var spanSec = this.winEnd - this.winStart;
    var i;
    for (i = 0; i < this.events.length; i++) {
      (function (event, index) {
        var startSec = Math.max(event.start, self.winStart);
        var stopSec = Math.min(event.stop, self.winEnd);
        var left = ((startSec - self.winStart) / spanSec) * 100;
        var width = ((stopSec - startSec) / spanSec) * 100;
        if (width < 0.5) { width = 0.5; }

        var block = document.createElement('div');
        block.className = 'guide-block' + (index === self.programIndex ? ' selected' : '') + (width < 8 ? ' narrow' : '');
        block.style.left = left + '%';
        block.style.width = width + '%';

        var titleEl = document.createElement('div');
        titleEl.className = 'guide-block-title';
        titleEl.textContent = event.title || '(no title)';
        var timeEl = document.createElement('div');
        timeEl.className = 'guide-block-time';
        timeEl.textContent = clock(event.start * 1000);

        block.appendChild(titleEl);
        block.appendChild(timeEl);
        self.stripEl.appendChild(block);
      })(this.events[i], i);
    }
    this.positionNowLine();
    this.renderDescription();
  };

  Guide.prototype.renderInfo = function (event) {
    if (!event) {
      this.infoTitleEl.textContent = '\u00a0';
      this.infoTimeEl.textContent = '\u00a0';
      this.infoDescEl.textContent = this.events.length ? '\u00a0' : 'Loading program guide...';
      return;
    }
    this.infoTitleEl.textContent = event.title || '(no title)';
    this.infoTimeEl.textContent = clock(event.start * 1000) + ' - ' + clock(event.stop * 1000);
    this.infoDescEl.textContent = event.description || event.subtitle || '';
  };

  Guide.prototype.renderDescription = function () {
    this.renderInfo(this.events[this.programIndex]);
  };

  window.TvhGuide = Guide;
})(window, document);
