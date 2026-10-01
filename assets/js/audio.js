/* ══════════════════════════════════════════════
   重走险关 · WebAudio 程序化音乐音效引擎
   零音频文件：配乐与环境声全部代码合成，无网络请求。
   暴露 window.CGAudio 供 main.js 挂接场景/交互事件。
   ══════════════════════════════════════════════ */
(function () {
  'use strict';
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let ctx = null, master = null, padBus = null, ambBus = null, verb = null;
  let curAmb = null;          // { name, gain, stop() }
  let padTimer = 0, padOscs = [];
  let enabled = false, booted = false, flyBoostOn = false;

  const db = v => Math.pow(10, v / 20);

  /* ── 初始化（首次用户手势） ── */
  function init() {
    if (booted) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = db(-14);
    master.connect(ctx.destination);

    /* 生成脉冲响应做简单混响（Pad 用） */
    const irLen = ctx.sampleRate * 2.2;
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < irLen; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6) * 0.5;
      }
    }
    verb = ctx.createConvolver();
    verb.buffer = ir;

    padBus = ctx.createGain(); padBus.gain.value = 1;
    const padLP = ctx.createBiquadFilter(); padLP.type = 'lowpass'; padLP.frequency.value = 850;
    padBus.connect(padLP); padLP.connect(master); padLP.connect(verb);
    verb.connect(master);

    ambBus = ctx.createGain(); ambBus.gain.value = 1;
    ambBus.connect(master);

    startPad();
    booted = true;
    return true;
  }

  /* ── 生成式配乐：A 宫五声慢演变 Pad ── */
  /* A2 宫系统：A C# D E G（五声），低八度铺底 */
  const PENTA = [110, 138.59, 146.83, 164.81, 196];        // A2 C#3 D3 E3 G3
  const CHORDS = [
    [0, 2, 4], [1, 3, 0], [2, 4, 1], [3, 0, 2],
  ];
  let chordIdx = 0;
  function startPad() {
    stopPad();
    chordIdx = (chordIdx + 1) % CHORDS.length;
    const chord = CHORDS[chordIdx];
    padOscs = chord.map((n, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = PENTA[n] * (i === 0 ? 0.5 : 1);
      o.detune.value = (i - 1) * 5;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(0.028, ctx.currentTime + 4);
      o.connect(g); g.connect(padBus);
      o.start();
      return { o, g };
    });
    padTimer = setTimeout(startPad, 12000 + Math.random() * 4000);
  }
  function stopPad() {
    clearTimeout(padTimer);
    padOscs.forEach(({ o, g }) => {
      try {
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + 3);
        o.stop(ctx.currentTime + 3.2);
      } catch (e) {}
    });
    padOscs = [];
  }

  /* ── 环境声（滤波噪声合成） ── */
  function noiseBuffer() {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function lfo(target, param, rate, depth) {
    const o = ctx.createOscillator();
    o.frequency.value = rate;
    const g = ctx.createGain(); g.gain.value = depth;
    o.connect(g); g.connect(target[param]);
    o.start();
    return o;
  }
  const AMBIENT_BUILDERS = {
    /* 水流：带通噪声 + 流速 LFO */
    water(base) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(); src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 480; bp.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.value = base;
      const l1 = lfo(bp, 'frequency', 0.4, 140);
      const l2 = lfo(g, 'gain', 0.16, base * 0.35);
      src.connect(bp); bp.connect(g);
      src.start();
      return { nodes: [src, bp, g], out: g, oscs: [l1, l2] };
    },
    /* 风雪：高通噪声 + 阵风 LFO */
    snow(base) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(); src.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
      const g = ctx.createGain(); g.gain.value = base * 0.6;
      const gust = lfo(g, 'gain', 0.09, base * 0.5);
      const gust2 = lfo(g, 'gain', 0.031, base * 0.3);
      src.connect(hp); hp.connect(g);
      src.start();
      return { nodes: [src, hp, g], out: g, oscs: [gust, gust2] };
    },
    /* 草地：低频 drone + 弱风 */
    drone(base) {
      const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 55.4;
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(); src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
      const g = ctx.createGain(); g.gain.value = base;
      const windG = ctx.createGain(); windG.gain.value = base * 0.35;
      const gust = lfo(windG, 'gain', 0.07, base * 0.25);
      o1.connect(g); o2.connect(g);
      src.connect(lp); lp.connect(windG); windG.connect(g);
      o1.start(); o2.start(); src.start();
      return { nodes: [src, lp, g, windG], out: g, oscs: [o1, o2, gust] };
    },
    /* 隘口：风 + 远处闷响 */
    wind(base) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer(); src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.5;
      const g = ctx.createGain(); g.gain.value = base * 0.55;
      const gust = lfo(g, 'gain', 0.06, base * 0.4);
      src.connect(bp); bp.connect(g);
      src.start();
      /* 远处闷响：20–40s 随机 */
      let rumbleTimer = 0;
      const rumble = () => {
        if (!curAmb || curAmb.name !== 'wind') return;
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 48;
        const rg = ctx.createGain(); rg.gain.value = 0;
        o.connect(rg); rg.connect(ambBus);
        const t = ctx.currentTime;
        rg.gain.linearRampToValueAtTime(base * 1.4, t + 0.08);
        rg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        o.start(t); o.stop(t + 1.7);
        rumbleTimer = setTimeout(rumble, 20000 + Math.random() * 20000);
      };
      rumbleTimer = setTimeout(rumble, 12000);
      return { nodes: [src, bp, g], out: g, oscs: [gust], timer: rumbleTimer };
    },
  };
  const AMBIENT_BY_GATE = {
    jiaopingdu: 'water', luding: 'water', jiajinshan: 'snow', songpan: 'drone', lazikou: 'wind',
  };

  /* 泸定：水流 + 偶发金属轻响 */
  let metalTimer = 0;
  function scheduleMetal() {
    metalTimer = setTimeout(() => {
      if (enabled && curAmb && curAmb.gate === 'luding') {
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.value = 2200 + Math.random() * 1400;
        const g = ctx.createGain(); g.gain.value = 0;
        o.connect(g); g.connect(ambBus);
        const t = ctx.currentTime;
        g.gain.linearRampToValueAtTime(0.012, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        o.start(t); o.stop(t + 0.45);
      }
      scheduleMetal();
    }, 8000 + Math.random() * 12000);
  }

  function setAmbient(gateId) {
    if (!booted || !enabled) { setAmbient.pending = gateId; return; }
    const name = gateId ? AMBIENT_BY_GATE[gateId] : null;
    if (curAmb && curAmb.gate === gateId) return;
    /* 旧环境声 1.5s 淡出 */
    if (curAmb) {
      const old = curAmb;
      old.gain.gain.cancelScheduledValues(ctx.currentTime);
      old.gain.gain.setValueAtTime(old.gain.gain.value, ctx.currentTime);
      old.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
      setTimeout(() => old.stop(), 1700);
      curAmb = null;
    }
    if (!name) return;
    const builder = AMBIENT_BUILDERS[name];
    const base = (flyBoostOn && gateId === 'jiajinshan') ? 0.11 : 0.055;   // 穿越时风声增强
    const a = builder(base);
    const fade = ctx.createGain(); fade.gain.value = 0;
    a.out.connect(fade); fade.connect(ambBus);
    fade.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
    curAmb = {
      gate: gateId, name, gain: fade,
      stop() {
        a.nodes.forEach(n => { try { n.stop ? n.stop() : n.disconnect(); } catch (e) {} });
        a.oscs.forEach(o => { try { o.stop(); } catch (e) {} });
        if (a.timer) clearTimeout(a.timer);
        try { fade.disconnect(); } catch (e) {}
      },
    };
  }

  function flyBoost(on) {
    flyBoostOn = on;
    if (!booted || !enabled || !curAmb || curAmb.gate !== 'jiajinshan') return;
    const g = curAmb.gate;
    const old = curAmb;
    curAmb = null;
    old.gain.gain.cancelScheduledValues(ctx.currentTime);
    old.gain.gain.setValueAtTime(old.gain.gain.value, ctx.currentTime);
    old.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
    setTimeout(() => old.stop(), 1000);
    setAmbient(g);
  }

  /* ── 实录 BGM（Imperial China Cinematic — Shane Ivers，CC BY 4.0）＋ 生成式旋律层（保底） ── */
  let bgmEl = null, bgmActive = false, bgmDuck = 1;
  const BGM_VOL = db(-16);
  const bgmVolume = () => BGM_VOL * bgmDuck;
  function bgmStart() {
    if (bgmEl) return;
    bgmEl = new Audio('assets/audio/bgm-main.mp3');
    bgmEl.loop = true;
    bgmEl.volume = 0;
    bgmEl.addEventListener('error', () => { bgmEl = null; bgmActive = false; applyMelGain(); });
    bgmEl.play().then(() => {
      bgmActive = true;
      const t0 = performance.now();   // 淡入到 -16dB
      (function ramp() {
        const k = Math.min(1, (performance.now() - t0) / 1500);
        if (bgmEl) bgmEl.volume = bgmVolume() * k;
        if (k < 1 && bgmEl) requestAnimationFrame(ramp);
      })();
      applyMelGain();
    }).catch(() => { /* 等首次手势后重试 */ });
  }

  /* 生成式旋律层：原创 A 宫五声主题（32 拍循环，拟二胡弦乐），
     sawtooth + 5.5Hz 揉弦(±15c) + 低通 1800 + portamento + 长音渐强包络 */
  const MEL_SCALE = { A3: 220, C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440, C5: 523.25 };
  const MOTIF = [
    ['E4', 1], ['G4', 1], ['A4', 2], ['G4', 1], ['E4', 1], ['D4', 2],
    ['E4', 1], ['G4', 1], ['A4', 1], ['C5', 1], ['A4', 2], ['G4', 2], ['E4', 2],
    ['D4', 1], ['E4', 1], ['G4', 2], ['E4', 1], ['D4', 1], ['C4', 2],
    ['D4', 1], ['C4', 1], ['A3', 2], ['A3', 4],
  ];
  const BEAT = 1.0;   // ≈60bpm
  let melBus = null, melOsc = null, melGain = null, melVib = null;
  let melTimer = 0, melOn = false, melMood = 'hero', melDuck = 1, melCycle = 0;
  function startMelody() {
    if (melOn || !ctx) return;
    melOn = true;
    melOsc = ctx.createOscillator(); melOsc.type = 'sawtooth';
    melVib = ctx.createOscillator(); melVib.frequency.value = 5.5;
    const vibG = ctx.createGain(); vibG.gain.value = 15;
    melVib.connect(vibG); vibG.connect(melOsc.detune);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    melGain = ctx.createGain(); melGain.gain.value = 0.02;
    melBus = ctx.createGain(); melBus.gain.value = 0;
    melOsc.connect(lp); lp.connect(melGain); melGain.connect(melBus);
    melBus.connect(master); melBus.connect(verb);
    melOsc.start(); melVib.start();
    scheduleCycle();
    applyMelGain();
  }
  function accom(freq, t, dur, peak) {   // 低五度分解和声垫底
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(melBus);
    g.gain.linearRampToValueAtTime(peak, t + 0.1);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function scheduleCycle() {
    if (!melOn) return;
    melCycle++;
    const sparse = (melMood === 'map' || melMood === 'gate') && melCycle % 3 !== 1;   // 地图/险关稀疏点缀
    let t = ctx.currentTime + 0.15;
    const total = 32 * BEAT;
    if (!sparse) {
      const ROOTS = ['A3', 'D4', 'E4', 'G4'];
      MOTIF.forEach(([n, dur], idx) => {
        const f = MEL_SCALE[n], d2 = dur * BEAT;
        melOsc.frequency.linearRampToValueAtTime(f, t + Math.min(0.09, d2 * 0.25));
        const peak = 0.05 * (dur >= 2 ? 1.2 : 1);
        melGain.gain.setTargetAtTime(peak, t, 0.09);
        melGain.gain.setTargetAtTime(0.018, t + d2 - 0.06, 0.05);
        if (idx % 2 === 0) {
          const root = MEL_SCALE[ROOTS[Math.floor(idx / 6) % ROOTS.length]] / 2;
          accom(root, t, 1.6, 0.016);
          accom(root * 1.5, t + BEAT, 1.2, 0.012);
        }
        t += d2;
      });
    }
    melTimer = setTimeout(scheduleCycle, total * 1000 - 150);
  }
  const MEL_GAIN = { hero: 0, background: 0.85, map: 0.5, gate: 0.45, finale: 1.0, colophon: 0 };
  function applyMelGain() {
    if (!booted || !melBus) return;
    const v = (MEL_GAIN[melMood] || 0) * melDuck * (bgmActive ? 0 : 1) * (enabled ? 1 : 0);
    melBus.gain.setTargetAtTime(v, ctx.currentTime, 0.9);
  }
  function setMood(m) { melMood = m; applyMelGain(); }
  function duck(on) {
    melDuck = on ? 0.35 : 1;
    bgmDuck = on ? 0.5 : 1;
    if (bgmActive && bgmEl) bgmEl.volume = bgmVolume();
    applyMelGain();
  }

  /* ── 音效 ── */
  function sfx(name) {
    if (!booted || !enabled) return;
    const t = ctx.currentTime;
    if (name === 'whoosh') {
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(2200, t + 0.22);
      const g = ctx.createGain(); g.gain.value = 0;
      g.gain.linearRampToValueAtTime(0.05, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      src.connect(bp); bp.connect(g); g.connect(master);
      src.start(t); src.stop(t + 0.35);
    } else if (name === 'tick') {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 1900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.03, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.06);
    } else if (name === 'thud') {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(72, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      const src = ctx.createBufferSource(); src.buffer = noiseBuffer();
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.09, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g); g.connect(master);
      src.connect(lp); lp.connect(ng); ng.connect(master);
      o.start(t); o.stop(t + 0.65); src.start(t); src.stop(t + 0.2);
    } else if (name === 'type') {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 1250;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.008, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.03);
    }
  }

  /* ── 开关与生命周期 ── */
  function setEnabled(on, save) {
    enabled = on;
    if (save) { try { localStorage.setItem('cguan-audio', on ? '1' : '0'); } catch (e) {} }
    if (on && !booted) { if (!init()) return; }
    if (!booted) return;
    if (ctx.state === 'suspended' && on) ctx.resume();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(on ? db(-14) : 0.0001, ctx.currentTime + 0.4);
    if (on) {
      padBus.gain.value = 1;
      startMelody();
      bgmStart();
      applyMelGain();
      const pend = setAmbient.pending; setAmbient.pending = null;
      setAmbient(pend !== undefined ? pend : (window.__cgaScene || null));
    } else {
      setAmbient(null);
      if (bgmEl) bgmEl.pause();
      applyMelGain();
    }
    btn && (btn.textContent = on ? '🔊' : '🔇');
    btn && btn.classList.toggle('on', on);
  }

  document.addEventListener('visibilitychange', () => {
    if (!booted) return;
    if (document.hidden) ctx.suspend();
    else if (enabled) ctx.resume();
    if (bgmEl && bgmActive) {
      if (document.hidden) bgmEl.pause();
      else if (enabled) bgmEl.play().catch(() => {});
    }
  });

  /* 首次用户手势解锁 AudioContext 策略 */
  const unlock = () => {
    if (!enabled) return;
    if (!booted) init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    if (!bgmActive) {
      if (bgmEl) {
        bgmEl.play().then(() => { bgmActive = true; bgmEl.volume = bgmVolume(); applyMelGain(); }).catch(() => {});
      } else bgmStart();
    }
  };
  addEventListener('pointerdown', unlock, { passive: true });
  addEventListener('keydown', unlock);

  /* ── 开关按钮 ── */
  const btn = document.createElement('button');
  btn.className = 'audio-toggle';
  btn.type = 'button';
  btn.textContent = '🔇';
  btn.setAttribute('aria-label', '声音开关');
  btn.addEventListener('click', () => {
    setEnabled(!enabled);
    if (enabled) sfx('tick');
    hideHint(true);
  });
  document.body.appendChild(btn);

  /* 首次访问一次性提示（RM 用户不提示） */
  let hint = null;
  function hideHint(save) {
    if (hint) { hint.classList.add('out'); setTimeout(() => hint && hint.remove(), 500); hint = null; }
    if (save) { try { localStorage.setItem('cguan-audio-hint', '1'); } catch (e) {} }
  }
  let hinted = false;
  try { hinted = localStorage.getItem('cguan-audio-hint') === '1'; } catch (e) {}
  if (!RM && !hinted) {
    setTimeout(() => {
      if (enabled) return;
      hint = document.createElement('div');
      hint.className = 'audio-hint';
      hint.textContent = '开启声音，体验更佳';
      hint.addEventListener('click', () => { setEnabled(true); hideHint(true); });
      document.body.appendChild(hint);
      btn.classList.add('pulse');
      setTimeout(() => { hideHint(true); btn.classList.remove('pulse'); }, 6000);
    }, 3500);
  }

  /* 默认开启（浏览器自动播放策略下等首次手势解锁）；用户主动关过才记住关闭 */
  let saved = null;
  try { saved = localStorage.getItem('cguan-audio'); } catch (e) {}
  if (saved !== '0' && !RM) setEnabled(true, false);

  /* ── 对外 API ── */
  window.CGAudio = {
    setAmbient,           // gateId 或 null（pad 常驻）
    sfx,                  // 'whoosh' | 'tick' | 'thud' | 'type'
    flyBoost,             // 3D 穿越风声增强
    setEnabled,
    setMood,              // 'hero'|'background'|'map'|'gate'|'finale'|'colophon'
    duck,                 // 打字机/决策时旋律与 BGM 闪避
    get enabled() { return enabled; },
    get bgmActive() { return bgmActive; },
    get melodyOn() { return melOn; },
  };
})();
