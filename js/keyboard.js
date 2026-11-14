/*
 * Tvheadend TV - on-screen keyboard.
 * Fully D-pad driven so text fields work without a physical keyboard.
 */
(function (window, document, undefined) {
  'use strict';

  var LOWER_ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '@', '.'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '-', '_', '/', ':'],
    ['SHIFT', 'SYM', 'SPACE', 'DEL', 'DONE']
  ];

  var SYM_ROWS = [
    ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'],
    ['-', '_', '=', '+', '[', ']', '{', '}', ';', ':'],
    ["'", '"', '`', '~', '|', '\\', '<', '>', ',', '.'],
    ['/','?','+','=','SPACE','DEL','DONE']
  ];

  function Keyboard() {
    this.root = document.getElementById('keyboard');
    this.labelEl = document.getElementById('kb-label');
    this.valueEl = document.getElementById('kb-value');
    this.gridEl = document.getElementById('kb-grid');
    this.mode = 'abc';
    this.value = '';
    this.focusRow = 0;
    this.focusCol = 0;
    this.rows = [];
    this.onDone = null;
    this.onCancel = null;
    this.build();
  }

  Keyboard.prototype.isOpen = function () {
    return !this.root.classList.contains('hidden');
  };

  Keyboard.prototype.open = function (label, value, onDone, onCancel) {
    this.labelEl.textContent = label;
    this.value = value || '';
    this.onDone = onDone || null;
    this.onCancel = onCancel || null;
    this.mode = 'abc';
    this.focusRow = 0;
    this.focusCol = 0;
    this.build();
    this.updateValue();
    this.root.classList.remove('hidden');
  };

  Keyboard.prototype.close = function () {
    this.root.classList.add('hidden');
    this.onDone = null;
    this.onCancel = null;
  };

  Keyboard.prototype.finish = function (commit) {
    var callback = commit ? this.onDone : this.onCancel;
    var value = this.value;
    this.close();
    if (typeof callback === 'function') {
      callback(value);
    }
  };

  Keyboard.prototype.keyLabel = function (code) {
    if (code === 'SHIFT') {
      return this.mode === 'ABC' ? 'abc' : '\u21e7';
    }
    if (code === 'SYM') {
      return '123';
    }
    if (code === 'ABC') {
      return 'abc';
    }
    if (code === 'SPACE') {
      return 'space';
    }
    if (code === 'DEL') {
      return '\u232b';
    }
    if (code === 'DONE') {
      return 'Done';
    }
    return this.mode === 'ABC' ? code.toUpperCase() : code;
  };

  Keyboard.prototype.addKey = function (element, row, col) {
    var self = this;
    element.addEventListener('click', function () {
      self.focusRow = row;
      self.focusCol = col;
      self.updateFocus();
      self.activate();
    }, false);
  };

  Keyboard.prototype.build = function () {
    var layout = this.mode === 'sym' ? SYM_ROWS : LOWER_ROWS;
    this.gridEl.innerHTML = '';
    this.rows = [];

    var rowIndex;
    var colIndex;
    for (rowIndex = 0; rowIndex < layout.length; rowIndex++) {
      var rowElement = document.createElement('div');
      rowElement.className = 'kb-row';
      var rowItems = [];
      for (colIndex = 0; colIndex < layout[rowIndex].length; colIndex++) {
        var code = layout[rowIndex][colIndex];
        var keyElement = document.createElement('div');
        keyElement.className = 'kb-key' + (code.length > 1 ? ' wide' : '');
        keyElement.textContent = this.keyLabel(code);
        keyElement.setAttribute('data-key', code);
        rowElement.appendChild(keyElement);
        rowItems.push({ element: keyElement, code: code });
        this.addKey(keyElement, rowIndex, colIndex);
      }
      this.gridEl.appendChild(rowElement);
      this.rows.push(rowItems);
    }

    if (this.focusRow >= this.rows.length) {
      this.focusRow = this.rows.length - 1;
    }
    if (this.focusCol >= this.rows[this.focusRow].length) {
      this.focusCol = this.rows[this.focusRow].length - 1;
    }
    this.updateFocus();
  };

  Keyboard.prototype.updateValue = function () {
    this.valueEl.textContent = this.value ? this.value : '(empty)';
  };

  Keyboard.prototype.updateFocus = function () {
    var row;
    var col;
    for (row = 0; row < this.rows.length; row++) {
      for (col = 0; col < this.rows[row].length; col++) {
        var focused = row === this.focusRow && col === this.focusCol;
        if (focused) {
          this.rows[row][col].element.classList.add('focused');
        } else {
          this.rows[row][col].element.classList.remove('focused');
        }
      }
    }
  };

  Keyboard.prototype.moveRow = function (delta) {
    var row = this.focusRow + delta;
    if (row < 0) {
      row = this.rows.length - 1;
    }
    if (row >= this.rows.length) {
      row = 0;
    }
    this.focusRow = row;
    if (this.focusCol >= this.rows[row].length) {
      this.focusCol = this.rows[row].length - 1;
    }
    this.updateFocus();
  };

  Keyboard.prototype.moveCol = function (delta) {
    var length = this.rows[this.focusRow].length;
    this.focusCol = (this.focusCol + delta + length) % length;
    this.updateFocus();
  };

  Keyboard.prototype.activate = function () {
    var row = this.rows[this.focusRow];
    if (!row) {
      return;
    }
    var item = row[this.focusCol];
    if (!item) {
      return;
    }
    var code = item.code;

    if (code === 'SHIFT') {
      this.mode = this.mode === 'ABC' ? 'abc' : 'ABC';
      this.build();
      return;
    }
    if (code === 'SYM') {
      this.mode = 'sym';
      this.build();
      return;
    }
    if (code === 'ABC') {
      this.mode = 'abc';
      this.build();
      return;
    }
    if (code === 'SPACE') {
      this.value += ' ';
    } else if (code === 'DEL') {
      this.value = this.value.slice(0, -1);
    } else if (code === 'DONE') {
      this.finish(true);
      return;
    } else {
      this.value += this.mode === 'ABC' ? code.toUpperCase() : code;
    }
    this.updateValue();
  };

  Keyboard.prototype.handleKey = function (event) {
    var code = event.keyCode;
    if (code === 37) {
      this.moveCol(-1);
    } else if (code === 39) {
      this.moveCol(1);
    } else if (code === 38) {
      this.moveRow(-1);
    } else if (code === 40) {
      this.moveRow(1);
    } else if (code === 13) {
      this.activate();
    } else if (code === 461 || code === 27) {
      this.finish(false);
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  window.TvhKeyboard = Keyboard;
})(window, document);
