/*
 * Tvheadend TV - EPG guide overlay (hybrid).
 * Left pane: every channel with its now/next program and a progress bar.
 * Right pane: the focused channel's day schedule as a text list plus a
 * program info panel with the full description.
 * Panes are navigated with LEFT/RIGHT; no time-axis blocks (they read as
 * empty boxes on webOS TV Lite).
 */
(function (window, document, undefined) {
  'use strict';

  function byId(id) {
    return document.getElementById(id);
  }

  function pad(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function clock(sec) {
    var date = new Date(sec * 1000);
    return pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function Guide() {
    this.root = byId('guide');
    this.clockEl = byId('guide-clock');
    this.channelsEl = byId('guide-channels');
    this.scheduleEl = byId('guide-schedule');
    this.dayLabelEl = byId('guide-day-label');
    this.infoTitleEl = byId('guide-info-title');
    this.infoTimeEl = byId('guide-info-time');
    this.infoDescEl = byId('guide-info-desc');

    this.channels = [];
    this.rows = [];
    this.index = 0;
    this.pane = 'channels'; /* 'channels' | 'schedule' */
    this.programIndex = 0;
    this.dayEvents = [];
    this.programNodes = [];
    this.grid = null;
    this.eventsProvider = null;
    this.gridProvider = null;
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
      self.pane = 'channels';
      self.renderFocus();
      self.loadSchedule();
    }, false);
    this.scheduleEl.addEventListener('click', function (event) {
      var target = event.target;
      while (target && target !== self.scheduleEl && !target.getAttribute('data-index')) {
        target = target.parentNode;
      }
      if (!target || target === self.scheduleEl) {
        return;
      }
      var picked = parseInt(target.getAttribute('data-index'), 10);
      if (isNaN(picked)) {
        return;
      }
      self.pane = 'schedule';
      self.programIndex = picked;
      self.renderSchedule();
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

      var head = document.createElement('div');
      head.className = 'guide-ch-head';
      var numberEl = document.createElement('span');
      numberEl.className = 'guide-num';
      numberEl.textContent = String(this.channels[i].number);
      var nameEl = document.createElement('span');
      nameEl.className = 'guide-name';
      nameEl.textContent = this.channels[i].name;
      head.appendChild(numberEl);
      head.appendChild(nameEl);

      var nowEl = document.createElement('div');
      nowEl.className = 'guide-ch-now';
      var barEl = document.createElement('div');
      barEl.className = 'guide-ch-bar';
      var fillEl = document.createElement('div');
      fillEl.className = 'guide-ch-bar-fill';
      barEl.appendChild(fillEl);
      var nextEl = document.createElement('div');
      nextEl.className = 'guide-ch-next';

      row.appendChild(head);
      row.appendChild(nowEl);
      row.appendChild(barEl);
      row.appendChild(nextEl);
      fragment.appendChild(row);

      row.__now = nowEl;
      row.__fill = fillEl;
      row.__next = nextEl;
      this.rows.push(row);
    }
    this.channelsEl.appendChild(fragment);
  };

  Guide.prototype.setEventsProvider = function (provider) {
    this.eventsProvider = provider;
  };

  Guide.prototype.setGridProvider = function (provider) {
    this.gridProvider = provider;
  };

  Guide.prototype.isOpen = function () {
    return !this.root.classList.contains('hidden');
  };

  Guide.prototype.inSchedule = function () {
    return this.pane === 'schedule';
  };

  Guide.prototype.open = function (index) {
    if (!this.channels.length) {
      return;
    }
    this.index = index;
    if (this.index < 0 || this.index >= this.channels.length) {
      this.index = 0;
    }
    this.pane = 'channels';
    this.root.classList.remove('hidden');
    this.renderClock();
    this.renderFocus();
    this.loadGrid();
    this.loadSchedule();

    var self = this;
    if (this.tickTimer) {
      window.clearInterval(this.tickTimer);
    }
    this.tickTimer = window.setInterval(function () {
      self.renderClock();
      self.updateRowsNowNext();
      self.renderSchedule();
    }, 60000);
  };

  Guide.prototype.close = function () {
    this.root.classList.add('hidden');
    if (this.tickTimer) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  };

  Guide.prototype.renderClock = function () {
    this.clockEl.textContent = clock(Math.floor(Date.now() / 1000));
  };

  /* ----------------------------------------------------------- left pane */

  Guide.prototype.loadGrid = function () {
    var self = this;
    if (typeof this.gridProvider !== 'function') {
      return;
    }
    this.gridProvider(function (error, grid) {
      if (error) {
        return;
      }
      self.grid = grid;
      self.updateRowsNowNext();
    });
  };

  Guide.prototype.updateRowsNowNext = function () {
    var nowSec = Math.floor(Date.now() / 1000);
    var i;
    for (i = 0; i < this.channels.length; i++) {
      var channel = this.channels[i];
      var row = this.rows[i];
      if (!row) {
        continue;
      }
      var info = window.TvhEpg.gridNowNext(this.grid, channel.id, nowSec);
      var current = info.now;
      var next = info.next;

      if (current) {
        row.__now.textContent = current.title || 'Program';
        var pct = 0;
        if (current.stop > current.start) {
          pct = Math.max(0, Math.min(100, ((nowSec - current.start) / (current.stop - current.start)) * 100));
        }
        row.__fill.style.width = pct + '%';
        row.__next.textContent = next ? 'Next: ' + next.title : '';
      } else {
        row.__now.textContent = 'No program info';
        row.__fill.style.width = '0%';
        row.__next.textContent = next ? 'Next: ' + next.title : '';
      }
    }
  };

  Guide.prototype.renderFocus = function () {
    var i;
    for (i = 0; i < this.rows.length; i++) {
      var row = this.rows[i];
      if (i === this.index) {
        row.classList.add(this.pane === 'channels' ? 'active' : 'focused');
        if (this.pane === 'channels') {
          row.classList.remove('focused');
        } else {
          row.classList.remove('active');
        }
      } else {
        row.classList.remove('active');
        row.classList.remove('focused');
      }
    }
    var node = this.rows[this.index];
    if (!node) {
      return;
    }
    var top = node.offsetTop;
    var bottom = top + node.offsetHeight;
    if (top < this.channelsEl.scrollTop) {
      this.channelsEl.scrollTop = top;
    } else if (bottom > this.channelsEl.scrollTop + this.channelsEl.clientHeight) {
      this.channelsEl.scrollTop = bottom - this.channelsEl.clientHeight;
    }
  };

  Guide.prototype.selectedChannel = function () {
    return this.index;
  };

  Guide.prototype.moveChannel = function (delta) {
    var count = this.channels.length;
    if (!count) {
      return;
    }
    this.index = ((this.index + delta) % count + count) % count;
    this.renderFocus();
    this.loadSchedule();
  };

  /* ---------------------------------------------------------- right pane */

  Guide.prototype.currentChannel = function () {
    return this.channels[this.index];
  };

  Guide.prototype.loadSchedule = function () {
    var self = this;
    var channel = this.currentChannel();
    this.dayEvents = [];
    this.programIndex = 0;
    this.renderSchedule();
    this.renderInfo(null);

    if (!channel || !channel.id) {
      this.infoDescEl.textContent = 'No program guide for this channel';
      return;
    }
    if (typeof this.eventsProvider !== 'function') {
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
      self.dayEvents = window.TvhEpg.inWindow(events, nowSec - 3600, nowSec + 12 * 3600);
      if (self.dayEvents.length > 40) {
        self.dayEvents = self.dayEvents.slice(0, 40);
      }
      var i;
      for (i = 0; i < self.dayEvents.length; i++) {
        if (self.dayEvents[i].start <= nowSec && nowSec < self.dayEvents[i].stop) {
          self.programIndex = i;
          break;
        }
      }
      self.renderSchedule();
    });
  };

  Guide.prototype.enterSchedule = function () {
    if (!this.dayEvents.length) {
      return;
    }
    this.pane = 'schedule';
    this.renderFocus();
    this.renderSchedule();
  };

  Guide.prototype.exitSchedule = function () {
    this.pane = 'channels';
    this.renderFocus();
    this.renderSchedule();
  };

  Guide.prototype.moveProgram = function (delta) {
    if (!this.dayEvents.length) {
      return;
    }
    this.programIndex = ((this.programIndex + delta) % this.dayEvents.length + this.dayEvents.length) % this.dayEvents.length;
    this.renderSchedule();
  };

  Guide.prototype.renderSchedule = function () {
    var self = this;
    this.scheduleEl.innerHTML = '';
    this.programNodes = [];

    var nowSec = Math.floor(Date.now() / 1000);
    var i;
    for (i = 0; i < this.dayEvents.length; i++) {
      (function (event, index) {
        var row = document.createElement('div');
        row.className = 'guide-prog';
        row.setAttribute('data-index', String(index));
        if (index === self.programIndex && self.pane === 'schedule') {
          row.classList.add('selected');
        }
        var onNow = event.start <= nowSec && nowSec < event.stop;

        var timeEl = document.createElement('span');
        timeEl.className = 'guide-prog-time';
        timeEl.textContent = clock(event.start);
        var titleEl = document.createElement('span');
        titleEl.className = 'guide-prog-title';
        titleEl.textContent = event.title || '(no title)';
        row.appendChild(timeEl);
        row.appendChild(titleEl);
        if (onNow) {
          var badgeEl = document.createElement('span');
          badgeEl.className = 'guide-prog-badge';
          badgeEl.textContent = 'ON NOW';
          row.appendChild(badgeEl);
        }
        self.scheduleEl.appendChild(row);
        self.programNodes.push(row);
      })(this.dayEvents[i], i);
    }

    if (!this.dayEvents.length) {
      this.dayLabelEl.textContent = 'Programs - no guide data';
    } else {
      this.dayLabelEl.textContent = 'Programs - ' + clock(this.dayEvents[0].start) + ' onward';
    }

    this.renderInfo(this.dayEvents[this.programIndex]);

    var node = this.programNodes[this.programIndex];
    if (node && this.pane === 'schedule') {
      var top = node.offsetTop;
      var bottom = top + node.offsetHeight;
      if (top < this.scheduleEl.scrollTop) {
        this.scheduleEl.scrollTop = top;
      } else if (bottom > this.scheduleEl.scrollTop + this.scheduleEl.clientHeight) {
        this.scheduleEl.scrollTop = bottom - this.scheduleEl.clientHeight;
      }
    }
  };

  Guide.prototype.renderInfo = function (event) {
    if (!event) {
      this.infoTitleEl.textContent = '\u00a0';
      this.infoTimeEl.textContent = '\u00a0';
      this.infoDescEl.textContent = '\u00a0';
      return;
    }
    this.infoTitleEl.textContent = event.title || '(no title)';
    this.infoTimeEl.textContent = clock(event.start) + ' - ' + clock(event.stop);
    this.infoDescEl.textContent = event.description || event.subtitle || '';
  };

  window.TvhGuide = Guide;
})(window, document);
