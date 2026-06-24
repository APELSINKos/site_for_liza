// Episode 2 — "Пикник с рисованием".
// Self-contained: no karaoke, no sunset, no music, no achievement. Unlocked by a
// secret phrase (checked server-side in the Worker) and launched via Episode2.start().
//
// Talks to the rest of the app through window.AppFlow (exposed by app.js):
//   AppFlow.show(id)          switch the active .screen
//   AppFlow.pauseAudio()      stop the track (Episode 2 is silent)
//   AppFlow.deactivateSkies() pause the canvas starfields
//   AppFlow.setCurrentEp(ep)  so "change date" on the mystery screen targets ep2
//   AppFlow.finishEpisode2()  save done -> return to the mystery screen
//   AppFlow.backToMystery()   return to the mystery screen without saving
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var MONTHS_NOM = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
  var MONTHS_GEN = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  var DOW = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
  var RESPAWN_MS = 14000; // "со временем вылезет только одно"

  var el = {
    screen: $("episode2"),
    toastsBottom: $("ep2Toasts"),
    toastsTop: $("ep2ToastsTop"),
    picker: $("ep2Picker"),
    pickerScrim: $("ep2PickerScrim"),
    pickClose: $("ep2PickClose"),
    title: $("ep2PickTitle"),
    cal: $("ep2Cal"),
    confirm: $("ep2PickConfirm"),
    hint: $("ep2PickHint"),
    hamburger: $("hamburger"),
    replayBack: $("replayBack")
  };

  var EP = null;
  var mode = "initial";
  var completed = false;
  var active = false;        // toast cycle running
  var live = [];             // [{ node, group }]
  var spawnTimer = null;

  var view = new Date(); view.setDate(1);
  var selectedDate = null;

  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function formatISO(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function formatHuman(d) { return d.getDate() + " " + MONTHS_GEN[d.getMonth()] + " " + d.getFullYear(); }
  function findEp2() {
    var list = window.EPISODES || [];
    for (var i = 0; i < list.length; i++) if (list[i].kind === "picnic") return list[i];
    return list[1] || list[0] || { id: "ep2", kind: "picnic", fbPath: "episodes/ep2", icon: "🧺", label: "Пикник", notifyDatePrefix: "Пикник запланирован:" };
  }
  function epPath() { return "devices/" + window.Store.uid() + "/" + EP.fbPath; }
  function af(name) { return window.AppFlow && window.AppFlow[name]; }

  // ---- Toasts ------------------------------------------------------------
  // The lone toast sits bottom-right; when it's closed two appear — one
  // bottom-right and one top-right. Close both and one comes back after a delay.
  function makeToast(group, pos) {
    var t = document.createElement("div");
    t.className = "ep2-toast";
    t.setAttribute("data-group", group);
    t.innerHTML =
      '<button class="ep2-toast-x" type="button" aria-label="Закрыть">×</button>' +
      '<span class="ep2-toast-title">🎨 Требуется обучение в искусстве</span>' +
      '<span class="ep2-toast-sub">оплата круассанами с кофейком ☕🥐</span>' +
      '<span class="ep2-toast-cta">нажми, чтобы выбрать дату →</span>';
    var item = { node: t, group: group };
    t.querySelector(".ep2-toast-x").addEventListener("click", function (e) {
      e.stopPropagation();
      closeToast(item);
    });
    t.addEventListener("click", function () { openPicker("initial"); });
    (pos === "top" ? el.toastsTop : el.toastsBottom).appendChild(t);
    requestAnimationFrame(function () { t.classList.add("is-in"); });
    return item;
  }

  function spawn(group, pos) {
    if (!active) return;
    live.push(makeToast(group, pos));
  }
  function spawnLone() { spawn("lone", "bottom"); }
  function spawnPair() { spawn("pair", "bottom"); setTimeout(function () { spawn("pair", "top"); }, 220); }
  function scheduleLone() {
    clearTimeout(spawnTimer);
    spawnTimer = setTimeout(function () { spawnLone(); }, RESPAWN_MS);
  }

  function detach(node) {
    node.classList.remove("is-in");
    node.classList.add("is-out");
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 520);
  }

  function closeToast(item) {
    var idx = live.indexOf(item);
    if (idx === -1) return;
    live.splice(idx, 1);
    detach(item.node);
    if (item.group === "lone") {
      // Closing the lone notification spawns two more straight away.
      spawnPair();
    } else if (live.length === 0) {
      // Both of the pair are gone -> only one comes back, with a delay.
      scheduleLone();
    }
  }

  function clearAllToasts() {
    clearTimeout(spawnTimer);
    for (var i = 0; i < live.length; i++) detach(live[i].node);
    live = [];
  }

  // ---- Date picker -------------------------------------------------------
  function renderCal() {
    var y = view.getFullYear(), m = view.getMonth();
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var first = new Date(y, m, 1);
    var startDow = (first.getDay() + 6) % 7;
    var daysIn = new Date(y, m + 1, 0).getDate();

    var html = '<div class="ep2-cal-head">' +
      '<button class="ep2-nav" data-nav="-1" type="button" aria-label="Назад">‹</button>' +
      '<span class="ep2-month">' + MONTHS_NOM[m] + " " + y + "</span>" +
      '<button class="ep2-nav" data-nav="1" type="button" aria-label="Вперёд">›</button>' +
      '</div><div class="ep2-grid">';
    for (var d = 0; d < 7; d++) html += '<div class="ep2-dow">' + DOW[d] + "</div>";
    for (var b = 0; b < startDow; b++) html += '<div class="ep2-day is-empty"></div>';
    for (var day = 1; day <= daysIn; day++) {
      var cur = new Date(y, m, day);
      var cls = "ep2-day";
      if (cur < today) cls += " is-past";
      if (cur.getTime() === today.getTime()) cls += " is-today";
      if (selectedDate && formatISO(selectedDate) === formatISO(cur)) cls += " is-selected";
      html += '<div class="' + cls + '" data-day="' + day + '">' + day + "</div>";
    }
    html += "</div>";
    el.cal.innerHTML = html;

    Array.prototype.forEach.call(el.cal.querySelectorAll(".ep2-nav"), function (btn) {
      btn.addEventListener("click", function () {
        view.setMonth(view.getMonth() + parseInt(btn.getAttribute("data-nav"), 10));
        renderCal();
      });
    });
    Array.prototype.forEach.call(el.cal.querySelectorAll(".ep2-day[data-day]"), function (cell) {
      if (cell.classList.contains("is-past")) return;
      cell.addEventListener("click", function () {
        selectedDate = new Date(y, m, parseInt(cell.getAttribute("data-day"), 10));
        el.hint.textContent = "";
        renderCal();
        updateConfirm();
      });
    });
  }

  function updateConfirm() {
    el.confirm.classList.toggle("is-shown", !!selectedDate);
  }

  function openPicker(m) {
    mode = m || "initial";
    active = false;
    clearAllToasts();

    if (mode === "change") {
      EP = EP || findEp2();
      if (af("setCurrentEp")) window.AppFlow.setCurrentEp(EP);
      showScreen();
    }

    selectedDate = null;
    view = new Date(); view.setDate(1);
    el.title.textContent = mode === "change" ? "Выбрать другую дату" : "Когда устроим пикник?";
    el.confirm.classList.remove("is-shown");
    el.hint.textContent = "выбери день";
    renderCal();

    el.picker.classList.add("is-open");
    el.picker.setAttribute("aria-hidden", "false");
  }

  function closePickerImmediate() {
    el.picker.classList.remove("is-open");
    el.picker.setAttribute("aria-hidden", "true");
  }

  function closePicker() {
    closePickerImmediate();
    if (mode === "change") {
      if (af("backToMystery")) window.AppFlow.backToMystery();
    } else {
      active = true;
      clearTimeout(spawnTimer);
      spawnTimer = setTimeout(spawnLone, 800);
    }
  }

  function confirm() {
    if (!selectedDate) return;
    var iso = formatISO(selectedDate);
    var rec = { date: iso, state: "completed", uid: window.Store.uid(), ts: Date.now() };
    window.Store.write(epPath(), rec);
    try {
      window.sendTelegram((EP.notifyDatePrefix || "Пикник запланирован:") + " " + iso + " (" + formatHuman(selectedDate) + ")");
    } catch (e) {}

    completed = true;
    active = false;
    clearAllToasts();
    closePickerImmediate();
    if (af("finishEpisode2")) window.AppFlow.finishEpisode2();
  }

  // ---- Screen control ----------------------------------------------------
  function showScreen() {
    if (af("deactivateSkies")) window.AppFlow.deactivateSkies();
    if (af("show")) window.AppFlow.show("episode2");
    if (el.hamburger) el.hamburger.hidden = true;
    if (el.replayBack) el.replayBack.hidden = true;
  }

  function start(ep) {
    EP = ep || findEp2();
    completed = false;
    mode = "initial";
    if (af("pauseAudio")) window.AppFlow.pauseAudio();
    if (af("setCurrentEp")) window.AppFlow.setCurrentEp(EP);
    closePickerImmediate();
    clearAllToasts();
    showScreen();
    active = true;
    clearTimeout(spawnTimer);
    spawnTimer = setTimeout(function () { spawnLone(); }, 1300);
  }

  // ---- Wiring ------------------------------------------------------------
  if (el.pickClose) el.pickClose.addEventListener("click", closePicker);
  if (el.pickerScrim) el.pickerScrim.addEventListener("click", closePicker);
  if (el.confirm) el.confirm.addEventListener("click", confirm);

  window.Episode2 = { start: start, openPicker: openPicker };
})();
