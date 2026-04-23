// ── IndexedDB ─────────────────────────────────────────────────────────────────
let db;
const dbReq = indexedDB.open("DeepWorkDB2", 1);

dbReq.onupgradeneeded = function(e) {
  db = e.target.result;
  if (!db.objectStoreNames.contains("blocks")) {
    const store = db.createObjectStore("blocks", { keyPath: "id", autoIncrement: true });
    store.createIndex("date", "date", { unique: false });
  }
};

dbReq.onsuccess = function(e) {
  db = e.target.result;
  loadToday();
  prefillStartTime();
  startReminderLoop();
  updateNotifSettingsLabel();
};

dbReq.onerror = function(e) { console.error("DB error", e.target.errorCode); };

// ── Edit mode state ───────────────────────────────────────────────────────────
let editingId = null; // null = create mode, number = edit mode

function enterEditMode(block) {
  editingId = block.id;

  document.getElementById('taskTitle').value  = block.title;
  document.getElementById('taskDesc').value   = block.desc || '';
  document.getElementById('startTime').value  = block.startTime;
  document.getElementById('endTime').value    = block.endTime;

  document.getElementById('formModeLabel').textContent   = 'Edit Time Block';
  document.getElementById('formModeSub').textContent     = 'Update the details below, then save';
  document.getElementById('submitBtnText').textContent   = 'Save Changes';
  document.getElementById('cancelEditBtn').style.display = 'flex';
  document.getElementById('editingBanner').style.display = 'flex';
  document.getElementById('editingBannerTitle').textContent = block.title;

  clearErrors();
  document.getElementById('create-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(function() { document.getElementById('taskTitle').focus(); }, 300);
}

function exitEditMode() {
  editingId = null;
  document.getElementById('blockForm').reset();
  document.getElementById('formModeLabel').textContent   = 'Create Time Block';
  document.getElementById('formModeSub').textContent     = 'Schedule your deep work sessions for today';
  document.getElementById('submitBtnText').textContent   = 'Add Time Block';
  document.getElementById('cancelEditBtn').style.display = 'none';
  document.getElementById('editingBanner').style.display = 'none';
  clearErrors();
  prefillStartTime();
}

// ── Notification mode ─────────────────────────────────────────────────────────
function getNotifMode() { return localStorage.getItem('notifMode') || 'selective'; }
function setNotifMode(mode) { localStorage.setItem('notifMode', mode); updateNotifSettingsLabel(); }

function updateNotifSettingsLabel() {
  var el = document.getElementById('notifSettingsLabel');
  if (!el) return;
  var mode = getNotifMode();
  el.textContent = mode === 'all' ? 'All reminders on' : mode === 'off' ? 'Reminders off' : 'Selective reminders';
}

async function requestNotifPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  var result = await Notification.requestPermission();
  return result === 'granted';
}

function sendNativeNotif(title, body) {
  if (Notification.permission === 'granted') new Notification(title, { body: body });
}

// ── Notification settings modal ───────────────────────────────────────────────
document.getElementById('notifSettingsBtn').addEventListener('click', function() {
  var mode = getNotifMode();
  document.querySelector('input[name="notifMode"][value="' + mode + '"]').checked = true;
  document.querySelectorAll('.notif-option').forEach(function(o) { o.classList.remove('selected'); });
  document.getElementById('option' + capitalize(mode)).classList.add('selected');
  document.getElementById('notifModal').style.display = 'flex';
});

document.querySelectorAll('input[name="notifMode"]').forEach(function(radio) {
  radio.addEventListener('change', function() {
    document.querySelectorAll('.notif-option').forEach(function(o) { o.classList.remove('selected'); });
    var label = this.closest('.notif-option');
    if (label) label.classList.add('selected');
  });
});

document.getElementById('cancelNotifModal').addEventListener('click', function() {
  document.getElementById('notifModal').style.display = 'none';
});

