(function () {
  "use strict";
  var SIM = window.SIM; if (!SIM) return;
  var reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;

  /* ================= i18n ================= */
  var EN = {
    brand: "Air-defense interceptor sim", nav_detail: "Technical detail",
    kick: "Try it yourself",
    title: "Intercept the incoming drone yourself",
    lead: "A short-range air-defense missile can only change course by pushing sideways. Use the joystick below to steer it into the drone.",
    joyhint2: "or use the keyboard", knob: "steer",
    g_ready_t: "Ready?", g_ready_p: "Push the joystick left and right to guide the missile toward the drone. Get inside the kill radius to score a hit.",
    g_start: "Launch",
    g_note: "An educational simulation to see the physics and control, not a combat tool. The evasive drone turns at random.",
    ex_h: "How did it go?",
    ex_p1: "Harder than it looks. The missile is fast, the drone is small and jinks suddenly. Because a human hand struggles to hit it, real interceptors chase the target on their own using a guidance rule called <b>proportional navigation</b>.",
    ex_b1: "proportional navigation",
    ex_p2: "This project implements that automatic guidance in a 2D physics engine, then studies how to choose the missile's design values (how much sideways force, in which direction, and how sensitive the guidance) to hit best.",
    ex_p3: "That is the whole idea. If you want more, scroll down for the guided trajectories and the experiment results.",
    tline: "Technical detail below · for the curious",
    pb_h: "When automatic guidance flies it",
    pb_sub: "Trajectories flown by proportional navigation instead of a person. Compare an optimized design against one with too little sideways force.",
    lg_m: "Missile", lg_d: "Drone", lg_t: "Thrust / detonation",
    res_h: "Comparing the optimizers",
    res_sub: "Four methods minimize the same objective (weighted sum of intercept time, fuel and accuracy). Operating point: a drone evading at 7g, 250 m detection, response delays included. Lower is better.",
    sw_h: "The least force needed to hit",
    sw_sub: "The harder the drone evades and the earlier it is detected, the more force is required. 'X' marks conditions where this small missile (≤300N) struggles to reach 90% hits, which appeared once realistic delays were added.",
    sw_t1: "Min sideways force [N] · at 90% hit rate", sw_x: "← detection range [m] →",
    sw_i1t: "Force decides it", sw_i1: "Required force grows from <code>125N to 300N</code> with the conditions. What governs the hit is how much sideways force the missile can produce.",
    sw_i2t: "Out of reach", sw_i2: "With response delay, a drone evading at 9g is mostly hard to hit for a missile of this class. That ceiling was invisible under idealized instant control.",
    how_h: "How it works",
    how_sub: "It moves by Newtonian rigid-body dynamics, is guided by proportional navigation, and four methods search the design against one objective.",
    m_pn_t: "Proportional navigation", m_pn: "Accelerate in proportion to how fast the target slides across the line of sight <code>a = N·Vc·λ̇</code>, produced by the sideways force. Sensitivity N is a design value.",
    m_obj_t: "What is minimized", m_obj: "A weighted sum <code>J = time + fuel + miss distance</code>. Since evasion is random, each design is scored over 8 runs.",
    m_gg_t: "Grid · gradient", m_gg: "Grid tries every combination (slow but sure). Gradient descends along the slope: fast, but can get stuck in local optima.",
    m_gp_t: "Genetic · reinforcement learning", m_gp: "The genetic algorithm breeds and mutates better designs. PPO learns to steer by trial and error, with no guidance rule.",
    fd_h: "What the experiment showed",
    fd1t: "The genetic algorithm was the most efficient.", fd1: "It reached the lowest objective and fuel with a fifth of grid's evaluations. Gradient over-allocated force and used more fuel; reinforcement learning learned to intercept but lacked terminal precision.",
    fd2t: "The design conclusion depended on missile size.", fd2: "On a large supersonic missile the position of the sideways thruster decided the hit, but on this slow, small class the force itself dominates, so position only affected fuel.",
    fd3t: "The drone's survival was set by speed, not agility.", fd3: "A slow drone cannot get far in the short terminal window no matter how hard it turns. The decisive variables were the drone's speed limit and the missile's force.",
    fd4t: "The numbers came from real specifications.", fd4: "Mass, speed and warhead follow public data for a small counter-drone interceptor; delays follow standard guidance and attitude time constants; evasion follows real drone ranges. The physics is checked by 23 automated tests.",
    ft_desc: "A 2D short-range air-defense interception simulator. A Python physics engine computes the trajectories replayed in the browser, and the game at the top is steered live. Personal research portfolio.",
    // game runtime
    r_time: "time", r_dist: "range", r_spd: "speed",
    hit_t: "Hit", hit_p: "You intercepted the drone. Real guidance does this automatically, every time.",
    miss_t: "Missed", miss_p: "The drone slipped past. This is exactly why automatic guidance exists.",
    retry: "Try again",
    p_time: "time", p_spd: "missile", p_thr: "thrust", p_rng: "range",
  };
  var lang = "ko";
  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-k]").forEach(function (el) {
      if (el.dataset.ko == null) el.dataset.ko = el.innerHTML;
      var v = (lang === "en") ? EN[el.dataset.k] : null;
      el.innerHTML = (v != null) ? v : el.dataset.ko;
    });
    refreshTabs(); if (GAME) GAME.relabel();
  }
  function T(k, ko) { return lang === "en" ? (EN[k] || ko) : ko; }
  document.querySelectorAll(".langtog button").forEach(function (b) {
    b.addEventListener("click", function () {
      lang = b.dataset.lang;
      document.querySelectorAll(".langtog button").forEach(function (x) { x.classList.toggle("on", x === b); });
      applyLang();
    });
  });

  function fit(cv) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = cv.getBoundingClientRect(), ctx = cv.getContext("2d");
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: r.width, h: r.height, ctx: ctx };
  }
  function tri(ctx, x, y, s, ang, col) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-ang); ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * .72, s * .62); ctx.lineTo(-s * .72, -s * .62);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  /* ================= INTERACTIVE GAME ================= */
  var GAME = (function () {
    var cv = document.getElementById("game"); if (!cv) return null;
    var ghud = document.getElementById("ghud"), banner = document.getElementById("gbanner");
    var startBtn = document.getElementById("startbtn"), joy = document.getElementById("joy"),
      knob = document.getElementById("knob");
    var WD = 1000, HT = 560, ctx, W, H, scale, ox, oy;
    var state = "ready", steer = 0, keySteer = 0, dragSteer = 0;
    var m, drone, mtrail, dtrail, tElapsed, blast;

    function resize() { var f = fit(cv); ctx = f.ctx; W = f.w; H = f.h;
      scale = Math.min(W / WD, H / HT); ox = (W - WD * scale) / 2; oy = (H - HT * scale) / 2; draw(); }
    function SX(x) { return ox + x * scale; } function SY(y) { return oy + (HT - y) * scale; }
    function SR(r) { return r * scale; }

    function reset() {
      m = { x: 90, y: 70, ang: 0.9, spd: 430 };
      drone = { x: 940, y: 430, vx: -150, vy: -10, adir: 0, at: 0 };
      mtrail = []; dtrail = []; tElapsed = 0; blast = null;
    }
    function start() { reset(); state = "flying"; banner.classList.add("hide"); }
    function end(hit) {
      state = hit ? "hit" : "miss";
      banner.classList.remove("hide");
      banner.innerHTML = '<div class="result ' + (hit ? "hit" : "miss") + '">' +
        (hit ? T("hit_t", "명중!") : T("miss_t", "놓쳤습니다")) + '</div>' +
        '<p>' + (hit ? T("hit_p", "드론을 요격했습니다. 실제 유도는 이 일을 자동으로, 매번 해냅니다.")
          : T("miss_p", "드론이 빠져나갔습니다. 자동 유도가 필요한 이유가 바로 이것입니다.")) + '</p>' +
        '<button class="btn res" id="retry">' + T("retry", "다시 하기") + '</button>';
      document.getElementById("retry").onclick = start;
    }
    function relabel() {
      if (state === "ready") return;
      if (state === "hit" || state === "miss") end(state === "hit");
    }

    function step(dt) {
      var u = keySteer || dragSteer;
      steer += (u - steer) * Math.min(1, dt * 12);
      // missile: constant speed, steering turns heading (bounded turn rate = divert authority)
      m.ang -= steer * 2.6 * dt;
      m.x += Math.cos(m.ang) * m.spd * dt; m.y += Math.sin(m.ang) * m.spd * dt;
      mtrail.push([m.x, m.y]); if (mtrail.length > 90) mtrail.shift();
      // drone: drift left + random evasion when missile near
      var dist = Math.hypot(m.x - drone.x, m.y - drone.y);
      var ax = -40, ay = 0;
      if (dist < 330) {
        drone.at -= dt;
        if (drone.at <= 0) { drone.adir = Math.random() * 6.283; drone.at = 0.4; }
        ax += Math.cos(drone.adir) * 1100; ay += Math.sin(drone.adir) * 1100;
      }
      drone.vx += ax * dt; drone.vy += ay * dt;
      var ds = Math.hypot(drone.vx, drone.vy), cap = 215;
      if (ds > cap) { drone.vx *= cap / ds; drone.vy *= cap / ds; }
      drone.x += drone.vx * dt; drone.y += drone.vy * dt;
      if (drone.y < 40) { drone.y = 40; drone.vy = Math.abs(drone.vy); }
      if (drone.y > HT - 30) { drone.y = HT - 30; drone.vy = -Math.abs(drone.vy); }
      dtrail.push([drone.x, drone.y]); if (dtrail.length > 90) dtrail.shift();
      tElapsed += dt;
      // outcomes
      if (dist < 28) { blast = { x: m.x, y: m.y, t: 0 }; end(true); return; }
      if (m.x < -20 || m.x > WD + 20 || m.y < -20 || m.y > HT + 20) return end(false);
      if (drone.x < 30) return end(false);
      if (tElapsed > 9) return end(false);
    }

    function trail(arr, col) {
      for (var i = 1; i < arr.length; i++) {
        ctx.strokeStyle = col + (i / arr.length * .8 + .05) + ")"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(SX(arr[i - 1][0]), SY(arr[i - 1][1]));
        ctx.lineTo(SX(arr[i][0]), SY(arr[i][1])); ctx.stroke();
      }
    }
    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      // grid
      ctx.strokeStyle = "rgba(38,35,29,.05)"; ctx.lineWidth = 1;
      for (var gx = 0; gx <= 10; gx++) { var px = SX(gx / 10 * WD); ctx.beginPath(); ctx.moveTo(px, SY(0)); ctx.lineTo(px, SY(HT)); ctx.stroke(); }
      for (var gy = 0; gy <= 6; gy++) { var py = SY(gy / 6 * HT); ctx.beginPath(); ctx.moveTo(SX(0), py); ctx.lineTo(SX(WD), py); ctx.stroke(); }
      // launcher
      ctx.fillStyle = "#8a8372"; ctx.fillRect(SX(90) - 5, SY(0) - 4, 10, 8);
      if (m) {
        // detection ring
        ctx.strokeStyle = "rgba(201,70,58,.16)"; ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.arc(SX(drone.x), SY(drone.y), SR(330), 0, 7); ctx.stroke(); ctx.setLineDash([]);
        trail(mtrail, "rgba(47,93,124,"); trail(dtrail, "rgba(201,70,58,");
        // thrust flare
        if (state === "flying" && Math.abs(steer) > .12) {
          var a = Math.min(1, Math.abs(steer)); var mx = SX(m.x), my = SY(m.y);
          var g = ctx.createRadialGradient(mx, my, 0, mx, my, 15 * a + 5);
          g.addColorStop(0, "rgba(221,148,64," + (.8 * a) + ")"); g.addColorStop(1, "rgba(221,148,64,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, 15 * a + 5, 0, 7); ctx.fill();
        }
        // drone
        ctx.fillStyle = "#c9463a"; ctx.beginPath(); ctx.arc(SX(drone.x), SY(drone.y), 6, 0, 7); ctx.fill();
        ctx.strokeStyle = "rgba(201,70,58,.35)"; ctx.beginPath(); ctx.arc(SX(drone.x), SY(drone.y), 9, 0, 7); ctx.stroke();
        // missile
        tri(ctx, SX(m.x), SY(m.y), 8, m.ang, "#2f5d7c");
        // blast
        if (blast) {
          blast.t += .06; var r = SR(28) * (1 + blast.t * 2), ex = SX(blast.x), ey = SY(blast.y);
          var bg = ctx.createRadialGradient(ex, ey, 0, ex, ey, r);
          bg.addColorStop(0, "rgba(230,169,77," + Math.max(0, .7 - blast.t) + ")"); bg.addColorStop(1, "rgba(230,169,77,0)");
          ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(ex, ey, r, 0, 7); ctx.fill();
        }
        var dist = Math.hypot(m.x - drone.x, m.y - drone.y);
        ghud.innerHTML = T("r_time", "시간") + " <b>" + tElapsed.toFixed(1) + "s</b>&nbsp;&nbsp;" +
          T("r_dist", "거리") + " <b>" + (dist * .8).toFixed(0) + "m</b>";
      }
    }

    var last = 0;
    function loop(ts) {
      var dt = last ? Math.min(.05, (ts - last) / 1000) : 0; last = ts;
      if (state === "flying") step(dt);
      if (blast && state === "hit") blast.t = blast.t; // keep animating handled in draw
      draw(); requestAnimationFrame(loop);
    }

    // input: keyboard
    addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keySteer = -1;
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keySteer = 1;
      else return;
      if (state !== "flying") start(); e.preventDefault();
    });
    addEventListener("keyup", function (e) {
      if (["ArrowLeft", "a", "A", "ArrowRight", "d", "D"].indexOf(e.key) >= 0) keySteer = 0;
    });
    // input: pointer drag (joystick + stage)
    var dragging = false, startX = 0;
    function pStart(e) { if (state !== "flying") return; dragging = true; startX = e.clientX; e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); e.preventDefault(); }
    function pMove(e) { if (!dragging) return; dragSteer = Math.max(-1, Math.min(1, (e.clientX - startX) / 52)); knob.style.transform = "translateX(" + dragSteer * 26 + "px)"; }
    function pEnd() { dragging = false; dragSteer = 0; knob.style.transform = ""; }
    joy.addEventListener("pointerdown", pStart); cv.addEventListener("pointerdown", pStart);
    addEventListener("pointermove", pMove); addEventListener("pointerup", pEnd); addEventListener("pointercancel", pEnd);
    startBtn.onclick = start;
    addEventListener("resize", resize);
    resize(); requestAnimationFrame(loop);
    if (/[?&]play/.test(location.search)) { setTimeout(function () { start(); dragSteer = 0.6; }, 300); }
    return { relabel: relabel };
  })();

  /* ================= PLAYBACK (guided replay) ================= */
  var scenarios = SIM.scenarios.filter(function (s) { return s.id !== "noguide"; });
  var cv2 = document.getElementById("cv"), pctx, PW, PH, bounds, si = 0, cur = 0, playing = true;
  var scrub = document.getElementById("scrub"), playBtn = document.getElementById("playbtn");
  var hud = document.getElementById("hud"), verdictEl = document.getElementById("verdict");

  function pbBounds(sc) {
    var f = sc.frames, minx = 0, maxx = sc.drone_x0 + 40, miny = -20, maxy = sc.drone_y0 + 50;
    for (var i = 0; i < f.length; i++) { minx = Math.min(minx, f[i][0], f[i][3]); maxx = Math.max(maxx, f[i][0], f[i][3]); miny = Math.min(miny, f[i][1], f[i][4]); maxy = Math.max(maxy, f[i][1], f[i][4]); }
    var sc2 = Math.min(1, 1);
    var wx = maxx - minx, wy = maxy - miny;
    return { minx: minx - wx * .05 - 15, maxx: maxx + wx * .05 + 15, miny: miny - wy * .1 - 12, maxy: maxy + wy * .12 + 12 };
  }
  function pResize() { var f = fit(cv2); pctx = f.ctx; PW = f.w; PH = f.h; pRender(cur); }
  function PX(x) { return (x - bounds.minx) / (bounds.maxx - bounds.minx) * PW; }
  function PY(y) { return PH - (y - bounds.miny) / (bounds.maxy - bounds.miny) * PH; }
  function PR(r) { return r / (bounds.maxx - bounds.minx) * PW; }

  function pRender(fidx) {
    if (!bounds || !pctx) return;
    var sc = scenarios[si], f = sc.frames, n = f.length, fi = Math.max(0, Math.min(n - 1, Math.round(fidx)));
    pctx.clearRect(0, 0, PW, PH);
    pctx.strokeStyle = "rgba(38,35,29,.05)"; pctx.lineWidth = 1;
    for (var gx = 0; gx <= 8; gx++) { var px = gx / 8 * PW; pctx.beginPath(); pctx.moveTo(px, 0); pctx.lineTo(px, PH); pctx.stroke(); }
    for (var gy = 0; gy <= 4; gy++) { var py = gy / 4 * PH; pctx.beginPath(); pctx.moveTo(0, py); pctx.lineTo(PW, py); pctx.stroke(); }
    if (bounds.miny < 0) { var g0 = PY(0); pctx.strokeStyle = "rgba(38,35,29,.14)"; pctx.setLineDash([5, 5]); pctx.beginPath(); pctx.moveTo(0, g0); pctx.lineTo(PW, g0); pctx.stroke(); pctx.setLineDash([]); }
    pctx.strokeStyle = "rgba(201,70,58,.15)"; pctx.setLineDash([3, 5]); pctx.beginPath(); pctx.arc(PX(sc.drone_x0), PY(sc.drone_y0), PR(sc.R_det), 0, 7); pctx.stroke(); pctx.setLineDash([]);
    pctx.fillStyle = "#8a8372"; pctx.fillRect(PX(0) - 4, PY(0) - 4, 8, 8);
    pTrail(f, fi, 0, 1, "rgba(47,93,124,"); pTrail(f, fi, 3, 4, "rgba(201,70,58,");
    var c = f[fi], mx = PX(c[0]), my = PY(c[1]);
    if (c[5] > 20) { var a = Math.min(1, c[5] / 300), g = pctx.createRadialGradient(mx, my, 0, mx, my, 15 * a + 5); g.addColorStop(0, "rgba(221,148,64," + (.8 * a) + ")"); g.addColorStop(1, "rgba(221,148,64,0)"); pctx.fillStyle = g; pctx.beginPath(); pctx.arc(mx, my, 15 * a + 5, 0, 7); pctx.fill(); }
    pctx.fillStyle = "#c9463a"; pctx.beginPath(); pctx.arc(PX(c[3]), PY(c[4]), 5, 0, 7); pctx.fill();
    tri(pctx, mx, my, 7, c[2], "#2f5d7c");
    if (sc.det_i >= 0 && fi >= sc.det_i) {
      var d = f[sc.det_i], ex = PX(d[0]), ey = PY(d[1]), col = sc.hit ? "230,169,77" : "201,70,58";
      pctx.strokeStyle = "rgba(" + col + ",.9)"; pctx.lineWidth = 2; pctx.beginPath(); pctx.arc(ex, ey, Math.max(PR(sc.R_eff), 8), 0, 7); pctx.stroke(); pctx.lineWidth = 1;
    }
    var dist = Math.hypot(c[0] - c[3], c[1] - c[4]);
    hud.innerHTML = T("p_time", "시간") + " <b>" + (fi * .02).toFixed(2) + "s</b><br>" +
      T("p_spd", "미사일") + " <b>" + c[6].toFixed(0) + " m/s</b><br>" +
      T("p_thr", "측추력") + " <b>" + c[5].toFixed(0) + " N</b><br>" +
      T("p_rng", "거리") + " <b>" + dist.toFixed(0) + " m</b>";
    if (sc.det_i >= 0 && fi >= sc.det_i) {
      verdictEl.style.display = ""; verdictEl.className = "verdict " + (sc.hit ? "hit" : "miss");
      verdictEl.textContent = (sc.hit ? "HIT" : "MISS") + " · " + sc.min_dist + "m";
    } else verdictEl.style.display = "none";
  }
  function pTrail(f, fi, ix, iy, col) {
    pctx.lineWidth = 2;
    for (var i = 1; i <= fi; i++) { pctx.strokeStyle = col + (Math.max(.08, i / fi) * .8) + ")"; pctx.beginPath(); pctx.moveTo(PX(f[i - 1][ix]), PY(f[i - 1][iy])); pctx.lineTo(PX(f[i][ix]), PY(f[i][iy])); pctx.stroke(); }
  }
  var pLast = 0, pAcc = 0;
  function pLoop(ts) {
    var n = scenarios[si].frames.length;
    if (playing && !reduce) { if (!pLast) pLast = ts; pAcc += (ts - pLast) / 1000; pLast = ts; if (pAcc * 50 >= 1) { cur += pAcc * 50; pAcc = 0; if (cur >= n + 16) cur = 0; } }
    else pLast = ts;
    var d = Math.min(cur, n - 1); scrub.value = (d / (n - 1) * 100).toFixed(1); pRender(d); requestAnimationFrame(pLoop);
  }
  function setScenario(i) {
    si = i; cur = 0; pAcc = 0; pLast = 0; bounds = pbBounds(scenarios[si]);
    document.getElementById("scndesc").textContent = lang === "en" ? scenarios[si].desc_en : scenarios[si].desc_ko;
    document.querySelectorAll(".tab").forEach(function (x, k) { x.classList.toggle("on", k === i); });
    if (reduce) { cur = scenarios[si].frames.length - 1; pRender(cur); }
  }
  var tabsEl = document.getElementById("tabs");
  scenarios.forEach(function (s, k) {
    var b = document.createElement("button"); b.className = "tab" + (k === 0 ? " on" : "");
    b.textContent = s.title_ko; b.onclick = function () { setScenario(k); playing = true; playBtn.textContent = "❚❚"; };
    tabsEl.appendChild(b);
  });
  function refreshTabs() {
    document.querySelectorAll(".tab").forEach(function (b, k) { if (scenarios[k]) b.textContent = lang === "en" ? scenarios[k].title_en : scenarios[k].title_ko; });
    var sd = document.getElementById("scndesc"); if (sd && scenarios[si]) sd.textContent = lang === "en" ? scenarios[si].desc_en : scenarios[si].desc_ko;
  }
  playBtn.onclick = function () { playing = !playing; playBtn.textContent = playing ? "❚❚" : "▶"; if (playing) pLast = 0; };
  scrub.oninput = function () { playing = false; playBtn.textContent = "▶"; var n = scenarios[si].frames.length; cur = scrub.value / 100 * (n - 1); pRender(cur); };
  addEventListener("resize", pResize);
  setScenario(0); pResize(); requestAnimationFrame(pLoop);

  /* ================= comparison + sweep ================= */
  var cmpEl = document.getElementById("cmp");
  var maxFuel = Math.max.apply(null, SIM.comparison.map(function (c) { return c.fuel; }));
  SIM.comparison.forEach(function (c) {
    var row = document.createElement("div");
    row.className = "cmp-row" + (c.win ? " win" : "") + (c.algo.indexOf("RL") === 0 ? " rl" : "");
    var jt = c.J > 5 ? c.J.toFixed(2) : c.J.toFixed(3);
    row.innerHTML = '<div class="name"><b>' + c.algo + '</b><span>' + c.evals.toLocaleString() + ' evals</span></div>' +
      '<div class="bar"><i style="width:' + (c.fuel / maxFuel * 100) + '%"></i></div>' +
      '<div class="stat"><b>J ' + jt + '</b> · hit <b>' + c.hit + '%</b> · fuel <b>' + c.fuel + '</b></div>';
    cmpEl.appendChild(row);
  });
  var heat = document.getElementById("heat"), sw = SIM.sweep;
  function heatColor(v) { var t = Math.max(0, Math.min(1, (v - 100) / 220)); return "rgb(" + Math.round(232 - t * 40) + "," + Math.round(190 - t * 90) + "," + Math.round(150 - t * 80) + ")"; }
  function hd(txt) { var d = document.createElement("div"); d.className = "hd"; d.textContent = txt; return d; }
  heat.appendChild(hd("")); sw.R.forEach(function (r) { heat.appendChild(hd(r)); });
  for (var i = sw.g.length - 1; i >= 0; i--) {
    heat.appendChild(hd(sw.g[i] + "g"));
    for (var j = 0; j < sw.R.length; j++) {
      var v = sw.reqF[i][j], cell = document.createElement("div");
      if (v == null) { cell.className = "cell x"; cell.textContent = "X"; }
      else { cell.className = "cell"; cell.style.background = heatColor(v); cell.textContent = v; }
      heat.appendChild(cell);
    }
  }

  /* reveal */
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { threshold: .12 });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  } else document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
})();
