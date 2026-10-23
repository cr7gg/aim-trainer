/* Aim Trainer - MIT licensed. Plain JS, no dependencies, no build step. */
(() => {
  'use strict';

  // ---------- Game modes (add your own here) ----------
  const MODES = {
    gridshot: {
      name: 'Gridshot',
      desc: 'Three targets on screen at all times. Click them as fast as you can.',
      type: 'click', count: 3, radius: 32,
    },
    flick: {
      name: 'Flick',
      desc: 'One target at a time that vanishes fast. Train snap movements.',
      type: 'click', count: 1, radius: 28, lifetime: 1400,
    },
    microshot: {
      name: 'Microshot',
      desc: 'Tiny targets. Precision over speed.',
      type: 'click', count: 2, radius: 14,
    },
    tracking: {
      name: 'Tracking',
      desc: 'Keep your crosshair on a moving target. Score is time on target.',
      type: 'track', radius: 36, speed: 260,
    },
  };

  // ---------- Helpers ----------
  const $ = (s) => document.querySelector(s);
  const rand = (a, b) => a + Math.random() * (b - a);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const screens = { menu: $('#menu'), play: $('#play'), results: $('#results') };
  function show(name) {
    Object.entries(screens).forEach(([k, el]) => el.classList.toggle('active', k === name));
  }

  const canvas = $('#game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;

  // ---------- Persistence ----------
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    },
  };

  const settings = Object.assign(
    { duration: 30, size: 1, sound: true },
    store.get('aimtrainer.settings', {})
  );
  let best = store.get('aimtrainer.best', {}); // key: "mode:duration" -> score

  const bestKey = (mode) => `${mode}:${settings.duration}`;

  // ---------- Sound ----------
  let audio = null;
  function beep(freq, dur, type = 'sine', vol = 0.08) {
    if (!settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
      o.connect(g);
      g.connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + dur);
    } catch { /* audio unavailable */ }
  }

  // ---------- Menu ----------
  function renderMenu() {
    const wrap = $('#modes');
    wrap.innerHTML = '';
    for (const [key, m] of Object.entries(MODES)) {
      const card = document.createElement('article');
      card.className = 'mode';
      const h = document.createElement('h3');
      h.textContent = m.name;
      const p = document.createElement('p');
      p.textContent = m.desc;
      const b = document.createElement('div');
      b.className = 'best';
      const score = best[bestKey(key)];
      b.textContent = score ? `Best (${settings.duration}s): ${score}` : `No score yet (${settings.duration}s)`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Play';
      btn.addEventListener('click', () => startGame(key));
      card.append(h, p, b, btn);
      wrap.appendChild(card);
    }
  }

  $('#duration').value = String(settings.duration);
  $('#size').value = String(settings.size);
  $('#sizeOut').textContent = settings.size.toFixed(1) + 'x';
  $('#sound').checked = settings.sound;

  $('#duration').addEventListener('change', (e) => {
    settings.duration = Number(e.target.value);
    store.set('aimtrainer.settings', settings);
    renderMenu();
  });
  $('#size').addEventListener('input', (e) => {
    settings.size = Number(e.target.value);
    $('#sizeOut').textContent = settings.size.toFixed(1) + 'x';
    store.set('aimtrainer.settings', settings);
  });
  $('#sound').addEventListener('change', (e) => {
    settings.sound = e.target.checked;
    store.set('aimtrainer.settings', settings);
  });
  $('#resetScores').addEventListener('click', () => {
    best = {};
    store.set('aimtrainer.best', best);
    renderMenu();
  });

  // ---------- Canvas sizing ----------
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    W = rect.width;
    H = rect.height;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state) {
      for (const t of state.targets) {
        t.x = Math.min(Math.max(t.x, t.r), Math.max(t.r, W - t.r));
        t.y = Math.min(Math.max(t.y, t.r), Math.max(t.r, H - t.r));
      }
    }
  }
  window.addEventListener('resize', resize);

  // ---------- Game state ----------
  let state = null;

  function startGame(key) {
    cancelAnimationFrame(state ? state.raf : 0);
    show('play');
    state = null;
    resize();
    const now = performance.now();
    state = {
      key,
      mode: MODES[key],
      phase: 'countdown',
      countdownEnd: now + 3000,
      endTime: 0,
      last: now,
      hits: 0,
      misses: 0,
      score: 0,
      rts: [],
      onTime: 0,
      targets: [],
      particles: [],
      flash: 0,
      mouse: { x: W / 2, y: H / 2 },
      raf: 0,
    };
    $('#hudModeName').textContent = state.mode.name;
    updateHud(now);
    state.raf = requestAnimationFrame(frame);
  }

  function spawn(now) {
    const m = state.mode;
    const r = m.radius * settings.size;
    const pad = r + 6;
    const t = { x: 0, y: 0, r, born: now, ang: rand(0, Math.PI * 2), turnIn: rand(0.4, 1.1) };
    let tries = 0;
    do {
      t.x = rand(pad, Math.max(pad, W - pad));
      t.y = rand(pad, Math.max(pad, H - pad));
      tries++;
    } while (tries < 40 && state.targets.some((o) => dist(o, t) < o.r + r + 12));
    state.targets.push(t);
  }

  function beginPlay(now) {
    state.phase = 'playing';
    state.endTime = now + settings.duration * 1000;
    const count = state.mode.type === 'track' ? 1 : state.mode.count;
    for (let i = 0; i < count; i++) spawn(now);
  }

  function burst(x, y) {
    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(80, 240);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1 });
    }
  }

  function update(now, dt) {
    const m = state.mode;
    if (now >= state.endTime) { finish(); return; }

    if (m.type === 'click') {
      if (m.lifetime) {
        for (let i = state.targets.length - 1; i >= 0; i--) {
          if (now - state.targets[i].born > m.lifetime) {
            state.targets.splice(i, 1);
            state.misses++;
            beep(160, 0.12, 'square', 0.04);
            spawn(now);
          }
        }
      }
    } else {
      const t = state.targets[0];
      t.turnIn -= dt;
      if (t.turnIn <= 0) {
        t.ang += rand(-1.4, 1.4);
        t.turnIn = rand(0.4, 1.1);
      }
      t.x += Math.cos(t.ang) * m.speed * dt;
      t.y += Math.sin(t.ang) * m.speed * dt;
      if (t.x < t.r) { t.x = t.r; t.ang = Math.PI - t.ang; }
      if (t.x > W - t.r) { t.x = W - t.r; t.ang = Math.PI - t.ang; }
      if (t.y < t.r) { t.y = t.r; t.ang = -t.ang; }
      if (t.y > H - t.r) { t.y = H - t.r; t.ang = -t.ang; }
      if (dist(state.mouse, t) <= t.r) {
        state.onTime += dt * 1000;
        state.score = Math.floor(state.onTime / 10);
      }
    }

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 2.5;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    state.flash = Math.max(0, state.flash - dt * 4);
  }

  // ---------- Rendering ----------
  function drawTarget(t, now, m) {
    const rings = [
      [1, '#ff4d5e'],
      [0.68, '#f4f6f8'],
      [0.36, '#ff4d5e'],
    ];
    for (const [k, color] of rings) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r * k, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    if (m.lifetime) {
      const left = 1 - (now - t.born) / m.lifetime;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, left));
      ctx.strokeStyle = '#ffb86b';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  function drawCrosshair(onTarget) {
    const { x, y } = state.mouse;
    ctx.strokeStyle = onTarget ? '#3fb950' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 14, y); ctx.lineTo(x - 5, y);
    ctx.moveTo(x + 5, y); ctx.lineTo(x + 14, y);
    ctx.moveTo(x, y - 14); ctx.lineTo(x, y - 5);
    ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 14);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(0, 0, W, H);

    // subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < W; x += 60) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y < H; y += 60) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,77,94,${state.flash * 0.12})`;
      ctx.fillRect(0, 0, W, H);
    }

    for (const t of state.targets) drawTarget(t, now, state.mode);

    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = '#ffb86b';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (state.phase === 'countdown') {
      const n = Math.ceil((state.countdownEnd - now) / 1000);
      ctx.fillStyle = 'rgba(230,237,243,0.95)';
      ctx.font = '700 96px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.max(1, n)), W / 2, H / 2);
      ctx.font = '500 18px system-ui, sans-serif';
      ctx.fillStyle = '#8b98a5';
      ctx.fillText(state.mode.name, W / 2, H / 2 + 70);
    }

    const onTarget = state.mode.type === 'track' && state.targets[0] &&
      dist(state.mouse, state.targets[0]) <= state.targets[0].r;
    drawCrosshair(onTarget);
  }

  // ---------- HUD ----------
  function accuracy() {
    if (state.mode.type === 'track') {
      if (state.phase !== 'playing') return 0;
      const total = settings.duration * 1000;
      const elapsed = total - Math.max(0, state.endTime - performance.now());
      return elapsed > 0 ? Math.min(1, state.onTime / elapsed) : 0;
    }
    const total = state.hits + state.misses;
    return total ? state.hits / total : 0;
  }

  function updateHud(now) {
    const left = state.phase === 'playing'
      ? Math.max(0, state.endTime - now) / 1000
      : settings.duration;
    $('#hudScore').textContent = String(state.score);
    $('#hudTime').textContent = left.toFixed(1);
    $('#hudAcc').textContent = Math.round(accuracy() * 100) + '%';
  }

  // ---------- Main loop ----------
  function frame(now) {
    if (!state) return;
    const dt = Math.min(0.05, (now - state.last) / 1000);
    state.last = now;

    if (state.phase === 'countdown' && now >= state.countdownEnd) beginPlay(now);
    if (state.phase === 'playing') update(now, dt);
    if (!state || state.phase === 'done') return;

    draw(now);
    updateHud(now);
    state.raf = requestAnimationFrame(frame);
  }

  // ---------- Input ----------
  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener('pointermove', (e) => {
    if (state) state.mouse = pointerPos(e);
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (!state || state.phase !== 'playing') return;
    state.mouse = pointerPos(e);
    if (state.mode.type !== 'click') return;
    const now = performance.now();

    // choose the closest target the click landed inside
    let hitIndex = -1;
    let hitDist = Infinity;
    state.targets.forEach((t, i) => {
      const d = dist(state.mouse, t);
      if (d <= t.r && d < hitDist) { hitDist = d; hitIndex = i; }
    });

    if (hitIndex >= 0) {
      const t = state.targets[hitIndex];
      const rt = now - t.born;
      state.rts.push(rt);
      state.hits++;
      state.score += 100 + Math.round(Math.min(1000, Math.max(0, 1000 - rt)) / 10);
      burst(t.x, t.y);
      state.targets.splice(hitIndex, 1);
      spawn(now);
      beep(660 + Math.min(300, state.hits * 4), 0.07, 'sine', 0.07);
    } else {
      state.misses++;
      state.flash = 1;
      beep(150, 0.1, 'square', 0.04);
    }
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- Results ----------
  function finish() {
    const s = state;
    s.phase = 'done';
    cancelAnimationFrame(s.raf);

    const isTrack = s.mode.type === 'track';
    const acc = isTrack
      ? s.onTime / (settings.duration * 1000)
      : (s.hits + s.misses ? s.hits / (s.hits + s.misses) : 0);
    const avg = s.rts.length ? Math.round(s.rts.reduce((a, b) => a + b, 0) / s.rts.length) : null;

    const key = bestKey(s.key);
    const isBest = s.score > 0 && s.score > (best[key] || 0);
    if (isBest) {
      best[key] = s.score;
      store.set('aimtrainer.best', best);
    }

    $('#resTitle').textContent = `${s.mode.name} - ${settings.duration}s`;
    $('#resBest').hidden = !isBest;
    $('#resScore').textContent = String(s.score);
    $('#resAcc').textContent = Math.round(acc * 100) + '%';
    $('#resHitsLabel').textContent = isTrack ? 'Time on target' : 'Hits';
    $('#resHits').textContent = isTrack ? (s.onTime / 1000).toFixed(1) + 's' : String(s.hits);
    $('#resAvgLabel').textContent = isTrack ? 'Time off target' : 'Avg reaction';
    $('#resAvg').textContent = isTrack
      ? Math.max(0, settings.duration - s.onTime / 1000).toFixed(1) + 's'
      : (avg === null ? '-' : avg + ' ms');

    screens.results.classList.add('active');
    $('#again').focus();
    renderMenu();
  }

  function quitToMenu() {
    if (state) { cancelAnimationFrame(state.raf); state = null; }
    show('menu');
    renderMenu();
  }

  $('#again').addEventListener('click', () => {
    const key = state ? state.key : null;
    screens.results.classList.remove('active');
    if (key) startGame(key);
  });
  $('#toMenu').addEventListener('click', quitToMenu);

  window.addEventListener('keydown', (e) => {
    if (!state) return;
    if (e.key === 'Escape') quitToMenu();
    else if (e.key.toLowerCase() === 'r') {
      screens.results.classList.remove('active');
      startGame(state.key);
    }
  });

  // ---------- Boot ----------
  renderMenu();
})();