document.getElementById('saveNotifModal').addEventListener('click', async function() {
  var selected = document.querySelector('input[name="notifMode"]:checked');
  if (!selected) return;
  var mode = selected.value;

  if (mode !== 'off') {
    var granted = await requestNotifPermission();
    if (!granted) {
      showToast('Permission denied', 'Please allow notifications in your browser settings.');
      document.getElementById('notifModal').style.display = 'none';
      return;
    }
  }

  setNotifMode(mode);
  document.getElementById('notifModal').style.display = 'none';

  if (mode === 'all') {
    showToast('All reminders enabled', "You'll be notified 5 min before every block.");
    setAllReminders(true);
  } else if (mode === 'selective') {
    showToast('Selective reminders', 'Use the bell button on each block to set reminders.');
  } else {
    showToast('Reminders off', 'You will not receive any reminders.');
    setAllReminders(false);
  }
  loadToday();
});

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function setAllReminders(value) {
  var tx = db.transaction("blocks", "readwrite");
  var store = tx.objectStore("blocks");
  store.index("date").getAll(todayStr()).onsuccess = function(e) {
    e.target.result.forEach(function(b) {
      b.reminderSet = value;
      if (!value) b.reminderFired = false;
      var wTx = db.transaction("blocks", "readwrite");
      wTx.objectStore("blocks").put(b);
    });
  };
}

document.getElementById('notifModal').addEventListener('click', function(e) {
  if (e.target === this) this.style.display = 'none';
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().split('T')[0]; }

function toMins(t) {
  if (!t) return 0;
  var parts = t.split(':').map(Number);
  return parts[0] * 60 + parts[1];
}

function nowMins() {
  var n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function fmt(t) {
  if (!t) return '';
  var parts = t.split(':');
  var hr = parseInt(parts[0]);
  var suffix = hr >= 12 ? 'PM' : 'AM';
  var disp = hr % 12 === 0 ? 12 : hr % 12;
  return disp + ':' + parts[1] + ' ' + suffix;
}

// ── Prefill start time ────────────────────────────────────────────────────────
function prefillStartTime() {
  var tx = db.transaction("blocks", "readonly");
  tx.objectStore("blocks").index("date").getAll(todayStr()).onsuccess = function(e) {
    var blocks = e.target.result;
    if (blocks.length === 0) {
      document.getElementById('startTime').value = '';
      return;
    }
    var sorted = blocks.slice().sort(function(a, b) { return toMins(a.startTime) - toMins(b.startTime); });
    var last = sorted[sorted.length - 1];
    if (last && last.endTime) document.getElementById('startTime').value = last.endTime;
  };
}

// ── Validation ────────────────────────────────────────────────────────────────
function clearErrors() {
  ['titleError', 'startError', 'endError'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.textContent = '';
  });
  ['taskTitle', 'startTime', 'endTime'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('invalid');
  });
  var fe = document.getElementById('formError');
  if (fe) { fe.style.display = 'none'; fe.textContent = ''; }
}

function showFieldError(fieldId, errorId, msg) {
  var field = document.getElementById(fieldId);
  var err = document.getElementById(errorId);
  if (field) field.classList.add('invalid');
  if (err) err.textContent = msg;
}

function validateForm(title, startTime, endTime) {
  clearErrors();
  var valid = true;
  if (!title.trim()) {
    showFieldError('taskTitle', 'titleError', 'Task title is required.');
    valid = false;
  } else if (title.trim().length < 2) {
    showFieldError('taskTitle', 'titleError', 'Title must be at least 2 characters.');
    valid = false;
  } else if (title.trim().length > 120) {
    showFieldError('taskTitle', 'titleError', 'Title must be under 120 characters.');
    valid = false;
  }
  if (!startTime) { showFieldError('startTime', 'startError', 'Start time is required.'); valid = false; }
  if (!endTime)   { showFieldError('endTime',   'endError',   'End time is required.');   valid = false; }
  if (startTime && endTime) {
    if (toMins(endTime) <= toMins(startTime)) {
      showFieldError('endTime', 'endError', 'End time must be after start time.');
      valid = false;
    } else if (toMins(endTime) - toMins(startTime) < 5) {
      showFieldError('endTime', 'endError', 'Block must be at least 5 minutes.');
      valid = false;
    }
  }
  return valid;
}

