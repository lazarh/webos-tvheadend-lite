/*
 * Tvheadend TV - overlays: channel info OSD, channel list and message screen.
 */
(function (window, document, undefined) {
  'use strict';

  /* ---------------------------------------------------------------- OSD */

  function Osd() {
    this.root = document.getElementById('osd');
    this.numberEl = document.getElementById('osd-number');
    this.nameEl = document.getElementById('osd-name');
    this.statusEl = document.getElementById('osd-status');
    this.timer = null;
  }

  Osd.prototype.show = function (channel, status, isError) {
    if (channel) {
      this.numberEl.textContent = String(channel.number);
      this.nameEl.textContent = channel.name;
    } else {
      this.numberEl.textContent = '';
      this.nameEl.textContent = '';
    }
    this.setStatus(status || '', isError);
    this.clearTimer();
    this.root.classList.remove('hidden');
  };

  Osd.prototype.showNumber = function (digits) {
    this.numberEl.textContent = digits;
    this.nameEl.textContent = 'Direct channel entry';
    this.setStatus('Press more digits or wait...');
    this.clearTimer();
    this.root.classList.remove('hidden');
  };

  Osd.prototype.setStatus = function (text, isError) {
    this.statusEl.textContent = text || '';
    if (isError) {
      this.statusEl.classList.add('error');
    } else {
      this.statusEl.classList.remove('error');
    }
  };

  Osd.prototype.scheduleHide = function (milliseconds) {
    var self = this;
    this.clearTimer();
    this.timer = window.setTimeout(function () {
      self.hide();
    }, milliseconds);
  };

  Osd.prototype.clearTimer = function () {
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  };

  Osd.prototype.hide = function () {
    this.clearTimer();
    this.root.classList.add('hidden');
  };

  Osd.prototype.isVisible = function () {
    return !this.root.classList.contains('hidden');
  };

  Osd.prototype.setProgram = function (current, next) {
    var programEl = document.getElementById('osd-program');
    var progEl = document.getElementById('osd-prog');
    var barEl = document.getElementById('osd-bar');
    var fillEl = document.getElementById('osd-bar-fill');
    var descEl = document.getElementById('osd-desc');
    var nextEl = document.getElementById('osd-next');
    var next;

    function clock(sec) {
      var date = new Date(sec * 1000);
      var h = date.getHours();
      var m = date.getMinutes();
      return (h < 10 ? '0' + h : String(h)) + ':' + (m < 10 ? '0' + m : String(m));
    }

    if (current) {
      programEl.classList.remove('hidden');
      progEl.textContent = current.title || '';
      descEl.textContent = current.subtitle ? String(current.subtitle).slice(0, 160) : '';
      var nowSec = Math.floor(Date.now() / 1000);
      var pct = 0;
      if (current.stop > current.start) {
        pct = Math.max(0, Math.min(100, ((nowSec - current.start) / (current.stop - current.start)) * 100));
      }
      fillEl.style.width = pct + '%';
      barEl.classList.remove('hidden');
    } else {
      programEl.classList.add('hidden');
      progEl.textContent = '';
      descEl.textContent = '';
      barEl.classList.add('hidden');
    }
    nextEl.textContent = next ? 'Next: ' + (next.title || '') + ' at ' + clock(next.start) : '';
  };

  /* ------------------------------------------------------- Channel list */

  function ChannelList() {
    this.root = document.getElementById('channel-list');
    this.scroll = document.getElementById('list-scroll');
    this.itemsEl = document.getElementById('list-items');
    this.countEl = document.getElementById('list-count');
    this.channels = [];
    this.nodes = [];
    this.index = 0;
    this.current = -1;
    this.onPick = null;
    this.bindClicks();
  }

  ChannelList.prototype.bindClicks = function () {
    var self = this;
    this.itemsEl.addEventListener('click', function (event) {
      var target = event.target;
      while (target && target !== self.itemsEl && !target.getAttribute('data-index')) {
        target = target.parentNode;
      }
      if (!target || target === self.itemsEl) {
        return;
      }
      var raw = target.getAttribute('data-index');
      var picked = raw === 'guide' ? -1 : parseInt(raw, 10);
      if (isNaN(picked)) {
        return;
      }
      if (typeof self.onPick === 'function') {
        self.onPick(picked);
      }
    }, false);
  };

  ChannelList.prototype.setChannels = function (channels) {
    this.channels = channels || [];
    this.nodes = [];
    this.itemsEl.innerHTML = '';
    this.countEl.textContent = this.channels.length + ' channels';

    var fragment = document.createDocumentFragment();
    var index;

    /* guide row at the top (selected index -1) */
    var guideItem = document.createElement('li');
    guideItem.className = 'ch-item guide-row';
    guideItem.setAttribute('data-index', 'guide');
    var guideNum = document.createElement('span');
    guideNum.className = 'ch-num';
    guideNum.textContent = 'INFO';
    var guideName = document.createElement('span');
    guideName.className = 'ch-name';
    guideName.textContent = 'TV Guide';
    guideItem.appendChild(guideNum);
    guideItem.appendChild(guideName);
    fragment.appendChild(guideItem);
    this.nodes.push(guideItem);

    for (index = 0; index < this.channels.length; index++) {
      var item = document.createElement('li');
      item.className = 'ch-item';
      item.setAttribute('data-index', String(index));

      var numberEl = document.createElement('span');
      numberEl.className = 'ch-num';
      numberEl.textContent = String(this.channels[index].number);

      var nameEl = document.createElement('span');
      nameEl.className = 'ch-name';
      nameEl.textContent = this.channels[index].name;

      item.appendChild(numberEl);
      item.appendChild(nameEl);
      fragment.appendChild(item);
      this.nodes.push(item);
    }
    this.itemsEl.appendChild(fragment);
  };

  ChannelList.prototype.setCurrent = function (index) {
    if (this.current >= -1 && this.nodes[this.current + 1]) {
      this.nodes[this.current + 1].classList.remove('current');
    }
    this.current = index;
    if (index >= -1 && this.nodes[index + 1]) {
      this.nodes[index + 1].classList.add('current');
    }
  };

  ChannelList.prototype.open = function (index) {
    if (!this.channels.length) {
      return;
    }
    this.index = index;
    if (this.index < -1 || this.index >= this.channels.length) {
      this.index = 0;
    }
    this.root.classList.remove('hidden');
    this.highlight();
  };

  ChannelList.prototype.close = function () {
    this.root.classList.add('hidden');
  };

  ChannelList.prototype.isOpen = function () {
    return !this.root.classList.contains('hidden');
  };

  ChannelList.prototype.move = function (delta) {
    var count = this.channels.length;
    if (!count) {
      return;
    }
    var total = count + 1; /* + the guide row */
    this.index = ((this.index + 1 + delta) % total + total) % total - 1;
    this.highlight();
  };

  ChannelList.prototype.highlight = function () {
    var index;
    for (index = 0; index < this.nodes.length; index++) {
      if (index - 1 === this.index) {
        this.nodes[index].classList.add('active');
      } else {
        this.nodes[index].classList.remove('active');
      }
    }
    var node = this.nodes[this.index + 1];
    if (!node) {
      return;
    }
    /* offsetTop is relative to .list-scroll (position: relative) */
    var top = node.offsetTop;
    var bottom = top + node.offsetHeight;
    var scrollTop = this.scroll.scrollTop;
    var viewHeight = this.scroll.clientHeight;
    if (top < scrollTop) {
      this.scroll.scrollTop = top;
    } else if (bottom > scrollTop + viewHeight) {
      this.scroll.scrollTop = bottom - viewHeight;
    }
  };

  ChannelList.prototype.selected = function () {
    return this.index;
  };

  /* ------------------------------------------------------ Message screen */

  function MessageScreen() {
    this.root = document.getElementById('message');
    this.titleEl = document.getElementById('message-title');
    this.textEl = document.getElementById('message-text');
    this.hintEl = document.getElementById('message-hint');
  }

  MessageScreen.prototype.show = function (title, text, hint) {
    if (title) {
      this.titleEl.textContent = title;
    }
    this.textEl.textContent = text || '';
    this.hintEl.textContent = hint || '';
    this.root.classList.remove('hidden');
  };

  MessageScreen.prototype.hide = function () {
    this.root.classList.add('hidden');
  };

  MessageScreen.prototype.isVisible = function () {
    return !this.root.classList.contains('hidden');
  };

  window.TvhUi = {
    Osd: Osd,
    ChannelList: ChannelList,
    MessageScreen: MessageScreen
  };
})(window, document);
