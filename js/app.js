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
    'pass': 'No transcoding - only for channels the TV can decode directly',
    'webtv-h264-aac-mpegts': 'Transcodes every channel to H.264 + AAC in MPEG-TS',
    'htsp': 'HTSP protocol - the HTML5 video element cannot play this'
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
    digitTimer: null
  };

  var player = null;
  var osd = null;
  var channelList = null;
  var guide = null;
  var message = null;

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
    state.configured = window.TvhSettings.hasSettings() ||
      !!(window.TVH_CONFIG && window.TVH_CONFIG.server);

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
    tuneIndex(index);
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

    var streamUrl = channel.url;
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

    if (window.__tvhTestLog) {
      window.__tvhTestLog.push({ type: 'tune', profile: state.settings.profile });
    }

    channelList.setCurrent(state.currentIndex);
    message.hide();
    osd.show(channel, 'Switching...');
    loadNowNext(channel);

    player.tune(effectiveChannel, {
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
        var text = (info && info.text) || 'Playback error';
        if (window.__tvhTestLog) {
          window.__tvhTestLog.push({ type: 'error', code: (info && info.code) || 0 });
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
    bindFieldInputs();
  }

  function bindFieldInputs() {
    var inputs = settingsRoot.querySelectorAll('.field-input');
    var i;
    for (i = 0; i < inputs.length; i++) {
      (function (input) {
        var key = input.getAttribute('data-key');
        input.addEventListener('input', function () {
          state.values[key] = input.value;
          hideSettingsError();
        }, false);
        input.addEventListener('keydown', function (event) {
          var code = event.keyCode;
          /* let the D-pad leave the field; the system keyboard handles keys
             while it is open (those never reach the page) */
          if (code === KEYS.UP || code === KEYS.DOWN || code === KEYS.ENTER ||
              code === KEYS.BACK || code === KEYS.ESC) {
            input.blur();
          }
        }, false);
      })(inputs[i]);
    }
  }

  function focusInput(key) {
    var ids = {
      server: 'input-server',
      username: 'input-username',
      password: 'input-password',
      profile: 'input-profile'
    };
    var input = byId(ids[key]);
    if (input) {
      input.focus();
    }
  }

  function blurSettingsInputs() {
    var active = document.activeElement;
    if (active && active.tagName === 'INPUT') {
      active.blur();
    }
  }

  function readSettingsInputs() {
    var ids = {
      server: 'input-server',
      username: 'input-username',
      password: 'input-password',
      profile: 'input-profile'
    };
    for (var key in ids) {
      if (ids.hasOwnProperty(key)) {
        var input = byId(ids[key]);
        if (input) {
          state.values[key] = input.value;
        }
      }
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
    var element;
    var inputs = {
      server: 'input-server',
      username: 'input-username',
      password: 'input-password',
      profile: 'input-profile'
    };
    for (var key in inputs) {
      if (inputs.hasOwnProperty(key)) {
        element = byId(inputs[key]);
        if (element && document.activeElement !== element) {
          element.value = values[key] || '';
        }
      }
    }
    setText('profile-note', PROFILE_NOTES[values.profile] || 'Custom Tvheadend stream profile');
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
      profile: state.settings.profile
    };
    state.settingsFocus = 0;
    hideSettingsError();
    renderSettings();
    settingsRoot.classList.remove('hidden');
  }

  function closeSettings() {
    settingsRoot.classList.add('hidden');
    state.settingsOpen = false;
    if (!state.configured) {
      message.show('Tvheadend TV', 'No server configured yet.', 'RED: settings');
    }
  }

  function saveSettings() {
    readSettingsInputs();
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
    profile: window.TvhSettings.PROFILES
  };

  function cycleField(key, delta) {
    var list = CYCLE_LISTS[key];
    if (!list) {
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
      focusInput(element.getAttribute('data-key'));
    } else if (action === 'preset') {
      state.values.server = element.getAttribute('data-server');
      renderSettings();
    } else if (action === 'save') {
      saveSettings();
    } else if (action === 'cancel') {
      closeSettings();
    }
  }

  function handleSettingsKey(event) {
    var code = event.keyCode;
    var element = settingsFocusables[state.settingsFocus];
    var action = element ? element.getAttribute('data-action') : '';
    var key = element ? element.getAttribute('data-key') : '';
    var editing = document.activeElement && document.activeElement.tagName === 'INPUT';

    switch (code) {
      case KEYS.UP:
        blurSettingsInputs();
        state.settingsFocus = (state.settingsFocus - 1 + settingsFocusables.length) % settingsFocusables.length;
        highlightSettingsFocus();
        consume(event);
        break;
      case KEYS.DOWN:
        blurSettingsInputs();
        state.settingsFocus = (state.settingsFocus + 1) % settingsFocusables.length;
        highlightSettingsFocus();
        consume(event);
        break;
      case KEYS.LEFT:
        if (!editing && key === 'profile') {
          cycleField('profile', -1);
          consume(event);
        }
        break;
      case KEYS.RIGHT:
        if (!editing && key === 'profile') {
          cycleField('profile', 1);
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