// ── Form Submit (create + edit) ───────────────────────────────────────────────
document.getElementById('blockForm').addEventListener('submit', function(e) {
  e.preventDefault();
  var title     = document.getElementById('taskTitle').value;
  var desc      = document.getElementById('taskDesc').value.trim();
  var startTime = document.getElementById('startTime').value;
  var endTime   = document.getElementById('endTime').value;

  if (!validateForm(title, startTime, endTime)) return;

  if (editingId !== null) {
    // UPDATE
    checkOverlap(startTime, endTime, editingId, function(overlap) {
      if (overlap) {
        var fe = document.getElementById('formError');
        fe.textContent = 'This time overlaps with "' + overlap.title + '" (' + fmt(overlap.startTime) + '\u2013' + fmt(overlap.endTime) + ').';
        fe.style.display = 'block';
        return;
      }
      var tx = db.transaction("blocks", "readwrite");
      var store = tx.objectStore("blocks");
      store.get(editingId).onsuccess = function(ev) {
        var b = ev.target.result;
        b.title       = title.trim();
        b.desc        = desc;
        b.startTime   = startTime;
        b.endTime     = endTime;
        b.reminderFired = false;
        store.put(b).onsuccess = function() {
          var savedTitle = b.title;
          exitEditMode();
          loadToday();
          showToast('Block updated', '"' + savedTitle + '" has been saved.');
        };
      };
    });
  } else {
    // CREATE
    checkOverlap(startTime, endTime, null, function(overlap) {
      if (overlap) {
        var fe = document.getElementById('formError');
        fe.textContent = 'This time overlaps with "' + overlap.title + '" (' + fmt(overlap.startTime) + '\u2013' + fmt(overlap.endTime) + ').';
        fe.style.display = 'block';
        return;
      }
      var mode = getNotifMode();
      var block = {
        title: title.trim(), desc: desc,
        startTime: startTime, endTime: endTime,
        status: 'pending', date: todayStr(),
        reminderSet: mode === 'all', reminderFired: false
      };
      var tx = db.transaction("blocks", "readwrite");
      tx.objectStore("blocks").add(block).onsuccess = function() {
        document.getElementById('taskTitle').value = '';
        document.getElementById('taskDesc').value  = '';
        document.getElementById('startTime').value = endTime;
        document.getElementById('endTime').value   = '';
        clearErrors();
        loadToday();
      };
    });
  }
});

document.getElementById('cancelEditBtn').addEventListener('click', function() { exitEditMode(); });

// ── Overlap check ─────────────────────────────────────────────────────────────
function checkOverlap(startTime, endTime, excludeId, cb) {
  var tx = db.transaction("blocks", "readonly");
  tx.objectStore("blocks").index("date").getAll(todayStr()).onsuccess = function(e) {
    var blocks = e.target.result;
    var s = toMins(startTime), en = toMins(endTime);
    var overlapping = blocks.find(function(b) {
      if (excludeId && b.id === excludeId) return false;
      return s < toMins(b.endTime) && en > toMins(b.startTime);
    });
    cb(overlapping || null);
  };
}

// ── Load & Render ─────────────────────────────────────────────────────────────
function loadToday() {
  var tx = db.transaction("blocks", "readonly");
  tx.objectStore("blocks").index("date").getAll(todayStr()).onsuccess = function(e) {
    var blocks = e.target.result.sort(function(a, b) { return toMins(a.startTime) - toMins(b.startTime); });
    renderBlocks(blocks);
    updateProgress(blocks);
    if (blocks.length === 0) {
      // If we're not editing, clear start/end time when no blocks
      if (editingId === null) {
        document.getElementById('startTime').value = '';
        document.getElementById('endTime').value   = '';
      }
    }
  };
}

