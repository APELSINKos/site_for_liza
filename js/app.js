(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    intro: $("intro"), vinyl: $("vinyl"),
    playToggle: $("playToggle"), muteToggle: $("muteToggle"),
    karaoke: $("karaoke"), continueBtn: $("continueBtn"), startVeil: $("startVeil"),
    kxRing: $("kxRing"), archImg: $("archImg"),
    scene: $("scene"), skyBase: document.querySelector("#scene .sky-base"),
    stars: $("stars"), inviteText: document.querySelector("#scene .invite-text"),
    greenBtn: $("greenBtn"), redBtn: $("redBtn"), sceneActions: $("sceneActions"),
    datepicker: $("datepicker"), stars2: $("stars2"), dpTitle: $("dpTitle"), dpCalendar: $("dpCalendar"),
    dpHint: $("dpHint"), dpWish: $("dpWish"), wishInput: $("wishInput"), dpConfirm: $("dpConfirm"), dpBack: $("dpBack"),
    mystery: $("mystery"), stars3: $("stars3"), changeDateBtn: $("changeDateBtn"), addWishBtn: $("addWishBtn"),
    hamburger: $("hamburger"), drawer: $("drawer"), drawerScrim: $("drawerScrim"), replayBack: $("replayBack"), addWishDrawer: $("addWishDrawer"),
    menuDates: $("menuDates"), menuWishes: $("menuWishes"), menuAch: $("menuAchievements"), menuHistory: $("menuHistory"),
    achievement: $("achievement"), achIcon: $("achIcon"), achTitle: $("achTitle"),
    track: $("track"), pling: $("pling")
  };

  var MONTHS_NOM = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
  var MONTHS_GEN = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  var DOW = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

  var currentEp = window.EPISODES[0];
  var replayMode = false;
  var audioStarted = false;
  var karaokeRAF = null;
  var centerLines = [];
  var sceneSky = null, dpSky = null, mysterySky = null;

  function setVH() { document.documentElement.style.setProperty("--vh", window.innerHeight + "px"); }
  setVH();
  window.addEventListener("resize", setVH, { passive: true });
  window.addEventListener("orientationchange", setVH, { passive: true });

  function show(id) {
    var screens = document.querySelectorAll(".screen");
    for (var i = 0; i < screens.length; i++) screens[i].classList.toggle("is-active", screens[i].id === id);
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function formatISO(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function formatHuman(d) { return d.getDate() + " " + MONTHS_GEN[d.getMonth()] + " " + d.getFullYear(); }
  function humanFromISO(iso) {
    var p = (iso || "").split("-"); if (p.length !== 3) return iso || "";
    return parseInt(p[2], 10) + " " + MONTHS_GEN[parseInt(p[1], 10) - 1] + " " + p[0];
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function fadeAudio(a, to, ms) {
    var from = a.volume, t0 = performance.now();
    (function step(now) { var p = Math.min(1, (now - t0) / ms); a.volume = from + (to - from) * p; if (p < 1) requestAnimationFrame(step); })(t0);
  }

  function notifyVisit() {
    try {
      if (sessionStorage.getItem("visit")) return;
      sessionStorage.setItem("visit", "1");
    } catch (e) {}
    var d = new Date();
    var lines = [
      "Заход на сайт",
      "Время: " + d.toLocaleString("ru-RU"),
      "Устройство: " + (navigator.userAgent || "?"),
      "Экран: " + (window.screen ? (screen.width + "x" + screen.height) : "?"),
      "Язык: " + (navigator.language || "?"),
      "Откуда: " + (document.referrer || "напрямую")
    ];
    try { window.sendTelegram(lines.join("\n")); } catch (e) {}
  }

  function epPath(ep) { return "devices/" + window.Store.uid() + "/" + ep.fbPath; }
  function wishPath() { return "devices/" + window.Store.uid() + "/wishes"; }

  function applyEpisode(ep) {
    if (el.inviteText) el.inviteText.textContent = ep.card;
    if (el.greenBtn) el.greenBtn.textContent = ep.greenBtn;
    if (el.redBtn) el.redBtn.textContent = ep.redBtn;
  }

  function buildKaraoke() {
    el.karaoke.innerHTML = "";
    centerLines = [];
    (window.CHORUS || []).forEach(function (txt) {
      var ln = document.createElement("span");
      ln.className = "kc-line";
      var words = txt.split(/\s+/), spans = [];
      words.forEach(function (w, i) {
        var sp = document.createElement("span");
        sp.className = "kcw";
        sp.textContent = w;
        ln.appendChild(sp);
        if (i < words.length - 1) ln.appendChild(document.createTextNode(" "));
        spans.push(sp);
      });
      el.karaoke.appendChild(ln);
      centerLines.push({ el: ln, words: spans });
    });
  }

  function splitHalf(text) {
    var w = String(text).trim().split(/\s+/);
    var m = Math.ceil(w.length / 2);
    return [w.slice(0, m).join(" "), w.slice(m).join(" ")];
  }

  function prepArch() {
    var img = el.archImg; if (!img) return;
    img.addEventListener("load", function () { if (sceneSky) sceneSky.resize(); });
    var raw = new Image();
    raw.onload = function () {
      try {
        var c = document.createElement("canvas");
        c.width = raw.naturalWidth; c.height = raw.naturalHeight;
        var x = c.getContext("2d");
        x.drawImage(raw, 0, 0);
        var d = x.getImageData(0, 0, c.width, c.height), p = d.data;
        for (var i = 0; i < p.length; i += 4) {
          var mn = Math.min(p[i], p[i + 1], p[i + 2]);
          if (mn >= 238) p[i + 3] = 0;
          else if (mn > 210) p[i + 3] = Math.round(p[i + 3] * (238 - mn) / 28);
        }
        x.putImageData(d, 0, 0);
        var minX = c.width, minY = c.height, maxX = 0, maxY = 0, found = false;
        for (var y = 0; y < c.height; y++) {
          for (var xx = 0; xx < c.width; xx++) {
            if (p[(y * c.width + xx) * 4 + 3] > 12) {
              found = true;
              if (xx < minX) minX = xx; if (xx > maxX) maxX = xx;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
        }
        if (found) {
          var cc = document.createElement("canvas");
          cc.width = maxX - minX + 1; cc.height = maxY - minY + 1;
          cc.getContext("2d").putImageData(d, -minX, -minY);
          img.src = cc.toDataURL("image/png");
        } else {
          img.src = c.toDataURL("image/png");
        }
      } catch (e) {}
      if (sceneSky) sceneSky.resize();
    };
    raw.src = "arch.jpg";
  }

  function resetKaraoke() {
    for (var i = 0; i < centerLines.length; i++) {
      var ws = centerLines[i].words;
      for (var j = 0; j < ws.length; j++) ws[j].className = "kcw";
    }
    if (el.kxRing) el.kxRing.innerHTML = "";
    el.continueBtn.classList.remove("is-shown");
  }

  function startKaraokeLoop() {
    if (karaokeRAF) cancelAnimationFrame(karaokeRAF);
    var song = window.SONG || [];
    if (!song.length || !centerLines.length) return;
    var off = window.LYRIC_OFFSET || 0;
    var firstT = song[0].t;
    var lastEntry = null;

    var ringChars = [];
    var ringWordCount = 0;
    var lastC = -2, lastCW = -2, lastRW = -2;

    function activeIndex(ct) {
      for (var i = 0; i < song.length; i++) {
        var s = song[i].t, nt = (i + 1 < song.length) ? song[i + 1].t : s + 4;
        if (ct >= s && ct < Math.min(nt, s + 4.5)) return i;
      }
      return -1;
    }
    function wordCls(i, aw) { return i < aw ? "kcw is-sung" : (i === aw ? "kcw is-active" : "kcw"); }

    function paintCenter(activeC, aw, wf) {
      if (activeC !== lastC || aw !== lastCW) {
        lastC = activeC; lastCW = aw;
        for (var k = 0; k < centerLines.length; k++) {
          var on = (k === activeC);
          centerLines[k].el.classList.toggle("is-active", on);
          var ws = centerLines[k].words;
          for (var i = 0; i < ws.length; i++) ws[i].className = on ? wordCls(i, aw) : "kcw";
        }
      }
      if (activeC >= 0 && aw >= 0) {
        var awe = centerLines[activeC].words[aw];
        if (awe) awe.style.setProperty("--wf", ((wf || 0) * 100).toFixed(1) + "%");
      }
    }

    function buildRing(text) {
      var r = el.kxRing.getBoundingClientRect();
      var cx = r.width / 2, cy = r.height / 2, radius = r.width / 2 + 14;
      el.kxRing.innerHTML = "";
      ringChars = [];
      var words = text.split(/\s+/);
      ringWordCount = words.length;
      var seq = [];
      words.forEach(function (w, wi) {
        for (var c = 0; c < w.length; c++) seq.push({ ch: w[c], w: wi });
        if (wi < words.length - 1) seq.push({ ch: " ", w: -1 });
      });
      var n = seq.length, span = Math.max(60, Math.min(170, n * 7)), start = 270 - span / 2;
      seq.forEach(function (cc, i) {
        var ang = start + span * (n > 1 ? i / (n - 1) : 0.5), rad = ang * Math.PI / 180;
        var sp = document.createElement("span");
        sp.className = "krc";
        sp.textContent = cc.ch;
        sp.style.left = (cx + radius * Math.cos(rad)) + "px";
        sp.style.top = (cy + radius * Math.sin(rad)) + "px";
        sp.setAttribute("data-base", "translate(-50%,-50%) rotate(" + (ang + 90) + "deg)");
        sp.style.transform = sp.getAttribute("data-base");
        el.kxRing.appendChild(sp);
        ringChars.push({ el: sp, w: cc.w });
      });
    }
    function paintRing(aw) {
      if (aw === lastRW) return;
      lastRW = aw;
      for (var i = 0; i < ringChars.length; i++) {
        var rc = ringChars[i], base = rc.el.getAttribute("data-base");
        rc.el.className = rc.w < 0 ? "krc" : (rc.w < aw ? "krc is-sung" : (rc.w === aw ? "krc is-active" : "krc"));
        rc.el.style.transform = base + (rc.w === aw ? " scale(1.2)" : "");
      }
    }
    function clearRing() { if (ringChars.length) { el.kxRing.innerHTML = ""; ringChars = []; } ringWordCount = 0; lastRW = -2; }

    function frame() {
      var ct = (el.track.currentTime || 0) + off;
      var idx = activeIndex(ct);
      if (idx < 0) {
        paintCenter(-1, -1, 0);
        if (lastEntry) { clearRing(); lastEntry = null; }
        el.karaoke.classList.add("is-idle");
      } else {
        el.karaoke.classList.remove("is-idle");
        var e = song[idx];
        var nt = (idx + 1 < song.length) ? song[idx + 1].t : e.t + 4;
        var dur = Math.max(0.4, Math.min(nt, e.t + 4.5) - e.t);
        var raw = Math.max(0, Math.min(1, (ct - e.t) / dur));
        if (e !== lastEntry) {
          if (e.s != null) buildRing(e.s); else clearRing();
          lastEntry = e; lastC = -2; lastCW = -2; lastRW = -2;
        }
        if (e.c != null) {
          var fill = 1 - Math.pow(1 - raw, 1.6);
          var nf = centerLines[e.c].words.length;
          var pos = fill * nf;
          var aw = Math.max(0, Math.min(nf - 1, Math.floor(pos)));
          paintCenter(e.c, aw, Math.max(0, Math.min(1, pos - aw)));
        } else {
          paintCenter(-1, -1, 0);
          paintRing(Math.max(0, Math.min(ringWordCount - 1, Math.floor(raw * ringWordCount))));
        }
      }
      if (ct >= firstT) el.continueBtn.classList.add("is-shown");
      karaokeRAF = requestAnimationFrame(frame);
    }
    karaokeRAF = requestAnimationFrame(frame);
  }
  function stopKaraokeLoop() { if (karaokeRAF) { cancelAnimationFrame(karaokeRAF); karaokeRAF = null; } }

  function startAudio() {
    if (audioStarted) return;
    try { el.track.muted = false; document.body.classList.remove("is-muted"); } catch (e) {}
    try { el.track.volume = 0; } catch (e) {}
    var pr;
    try { pr = el.track.play(); } catch (e) { pr = null; }
    if (pr && typeof pr.then === "function") pr.then(onPlaySuccess).catch(onPlayBlocked);
    else if (!el.track.paused) onPlaySuccess();
    else onPlayBlocked();
  }
  function onPlaySuccess() {
    if (audioStarted) return;
    audioStarted = true;
    teardownAudioArm();
    clearTimeout(el._audioFallback);
    fadeAudio(el.track, 0.55, 1400);
    el.vinyl.classList.add("is-playing");
    document.body.classList.add("is-playing-audio");
    startKaraokeLoop();
    hideVeil();
  }
  function onPlayBlocked() {
    if (audioStarted) return;
    showVeil();
    armAudioStart();
    clearTimeout(el._audioFallback);
    el._audioFallback = setTimeout(function () {
      if (!audioStarted) { hideVeil(); el.continueBtn.classList.add("is-shown"); }
    }, 4000);
  }
  var _audioArmed = false;
  function _armHandler() { if (!audioStarted) startAudio(); }
  function armAudioStart() {
    if (_audioArmed) return;
    _audioArmed = true;
    document.addEventListener("pointerdown", _armHandler, true);
    document.addEventListener("touchend", _armHandler, true);
    el.track.addEventListener("canplay", _armHandler);
    el.track.addEventListener("loadeddata", _armHandler);
  }
  function teardownAudioArm() {
    if (!_audioArmed) return;
    _audioArmed = false;
    document.removeEventListener("pointerdown", _armHandler, true);
    document.removeEventListener("touchend", _armHandler, true);
    el.track.removeEventListener("canplay", _armHandler);
    el.track.removeEventListener("loadeddata", _armHandler);
  }
  function afterPlay() { onPlaySuccess(); }
  function hideVeil() { el.startVeil.classList.add("is-hidden"); }
  function showVeil() { el.startVeil.classList.remove("is-hidden"); }

  function wireIntroControls() {
    el.startVeil.addEventListener("click", startAudio);
    el.playToggle.addEventListener("click", function () {
      if (!audioStarted) { startAudio(); return; }
      if (el.track.paused) {
        el.track.play().catch(function () {});
        el.vinyl.classList.add("is-playing");
        document.body.classList.add("is-playing-audio");
        startKaraokeLoop();
      } else {
        el.track.pause();
        el.vinyl.classList.remove("is-playing");
        document.body.classList.remove("is-playing-audio");
      }
    });
    el.muteToggle.addEventListener("click", function () {
      el.track.muted = !el.track.muted;
      document.body.classList.toggle("is-muted", el.track.muted);
    });
    el.continueBtn.addEventListener("click", goToScene);
  }

  function enterIntro(opts) {
    replayMode = !!(opts && opts.replay);
    applyEpisode(currentEp);
    resetKaraoke();
    el.vinyl.classList.remove("is-playing");
    document.body.classList.remove("is-playing-audio");
    deactivateAllSkies();
    show("intro");
    if (replayMode) {
      el.replayBack.hidden = false;
      el.hamburger.hidden = true;
      audioStarted = false;
      try { el.track.muted = false; } catch (e) {}
      document.body.classList.remove("is-muted");
      try { el.track.pause(); el.track.currentTime = 0; } catch (e) {}
      startAudio();
    } else {
      audioStarted = false;
      showVeil();
    }
  }

  function goToScene() {
    stopKaraokeLoop();
    show("scene");
    if (el.skyBase) requestAnimationFrame(function () { el.skyBase.classList.add("is-ready"); });
    if (!sceneSky) sceneSky = new window.StarSky(el.stars, { architecture: false, shooting: true, density: 1, targetEl: el.archImg });
    sceneSky.resize();
    sceneSky.setActive(true);
    sceneSky.triggerShoot(1700);
    resetRedButton();
  }

  function deactivateAllSkies() {
    if (sceneSky) sceneSky.setActive(false);
    if (dpSky) dpSky.setActive(false);
    if (mysterySky) mysterySky.setActive(false);
  }

  function resetRedButton() {
    el.redBtn.classList.remove("is-fixed");
    el.redBtn.style.removeProperty("--rx");
    el.redBtn.style.removeProperty("--ry");
    el.redBtn.style.removeProperty("--rr");
  }
  function fleeFrom(px, py) {
    var vw = window.innerWidth, vh = window.innerHeight;
    var margin = 70, best = null, bestD = -1;
    for (var i = 0; i < 8; i++) {
      var cx = margin + Math.random() * (vw - margin * 2);
      var cy = vh * 0.18 + Math.random() * (vh * 0.66);
      var d = Math.hypot(cx - px, cy - py);
      if (d > bestD) { bestD = d; best = { x: cx, y: cy }; }
    }
    var anchorX = vw * 0.5, anchorY = vh * 0.72;
    el.redBtn.style.setProperty("--rx", (best.x - anchorX).toFixed(0) + "px");
    el.redBtn.style.setProperty("--ry", (best.y - anchorY).toFixed(0) + "px");
    el.redBtn.style.setProperty("--rr", (Math.random() * 24 - 12).toFixed(0) + "deg");
  }
  function wireEscape() {
    var armed = false;
    function arm() { if (!armed) { armed = true; el.redBtn.classList.add("is-fixed"); } }
    function dodge(x, y) { arm(); fleeFrom(x, y); }
    el.redBtn.addEventListener("pointerenter", function (e) { dodge(e.clientX, e.clientY); });
    el.redBtn.addEventListener("pointerdown", function (e) { e.preventDefault(); dodge(e.clientX, e.clientY); });
    el.redBtn.addEventListener("touchstart", function (e) { e.preventDefault(); var t = e.touches[0]; dodge(t.clientX, t.clientY); }, { passive: false });
    el.redBtn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); });
    function proximity(x, y) {
      if (!armed) return;
      var r = el.redBtn.getBoundingClientRect();
      var d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
      if (d < 130) fleeFrom(x, y);
    }
    el.scene.addEventListener("pointermove", function (e) { proximity(e.clientX, e.clientY); }, { passive: true });
    el.scene.addEventListener("touchmove", function (e) { if (e.touches[0]) proximity(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    el._disarmEscape = function () { armed = false; };
  }

  function wireGreen() { el.greenBtn.addEventListener("click", onGreen); }
  function onGreen() {
    showAchievement(currentEp.achievement);
    playPling();
    if (!replayMode && currentEp.notifyClick) window.sendTelegram(currentEp.notifyClick);
    setTimeout(function () { openDatePicker("initial"); }, 1000);
  }
  function showAchievement(ach) {
    el.achIcon.textContent = (ach && ach.icon) || "🌸";
    el.achTitle.textContent = "«" + ((ach && ach.title) || "Начало?") + "»";
    el.achievement.classList.add("is-shown");
    el.achievement.setAttribute("aria-hidden", "false");
    clearTimeout(el._achTimer);
    el._achTimer = setTimeout(function () {
      el.achievement.classList.remove("is-shown");
      el.achievement.setAttribute("aria-hidden", "true");
    }, 4600);
  }
  function playPling() { try { el.pling.currentTime = 0; el.pling.play().catch(function () {}); } catch (e) {} }

  var dpView = new Date(); dpView.setDate(1);
  var dpSelected = null;
  var dpMode = "initial";

  function openDatePicker(mode) {
    dpMode = mode || "initial";
    if (el._disarmEscape) el._disarmEscape();
    if (dpMode === "add") {
      el.dpTitle.textContent = "Куда сходим?";
      el.dpHint.textContent = "выбери день и напиши, куда хочется";
      el.dpWish.hidden = false; el.wishInput.value = "";
      el.dpConfirm.textContent = "Отправить";
    } else if (dpMode === "change") {
      el.dpTitle.textContent = "Выбрать другую дату";
      el.dpHint.textContent = "выбери новый день";
      el.dpWish.hidden = true;
      el.dpConfirm.textContent = "Сохранить дату";
    } else {
      el.dpTitle.textContent = currentEp.datePrompt;
      el.dpHint.textContent = "выбери день, который тебе подходит";
      el.dpWish.hidden = true;
      el.dpConfirm.textContent = "Подтвердить";
    }
    el.dpBack.hidden = (dpMode === "initial");
    dpView = new Date(); dpView.setDate(1);
    dpSelected = null;
    renderCalendar();
    deactivateAllSkies();
    if (!dpSky) dpSky = new window.StarSky(el.stars2, { architecture: false, density: 0.8 });
    dpSky.resize(); dpSky.setActive(true);
    show("datepicker");
  }

  function renderCalendar() {
    var y = dpView.getFullYear(), m = dpView.getMonth();
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var first = new Date(y, m, 1);
    var startDow = (first.getDay() + 6) % 7;
    var daysIn = new Date(y, m + 1, 0).getDate();

    var html = '<div class="dp-head">' +
      '<button class="dp-nav" data-nav="-1" type="button" aria-label="Назад">‹</button>' +
      '<span class="dp-month">' + MONTHS_NOM[m] + " " + y + "</span>" +
      '<button class="dp-nav" data-nav="1" type="button" aria-label="Вперёд">›</button>' +
      "</div><div class=\"dp-grid\">";
    for (var d = 0; d < 7; d++) html += '<div class="dp-dow">' + DOW[d] + "</div>";
    for (var b = 0; b < startDow; b++) html += '<div class="dp-day is-empty"></div>';
    for (var day = 1; day <= daysIn; day++) {
      var cur = new Date(y, m, day);
      var cls = "dp-day";
      if (cur < today) cls += " is-past";
      if (cur.getTime() === today.getTime()) cls += " is-today";
      if (dpSelected && formatISO(dpSelected) === formatISO(cur)) cls += " is-selected";
      html += '<div class="' + cls + '" data-day="' + day + '">' + day + "</div>";
    }
    html += "</div>";
    el.dpCalendar.innerHTML = html;

    Array.prototype.forEach.call(el.dpCalendar.querySelectorAll(".dp-nav"), function (btn) {
      btn.addEventListener("click", function () { dpView.setMonth(dpView.getMonth() + parseInt(btn.getAttribute("data-nav"), 10)); renderCalendar(); });
    });
    Array.prototype.forEach.call(el.dpCalendar.querySelectorAll(".dp-day[data-day]"), function (cell) {
      if (cell.classList.contains("is-past")) return;
      cell.addEventListener("click", function () { dpSelected = new Date(y, m, parseInt(cell.getAttribute("data-day"), 10)); renderCalendar(); });
    });
    updateConfirmState();
  }
  function updateConfirmState() { el.dpConfirm.classList.toggle("is-shown", !!dpSelected); }

  function finalizeDate(date) {
    var iso = formatISO(date);

    if (dpMode === "add") {
      var place = (el.wishInput.value || "").trim();
      var wts = Date.now();
      window.Store.write(wishPath() + "/w_" + wts, { date: iso, place: place, ts: wts });
      window.sendTelegram("Добавлена встреча: " + (place ? place + " — " : "") + iso + " (" + formatHuman(date) + ")");
      if (dpSky) dpSky.setActive(false);
      setTimeout(function () { enterMystery(); refreshMenus(false); }, 650);
      return;
    }

    if (dpMode === "change") {
      window.Store.update(epPath(currentEp), { date: iso, ts: Date.now() });
      window.sendTelegram("Дата изменена: " + iso + " (" + formatHuman(date) + ")");
      if (dpSky) dpSky.setActive(false);
      setTimeout(function () { enterMystery(); refreshMenus(false); }, 650);
      return;
    }

    if (!replayMode) {
      var rec = { date: iso, state: "completed", achievement: currentEp.achievement.title, uid: window.Store.uid(), ts: Date.now() };
      window.Store.write(epPath(currentEp), rec);
      window.sendTelegram((currentEp.notifyDatePrefix || "Date:") + " " + iso + " (" + formatHuman(date) + ")");
    }
    if (dpSky) dpSky.setActive(false);
    setTimeout(function () { enterMystery(); refreshMenus(true); }, 700);
  }

  function enterMystery() {
    deactivateAllSkies();
    if (!mysterySky) mysterySky = new window.StarSky(el.stars3, { architecture: false, density: 0.7 });
    mysterySky.resize(); mysterySky.setActive(true);
    show("mystery");
    el.replayBack.hidden = true;
    el.hamburger.hidden = false;
    if (el.addWishBtn) {
      el.addWishBtn.classList.remove("is-magic");
      void el.addWishBtn.offsetWidth;
      el.addWishBtn.classList.add("is-magic");
      setTimeout(function () { el.addWishBtn.classList.remove("is-magic"); }, 2200);
    }
  }

  function wireDrawer() {
    el.hamburger.addEventListener("click", function () { el.drawer.classList.add("is-open"); el.drawer.setAttribute("aria-hidden", "false"); });
    el.drawerScrim.addEventListener("click", closeDrawer);
  }
  function closeDrawer() { el.drawer.classList.remove("is-open"); el.drawer.setAttribute("aria-hidden", "true"); }

  function refreshMenus(reveal) {
    window.Store.read(wishPath()).then(function (ws) {
      var arr = ws ? Object.keys(ws).map(function (k) { return ws[k]; }) : [];
      arr.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
      el.menuWishes.innerHTML = arr.length
        ? arr.map(function (w) { return "<li>" + escapeHtml(humanFromISO(w.date)) + (w.place ? " — " + escapeHtml(w.place) : "") + "</li>"; }).join("")
        : '<li class="muted">пока пусто</li>';
    });

    Promise.all(window.EPISODES.map(function (ep) {
      return window.Store.read(epPath(ep)).then(function (s) { return { ep: ep, state: s }; });
    })).then(function (list) {
      var done = list.filter(function (x) { return x.state && x.state.state === "completed"; });

      el.menuDates.innerHTML = done.length
        ? done.map(function (x) { return "<li>" + escapeHtml(humanFromISO(x.state.date)) + "</li>"; }).join("")
        : '<li class="muted">пока пусто</li>';

      el.menuAch.innerHTML = done.length
        ? done.map(function (x) { return "<li>" + escapeHtml((x.ep.achievement && x.ep.achievement.icon) || "🌸") + " «" + escapeHtml(x.state.achievement || "") + "»</li>"; }).join("")
        : '<li class="muted">пока пусто</li>';

      el.menuHistory.innerHTML = done.length
        ? done.map(function (x, i) {
            return '<li data-ep="' + escapeHtml(x.ep.id) + '" data-num="' + (i + 1) + '" data-when="' + escapeHtml(humanFromISO(x.state.date)) + '">' +
              '<div class="hist-top"><span class="hist-ep">Эпизод ' + (i + 1) + "</span>" +
              '<span class="hist-badge">' + escapeHtml((x.ep.achievement && x.ep.achievement.icon) || "🌸") + " «" + escapeHtml(x.state.achievement || "") + "»</span></div>" +
              '<span class="muted">' + escapeHtml(humanFromISO(x.state.date)) + "</span>" +
              '<span class="hist-replay">↻ нажми, чтобы пережить заново</span></li>';
          }).join("")
        : '<li class="muted">пока пусто</li>';

      Array.prototype.forEach.call(el.menuHistory.querySelectorAll("[data-ep]"), function (li) {
        li.addEventListener("click", function () {
          var id = li.getAttribute("data-ep");
          var ep = window.EPISODES.filter(function (e2) { return e2.id === id; })[0] || window.EPISODES[0];
          closeDrawer();
          window.sendTelegram("Открыта история: Эпизод " + (li.getAttribute("data-num") || "?") + " (" + (li.getAttribute("data-when") || "") + ")");
          currentEp = ep;
          enterIntro({ replay: true });
        });
      });

      if (reveal && done.length) {
        el.hamburger.hidden = false;
        requestAnimationFrame(function () { el.hamburger.classList.add("is-shown"); });
      }
    });
  }

  function init() {
    notifyVisit();
    buildKaraoke();
    prepArch();
    wireIntroControls();
    wireEscape();
    wireGreen();
    wireDrawer();
    el.dpConfirm.addEventListener("click", function () { if (dpSelected) finalizeDate(dpSelected); });
    el.dpBack.addEventListener("click", function () { enterMystery(); });
    el.changeDateBtn.addEventListener("click", function () { openDatePicker("change"); });
    el.addWishBtn.addEventListener("click", function () { openDatePicker("add"); });
    el.addWishDrawer.addEventListener("click", function () { closeDrawer(); openDatePicker("add"); });
    el.replayBack.addEventListener("click", function () { replayMode = false; stopKaraokeLoop(); enterMystery(); });

    window.Store.read(epPath(currentEp)).then(function (state) {
      if (state && state.state === "completed") {
        enterMystery();
        refreshMenus(true);
      } else {
        enterIntro({ replay: false });
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
