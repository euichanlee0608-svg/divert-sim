(function () {
  "use strict";
  var SIM = window.SIM;
  if (!SIM) return;

  /* ---------- i18n ---------- */
  var I18N = {
    en: {
      nav_results: "Results", nav_how: "How", nav_findings: "Findings",
      hero_eyebrow: "Optimal control · guidance · reinforcement learning",
      hero_title: "Intercepting an evasive drone<br>with a <em>lateral thruster</em>.",
      hero_lead: "A 2D physics engine where a small proportional-navigation interceptor chases a randomly evading drone. The thruster's position, force and guidance gain are designed by four optimizers, and trajectories replay frame by frame.",
      chip1: "<b>Proportional</b> navigation", chip2: "<b>RK4</b> integration",
      chip3: "<b>4-way</b> optimizer study", chip4: "Anchored to real <b>Coyote Block 2</b>",
      chip5: "<b>Realistic</b> lag &amp; noise",
      lg_m: "Missile", lg_d: "Drone", lg_t: "Thrust / detonation",
      res_h: "Four optimizers, head to head",
      res_sub: "All minimize the same objective (weighted sum of intercept time, fuel, accuracy). Operating point: 7g evasive drone at 250 m detection, delays modeled. Lower is better (J).",
      sw_h: "Key result — minimum divert authority to hit",
      sw_sub: "As the threat (drone g × detection range) grows, more thrust is needed. 'X' marks where a Coyote-class interceptor (≤300N) physically cannot reach 90% kill — a region that appeared once realistic delays were added.",
      sw_t1: "Min divert F_max [N] · kill rate ≥ 90%", sw_x: "← detection range R_det [m] →",
      sw_i1t: "Authority governs", sw_i1: "Required thrust rises <code>125N → 300N</code> with the threat. What decides the intercept is the missile's <b>divert authority</b>.",
      sw_i2t: "Infeasible zone", sw_i2: "With lag (seeker, autopilot, attitude loop) a 9g drone is mostly un-hittable by a Coyote-class round ('X'). That ceiling vanished under idealized instant control.",
      how_h: "How it works",
      how_sub: "Physics is Newtonian rigid-body dynamics, guidance is proportional navigation, and design search pits four algorithms against one objective.",
      m_pn_t: "Proportional navigation (PN)", m_pn: "Accelerate proportionally to how fast the target slides across the line of sight: <code>a = N·Vc·λ̇</code>, realized by the thruster. Gain N is a design variable.",
      m_obj_t: "Shared objective", m_obj: "<code>J = w₁·time + w₂·fuel + w₃·miss</code>. Since evasion is random, each design is scored as an 8-run Monte Carlo average for robustness.",
      m_gg_t: "Grid · Gradient", m_gg: "Grid tries every combination (global but slow). Gradient (L-BFGS-B) descends by slope: fast, but prone to local optima and over-thrust.",
      m_gp_t: "Genetic · RL", m_gp: "The genetic algorithm breeds and mutates good designs (sample-efficient). PPO learns the thruster policy step by step, with no guidance law.",
      fd_h: "Honest findings", fd_sub: "Nothing was dressed up. The design flaws we found and fixed, and the scale-dependent conclusions, are left in.",
      fd1t: "The genetic algorithm won.", fd1: "It reached the lowest objective and least fuel with a fifth of grid's evaluations (458). Gradient over-provisioned thrust and wasted fuel; PPO learned to intercept but lacked terminal precision.",
      fd2t: "'Mount it forward' depends on scale.", fd2: "On a large supersonic missile, thruster position decided the hit. On the slow, small Coyote-class round, translational divert dominates, so position only affected <b>fuel</b>. We report that reversal as is.",
      fd3t: "Drone survival is set by speed, not peak-g.", fd3: "A slow drone cannot translate far in the brief terminal window no matter how hard it pulls. The governing variables were <b>speed cap × interceptor authority</b>, not agility.",
      fd4t: "Every assumption anchored to real specs.", fd4: "Difficulty was never forced. Mass, speed and warhead come from public Coyote Block 2 data; delays from standard guidance and attitude-loop time constants; evasion g from real drone ranges. 23 automated tests machine-prove the physics.",
      ft_desc: "2D lateral-thruster interception simulator. A Python engine (RK4, proportional navigation, Monte Carlo) computes trajectories, exports JSON, and the browser canvas replays them. Personal research portfolio.",
      ft_src: "Sources · anchoring",
      d_time: "time", d_speed: "missile", d_thrust: "thrust", d_range: "range",
    },
    ko: {
      d_time: "시간", d_speed: "미사일", d_thrust: "측추력", d_range: "표적거리",
    }
  };
  var lang = "ko";
  function t(k) {
    if (lang === "en" && I18N.en[k] != null) return I18N.en[k];
    return null; // ko uses DOM defaults
  }
  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-k]").forEach(function (el) {
      if (!el.dataset.ko) el.dataset.ko = el.innerHTML; // cache korean
      var v = t(el.dataset.k);
      el.innerHTML = (lang === "en" && v != null) ? v : el.dataset.ko;
    });
    render(cur); // refresh hud labels
  }
  document.querySelectorAll(".langtog button").forEach(function (b) {
    b.addEventListener("click", function () {
      lang = b.dataset.lang;
      document.querySelectorAll(".langtog button").forEach(function (x) { x.classList.toggle("on", x === b); });
      applyLang();
    });
  });
  function L(k) { return (lang === "en" ? I18N.en[k] : I18N.ko[k]) || I18N.en[k] || k; }

  /* ---------- canvas engine ---------- */
  var cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  var scrub = document.getElementById("scrub"), playBtn = document.getElementById("play");
  var hud = document.getElementById("hud"), verdictEl = document.getElementById("verdict");
  var scenarios = SIM.scenarios, si = 0, cur = 0, playing = true, W = 0, H = 0, DPR = 1;
  var bounds = null;

  function computeBounds(sc) {
    var f = sc.frames, minx = 0, maxx = sc.drone_x0 + 40, miny = -30, maxy = sc.drone_y0 + 60;
    for (var i = 0; i < f.length; i++) {
      minx = Math.min(minx, f[i][0], f[i][3]); maxx = Math.max(maxx, f[i][0], f[i][3]);
      miny = Math.min(miny, f[i][1], f[i][4]); maxy = Math.max(maxy, f[i][1], f[i][4]);
    }
    var padx = (maxx - minx) * 0.06 + 20, pady = (maxy - miny) * 0.12 + 20;
    return { minx: minx - padx, maxx: maxx + padx, miny: miny - pady, maxy: maxy + pady };
  }
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    var r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    render(cur);
  }
  function X(wx) { return (wx - bounds.minx) / (bounds.maxx - bounds.minx) * W; }
  function Y(wy) { return H - (wy - bounds.miny) / (bounds.maxy - bounds.miny) * H; }
  function scaleR(wr) { return wr / (bounds.maxx - bounds.minx) * W; }

  function render(frameIdx) {
    if (!bounds) return;
    var sc = scenarios[si], f = sc.frames, n = f.length;
    var fi = Math.max(0, Math.min(n - 1, Math.round(frameIdx)));
    ctx.clearRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = "rgba(255,255,255,.04)"; ctx.lineWidth = 1;
    for (var gx = 0; gx <= 8; gx++) { var px = gx / 8 * W; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke(); }
    for (var gy = 0; gy <= 4; gy++) { var py = gy / 4 * H; ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke(); }
    // ground (y=0)
    if (bounds.miny < 0) {
      var gYp = Y(0); ctx.strokeStyle = "rgba(255,255,255,.13)"; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(0, gYp); ctx.lineTo(W, gYp); ctx.stroke(); ctx.setLineDash([]);
    }
    // detection radius around drone start (faint)
    ctx.strokeStyle = "rgba(255,93,84,.16)"; ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.arc(X(sc.drone_x0), Y(sc.drone_y0), scaleR(sc.R_det), 0, 7); ctx.stroke(); ctx.setLineDash([]);

    // launch + drone-start markers
    ctx.fillStyle = "#57d38c"; tri(X(0), Y(0), 6, Math.PI / 2);
    ctx.fillStyle = "rgba(255,93,84,.5)"; ctx.fillRect(X(sc.drone_x0) - 4, Y(sc.drone_y0) - 4, 8, 8);

    // trails
    trail(f, fi, 0, 1, true);    // missile
    trail(f, fi, 3, 4, false);   // drone

    var c = f[fi], mx = X(c[0]), my = Y(c[1]), dx = X(c[3]), dy = Y(c[4]);
    // thrust flare (glow on the missile when firing)
    var F = c[5];
    if (F > 20) {
      var a = Math.min(1, F / 300);
      var g = ctx.createRadialGradient(mx, my, 0, mx, my, 16 * a + 5);
      g.addColorStop(0, "rgba(255,207,107," + (0.85 * a) + ")");
      g.addColorStop(1, "rgba(245,165,36,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, 16 * a + 5, 0, 7); ctx.fill();
    }
    // drone
    ctx.fillStyle = "#ff5d54"; ctx.beginPath(); ctx.arc(dx, dy, 5, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(255,93,84,.35)"; ctx.beginPath(); ctx.arc(dx, dy, 8, 0, 7); ctx.stroke();
    // missile (oriented triangle)
    ctx.fillStyle = "#6ba9ff"; tri(mx, my, 7, -c[2]);

    // detonation
    if (sc.det_i >= 0 && fi >= sc.det_i) {
      var d = f[sc.det_i], ex = X(d[0]), ey = Y(d[1]);
      var reff = scaleR(sc.R_eff);
      var col = sc.hit ? "245,211,107" : "255,93,84";
      var age = (fi - sc.det_i) / Math.max(1, n - sc.det_i);
      ctx.strokeStyle = "rgba(" + col + ",.9)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ex, ey, Math.max(reff, 8), 0, 7); ctx.stroke();
      var fg = ctx.createRadialGradient(ex, ey, 0, ex, ey, Math.max(reff, 10) * 1.6);
      fg.addColorStop(0, "rgba(" + col + "," + (0.5 * (1 - age)) + ")"); fg.addColorStop(1, "rgba(" + col + ",0)");
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(ex, ey, Math.max(reff, 10) * 1.6, 0, 7); ctx.fill();
      ctx.lineWidth = 1;
    }

    // HUD
    var dist = Math.hypot(c[0] - c[3], c[1] - c[4]);
    hud.innerHTML =
      L("d_time") + " <b>" + (fi * 0.02).toFixed(2) + "s</b><br>" +
      L("d_speed") + " <b>" + c[6].toFixed(0) + " m/s</b><br>" +
      L("d_thrust") + " <b>" + c[5].toFixed(0) + " N</b><br>" +
      L("d_range") + " <b>" + dist.toFixed(0) + " m</b>";
    // verdict
    if (sc.det_i >= 0 && fi >= sc.det_i) {
      verdictEl.style.display = "block";
      verdictEl.className = "verdict " + (sc.hit ? "hit" : "miss");
      verdictEl.textContent = sc.hit ? ("HIT · " + sc.min_dist + "m") :
        (sc.detonated ? ("MISS · " + sc.min_dist + "m") : "MISS · " + sc.min_dist + "m");
    } else { verdictEl.style.display = "none"; }
  }
  function trail(f, fi, ix, iy, isMissile) {
    if (fi < 1) return;
    ctx.lineWidth = 2; ctx.lineJoin = "round";
    for (var i = 1; i <= fi; i++) {
      var al = Math.max(0.08, i / fi) * 0.85;
      ctx.strokeStyle = (isMissile ? "rgba(107,169,255," : "rgba(255,93,84,") + al + ")";
      ctx.beginPath();
      ctx.moveTo(X(f[i - 1][ix]), Y(f[i - 1][iy]));
      ctx.lineTo(X(f[i][ix]), Y(f[i][iy]));
      ctx.stroke();
    }
  }
  function tri(x, y, s, ang) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-ang); ctx.beginPath();
    ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, s * 0.6); ctx.lineTo(-s * 0.7, -s * 0.6);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  /* ---------- playback ---------- */
  var last = 0, acc = 0, FPS = 50, reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
  function loop(ts) {
    var n = scenarios[si].frames.length;
    if (playing && !reduce) {
      if (!last) last = ts; acc += (ts - last) / 1000; last = ts;
      var step = acc * FPS;
      if (step >= 1) { cur += step; acc = 0; if (cur >= n + 18) cur = 0; }
    } else last = ts;
    var draw = Math.min(cur, n - 1);
    scrub.value = (draw / (n - 1) * 100).toFixed(1);
    render(draw);
    requestAnimationFrame(loop);
  }
  function setScenario(idx) {
    si = idx; cur = 0; acc = 0; last = 0;
    bounds = computeBounds(scenarios[si]);
    document.getElementById("scntag").textContent = scenarios[si].id.toUpperCase();
    document.getElementById("scndesc").textContent =
      lang === "en" ? scenarios[si].desc_en : scenarios[si].desc_ko;
    document.querySelectorAll(".tab").forEach(function (x, k) { x.classList.toggle("on", k === idx); });
    if (reduce) { cur = scenarios[si].det_i >= 0 ? scenarios[si].frames.length - 1 : 0; render(cur); }
  }
  // tabs
  var tabsEl = document.getElementById("tabs");
  scenarios.forEach(function (s, k) {
    var b = document.createElement("button"); b.className = "tab" + (k === 0 ? " on" : "");
    b.dataset.k = "tab_" + s.id;
    b.textContent = s.title_ko;
    b.dataset.ko = s.title_ko;
    b._en = s.title_en;
    b.addEventListener("click", function () { setScenario(k); playing = true; playBtn.textContent = "❚❚"; });
    tabsEl.appendChild(b);
  });
  function refreshTabLabels() {
    document.querySelectorAll(".tab").forEach(function (b, k) {
      b.textContent = lang === "en" ? scenarios[k].title_en : scenarios[k].title_ko;
    });
    document.getElementById("scndesc").textContent =
      lang === "en" ? scenarios[si].desc_en : scenarios[si].desc_ko;
  }
  var _applyLang = applyLang;
  applyLang = function () { _applyLang(); refreshTabLabels(); };

  playBtn.addEventListener("click", function () {
    playing = !playing; playBtn.textContent = playing ? "❚❚" : "▶"; if (playing) last = 0;
  });
  scrub.addEventListener("input", function () {
    playing = false; playBtn.textContent = "▶";
    var n = scenarios[si].frames.length; cur = scrub.value / 100 * (n - 1); render(cur);
  });
  window.addEventListener("resize", resize);

  /* ---------- results: comparison bars ---------- */
  var cmpEl = document.getElementById("cmp");
  var maxFuel = Math.max.apply(null, SIM.comparison.map(function (c) { return c.fuel; }));
  SIM.comparison.forEach(function (c) {
    var row = document.createElement("div");
    row.className = "cmp-row" + (c.win ? " win" : "") + (c.algo.indexOf("RL") === 0 ? " rl" : "");
    var jtxt = c.J > 5 ? c.J.toFixed(2) : c.J.toFixed(3);
    row.innerHTML =
      '<div class="name"><b>' + c.algo + '</b><span>' + c.evals.toLocaleString() + ' evals</span></div>' +
      '<div class="bar"><i style="width:' + (c.fuel / maxFuel * 100) + '%"></i></div>' +
      '<div class="stat"><b>J ' + jtxt + '</b> <span class="mut">·</span> ' +
      'hit <b>' + c.hit + '%</b> <span class="mut">·</span> fuel <b>' + c.fuel + '</b></div>';
    cmpEl.appendChild(row);
  });

  /* ---------- sweep heatmap ---------- */
  var heat = document.getElementById("heat"), sw = SIM.sweep;
  function heatColor(v) { // 100..320 -> dark amber ramp
    var t = Math.max(0, Math.min(1, (v - 100) / 220));
    var r = Math.round(60 + t * 195), g = Math.round(40 + t * 125), b = Math.round(30 + t * 8);
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  heat.appendChild(hdCell(""));
  sw.R.forEach(function (r) { heat.appendChild(hdCell(r)); });
  for (var i = sw.g.length - 1; i >= 0; i--) {
    heat.appendChild(hdCell(sw.g[i] + "g"));
    for (var j = 0; j < sw.R.length; j++) {
      var v = sw.reqF[i][j], cell = document.createElement("div");
      if (v == null) { cell.className = "cell x"; cell.textContent = "X"; }
      else { cell.className = "cell"; cell.style.background = heatColor(v); cell.textContent = v; }
      heat.appendChild(cell);
    }
  }
  function hdCell(txt) { var d = document.createElement("div"); d.className = "hd"; d.textContent = txt; return d; }

  /* ---------- scroll reveal ---------- */
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- go ---------- */
  setScenario(0); resize(); requestAnimationFrame(loop);
})();