function renderBlocks(blocks) {
  var list  = document.getElementById('blockList');
  var empty = document.getElementById('emptyState');
  list.querySelectorAll('.block-item').forEach(function(el) { el.remove(); });

  if (blocks.length === 0) { empty.style.display = ''; return; }
  empty.style.display = 'none';

  var now  = nowMins();
  var mode = getNotifMode();

  blocks.forEach(function(block) {
    var item = document.createElement('div');
    item.className = 'block-item';
    if (block.status === 'completed') item.classList.add('completed');

    var s  = toMins(block.startTime), en = toMins(block.endTime);
    var isLive = block.status !== 'completed' && now >= s && now < en;
    if (isLive) item.classList.add('active-now');

    // Highlight currently-editing block
    if (block.id === editingId) item.classList.add('editing');

    var reminderActive = mode === 'all' ? true : (mode === 'selective' ? block.reminderSet : false);
    var bellTitle = mode === 'all'
      ? 'All reminders on (change in Reminders settings)'
      : mode === 'off'
      ? 'Reminders off (change in Reminders settings)'
      : (reminderActive ? 'Reminder on \u2014 click to disable' : 'Set reminder for this block');

    item.innerHTML =
      '<div class="block-left">'
      + (isLive ? '<span class="live-dot"></span>' : '')
      + '<div class="block-title">' + esc(block.title) + '</div>'
      + (block.desc ? '<div class="block-desc">' + esc(block.desc) + '</div>' : '')
      + '<div class="block-time">' + fmt(block.startTime) + ' \u2013 ' + fmt(block.endTime) + '</div>'
      + '</div>'
      + '<div class="block-actions">'
      + '<button class="act-btn reminder-btn' + (reminderActive ? '' : ' off') + (mode !== 'selective' ? ' mode-fixed' : '') + '" title="' + bellTitle + '" data-id="' + block.id + '">'
      + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'
      + '</button>'
      + '<button class="act-btn edit-btn" title="Edit this block" data-id="' + block.id + '">'
      + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
      + '</button>'
      + '<button class="act-btn complete-btn" title="' + (block.status === 'completed' ? 'Mark pending' : 'Mark complete') + '" data-id="' + block.id + '" data-status="' + block.status + '">'
      + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
      + '</button>'
      + '<button class="act-btn del-btn" title="Delete block" data-id="' + block.id + '">'
      + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>'
      + '</button>'
      + '</div>';

    item.querySelector('.edit-btn').addEventListener('click', function() {
      enterEditMode(block);
    });
    item.querySelector('.complete-btn').addEventListener('click', function() {
      updateStatus(block.id, block.status === 'completed' ? 'pending' : 'completed');
    });
    item.querySelector('.del-btn').addEventListener('click', function() {
      if (editingId === block.id) exitEditMode();
      deleteBlock(block.id);
    });
    item.querySelector('.reminder-btn').addEventListener('click', function() {
      if (mode === 'selective') {
        toggleReminder(block.id);
      } else {
        document.getElementById('notifSettingsBtn').click();
      }
    });

    list.appendChild(item);
  });
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function updateProgress(blocks) {
  var total = blocks.length;
  var done  = blocks.filter(function(b) { return b.status === 'completed'; }).length;
  document.getElementById('progressLabel').textContent =
    done + ' of ' + total + ' block' + (total !== 1 ? 's' : '') + ' completed';
}

// ── DB helpers ────────────────────────────────────────────────────────────────
function updateStatus(id, status) {
  var tx = db.transaction("blocks", "readwrite");
  var store = tx.objectStore("blocks");
  store.get(id).onsuccess = function(e) {
    var b = e.target.result;
    b.status = status;
    store.put(b).onsuccess = function() { loadToday(); };
  };
}

function deleteBlock(id) {
  var tx = db.transaction("blocks", "readwrite");
  tx.objectStore("blocks").delete(id).onsuccess = function() { loadToday(); };
}

function toggleReminder(id) {
  requestNotifPermission().then(function(granted) {
    if (!granted) {
      showToast('Permission denied', 'Allow notifications in your browser settings to use reminders.');
      return;
    }
    var tx = db.transaction("blocks", "readwrite");
    var store = tx.objectStore("blocks");
    store.get(id).onsuccess = function(e) {
      var b = e.target.result;
      b.reminderSet   = !b.reminderSet;
      b.reminderFired = false;
      store.put(b).onsuccess = function() {
        loadToday();
        showToast(
          b.reminderSet ? 'Reminder set' : 'Reminder removed',
          b.reminderSet ? 'You\'ll be notified 5 min before "' + b.title + '".' : 'Reminder off for "' + b.title + '".'
        );
      };
    };
  });
}

// ── Reminder loop ─────────────────────────────────────────────────────────────
function startReminderLoop() {
  setInterval(function() {
    if (Notification.permission !== 'granted') return;
    var mode = getNotifMode();
    if (mode === 'off') return;
    var tx = db.transaction("blocks", "readwrite");
    tx.objectStore("blocks").index("date").getAll(todayStr()).onsuccess = function(e) {
      var now = nowMins();
      e.target.result.forEach(function(block) {
        var shouldRemind = mode === 'all' ? true : block.reminderSet;
        if (!shouldRemind || block.reminderFired || block.status === 'completed') return;
        var s = toMins(block.startTime);
        if (now >= s - 5 && now <= s + 1) {
          block.reminderFired = true;
          var wTx = db.transaction("blocks", "readwrite");
          wTx.objectStore("blocks").put(block);
          var mins = s - now;
          var msg = mins <= 0 ? 'Starting now!' : 'Starting in ' + mins + ' min.';
          showToast(block.title, msg);
          sendNativeNotif('Deep Work: ' + block.title, msg);
        }
      });
    };
  }, 30000);
}

// ── Toast ─────────────────────────────────────────────────────────────────────
var toastTimer;
function showToast(title, msg) {
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastMsg').textContent   = msg;
  var t = document.getElementById('reminderToast');
  t.style.display = 'flex';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { t.style.display = 'none'; }, 5000);
}
document.getElementById('closeToast').addEventListener('click', function() {
  document.getElementById('reminderToast').style.display = 'none';
});

