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
    CH_UP: 427,
    CH_DOWN: 428,
    RED: 403
  };

  var PROFILE_NOTES = {
    'pass': 'No transcoding - works when the TV can decode the broadcast codecs',
    'webtv-h264-aac-mpegts': 'Transcodes every channel to H.264 + AAC in MPEG-TS (recommended for webOS TV Lite)',
    'webtv-vp8-vorbis-webm': 'Transcodes to WebM (VP8 + Vorbis) - unstable on webOS TV Lite',
    'htsp': 'HTSP protocol - the HTML5 video element cannot play this'
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
    message = new window.TvhUi.MessageScreen();
    keyboard = new window.TvhKeyboard();

    channelList.onPick = function (index) {
      channelList.close();
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
        zap(1);
        break;
      case KEYS.DOWN:
      case KEYS.CH_DOWN:
        zap(-1);
        break;
      case KEYS.ENTER:
        openChannelList();
        break;
      case KEYS.RED:
        openSettings();
        break;
      case KEYS.BACK:
      case KEYS.ESC:
        handled = false; /* let webOS close the app */
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
        channelList.move(-1);
        break;
      case KEYS.DOWN:
      case KEYS.CH_DOWN:
        channelList.move(1);
        break;
      case KEYS.ENTER:
        picked = channelList.selected();
        channelList.close();
        tuneIndex(picked);
        break;
      case KEYS.BACK:
      case KEYS.ESC:
        channelList.close();
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

  function tuneIndex(index) {
    var count = state.channels.length;
    if (!count) {
      message.show('No channels', 'The playlist did not contain any channels.', 'RED: settings');
      return;
    }

    clearDigits();
    state.currentIndex = ((index % count) + count) % count;
    var channel = state.channels[state.currentIndex];
    state.currentUrl = channel.url;

    var retried = false;

    channelList.setCurrent(state.currentIndex);
    message.hide();
    osd.show(channel, 'Switching...');

    player.tune(channel, state.settings, {
      status: function (text) {
        if (osd.isVisible()) {
          osd.setStatus(text);
        }
      },
      playing: function () {
        osd.setStatus('Playing');
        osd.scheduleHide(4000);
      },
      error: function (text) {
        /* Expired ticket? Refresh once and retry the same channel. */
        if (state.settings.authMode === 'ticket' && !retried) {
          retried = true;
          osd.setStatus('Refreshing tickets...');
          refreshPlaylistSilently(function () {
            tuneIndex(state.currentIndex);
          }, function () {
            osd.show(channel, text, true);
            osd.clearTimer();
          });
          return;
        }
        osd.show(channel, text, true);
        osd.clearTimer();
      }
    });
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

  function cycleList(listName, valuesKey, delta) {
    var list = listName === 'profiles' ? window.TvhSettings.PROFILES : window.TvhSettings.AUTH_MODES;
    var index = list.indexOf(state.values[valuesKey]);
    if (index === -1) {
      index = delta > 0 ? -1 : 0;
    }
    index = (index + delta + list.length) % list.length;
    state.values[valuesKey] = list[index];
    hideSettingsError();
    renderSettings();
  }

  function activateSettingsElement(element) {
    var action = element.getAttribute('data-action');
    if (action === 'edit') {
      openKeyboardFor(element.getAttribute('data-key'), element.getAttribute('data-label'));
    } else if (action === 'preset') {
      state.values.server = element.getAttribute('data-server');
      renderSettings();
    } else if (action === 'profile') {
      openKeyboardFor('profile', element.getAttribute('data-label'));
    } else if (action === 'auth') {
      cycleList('auths', 'authMode', 1);
    } else if (action === 'save') {
      saveSettings();
    } else if (action === 'cancel') {
      closeSettings();
    }
  }

  function openKeyboardFor(key, label) {
    keyboard.open(label, state.values[key] || '', function (value) {
      if (key === 'server' || key === 'profile') {
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
          cycleList('profiles', 'profile', -1);
          consume(event);
        } else if (action === 'auth') {
          cycleList('auths', 'authMode', -1);
          consume(event);
        }
        break;
      case KEYS.RIGHT:
        if (action === 'profile') {
          cycleList('profiles', 'profile', 1);
          consume(event);
        } else if (action === 'auth') {
          cycleList('auths', 'authMode', 1);
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
})(window, document);
