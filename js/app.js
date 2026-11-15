/*
 * Tvheadend TV - application bootstrap, remote control and state machine.
 */
(function (window, document, undefined) {
  'use strict';

  var KEYS = {
    BACK: 461,
    ESC: 27,
    ENTER: 13,
    LEFT: 37,
    UP: 38,
    RIGHT: 39,
    DOWN: 40,
    /* webOS TV Lite sends CH+/CH- as PageUp/PageDown */
    CH_UP: 33,
    CH_DOWN: 34,
    /* standard webOS key codes for CH+/CH- */
    CH_UP_ALT: 427,
    CH_DOWN_ALT: 428,
    RED: 403,
    GREEN: 404,
    YELLOW: 405,
    BLUE: 406,
    INFO: 457
  };

  var PROFILE_NOTES = {
    'pass': 'No transcoding - DVB channels usually work; IPTV channels may need the fallback',
    'webtv-h264-aac-mpegts': 'Transcodes every channel to H.264 + AAC in MPEG-TS',
    'htsp': 'HTSP protocol - the HTML5 video element cannot play this'
  };

  var FALLBACK_NOTES = {
    'webtv-h264-aac-mpegts': 'Transcoding profile tried automatically when a channel cannot play',
    'pass': 'Raw stream tried automatically when a channel cannot play',
    'htsp': 'HTSP protocol - not playable by the HTML5 video element',
    '': 'No fallback - channels that cannot play show an error'
  };

  var AUTH_NOTES = {
    'auth': 'Persistent token - enable "Persistent authentication" for the user in Tvheadend (Users > Passwords)',
    'ticket': '5-minute tickets - works without server changes, refreshed automatically',
    'url': 'Basic auth in the stream URL - for standard webOS TVs only'
  };

  var state = {
    settings: null,
    configured: false,
    channels: [],
    currentIndex: -1,
    currentUrl: '',
    channelProfiles: {},
    settingsOpen: false,
    settingsFocus: 0,
    values: null,
    digits: '',
    digitTimer: null,
    ticketTimer: null
  };

  var player = null;
  var osd = null;
  var channelList = null;
  var guide = null;
  var message = null;
  var keyboard = null;

  var settingsRoot = null;
  var settingsFocusables = [];

  function byId(id) {
    return document.getElementById(id);
  }

  function setText(id, text) {
    var element = byId(id);
    if (element) {
      element.textContent = text;
    }
  }

  /* ------------------------------------------------------------ startup */

  function init() {
    settingsRoot = byId('settings');

    player = new window.TvhPlayer(byId('player'));
    osd = new window.TvhUi.Osd();
    channelList = new window.TvhUi.ChannelList();
    guide = new window.TvhGuide();
    message = new window.TvhUi.MessageScreen();
    keyboard = new window.TvhKeyboard();

    guide.setEventsProvider(function (channel, callback) {
      if (!channel || !channel.id) {
        callback(null, []);
        return;
      }
      window.TvhEpg.fetch(state.settings, channel.id, callback);
    });

    guide.setGridProvider(function (callback) {
      window.TvhEpg.fetchGrid(state.settings, callback);
    });

    channelList.onPick = function (index) {
      channelList.close();
      if (index === -1) {
        openGuide();
        return;
      }
      tuneIndex(index);
    };

    state.settings = window.TvhSettings.load();
    state.configured = window.TvhSettings.hasSettings();

    collectSettingsFocusables();
    document.addEventListener('keydown', onKeyDown, false);

    if (!state.configured) {
      message.show('Tvheadend TV', 'Welcome! Configure your Tvheadend server to start watching.', 'RED: settings');
      openSettings();
    } else {
      loadPlaylist();
    }
  }

  /* --------------------------------------------------------- key router */

  function onKeyDown(event) {
    if (keyboard.isOpen()) {
      keyboard.handleKey(event);
      return;
    }
    if (state.settingsOpen) {
      handleSettingsKey(event);
      return;
    }
    if (channelList.isOpen()) {
      handleListKey(event);
      return;
    }
    if (guide.isOpen()) {
      handleGuideKey(event);
      return;
    }
    if (message.isVisible()) {
      handleMessageKey(event);
      return;
    }
    handleWatchKey(event);
  }

  function consume(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function isDigitKey(code) {
    return (code >= 48 && code <= 57) || (code >= 96 && code <= 105);
  }

  function digitFromKey(code) {
    if (code >= 96 && code <= 105) {
      return String.fromCharCode(code - 48);
    }
    return String.fromCharCode(code);
  }

  function handleWatchKey(event) {
    var code = event.keyCode;
    var handled = true;

    switch (code) {
      case KEYS.UP:
      case KEYS.CH_UP:
      case KEYS.CH_UP_ALT:
        zap(1);
        break;
      case KEYS.DOWN:
      case KEYS.CH_DOWN:
      case KEYS.CH_DOWN_ALT:
        zap(-1);
        break;
      case KEYS.ENTER:
      case KEYS.LEFT:
      case KEYS.RIGHT:
        openChannelList();
        break;
      case KEYS.INFO:
        openGuide();
        break;
      case KEYS.RED:
        openSettings();
        break;
      case KEYS.BACK:
      case KEYS.ESC:
        handled = false; /* let webOS close the app (Back never arrives on Lite) */
        break;
      default:
        if (isDigitKey(code)) {
          handleDigit(digitFromKey(code));
        } else {
          handled = false;
        }
    }

    if (handled) {
      consume(event);
    }
  }

  function handleListKey(event) {
    var code = event.keyCode;
    var handled = true;
    var picked;

    switch (code) {
      case KEYS.UP:
      case KEYS.CH_UP:
      case KEYS.CH_UP_ALT:
        channelList.move(-1);
        break;
      case KEYS.DOWN:
      case KEYS.CH_DOWN:
      case KEYS.CH_DOWN_ALT:
        channelList.move(1);
        break;
      case KEYS.ENTER:
      case KEYS.RIGHT:
        picked = channelList.selected();
        channelList.close();
        if (picked === -1) {
          openGuide();
        } else {
          tuneIndex(picked);
        }
        break;
      case KEYS.LEFT:
      case KEYS.BLUE:
      case KEYS.BACK:
      case KEYS.ESC:
        channelList.close();
        break;
      case KEYS.INFO:
        channelList.close();
        openGuide();
        break;
      case KEYS.RED:
        channelList.close();
        openSettings();
        break;
      default:
        handled = false;
    }

    if (handled) {
      consume(event);
    }
  }

  function handleGuideKey(event) {
    var code = event.keyCode;
    var handled = true;
    var picked;

    switch (code) {
      case KEYS.UP:
      case KEYS.CH_UP:
      case KEYS.CH_UP_ALT:
        if (guide.inSchedule()) {
          guide.moveProgram(-1);
        } else {
          guide.moveChannel(-1);
        }
        break;
      case KEYS.DOWN:
      case KEYS.CH_DOWN:
      case KEYS.CH_DOWN_ALT:
        if (guide.inSchedule()) {
          guide.moveProgram(1);
        } else {
          guide.moveChannel(1);
        }
        break;
      case KEYS.RIGHT:
        guide.enterSchedule();
        break;
      case KEYS.LEFT:
        if (guide.inSchedule()) {
          guide.exitSchedule();
        } else {
          guide.close();
        }
        break;
      case KEYS.ENTER:
        picked = guide.selectedChannel();
        guide.close();
        tuneIndex(picked);
        break;
      case KEYS.INFO:
      case KEYS.BLUE:
      case KEYS.BACK:
      case KEYS.ESC:
        guide.close();
        break;
      case KEYS.RED:
        guide.close();
        openSettings();
        break;
      default:
        handled = false;
    }

    if (handled) {
      consume(event);
    }
  }

  function handleMessageKey(event) {
    var code = event.keyCode;
    if (code === KEYS.ENTER) {
      consume(event);
      loadPlaylist();
    } else if (code === KEYS.RED) {
      consume(event);
      openSettings();
    }
    /* BACK / EXIT is left to the platform so the app can close. */
  }

  /* ------------------------------------------------------------- tuning */

  function loadPlaylist() {
    if (!state.configured) {
      openSettings();
      return;
    }
    if (!state.channels.length) {
      message.show('Tvheadend TV', 'Loading channels...', '');
      osd.hide();
    }
    window.TvhPlaylist.fetch(state.settings, function (error, channels) {
      if (error) {
        message.show('Channel list unavailable', error.message, 'ENTER: retry   -   RED: settings');
        osd.hide();
        return;
      }
      applyChannels(channels);
    });
  }

  function applyChannels(channels) {
    state.channels = channels;
    channelList.setChannels(channels);

    var index = 0;
    var found = false;
    var i;
    if (state.currentUrl) {
      for (i = 0; i < channels.length; i++) {
        if (channels[i].url === state.currentUrl) {
          index = i;
          found = true;
          break;
        }
      }
    }
    if (!found) {
      index = 0;
    }

    message.hide();
    scheduleTicketRefresh();
    tuneIndex(index);
  }

  /*
   * Silently re-fetches the playlist (ticket mode: tokens expire after
   * ~5 minutes). The playing stream is not interrupted; only the stored
   * channel URLs are replaced so future tunes use fresh tickets.
   */
  function refreshPlaylistSilently(onDone, onError) {
    if (!state.configured) {
      return;
    }
    window.TvhPlaylist.fetch(state.settings, function (error, channels) {
      if (error) {
        if (typeof onError === 'function') {
          onError();
        }
        return;
      }
      var current = state.channels[state.currentIndex];
      state.channels = channels;
      channelList.setChannels(channels);

      var index = 0;
      var i;
      if (current) {
        for (i = 0; i < channels.length; i++) {
          if (channels[i].number === current.number && channels[i].name === current.name) {
            index = i;
            break;
          }
        }
      }
      state.currentIndex = index;
      state.currentUrl = channels[index].url;
      channelList.setCurrent(index);
      if (typeof onDone === 'function') {
        onDone();
      }
    });
  }

  function scheduleTicketRefresh() {
    if (state.ticketTimer) {
      window.clearInterval(state.ticketTimer);
      state.ticketTimer = null;
    }
    if (state.settings.authMode === 'ticket') {
      state.ticketTimer = window.setInterval(function () {
        refreshPlaylistSilently();
      }, 240000);
    }
  }

  function tuneIndex(index, startStatus, attempts) {
    var count = state.channels.length;
    if (!count) {
      message.show('No channels', 'The playlist did not contain any channels.', 'RED: settings');
      return;
    }

    clearDigits();
    state.currentIndex = ((index % count) + count) % count;
    var channel = state.channels[state.currentIndex];
    state.currentUrl = channel.url;

    /* per-channel profile memory: base URL without the profile parameter */
    var baseKey = channel.url.replace(/profile=[^&]*/i, '');
    var effectiveProfile = state.channelProfiles[baseKey] || state.settings.profile;
    var streamUrl = window.TvhSettings.withProfile(channel.url, effectiveProfile);
    /* smaller server-side queue: first bytes arrive faster (default is 1.5 MB) */
    if (!/[?&]qsize=/.test(streamUrl)) {
      streamUrl += (streamUrl.indexOf('?') !== -1 ? '&' : '?') + 'qsize=300000';
    }
    var effectiveChannel = {
      number: channel.number,
      name: channel.name,
      url: streamUrl,
      logo: channel.logo
    };

    var a = attempts || { ticket: false, fallback: false };

    if (window.__tvhTestLog) {
      window.__tvhTestLog.push({ type: 'tune', profile: effectiveProfile });
    }

    channelList.setCurrent(state.currentIndex);
    message.hide();
    osd.show(channel, startStatus || 'Switching...');
    loadNowNext(channel);

    player.tune(effectiveChannel, state.settings, {
      status: function (text) {
        if (osd.isVisible()) {
          osd.setStatus(text);
        }
      },
      playing: function () {
        osd.setStatus('Playing');
        osd.scheduleHide(4000);
      },
      error: function (info) {
        var code = (info && info.code) || 0;
        var text = (info && info.text) || 'Playback error';

        if (window.__tvhTestLog) {
          window.__tvhTestLog.push({ type: 'error', code: code });
        }

        /* 1) ticket mode: refresh the playlist once and retry (an expired
           ticket also surfaces as error code 4 on this TV) */
        if (state.settings.authMode === 'ticket' && !a.ticket) {
          a.ticket = true;
          osd.setStatus('Refreshing tickets...');
          refreshPlaylistSilently(function () {
            tuneIndex(state.currentIndex, undefined, a);
          }, function () {
            osd.show(channel, text, true);
            osd.clearTimer();
          });
          return;
        }

        /* 2) decode/format failure: retry the channel with the fallback profile */
        if ((code === 3 || code === 4) && !a.fallback) {
          var fallback = state.settings.fallbackProfile;
          if (fallback && fallback !== effectiveProfile && fallback !== 'htsp') {
            a.fallback = true;
            state.channelProfiles[baseKey] = fallback;
            tuneIndex(state.currentIndex, 'Trying fallback profile...', a);
            return;
          }
        }

        osd.show(channel, text, true);
        osd.clearTimer();
      }
    }, startStatus || 'Switching...');
  }

  function zap(delta) {
    if (!state.channels.length) {
      return;
    }
    tuneIndex(state.currentIndex + delta);
  }

  function openChannelList() {
    if (!state.channels.length) {
      loadPlaylist();
      return;
    }
    clearDigits();
    osd.hide();
    channelList.open(state.currentIndex);
  }

  function openGuide() {
    if (!state.channels.length) {
      loadPlaylist();
      return;
    }
    clearDigits();
    osd.hide();
    guide.setChannels(state.channels);
    guide.open(state.currentIndex);
  }

  /* Fetch now/next for the tuned channel and show it in the OSD. */
  function loadNowNext(channel) {
    if (!channel || !channel.id) {
      osd.setProgram(null, null);
      return;
    }
    window.TvhEpg.fetch(state.settings, channel.id, function (error, events) {
      if (error) {
        return;
      }
      if (state.channels[state.currentIndex] !== channel) {
        return; /* tuned away while loading */
      }
      var info = window.TvhEpg.nowNext(events, Date.now());
      if (osd.isVisible()) {
        osd.setProgram(info.now, info.next);
      }
    });
  }

  /* ------------------------------------------------- direct channel entry */

  function handleDigit(digit) {
    if (state.digits.length >= 4) {
      state.digits = '';
    }
    state.digits += digit;
    if (state.digitTimer) {
      window.clearTimeout(state.digitTimer);
    }
    osd.showNumber(state.digits);
    state.digitTimer = window.setTimeout(commitDigits, 1800);
  }

  function clearDigits() {
    if (state.digitTimer) {
      window.clearTimeout(state.digitTimer);
      state.digitTimer = null;
    }
    state.digits = '';
  }

  function commitDigits() {
    var digits = state.digits;
    clearDigits();
    if (!digits) {
      return;
    }
    var target = parseInt(digits, 10);
    var i;
    for (i = 0; i < state.channels.length; i++) {
      if (state.channels[i].number === target) {
        tuneIndex(i);
        return;
      }
    }
    osd.showNumber(digits);
    osd.setStatus('Channel ' + target + ' not found', true);
    osd.scheduleHide(2500);
  }

  /* ----------------------------------------------------------- settings */

  function collectSettingsFocusables() {
    settingsFocusables = [];
    var nodes = settingsRoot.querySelectorAll('.focusable');
    var i;
    for (i = 0; i < nodes.length; i++) {
      settingsFocusables.push(nodes[i]);
    }
    for (i = 0; i < settingsFocusables.length; i++) {
      (function (element, index) {
        element.addEventListener('click', function () {
          if (!state.settingsOpen) {
            return;
          }
          state.settingsFocus = index;
          highlightSettingsFocus();
          activateSettingsElement(element);
        }, false);
      })(settingsFocusables[i], i);
    }
  }

  function highlightSettingsFocus() {
    var i;
    for (i = 0; i < settingsFocusables.length; i++) {
      if (i === state.settingsFocus) {
        settingsFocusables[i].classList.add('focused');
      } else {
        settingsFocusables[i].classList.remove('focused');
      }
    }
    /* keep the focused element visible inside the scrolling form body */
    var element = settingsFocusables[state.settingsFocus];
    var container = byId('form-body');
    if (element && container) {
      var top = element.offsetTop;
      var bottom = top + element.offsetHeight;
      if (top < container.scrollTop) {
        container.scrollTop = top;
      } else if (bottom > container.scrollTop + container.clientHeight) {
        container.scrollTop = bottom - container.clientHeight;
      }
    }
  }

  function renderSettings() {
    var values = state.values;
    var bullets = '';
    var i;
    setText('value-server', values.server || '(not set)');
    setText('value-username', values.username || '(none)');
    if (values.password) {
      for (i = 0; i < values.password.length; i++) {
        bullets += '\u2022';
      }
    }
    setText('value-password', values.password ? bullets : '(none)');
    setText('value-profile', values.profile || window.TvhSettings.DEFAULTS.profile);
    setText('profile-note', PROFILE_NOTES[values.profile] || 'Custom Tvheadend stream profile');
    setText('value-fallback', values.fallbackProfile || '(off)');
    setText('fallback-note', FALLBACK_NOTES[values.fallbackProfile || ''] || 'Custom fallback profile');
    setText('value-auth', values.authMode);
    setText('auth-note', AUTH_NOTES[values.authMode] || '');
    highlightSettingsFocus();
  }

  function openSettings() {
    if (state.settingsOpen) {
      return;
    }
    state.settingsOpen = true;
    state.values = {
      server: state.settings.server,
      username: state.settings.username,
      password: state.settings.password,
      profile: state.settings.profile,
      fallbackProfile: state.settings.fallbackProfile,
      authMode: state.settings.authMode
    };
    state.settingsFocus = 0;
    hideSettingsError();
    renderSettings();
    settingsRoot.classList.remove('hidden');
  }

  function closeSettings() {
    keyboard.close();
    settingsRoot.classList.add('hidden');
    state.settingsOpen = false;
    if (!state.configured) {
      message.show('Tvheadend TV', 'No server configured yet.', 'RED: settings');
    }
  }

  function saveSettings() {
    var error = window.TvhSettings.validate(state.values);
    if (error) {
      showSettingsError(error);
      return;
    }
    state.settings = window.TvhSettings.save(state.values);
    state.configured = true;
    closeSettings();
    message.hide();
    loadPlaylist();
  }

  function showSettingsError(text) {
    var element = byId('settings-error');
    element.textContent = text;
    element.classList.remove('hidden');
  }

  function hideSettingsError() {
    var element = byId('settings-error');
    element.textContent = '';
    element.classList.add('hidden');
  }

  var CYCLE_LISTS = {
    profile: window.TvhSettings.PROFILES,
    fallback: window.TvhSettings.FALLBACKS,
    auth: window.TvhSettings.AUTH_MODES
  };
  var CYCLE_KEYS = {
    profile: 'profile',
    fallback: 'fallbackProfile',
    auth: 'authMode'
  };

  function cycleField(action, delta) {
    var list = CYCLE_LISTS[action];
    var key = CYCLE_KEYS[action];
    if (!list || !key) {
      return;
    }
    var index = list.indexOf(state.values[key]);
    if (index === -1) {
      index = delta > 0 ? -1 : 0;
    }
    index = (index + delta + list.length) % list.length;
    state.values[key] = list[index];
    hideSettingsError();
    renderSettings();
  }

  function activateSettingsElement(element) {
    var action = element.getAttribute('data-action');
    if (action === 'edit') {
      openKeyboardFor(element.getAttribute('data-key'), element.getAttribute('data-label'));
    } else if (action === 'profile') {
      openKeyboardFor('profile', element.getAttribute('data-label'));
    } else if (action === 'fallback') {
      openKeyboardFor('fallbackProfile', element.getAttribute('data-label'));
    } else if (action === 'auth') {
      cycleField('auth', 1);
    } else if (action === 'save') {
      saveSettings();
    } else if (action === 'cancel') {
      closeSettings();
    }
  }

  function openKeyboardFor(key, label) {
    keyboard.open(label, state.values[key] || '', function (value) {
      if (key === 'server' || key === 'profile' || key === 'fallbackProfile') {
        value = value.replace(/^\s+|\s+$/g, '');
      }
      if (key === 'profile' && !value) {
        value = window.TvhSettings.DEFAULTS.profile;
      }
      state.values[key] = value;
      hideSettingsError();
      renderSettings();
    }, function () {
      /* cancelled - value is unchanged */
    });
  }

  function handleSettingsKey(event) {
    var code = event.keyCode;
    var element = settingsFocusables[state.settingsFocus];
    var action = element ? element.getAttribute('data-action') : '';

    switch (code) {
      case KEYS.UP:
        state.settingsFocus = (state.settingsFocus - 1 + settingsFocusables.length) % settingsFocusables.length;
        highlightSettingsFocus();
        consume(event);
        break;
      case KEYS.DOWN:
        state.settingsFocus = (state.settingsFocus + 1) % settingsFocusables.length;
        highlightSettingsFocus();
        consume(event);
        break;
      case KEYS.LEFT:
        if (action === 'profile') {
          cycleField('profile', -1);
          consume(event);
        } else if (action === 'fallback') {
          cycleField('fallback', -1);
          consume(event);
        } else if (action === 'auth') {
          cycleField('auth', -1);
          consume(event);
        }
        break;
      case KEYS.RIGHT:
        if (action === 'profile') {
          cycleField('profile', 1);
          consume(event);
        } else if (action === 'fallback') {
          cycleField('fallback', 1);
          consume(event);
        } else if (action === 'auth') {
          cycleField('auth', 1);
          consume(event);
        }
        break;
      case KEYS.ENTER:
        consume(event);
        if (element) {
          activateSettingsElement(element);
        }
        break;
      case KEYS.BACK:
      case KEYS.ESC:
      case KEYS.BLUE:
        consume(event);
        closeSettings();
        break;
      default:
        break;
    }
  }

  /* ---------------------------------------------------------------- boot */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, false);
  } else {
    init();
  }

  /* Test/diagnostic hooks (harmless, used by the remote debug harness). */
  window.__tvhTest = {
    tuneIndex: tuneIndex,
    findChannelNumber: function (number) {
      var i;
      for (i = 0; i < state.channels.length; i++) {
        if (state.channels[i].number === number) {
          return i;
        }
      }
      return -1;
    },
    currentIndex: function () {
      return state.currentIndex;
    }
  };
})(window, document);