// ── End Day ───────────────────────────────────────────────────────────────────
document.getElementById('endDayBtn').addEventListener('click', function() {
  var tx = db.transaction("blocks", "readonly");
  tx.objectStore("blocks").index("date").getAll(todayStr()).onsuccess = function(e) {
    var blocks = e.target.result;
    var total  = blocks.length;
    var done   = blocks.filter(function(b) { return b.status === 'completed'; }).length;
    var pct    = total > 0 ? Math.round(done / total * 100) : 0;
    var focusMins = 0;
    blocks.filter(function(b) { return b.status === 'completed'; }).forEach(function(b) {
      focusMins += toMins(b.endTime) - toMins(b.startTime);
    });
    var hrs  = Math.floor(focusMins / 60);
    var mins = focusMins % 60;
    var timeStr = hrs > 0 ? hrs + 'h ' + mins + 'm' : mins + 'm';

    var emoji, title, message;
    if (total === 0) {
      emoji = '📋'; title = 'Ready for Tomorrow?';
      message = 'No blocks were scheduled today. Deep work starts with a plan \u2014 even one focused block a day creates momentum.';
    } else if (pct === 100) {
      emoji = '🏆'; title = 'Perfect Day!';
      message = 'You completed all ' + total + ' block' + (total !== 1 ? 's' : '') + ' \u2014 that\'s ' + timeStr + ' of pure deep work. This is how exceptional work gets done.';
    } else if (pct >= 70) {
      emoji = '💪'; title = 'Strong Effort!';
      message = done + ' of ' + total + ' blocks done \u2014 ' + timeStr + ' of focused time earned. Consistency like this compounds into extraordinary results.';
    } else if (pct >= 40) {
      emoji = '🌱'; title = 'Good Start';
      message = done + ' of ' + total + ' blocks completed. ' + timeStr + ' of deep work is meaningful progress. Tomorrow, protect your first block ruthlessly.';
    } else {
      emoji = '🔄'; title = "Tomorrow's a Fresh Start";
      message = 'Life happens. ' + (focusMins > 0 ? 'You still logged ' + timeStr + ' of deep work.' : 'Planning itself is the first step.') + ' Show up tomorrow and protect your time.';
    }

    document.getElementById('modalEmoji').textContent   = emoji;
    document.getElementById('modalTitle').textContent   = title;
    document.getElementById('modalMessage').textContent = message;
    document.getElementById('modalStats').innerHTML =
      '<div class="modal-stat"><span>' + done + '/' + total + '</span><label>Blocks Done</label></div>'
      + '<div class="modal-stat"><span>' + (timeStr || '0m') + '</span><label>Deep Focus</label></div>'
      + '<div class="modal-stat"><span>' + pct + '%</span><label>Completion</label></div>';
    document.getElementById('summaryModal').style.display = 'flex';
  };
});

document.getElementById('closeModal').addEventListener('click', function() {
  document.getElementById('summaryModal').style.display = 'none';
});
document.getElementById('summaryModal').addEventListener('click', function(e) {
  if (e.target === this) this.style.display = 'none';
});

// ── Hamburger ─────────────────────────────────────────────────────────────────
var hamburger = document.getElementById('hamburger');
var navlinks  = document.getElementById('navlinks');

hamburger.addEventListener('click', function(e) {
  e.stopPropagation();
  hamburger.classList.toggle('active');
  navlinks.classList.toggle('active');
});

navlinks.querySelectorAll('a').forEach(function(link) {
  link.addEventListener('click', function() {
    hamburger.classList.remove('active');
    navlinks.classList.remove('active');
  });
});

document.addEventListener('click', function(e) {
  if (!navlinks.contains(e.target) && !hamburger.contains(e.target)) {
    hamburger.classList.remove('active');
    navlinks.classList.remove('active');
  }
});

// ── Theme ─────────────────────────────────────────────────────────────────────
if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');
