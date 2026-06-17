(function () {
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function StarSky(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.opts = Object.assign({ architecture: false, shooting: false, density: 1, interactive: true }, opts || {});
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.stars = [];
    this.sparks = [];
    this.pointer = { x: -9999, y: -9999, active: false };
    this.shoot = null;
    this.statueGlow = 0;
    this.boom = null;
    this.boomMax = 0;
    this.smoke = null;
    this.active = false;
    this.raf = null;
    this.W = 0; this.H = 0;
    this.skyline = null;
    this._loop = this._loop.bind(this);
    this._bind();
    this.resize();
  }

  StarSky.prototype._bind = function () {
    var self = this;
    if (this.opts.interactive) {
      var move = function (e) {
        var r = self.canvas.getBoundingClientRect();
        var p = e.touches ? e.touches[0] : e;
        self.pointer.x = p.clientX - r.left;
        self.pointer.y = p.clientY - r.top;
        self.pointer.active = true;
      };
      var leave = function () { self.pointer.active = false; self.pointer.x = -9999; self.pointer.y = -9999; };
      this.canvas.addEventListener("pointermove", move, { passive: true });
      this.canvas.addEventListener("pointerdown", move, { passive: true });
      this.canvas.addEventListener("pointerleave", leave, { passive: true });
      this.canvas.addEventListener("touchmove", move, { passive: true });
      this.canvas.addEventListener("touchend", leave, { passive: true });
    }
    this._onResize = function () { self.resize(); };
    window.addEventListener("resize", this._onResize, { passive: true });
    window.addEventListener("orientationchange", this._onResize, { passive: true });
  };

  StarSky.prototype.resize = function () {
    var w = this.canvas.clientWidth || window.innerWidth;
    var h = this.canvas.clientHeight || window.innerHeight;
    this.W = w; this.H = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.archH = this.opts.architecture ? Math.min(h * 0.34, 240) : 0;
    this.statueH = Math.min(h * 0.3, 210);
    this.statueX = w * 0.6;
    this.statueTop = { x: this.statueX, y: h - this.statueH };

    if (this.opts.targetEl && this.opts.targetEl.getBoundingClientRect) {
      var tr = this.opts.targetEl.getBoundingClientRect();
      var cr = this.canvas.getBoundingClientRect();
      if (tr.width > 0 && tr.height > 0) {
        this.statueX = tr.left - cr.left + tr.width * 0.5;
        this.statueTop = { x: this.statueX, y: tr.top - cr.top + Math.max(8, tr.height * 0.08) };
        this.statueH = tr.height;
      }
    }

    var count = clamp(Math.round((w * h) / 14000 * this.opts.density), 28, 140);
    var starTopLimit = h - this.archH - 6;
    this.stars = [];
    for (var i = 0; i < count; i++) {
      this.stars.push({
        x: rand(0, w),
        y: rand(0, Math.max(40, starTopLimit)),
        r: rand(0.5, 1.7),
        a: rand(0.25, 0.9),
        tw: rand(0, Math.PI * 2),
        tws: rand(0.6, 1.8),
        vx: rand(-0.05, 0.05),
        vy: rand(-0.04, 0.04)
      });
    }
    this.linkDist = clamp(Math.min(w, h) * 0.16, 80, 150);

    if (this.opts.architecture) this._buildSkyline(w, h);
  };

  StarSky.prototype.setActive = function (on) {
    this.active = on;
    if (on && !this.raf) this.raf = requestAnimationFrame(this._loop);
    if (!on && this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
  };

  StarSky.prototype.triggerShoot = function (delay) {
    var self = this;
    setTimeout(function () {
      var sx = rand(self.W * 0.15, self.W * 0.5);
      var sy = rand(self.H * 0.06, self.H * 0.2);
      var tx = self.statueTop.x + rand(-6, 6);
      var ty = self.statueTop.y + rand(-2, 6);
      var cx = (sx + tx) / 2 + rand(-self.W * 0.1, self.W * 0.05);
      var cy = Math.min(sy, ty) - rand(self.H * 0.12, self.H * 0.22);
      self.shoot = {
        sx: sx, sy: sy, cx: cx, cy: cy, tx: tx, ty: ty,
        p: 0, dur: rand(2200, 2800), t0: 0, spin: 0, tail: []
      };
    }, delay || 0);
  };

  StarSky.prototype._spawnSparks = function (x, y) {
    for (var i = 0; i < 26; i++) {
      var ang = rand(0, Math.PI * 2);
      var sp = rand(0.6, 3.4);
      this.sparks.push({
        x: x, y: y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 0.6,
        life: 1, r: rand(0.8, 2.2)
      });
    }
  };

  StarSky.prototype._loop = function (ts) {
    if (!this.active) return;
    var ctx = this.ctx, W = this.W, H = this.H;
    ctx.clearRect(0, 0, W, H);

    for (var i = 0; i < this.stars.length; i++) {
      var s = this.stars[i];
      s.x += s.vx; s.y += s.vy;
      if (s.x < -4) s.x = W + 4; if (s.x > W + 4) s.x = -4;
      if (s.y < -4) s.y = (H - this.archH); if (s.y > H - this.archH) s.y = -4;
      var tw = 0.55 + 0.45 * Math.sin((ts || 0) * 0.001 * s.tws + s.tw);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,247,235," + (s.a * tw).toFixed(3) + ")";
      ctx.fill();
    }

    ctx.lineWidth = 1;
    for (var a = 0; a < this.stars.length; a++) {
      var p1 = this.stars[a];
      for (var b = a + 1; b < this.stars.length; b++) {
        var p2 = this.stars[b];
        var dx = p1.x - p2.x, dy = p1.y - p2.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < this.linkDist) {
          var al = (1 - d / this.linkDist) * 0.22;
          ctx.strokeStyle = "rgba(180,210,190," + al.toFixed(3) + ")";
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        }
      }
      if (this.pointer.active) {
        var pdx = p1.x - this.pointer.x, pdy = p1.y - this.pointer.y;
        var pd = Math.sqrt(pdx * pdx + pdy * pdy);
        var pr = this.linkDist * 1.3;
        if (pd < pr) {
          var pal = (1 - pd / pr) * 0.4;
          ctx.strokeStyle = "rgba(168,213,176," + pal.toFixed(3) + ")";
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(this.pointer.x, this.pointer.y); ctx.stroke();
        }
      }
    }

    if (this.opts.architecture) this._drawCity(ctx, W, H);

    if (this.shoot) this._updateShoot(ctx, ts);

    if (this.smoke && this.smoke.length) {
      for (var sm = this.smoke.length - 1; sm >= 0; sm--) {
        var pf = this.smoke[sm];
        pf.x += pf.vx; pf.y += pf.vy; pf.vy -= 0.004; pf.r += pf.grow; pf.life -= 0.012;
        if (pf.life <= 0) { this.smoke.splice(sm, 1); continue; }
        var sa = pf.life * 0.16;
        var sg = ctx.createRadialGradient(pf.x, pf.y, 0, pf.x, pf.y, pf.r);
        sg.addColorStop(0, "rgba(46,34,52," + sa.toFixed(3) + ")");
        sg.addColorStop(1, "rgba(46,34,52,0)");
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(pf.x, pf.y, pf.r, 0, Math.PI * 2); ctx.fill();
      }
    }

    if (this.boom) {
      var bm = this.boom;
      if (!bm.t0) bm.t0 = ts;
      var bp = (ts - bm.t0) / bm.dur;
      if (bp >= 1) { this.boom = null; }
      else {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        var eo = 1 - Math.pow(1 - bp, 2);
        var fbR = Math.max(1, this.boomMax * 0.6 * eo), fa = Math.pow(1 - bp, 1.6);
        var fg = ctx.createRadialGradient(bm.x, bm.y, 0, bm.x, bm.y, fbR);
        fg.addColorStop(0, "rgba(255,255,255," + (0.95 * fa).toFixed(3) + ")");
        fg.addColorStop(0.3, "rgba(255,228,150," + (0.8 * fa).toFixed(3) + ")");
        fg.addColorStop(0.6, "rgba(255,150,70," + (0.55 * fa).toFixed(3) + ")");
        fg.addColorStop(1, "rgba(200,40,30,0)");
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(bm.x, bm.y, fbR, 0, Math.PI * 2); ctx.fill();
        var flash = Math.max(0, 1 - bp * 7);
        if (flash > 0) {
          var flR = this.boomMax * 0.55;
          var flg = ctx.createRadialGradient(bm.x, bm.y, 0, bm.x, bm.y, flR);
          flg.addColorStop(0, "rgba(255,255,255," + (0.9 * flash).toFixed(3) + ")");
          flg.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = flg; ctx.beginPath(); ctx.arc(bm.x, bm.y, flR, 0, Math.PI * 2); ctx.fill();
        }
        for (var ri = 0; ri < 3; ri++) {
          var rp = (bp - ri * 0.11) / (1 - ri * 0.11);
          if (rp > 0 && rp < 1) {
            var rr = this.boomMax * (0.45 + 0.32 * ri) * rp;
            ctx.strokeStyle = "rgba(255,220,170," + ((1 - rp) * 0.6).toFixed(3) + ")";
            ctx.lineWidth = 3 * (1 - rp) + 0.5;
            ctx.beginPath(); ctx.arc(bm.x, bm.y, rr, 0, Math.PI * 2); ctx.stroke();
          }
        }
        ctx.restore();
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var k = this.sparks.length - 1; k >= 0; k--) {
      var sp = this.sparks[k];
      var ox = sp.x, oy = sp.y;
      sp.x += sp.vx; sp.y += sp.vy; sp.vy += (sp.g != null ? sp.g : 0.06); sp.vx *= 0.99;
      sp.life -= (sp.decay != null ? sp.decay : 0.018);
      if (sp.life <= 0) { this.sparks.splice(k, 1); continue; }
      var av = Math.max(0, Math.min(1, sp.life));
      var fl = av * (0.7 + 0.3 * Math.sin((ts || 0) * 0.05 + sp.x));
      var col = sp.col || "rgba(255,221,160,";
      ctx.strokeStyle = col + (fl * 0.5).toFixed(3) + ")";
      ctx.lineWidth = Math.max(0.5, sp.r * av);
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(sp.x, sp.y); ctx.stroke();
      ctx.fillStyle = col + fl.toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(sp.x, sp.y, Math.max(0.4, sp.r * av), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    if (this.statueGlow > 0) this.statueGlow = Math.max(0, this.statueGlow - 0.006);

    this.raf = requestAnimationFrame(this._loop);
  };

  StarSky.prototype._updateShoot = function (ctx, ts) {
    var sh = this.shoot;
    if (!sh.t0) sh.t0 = ts;
    sh.p = clamp((ts - sh.t0) / sh.dur, 0, 1);
    var p = sh.p, q = 1 - p;
    var x = q * q * sh.sx + 2 * q * p * sh.cx + p * p * sh.tx;
    var y = q * q * sh.sy + 2 * q * p * sh.cy + p * p * sh.ty;
    sh.spin += 0.5;

    sh.tail.push({ x: x, y: y });
    if (sh.tail.length > 18) sh.tail.shift();
    for (var i = 0; i < sh.tail.length; i++) {
      var t = sh.tail[i], al = (i / sh.tail.length) * 0.5;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 1.6 * (i / sh.tail.length), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,230,180," + al.toFixed(3) + ")";
      ctx.fill();
    }

    this._drawSparkle(ctx, x, y, 7 + Math.sin(sh.spin) * 1.5, sh.spin);

    if (p >= 1) {
      this._explode(sh.tx, sh.ty);
      this.shoot = null;
    }
  };

  StarSky.prototype._explode = function (x, y) {
    var cols = ["rgba(255,240,200,", "rgba(255,200,120,", "rgba(255,140,70,", "rgba(168,213,176,", "rgba(255,255,255,"];
    for (var i = 0; i < 90; i++) {
      var ang = rand(0, Math.PI * 2), sp = rand(1, 8.5);
      this.sparks.push({
        x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 1.2,
        life: rand(0.7, 1), r: rand(0.8, 2.8), g: rand(0.05, 0.12), decay: rand(0.012, 0.026),
        col: cols[(Math.random() * cols.length) | 0]
      });
    }
    for (var j = 0; j < 16; j++) {
      var a2 = rand(0, Math.PI * 2), s2 = rand(8, 15);
      this.sparks.push({
        x: x, y: y, vx: Math.cos(a2) * s2, vy: Math.sin(a2) * s2 - 1,
        life: rand(0.4, 0.7), r: rand(0.6, 1.4), g: 0.04, decay: 0.04, col: "rgba(255,245,210,"
      });
    }
    this.smoke = this.smoke || [];
    for (var m = 0; m < 12; m++) {
      this.smoke.push({
        x: x + rand(-12, 12), y: y + rand(-8, 8),
        vx: rand(-0.5, 0.5), vy: rand(-1.1, -0.3),
        r: rand(6, 16), grow: rand(0.25, 0.6), life: rand(0.7, 1)
      });
    }
    this.boom = { x: x, y: y, t0: 0, dur: 1100 };
    this.boomMax = Math.min(this.W, this.H) * 0.5;
    this.statueGlow = 1;
  };

  StarSky.prototype._drawSparkle = function (ctx, x, y, r, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    var grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
    grd.addColorStop(0, "rgba(255,255,255,0.95)");
    grd.addColorStop(0.4, "rgba(255,221,160,0.6)");
    grd.addColorStop(1, "rgba(255,221,160,0)");
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    for (var i = 0; i < 4; i++) {
      var a = (Math.PI / 2) * i;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(a + Math.PI / 4) * r * 0.32, Math.sin(a + Math.PI / 4) * r * 0.32);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  StarSky.prototype._buildSkyline = function (w, h) {
    var R = makeRng(20260615);
    var base = h;
    var maxH = Math.min(h * 0.34, 240);

    var far = [], fx = -12;
    while (fx < w + 12) {
      var fw = 16 + R() * 30;
      var fh = (0.16 + R() * 0.30) * maxH;
      far.push({ x: fx, w: fw, h: fh });
      fx += fw + R() * 8;
    }

    var mid = [], windows = [], mx = -10;
    while (mx < w + 10) {
      var mw = 24 + R() * 50;
      var mh = (0.34 + R() * 0.5) * maxH;
      var pitched = R() > 0.55;
      mid.push({ x: mx, w: mw, h: mh, pitched: pitched });
      if (mh > maxH * 0.42) {
        var cols = Math.max(1, Math.floor(mw / 13));
        var rows = Math.max(2, Math.floor(mh / 17));
        for (var c = 0; c < cols; c++) for (var r = 0; r < rows; r++) {
          if (R() > 0.80) {
            windows.push({
              x: mx + 5 + c * (mw - 9) / Math.max(1, cols),
              y: base - mh + 8 + r * (mh - 12) / Math.max(1, rows),
              a: 0.22 + R() * 0.5
            });
          }
        }
      }
      mx += mw + 2 + R() * 9;
    }

    this.skyline = {
      base: base, maxH: maxH, far: far, mid: mid, windows: windows,
      dome: { x: w * (0.18 + R() * 0.08), r: Math.min(w * 0.075, 48) },
      tower: { x: w * (0.80 + R() * 0.05), w: Math.min(w * 0.035, 22), h: maxH * (0.98 + R() * 0.18) }
    };
    this.colon = { left: w * 0.03, right: w * 0.33, top: base - Math.min(h * 0.21, 158), n: 6 };
  };

  function silGrad(ctx, topY, bottomY) {
    var g = ctx.createLinearGradient(0, topY, 0, bottomY);
    g.addColorStop(0, "#06040d");
    g.addColorStop(1, "#1c1126");
    return g;
  }

  StarSky.prototype._drawCity = function (ctx, W, H) {
    var sk = this.skyline; if (!sk) return;
    var base = H, maxH = sk.maxH;

    var haze = ctx.createLinearGradient(0, base - maxH * 0.85, 0, base);
    haze.addColorStop(0, "rgba(255,150,110,0)");
    haze.addColorStop(1, "rgba(255,150,110,0.12)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, base - maxH * 0.85, W, maxH * 0.85);

    ctx.fillStyle = "rgba(20,13,30,0.55)";
    for (var i = 0; i < sk.far.length; i++) {
      var f = sk.far[i];
      ctx.fillRect(f.x, base - f.h, f.w, f.h);
    }

    ctx.fillStyle = silGrad(ctx, base - maxH, base);
    for (var m = 0; m < sk.mid.length; m++) {
      var b = sk.mid[m];
      ctx.fillRect(b.x, base - b.h, b.w, b.h);
      if (b.pitched) {
        ctx.beginPath();
        ctx.moveTo(b.x - 1, base - b.h);
        ctx.lineTo(b.x + b.w / 2, base - b.h - Math.min(16, b.w * 0.34));
        ctx.lineTo(b.x + b.w + 1, base - b.h);
        ctx.closePath(); ctx.fill();
      }
    }

    var d = sk.dome, dH = maxH * 0.52;
    ctx.fillStyle = silGrad(ctx, base - dH - d.r, base);
    ctx.fillRect(d.x - d.r, base - dH, d.r * 2, dH);
    ctx.beginPath(); ctx.arc(d.x, base - dH, d.r, Math.PI, 0); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(d.x - 3.5, base - dH - d.r + 2);
    ctx.lineTo(d.x, base - dH - d.r - 13);
    ctx.lineTo(d.x + 3.5, base - dH - d.r + 2);
    ctx.closePath(); ctx.fill();

    var t = sk.tower;
    ctx.fillStyle = silGrad(ctx, base - t.h, base);
    ctx.fillRect(t.x - t.w / 2, base - t.h, t.w, t.h);
    ctx.beginPath();
    ctx.moveTo(t.x - t.w / 2 - 1, base - t.h);
    ctx.lineTo(t.x, base - t.h - t.w * 1.2);
    ctx.lineTo(t.x + t.w / 2 + 1, base - t.h);
    ctx.closePath(); ctx.fill();

    for (var wi = 0; wi < sk.windows.length; wi++) {
      var wd = sk.windows[wi];
      ctx.fillStyle = "rgba(255,198,128," + wd.a.toFixed(2) + ")";
      ctx.fillRect(wd.x, wd.y, 1.6, 2.6);
    }

    this._drawColonnade(ctx, H);

    this._drawStatue(ctx, this.statueX, base, this.statueH);

    ctx.strokeStyle = "rgba(255,162,116,0.28)";
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, base - 0.6); ctx.lineTo(W, base - 0.6); ctx.stroke();

    if (this.statueGlow > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      var g = ctx.createRadialGradient(this.statueTop.x, this.statueTop.y + this.statueH * 0.3, 4,
        this.statueTop.x, this.statueTop.y + this.statueH * 0.3, this.statueH * 0.8);
      var gi = this.statueGlow;
      g.addColorStop(0, "rgba(255,228,170," + (0.5 * gi).toFixed(3) + ")");
      g.addColorStop(1, "rgba(255,228,170,0)");
      ctx.fillStyle = g;
      ctx.fillRect(this.statueTop.x - this.statueH, this.statueTop.y - 10, this.statueH * 2, this.statueH + 20);
      ctx.restore();
    }
  };

  StarSky.prototype._drawColonnade = function (ctx, H) {
    var base = H, c = this.colon;
    var span = c.right - c.left;
    var colW = Math.max(8, span / (c.n * 2.2));
    var top = c.top;

    ctx.fillStyle = silGrad(ctx, top - 50, base);

    ctx.fillRect(c.left - colW, base - 9, span + colW * 2, 9);
    ctx.fillRect(c.left - colW * 0.6, base - 15, span + colW * 1.2, 7);

    for (var i = 0; i < c.n; i++) {
      var cx = c.left + (span / (c.n - 1)) * i;
      ctx.beginPath();
      ctx.moveTo(cx - colW * 0.5, base - 15);
      ctx.lineTo(cx - colW * 0.4, top + 8);
      ctx.lineTo(cx + colW * 0.4, top + 8);
      ctx.lineTo(cx + colW * 0.5, base - 15);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(cx - colW * 0.62, top + 4, colW * 1.24, 6);
    }

    ctx.fillRect(c.left - colW * 0.72, top - 8, span + colW * 1.44, 12);
    ctx.beginPath();
    ctx.moveTo(c.left - colW * 0.72, top - 8);
    ctx.lineTo((c.left + c.right) / 2, top - 8 - Math.min(48, span * 0.17));
    ctx.lineTo(c.right + colW * 0.72, top - 8);
    ctx.closePath(); ctx.fill();
  };

  StarSky.prototype._drawStatue = function (ctx, cx, baseY, sh) {
    var pedH = sh * 0.22, figH = sh * 0.78, top = baseY - sh;
    ctx.fillStyle = silGrad(ctx, top, baseY);

    var pedW = sh * 0.32;
    ctx.fillRect(cx - pedW / 2, baseY - pedH, pedW, pedH);
    ctx.fillRect(cx - pedW * 0.62, baseY - pedH, pedW * 1.24, 6);
    ctx.fillRect(cx - pedW * 0.66, baseY - 7, pedW * 1.32, 7);

    var figBottom = baseY - pedH;
    var headR = figH * 0.072;
    var headCy = top + headR * 1.1;

    ctx.beginPath();
    ctx.ellipse(cx + figH * 0.008, headCy, headR * 0.8, headR, 0, 0, Math.PI * 2);
    ctx.fill();

    var shoulderY = headCy + headR * 1.15;
    var shoulderW = figH * 0.135;
    var waistY = top + figH * 0.5;
    var waistW = figH * 0.082;
    var hipY = top + figH * 0.62;
    var hipW = figH * 0.118;
    ctx.beginPath();
    ctx.moveTo(cx - shoulderW, shoulderY);
    ctx.quadraticCurveTo(cx - shoulderW * 1.04, waistY, cx - waistW, waistY);
    ctx.quadraticCurveTo(cx - hipW, hipY, cx - hipW * 0.7, hipY);
    ctx.quadraticCurveTo(cx - hipW * 0.5, figBottom - figH * 0.04, cx - figH * 0.045, figBottom);
    ctx.lineTo(cx - figH * 0.004, figBottom);
    ctx.quadraticCurveTo(cx - figH * 0.01, hipY + figH * 0.06, cx, hipY);
    ctx.quadraticCurveTo(cx + figH * 0.02, hipY + figH * 0.08, cx + figH * 0.05, figBottom);
    ctx.lineTo(cx + figH * 0.092, figBottom);
    ctx.quadraticCurveTo(cx + hipW * 0.7, hipY, cx + hipW, hipY);
    ctx.quadraticCurveTo(cx + waistW * 1.1, waistY, cx + waistW, waistY);
    ctx.quadraticCurveTo(cx + shoulderW * 1.04, waistY, cx + shoulderW, shoulderY);
    ctx.quadraticCurveTo(cx + shoulderW * 1.16, shoulderY + figH * 0.12, cx + shoulderW * 0.9, waistY);
    ctx.quadraticCurveTo(cx + shoulderW, shoulderY + figH * 0.02, cx + shoulderW * 0.4, shoulderY);
    ctx.lineTo(cx - shoulderW * 0.4, shoulderY);
    ctx.closePath();
    ctx.fill();
  };

  StarSky.prototype.destroy = function () {
    this.setActive(false);
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("orientationchange", this._onResize);
  };

  window.StarSky = StarSky;
})();
