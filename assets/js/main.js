/* ══════════════════════════════════════════════
   重走险关 · 长征险阻解码 — 交互主逻辑
   纯原生 JS（ES module），无第三方依赖，离线可运行
   ══════════════════════════════════════════════ */

const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SVGNS = 'http://www.w3.org/2000/svg';
const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

function el(tag, attrs = {}, parent) {
  const n = tag.startsWith('svg:')
    ? document.createElementNS(SVGNS, tag.slice(4))
    : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'class') n.setAttribute('class', v);
    else n.setAttribute(k, v);
  }
  if (parent) parent.appendChild(n);
  return n;
}

/* Catmull-Rom → 三次贝塞尔平滑路径（SVG d 字符串） */
function smoothPathD(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6},`
       + ` ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/* 数字滚动 */
function countUp(node, target, decimals = 0, duration = 1600, suffix = '') {
  if (RM) { node.textContent = target.toFixed(decimals) + suffix; return; }
  const t0 = performance.now();
  (function tick(t) {
    const k = Math.min(1, (t - t0) / duration);
    const e = 1 - Math.pow(1 - k, 3);
    node.textContent = (target * e).toFixed(decimals) + suffix;
    if (k < 1) requestAnimationFrame(tick);
  })(t0);
}
const decimalsOf = v => (String(v).split('.')[1] || '').length;

function onceVisible(node, cb, threshold = 0.3) {
  const io = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting) { cb(); io.disconnect(); } });
  }, { threshold });
  io.observe(node);
}

/* 海拔 → 等效含氧百分比（调研文档对照表线性插值） */
const O2_TABLE = [[0, 100], [1000, 89], [2000, 79], [3000, 70], [3500, 66], [4000, 62], [4500, 58]];
function oxygenAt(alt) {
  if (alt <= 0) return 100;
  for (let i = 1; i < O2_TABLE.length; i++) {
    if (alt <= O2_TABLE[i][0]) {
      const [a0, o0] = O2_TABLE[i - 1], [a1, o1] = O2_TABLE[i];
      return o0 + (o1 - o0) * (alt - a0) / (a1 - a0);
    }
  }
  return O2_TABLE[O2_TABLE.length - 1][1];
}

/* ────────────────────────────────
   0. 顶部进度条
   ──────────────────────────────── */
function initProgress() {
  const bar = el('div', { class: 'progress-bar' }, document.body);
  const update = () => {
    if (document.documentElement.classList.contains('theater')) return;   // 剧场模式由剧场控制器驱动
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = (h > 0 ? (scrollY / h) * 100 : 0) + '%';
  };
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  update();
}

/* ────────────────────────────────
   1. Hero 序章
   ──────────────────────────────── */
const HERO_STATS = [
  { v: 25000, label: '里 · 长征总里程（约）', suffix: '' },
  { v: 18, label: '座 · 翻越大山', suffix: '' },
  { v: 24, label: '条 · 跨过大河', suffix: '' },
  { v: 380, label: '次 · 大小战斗', suffix: '+' },
];

function initHero() {
  const hero = $('#hero');
  const statsBox = $('#hero-stats');
  HERO_STATS.forEach(s => {
    const item = el('div', { class: 'stat' }, statsBox);
    el('b', { text: '0' }, item);
    el('span', { text: s.label }, item);
  });
  onceVisible(statsBox, () => {
    statsBox.querySelectorAll('.stat').forEach((item, i) => {
      const s = HERO_STATS[i];
      countUp(item.querySelector('b'), s.v, 0, 1800, s.suffix);
    });
  }, 0.4);

  /* 噪点纹理（canvas 生成，无外部资源） */
  const nc = document.createElement('canvas');
  nc.width = nc.height = 160;
  const nctx = nc.getContext('2d');
  const img = nctx.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const g = Math.random() * 255 | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
    img.data[i + 3] = 46;
  }
  nctx.putImageData(img, 0, 0);
  el('div', { class: 'hero-noise', style: `background-image:url(${nc.toDataURL()})` }, hero);

  /* 预留背景图：存在则淡入，不存在保持纯 CSS 背景 */
  const bg = el('div', { class: 'hero-bgimg' }, hero);
  const probe = new Image();
  probe.onload = () => { bg.style.backgroundImage = "url('assets/img/hero-bg.jpg')"; bg.classList.add('loaded'); };
  probe.src = 'assets/img/hero-bg.jpg';

  /* 多层视差：鼠标微动 + 滚动差速（背景最慢、文字稍快） */
  if (!RM) {
    const inner = $('.hero-inner');
    let mx = 0, my = 0;
    const applyParallax = () => {
      const sy = Math.min(scrollY, innerHeight);
      inner.style.transform = `translate(${mx * 14}px, ${my * 10 + sy * 0.14}px)`;
      bg.style.transform = `translate(${mx * -22}px, ${my * -16 + sy * 0.3}px) scale(1.06)`;
    };
    if (matchMedia('(pointer:fine)').matches) {
      hero.addEventListener('mousemove', e => {
        mx = e.clientX / innerWidth - 0.5;
        my = e.clientY / innerHeight - 0.5;
        applyParallax();
      });
    }
    addEventListener('scroll', () => { if (scrollY < innerHeight * 1.2) applyParallax(); }, { passive: true });
  }
}

/* ────────────────────────────────
   2. 时空地图主线
   ──────────────────────────────── */
const NARRATIVE = [
  { idx: 0,  zoom: 1.45, title: '出发：从瑞金到于都', text: '1934年10月，中央红军8.6万余人撤离中央苏区，从江西瑞金、于都一带踏上战略转移之路。' },
  { idx: 2,  zoom: 1.6,  title: '血战湘江', text: '1934年11月底至12月初，红军在湘江两岸苦战五昼夜，突破第四道封锁线，人数由8.6万锐减至3万余。' },
  { idx: 5,  zoom: 1.8,  title: '遵义会议', text: '1935年1月，遵义会议召开，在最危急的关头确立了正确的军事指挥，长征迎来转折。' },
  { idx: 6,  zoom: 1.8,  title: '四渡赤水', text: '1935年1月至3月，红军在川黔滇边境四次渡过赤水河，声东击西，彻底跳出敌军重兵合围。' },
  { idx: 9,  zoom: 2.3,  title: '险关一 · 巧渡金沙江', text: '1935年5月3—9日，皎平渡。6条木船、37名船工、7天7夜，3万余人未失一人一马。', gate: 'jiaopingdu' },
  { idx: 12, zoom: 2.3,  title: '险关二 · 强渡大渡河、飞夺泸定桥', text: '1935年5月，安顺场强渡成功；红四团一昼夜急行240里，22名勇士攀13根铁索夺下泸定桥。', gate: 'luding' },
  { idx: 13, zoom: 2.5,  title: '险关三 · 翻越夹金山', text: '1935年6月，单衣草鞋翻越海拔4114米的王母寨垭口——长征路上第一座大雪山。', gate: 'jiajinshan' },
  { idx: 16, zoom: 2.5,  title: '险关四 · 穿越松潘草地', text: '1935年8月，右路军踏进纵横300公里的死亡沼泽，5—7天行军后抵达班佑、巴西。', gate: 'songpan' },
  { idx: 17, zoom: 2.5,  title: '险关五 · 攻克腊子口', text: '1935年9月16—17日，正面佯攻、攀崖迂回，一夜攻克宽仅8米的天险，北上通道就此打开。', gate: 'lazikou' },
  { idx: 20, zoom: 1.7,  title: '会宁会师', text: '1936年10月，红一、二、四方面军在甘肃会宁胜利会师，长征宣告结束。' },
];

function pickBaseImage() {
  const need = Math.min(innerWidth, 1600) * (devicePixelRatio || 1);
  const f = need <= 1300 ? 'map-base-1280.jpg' : need <= 2000 ? 'map-base-1920.jpg' : 'map-base-3200.jpg';
  return `assets/img/${f}`;
}

function initMap(geo) {
  const stage = $('#map-stage'), camera = $('#map-camera');
  const baselayer = $('#map-baselayer'), svg = $('#map-overlay');
  const navBox = $('#map-narrative');

  const setBase = () => { baselayer.style.backgroundImage = `url('${pickBaseImage()}')`; };
  setBase();
  addEventListener('resize', setBase);

  /* ── SVG 图层：底色路线 + 鎏金进度路线 + 节点 + 险关标记 ── */
  const routePts = geo.route.map(p => ({ x: p.x, y: p.y }));
  const d = smoothPathD(routePts);
  el('svg:path', { class: 'map-route-base', d }, svg);
  const routeLine = el('svg:path', {
    class: 'map-route-line', d,
    pathLength: '1', 'stroke-dasharray': '1', 'stroke-dashoffset': '1',
  }, svg);
  /* 行进军蚁流动层：与进度同窗口的流动虚线 */
  const marchLine = el('svg:path', {
    class: 'map-route-march', d,
    pathLength: '1', 'stroke-dasharray': '0.016 0.05', 'stroke-dashoffset': '1',
  }, svg);

  /* 节点标注：仅关键叙事节点且不与险关标记重合者，避免密集区文字叠压 */
  const LABELS = {
    0:  { dy: -16, anchor: 'start' },  // 瑞金
    2:  { dy: -16, anchor: 'start' },  // 湘江
    5:  { dy: -16, anchor: 'start' },  // 遵义
    6:  { dy: 40,  anchor: 'start' },  // 土城（四渡赤水）
    20: { dy: -16, anchor: 'start' },  // 会宁
  };
  const nodeDots = [], nodeHalos = [], nodeLabels = [];
  geo.route.forEach((p, i) => {
    nodeHalos.push(el('svg:circle', { class: 'map-node-halo', cx: p.x, cy: p.y, r: 7 }, svg));
    const c = el('svg:circle', { class: 'map-node', cx: p.x, cy: p.y, r: 7 }, svg);
    nodeDots.push(c);
    const L = LABELS[i];
    if (L) nodeLabels.push(el('svg:text', { class: 'map-node-label', 'data-node': i, x: p.x + 16, y: p.y + L.dy, 'text-anchor': L.anchor, text: p.name }, svg));
  });

  /* 节点悬停 tooltip（迷你叙事卡样式） */
  const tip = el('div', { class: 'map-tooltip' }, stage);
  geo.route.forEach((p, i) => {
    const hit = el('svg:circle', {
      class: 'map-node-hit', cx: p.x, cy: p.y, r: 24,
      fill: 'transparent', 'pointer-events': 'all',
    }, svg);
    hit.addEventListener('mouseenter', () => {
      tip.innerHTML = `<time>${p.date}</time><h3>${p.name}</h3><p>${p.event}</p>`;
      const r = nodeDots[i].getBoundingClientRect();
      const sr = stage.getBoundingClientRect();
      tip.style.left = (r.left - sr.left + r.width / 2) + 'px';
      tip.style.top = (r.top - sr.top) + 'px';
      tip.classList.add('show');
    });
    hit.addEventListener('mouseleave', () => tip.classList.remove('show'));
  });

    /* 险关标记：可点击 → 平滑滚动到对应险关节；走到对应节点时才脉冲揭示 */
  let justDragged = 0;   // 拖拽后抑制 click
  const gateGrps = [];
  const GATE_NODE_IDX = { jiajinshan: 13, songpan: 16, luding: 12, jiaopingdu: 9, lazikou: 17 };
  geo.gates.forEach(g => {
    const grp = el('svg:g', { class: 'map-gate', 'data-gate': g.id }, svg);
    gateGrps.push(grp);
    el('svg:circle', { class: 'map-gate-ring', cx: g.x, cy: g.y, r: 30 }, grp);
    el('svg:circle', { class: 'map-gate-dot', cx: g.x, cy: g.y, r: 12 }, grp);
    /* 松潘草地与腊子口相距近，标签置于左侧防止叠压 */
    const left = g.id === 'songpan';
    el('svg:text', {
      class: 'map-gate-label',
      x: left ? g.x - 44 : g.x + 44, y: g.y + 12,
      'text-anchor': left ? 'end' : 'start', text: g.name,
    }, grp);
    el('svg:title', { text: `${g.name} · 点击查看险关解码` }, grp);
    grp.addEventListener('click', () => {
      if (Date.now() - justDragged < 250) return;
      if (window.__theaterGoTo) { window.__theaterGoTo('gate-' + g.id); return; }
      const target = $('#gate-' + g.id);
      if (target) target.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
    });
  });

  /* ── 叙事卡片 ── */
  const cards = NARRATIVE.map(n => {
    const p = geo.route[n.idx];
    const card = el('article', { class: 'narrative-card' }, navBox);
    el('time', { text: p.date }, card);
    el('h3', { text: n.title }, card);
    el('p', { text: n.text }, card);
    return { node: card, routeIdx: n.idx, zoom: n.zoom };
  });

  /* ── 滚动驱动：路线逐段绘制 + 相机 zoom/pan ──
     所有目标量每帧从 scrollY 纯函数重算（幂等）；boxW/boxH 必须量
     未变换的 stage（对带 transform 的 camera 量 getBoundingClientRect
     会拿到缩放后尺寸，这是回滚后相机错位的根因） */
  let boxW = 0, boxH = 0;
  /* letterbox 参数必须来自 camera 的【布局】尺寸（clientWidth 不受 transform 影响；
     移动端 camera 高 71vw ≠ stage 高，用 stage 尺寸会把 SVG meet 的缩放算错——窄屏错位根因） */
  const measure = () => { boxW = camera.clientWidth; boxH = camera.clientHeight; };
  measure();
  addEventListener('resize', measure);

  let targetP = 0, drawP = 0;         // 路线进度
  let tZoom = 1, cZoom = 1;           // 相机缩放
  let tFx = 0, tFy = 0, cFx = 0, cFy = 0; // 相机焦点（图像坐标）
  let activeCard = -1, running = false;

  /* 手动探索状态（拖拽平移 / 双指缩放） */
  let manual = null;   // { tx, ty, zoom, last }
  let appliedTx = 0, appliedTy = 0;

  const simple = () => RM || innerWidth <= 720;   // 移动端 / 减弱动画：固定全局视图

  /* 卡片中心的文档坐标（进度计算的唯一数据源） */
  function cardCenters() {
    const docY = scrollY;
    return cards.map(c => c.node.getBoundingClientRect().top + docY + c.node.offsetHeight / 2);
  }

  const NODES_N = geo.route.length;
  const RBC = {   // 路线包围盒中心：稳定镜头基准
    x: (Math.min(...geo.route.map(q => q.x)) + Math.max(...geo.route.map(q => q.x))) / 2,
    y: (Math.min(...geo.route.map(q => q.y)) + Math.max(...geo.route.map(q => q.y))) / 2,
  };
  const MOBILE = () => innerWidth <= 720;

  /* 统一 beat 状态：{ frac 路线进度 0..1, cur 激活卡片 } —— 剧场 beat 与经典 scrollY 共用 */
  function beatState() {
    const th = window.__theater;
    let b;
    if (th) {
      b = clamp(th.beat, 0, cards.length - 1);
    } else {
      const centers = cardCenters();
      const first = centers[0], last = centers[centers.length - 1];
      const vc = scrollY + innerHeight / 2;
      b = clamp((vc - first) / Math.max(1, last - first), 0, 1) * (cards.length - 1);
    }
    const seg = clamp(Math.floor(b), 0, cards.length - 2);
    const t = clamp(b - seg, 0, 1);
    const iA = cards[seg].routeIdx, iB = cards[seg + 1].routeIdx;
    return { frac: (iA + (iB - iA) * t) / (NODES_N - 1), cur: Math.round(b) };
  }

  function computeTargets() {
    const { frac, cur } = beatState();
    if (RM) {
      /* RM：静态终态，全线全节点直接呈现 */
      targetP = 1;
      tFx = RBC.x; tFy = RBC.y;
      tZoom = MOBILE() ? 1.6 : 1.3;
    } else {
      targetP = frac;
      const fIdx = frac * (NODES_N - 1);
      const i0 = Math.floor(fIdx), i1 = Math.min(NODES_N - 1, i0 + 1), ft = fIdx - i0;
      const ax = lerp(geo.route[i0].x, geo.route[i1].x, ft);
      const ay = lerp(geo.route[i0].y, geo.route[i1].y, ft);
      if (MOBILE()) {
        /* 移动端：区域聚焦叙事，zoom 2.1 居中当前路线区段（复用边界钳制） */
        tZoom = 2.1;
        tFx = ax; tFy = ay;
      } else {
        /* 桌面：全程稳定俯瞰——zoom 跨 10 幕单调极缓推进(1.18→1.42)，
           重心向激活节点轻移（≤8% 视口，frame 内钳制），单幕切换无大幅镜头运动 */
        tZoom = lerp(1.18, 1.42, frac);
        tFx = RBC.x + (ax - RBC.x) * 0.45;
        tFy = RBC.y + (ay - RBC.y) * 0.45;
      }
    }
    if (cur !== activeCard) {
      cards.forEach((c, i) => {
        c.node.classList.toggle('active', i === cur);
        c.node.classList.toggle('beat-current', i === cur);
      });
      nodeDots.forEach((dot, i) => dot.classList.toggle('active', i === cards[cur].routeIdx));
      activeCard = cur;
    }
  }

  function frame() {
    if (!running) return;
    if (window.__theater && window.__theaterScene !== 'map') { requestAnimationFrame(frame); return; }
    computeTargets();
    drawP = RM ? 1 : lerp(drawP, targetP, 0.12);
    routeLine.setAttribute('stroke-dashoffset', String(1 - drawP));
    if (!RM) marchLine.setAttribute('stroke-dashoffset',
      String((1 - drawP) - ((performance.now() / 1000 * 0.09) % 0.066)));
    if (thumb) thumb.style.left = (drawP * 100) + '%';

    /* 节点逐个点亮 + 险关到时揭示（RM 下 drawP=1 即全量静态呈现） */
    nodeDots.forEach((dot, i) => {
      const lit = drawP >= i / (NODES_N - 1) - 0.002;
      if (lit !== dot.__lit) {
        dot.__lit = lit;
        dot.classList.toggle('lit', lit);
        nodeHalos[i].classList.toggle('lit', lit);
      }
    });
    nodeLabels.forEach(lb => {
      const lit = drawP >= (+lb.dataset.node) / (NODES_N - 1) - 0.002;
      lb.classList.toggle('show', lit);
    });
    gateGrps.forEach(grp => {
      const lit = drawP >= GATE_NODE_IDX[grp.dataset.gate] / (NODES_N - 1) - 0.02;
      if (lit !== grp.__lit) {
        grp.__lit = lit;
        grp.classList.toggle('revealed', lit);
      }
    });

    if (manual && performance.now() - manual.last > 3000) manual = null;
    if (manual) {
      /* 手动探索：插值跟随手动目标；3 秒无操作自动交还编舞 */
      appliedTx = lerp(appliedTx, manual.tx, 0.18);
      appliedTy = lerp(appliedTy, manual.ty, 0.18);
      cZoom = lerp(cZoom, manual.zoom, 0.18);
      camera.style.transform = `translate(${appliedTx.toFixed(1)}px,${appliedTy.toFixed(1)}px) scale(${cZoom.toFixed(4)})`;
    } else {
      /* 编舞相机：lerp ≈0.1 平滑跟随（惯性） */
      if (RM) { cZoom = tZoom; cFx = tFx; cFy = tFy; }
      else {
        cZoom = lerp(cZoom, tZoom, 0.1);
        cFx = lerp(cFx, tFx, 0.1);
        cFy = lerp(cFy, tFy, 0.1);
      }
      /* contain 适配后的 letterbox 参数（与 SVG preserveAspectRatio=meet 对齐） */
      const fit = Math.min(boxW / geo.imageWidth, boxH / geo.imageHeight);
      const ox = (boxW - geo.imageWidth * fit) / 2;
      const oy = (boxH - geo.imageHeight * fit) / 2;
      let sx = ox + cFx * fit, sy = oy + cFy * fit;
      if (!MOBILE() && !RM) {
        /* 桌面：激活节点重心偏移 ≤8% 视口 */
        const sxB = ox + RBC.x * fit, syB = oy + RBC.y * fit;
        sx = sxB + clamp(sx - sxB, -boxW * 0.08, boxW * 0.08);
        sy = syB + clamp(sy - syB, -boxH * 0.08, boxH * 0.08);
      }
      let tTx = boxW / 2 - sx * cZoom, tTy = boxH / 2 - sy * cZoom;
      /* 边界钳制：任何 zoom 下不露出图外黑边 */
      const minTx = boxW - (ox + geo.imageWidth * fit) * cZoom, maxTx = -ox * cZoom;
      const minTy = boxH - (oy + geo.imageHeight * fit) * cZoom, maxTy = -oy * cZoom;
      tTx = minTx <= maxTx ? clamp(tTx, minTx, maxTx) : boxW / 2 - (ox + geo.imageWidth * fit / 2) * cZoom;
      tTy = minTy <= maxTy ? clamp(tTy, minTy, maxTy) : boxH / 2 - (oy + geo.imageHeight * fit / 2) * cZoom;
      appliedTx = RM ? tTx : lerp(appliedTx, tTx, 0.12);
      appliedTy = RM ? tTy : lerp(appliedTy, tTy, 0.12);
      camera.style.transform = `translate(${appliedTx.toFixed(1)}px,${appliedTy.toFixed(1)}px) scale(${cZoom.toFixed(4)})`;
    }
    requestAnimationFrame(frame);
  }
  window.__mapDbg = () => ({ targetP, drawP, tZoom, cZoom, tFx, tFy, cFx, cFy, appliedTx, appliedTy, boxW, boxH, beat: window.__theater && window.__theater.beat });

  new IntersectionObserver(es => {
    es.forEach(e => {
      if (e.isIntersecting && !running) { running = true; measure(); requestAnimationFrame(frame); }
      else if (!e.isIntersecting) running = false;
    });
  }, { threshold: 0 }).observe($('#map-main'));

  /* ── 手动探索：拖拽平移（移动端仅平移）+ 双指/Ctrl+滚轮缩放；双击或 3s 无操作交还 ── */
  function enterManual() {
    if (RM) return null;
    if (!manual) manual = { tx: appliedTx, ty: appliedTy, zoom: cZoom, last: 0 };
    manual.last = performance.now();
    return manual;
  }
  let dragStart = null;
  stage.addEventListener('pointerdown', e => {
    if (RM || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.target.closest('.map-timeline')) return;
    /* 先不 capture：否则 click 会被重定向到 stage，险关点点击失效 */
    dragStart = { x: e.clientX, y: e.clientY, moved: false, captured: false, pid: e.pointerId };
  });
  stage.addEventListener('pointermove', e => {
    if (!dragStart) return;
    const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
    if (!dragStart.moved && Math.abs(dx) + Math.abs(dy) <= 4) return;
    if (!dragStart.moved) {
      dragStart.moved = true;
      const m = enterManual();
      if (!m) { dragStart = null; return; }
      dragStart.tx = m.tx; dragStart.ty = m.ty;
    }
    if (!manual) return;
    if (!dragStart.captured) { stage.setPointerCapture(dragStart.pid); dragStart.captured = true; }
    manual.tx = clamp(dragStart.tx + dx, -boxW * 0.7, boxW * 0.7);
    manual.ty = clamp(dragStart.ty + dy, -boxH * 0.7, boxH * 0.7);
    manual.last = performance.now();
  });
  stage.addEventListener('pointerup', () => {
    if (dragStart && dragStart.moved) justDragged = Date.now();
    dragStart = null;
  });
  stage.addEventListener('wheel', e => {
    /* 双指捏合（触控板捏合产生 ctrlKey wheel）才缩放，普通滚轮保持页面滚动 */
    if (simple() || (!e.ctrlKey && !e.metaKey)) return;
    e.preventDefault();
    const m = enterManual(); if (!m) return;
    const f = clamp(Math.exp(-e.deltaY * 0.002), 0.8, 1.25);
    const nz = clamp(m.zoom * f, 0.9, 5);
    const sr = stage.getBoundingClientRect();
    const cx = e.clientX - sr.left, cy = e.clientY - sr.top;
    const k = nz / m.zoom;
    m.tx = cx - (cx - m.tx) * k;
    m.ty = cy - (cy - m.ty) * k;
    m.zoom = nz;
    m.last = performance.now();
  }, { passive: false });
  stage.addEventListener('dblclick', e => {
    if (e.target.closest('.map-timeline')) return;
    manual = null;   // 交还滚动驱动（lerp 平滑回归）
  });

  /* ── 时间轴刷选条：作为滚动代理，scrollY 仍是唯一状态源 ── */
  const timeline = el('div', { class: 'map-timeline' }, stage);
  el('span', { class: 'mt-cap', text: '1934.10 瑞金' }, timeline);
  const track = el('div', { class: 'mt-track' }, timeline);
  el('span', { class: 'mt-cap', text: '1936.10 会宁' }, timeline);
  const thumb = el('div', { class: 'mt-thumb' }, track);

  function renderTicks() {
    track.querySelectorAll('.mt-tick').forEach(n => n.remove());
    const centers = cardCenters();
    const first = centers[0], last = centers[centers.length - 1];
    cards.forEach((c, i) => {
      const p = (centers[i] - first) / Math.max(1, last - first);
      const route = geo.route[c.routeIdx];
      el('div', {
        class: 'mt-tick', style: `left:${(p * 100).toFixed(2)}%`,
        title: `${route.date} · ${c.node.querySelector('h3').textContent}`,
      }, track);
    });
  }
  renderTicks();
  addEventListener('resize', renderTicks);

  function seek(clientX) {
    const r = track.getBoundingClientRect();
    const p = clamp((clientX - r.left) / r.width, 0, 1);
    const th = window.__theater;
    if (th) { th.beat = p * (cards.length - 1); th.sync && th.sync(th.beat); manual = null; return; }   // 剧场：刷选条驱动 beat
    const centers = cardCenters();
    const first = centers[0], last = centers[centers.length - 1];
    const y = first + p * (last - first) - innerHeight / 2;
    window.scrollTo({ top: y, behavior: 'auto' });   // instant：滚动管线自带 lerp 平滑
    manual = null;
  }
  let scrubbing = false;
  track.addEventListener('pointerdown', e => {
    scrubbing = true;
    track.setPointerCapture(e.pointerId);
    track.classList.add('scrubbing');
    seek(e.clientX);
    e.stopPropagation();
  });
  track.addEventListener('pointermove', e => { if (scrubbing) seek(e.clientX); });
  track.addEventListener('pointerup', () => { scrubbing = false; track.classList.remove('scrubbing'); });
}

/* ────────────────────────────────
   3. 险关解码站
   ──────────────────────────────── */

/* 3a. 夹金山 · Canvas 地形剖面 */
function renderProfile(canvas, profile, readout) {
  const ctx = canvas.getContext('2d');
  const DPR = devicePixelRatio || 1;
  let W = 0, H = 0;
  const M = { l: 58, r: 18, t: 26, b: 40 };
  const KM_MAX = 52, ALT_MIN = 2000, ALT_MAX = 4400, SNOW = 3900;

  const km2x = km => M.l + (km / KM_MAX) * (W - M.l - M.r);
  const alt2y = a => M.t + (1 - (a - ALT_MIN) / (ALT_MAX - ALT_MIN)) * (H - M.t - M.b);
  const pts = profile.map(p => ({ ...p, px: 0, py: 0 }));

  function resize() {
    W = canvas.clientWidth; H = 340;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    pts.forEach(p => { p.px = km2x(p.km); p.py = alt2y(p.alt); });
  }

  let progress = RM ? 1 : 0;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    /* 网格与坐标轴 */
    ctx.strokeStyle = 'rgba(34,48,64,.9)'; ctx.fillStyle = '#5f6f7d';
    ctx.font = '11px ui-monospace, monospace'; ctx.lineWidth = 1;
    for (let a = ALT_MIN; a <= ALT_MAX; a += 500) {
      const y = alt2y(a);
      ctx.beginPath(); ctx.moveTo(M.l, y); ctx.lineTo(W - M.r, y); ctx.stroke();
      ctx.fillText(a + 'm', 8, y + 4);
    }
    for (let k = 0; k <= KM_MAX; k += 10) {
      ctx.fillText(k + '', km2x(k) - 6, H - M.b + 18);
    }
    ctx.fillText('里程 km', W - M.r - 50, H - 8);

    /* 剖面填充（山脚绿 → 雪线白） */
    const grad = ctx.createLinearGradient(0, alt2y(ALT_MAX), 0, alt2y(ALT_MIN));
    grad.addColorStop(0, '#eef3f6');
    grad.addColorStop((ALT_MAX - SNOW) / (ALT_MAX - ALT_MIN), '#dde7ec');
    grad.addColorStop(0.55, '#7e8f96');
    grad.addColorStop(1, '#3f6049');

    const trace = () => {
      ctx.moveTo(pts[0].px, pts[0].py);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        ctx.bezierCurveTo(
          p1.px + (p2.px - p0.px) / 6, p1.py + (p2.py - p0.py) / 6,
          p2.px - (p3.px - p1.px) / 6, p2.py - (p3.py - p1.py) / 6,
          p2.px, p2.py);
      }
    };

    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, M.l + (W - M.l - M.r) * progress + 2, H); ctx.clip();
    ctx.beginPath(); trace();
    ctx.lineTo(pts[pts.length - 1].px, alt2y(ALT_MIN));
    ctx.lineTo(pts[0].px, alt2y(ALT_MIN));
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); trace();
    ctx.strokeStyle = '#c8d6dd'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();

    /* 雪线 */
    const sy = alt2y(SNOW);
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = 'rgba(232,226,213,.6)';
    ctx.beginPath(); ctx.moveTo(M.l, sy); ctx.lineTo(W - M.r, sy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(232,226,213,.75)';
    ctx.fillText('6月积雪线 约3900m（待考）', M.l + 8, sy - 6);

    /* 剖面点（窄屏只保留 4 个关键标注，防止文字叠压） */
    const KEY_KM = new Set([0, 25, 37, 50]);   // 硗碛 / 五道拐 / 王母寨垭口 / 达维会师桥
    const compact = W < 640;
    if (progress >= 1) pts.forEach(p => {
      ctx.fillStyle = p.alt >= SNOW ? '#f0c168' : '#9aa5ac';
      ctx.beginPath(); ctx.arc(p.px, p.py, 3.4, 0, 7); ctx.fill();
      if (compact && !KEY_KM.has(p.km)) return;
      ctx.fillStyle = '#9aa5ac'; ctx.font = '10px ui-monospace, monospace';
      const short = p.label.split('（')[0];
      ctx.fillText(short, clamp(p.px - ctx.measureText(short).width / 2, 2, W - 70), p.py - 9);
    });
  }

  resize(); draw();
  addEventListener('resize', () => { resize(); draw(); });

  if (!RM) onceVisible(canvas, () => {
    const t0 = performance.now();
    (function anim(t) {
      progress = Math.min(1, (t - t0) / 1400);
      progress = 1 - Math.pow(1 - progress, 3);
      draw();
      if (progress < 1) requestAnimationFrame(anim);
    })(t0);
  }, 0.35);

  /* 十字线读数 */
  let cross = null;
  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    cross = clamp((e.clientX - r.left - M.l) / (W - M.l - M.r), 0, 1);
    drawCross();
  });
  canvas.addEventListener('mouseleave', () => { cross = null; draw(); });

  /* 海拔滑杆读数（与十字线共用推算逻辑；无十字线时显示） */
  let altLine = 4114;
  function drawAlt() {
    const alt = altLine, y = alt2y(alt);
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = 'rgba(240,193,104,.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(M.l, y); ctx.lineTo(W - M.r, y); ctx.stroke();
    ctx.setLineDash([]);
    /* 剖面与该海拔的交点（上坡段 / 下坡段可能各一个） */
    const kms = [];
    for (let i = 1; i < pts.length; i++) {
      const a1 = pts[i - 1].alt, a2 = pts[i].alt;
      if (a1 === a2) continue;
      if ((a1 - alt) * (a2 - alt) <= 0) {
        kms.push(pts[i - 1].km + (alt - a1) / (a2 - a1) * (pts[i].km - pts[i - 1].km));
      }
    }
    ctx.fillStyle = '#f0c168';
    kms.forEach(km => { ctx.beginPath(); ctx.arc(km2x(km), y, 5, 0, 7); ctx.fill(); });
    /* 顶点恰好落在数据点上时会得到两个相同交点，去重 */
    const kmsUniq = kms.filter((k, i) => i === 0 || Math.abs(k - kms[i - 1]) > 0.05);
    const temp = 17.5 - 0.006 * (alt - 2300);
    const o2 = oxygenAt(alt);
    readout.textContent = `海拔 ${Math.round(alt)} m · 推算气温 ≈ ${temp.toFixed(1)} ℃ · 等效含氧 ≈ ${Math.round(o2)}%`
      + (kmsUniq.length ? ` · 剖面经过里程 ${kmsUniq.map(k => k.toFixed(1) + ' km').join(' / ')}` : '');
  }
  const _draw = draw;
  draw = function () { _draw(); if (cross === null && progress >= 1) drawAlt(); };

  function drawCross() {
    draw();
    const km = cross * KM_MAX;
    /* 按里程在剖面点上线性插值海拔 */
    let alt = pts[pts.length - 1].alt;
    for (let i = 1; i < pts.length; i++) {
      if (km <= pts[i].km) {
        alt = lerp(pts[i - 1].alt, pts[i].alt, (km - pts[i - 1].km) / (pts[i].km - pts[i - 1].km));
        break;
      }
    }
    const temp = 17.5 - 0.006 * (alt - 2300);   // 山脚6月白天约15–20℃取中值，递减率0.6℃/100m（推算）
    const o2 = oxygenAt(alt);
    const x = km2x(km), y = alt2y(alt);
    ctx.strokeStyle = 'rgba(127,179,200,.65)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, M.t); ctx.lineTo(x, H - M.b); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(M.l, y); ctx.lineTo(W - M.r, y); ctx.stroke();
    ctx.fillStyle = '#f0c168';
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7); ctx.fill();
    readout.textContent =
      `里程 ${km.toFixed(1)} km · 海拔 ${Math.round(alt)} m · 推算气温 ≈ ${temp.toFixed(1)} ℃（0.6℃/100m递减） · 等效含氧 ≈ ${Math.round(o2)}%`;
  }

  /* 竖向海拔滑杆（2300–4114m），拖动联动剖面高亮与读数 */
  const slider = el('div', { class: 'alt-slider' });
  canvas.parentNode.insertBefore(slider, canvas.nextSibling);
  el('span', { class: 'alt-cap', text: '4114m' }, slider);
  const track = el('div', { class: 'alt-track' }, slider);
  const thumbEl = el('div', { class: 'alt-thumb' }, track);
  el('span', { class: 'alt-cap', text: '2300m' }, slider);
  const SL_MIN = 2300, SL_MAX = 4114;
  function setAlt(alt, fromInit) {
    altLine = clamp(alt, SL_MIN, SL_MAX);
    const frac = (altLine - SL_MIN) / (SL_MAX - SL_MIN);
    thumbEl.style.bottom = (frac * 100) + '%';
    if (!fromInit && cross === null) draw();
  }
  function seekAlt(e) {
    const r = track.getBoundingClientRect();
    setAlt(SL_MIN + clamp(1 - (e.clientY - r.top) / r.height, 0, 1) * (SL_MAX - SL_MIN));
  }
  let altDragging = false;
  track.addEventListener('pointerdown', e => {
    altDragging = true; track.setPointerCapture(e.pointerId); seekAlt(e);
  });
  track.addEventListener('pointermove', e => { if (altDragging) seekAlt(e); });
  track.addEventListener('pointerup', () => { altDragging = false; });
  setAlt(4114, true);
}

/* 3b. 松潘草地 · SVG 地层剖面 */
function renderStrata(svg, tip) {
  const LAYERS = [
    { y: 40,  h: 56,  fill: '#3f6049', name: '草甸层',
      tip: '地表草甸覆盖，看似可踏，水下却泥潭深不可测——「人、马陷入即被吞没」。' },
    { y: 96,  h: 96,  fill: '#6b4f35', name: '泥炭层 2–3 m（最厚9–10 m）',
      tip: '泥炭层一般厚 2–3 m（另一口径 3–5 m），最厚 9–10 m。来源：中国大百科全书·中国地理。' },
    { y: 192, h: 56,  fill: '#51697c', name: '冻土层（最深 72 cm）',
      tip: '冻土隔水使地表常年过湿；9月下旬冻结、5月中旬解冻，最深达 72 cm。来源：地理学报。' },
    { y: 248, h: 64,  fill: '#39434e', name: '低渗透基岩',
      tip: '低渗透基岩面阻挡下渗；黑河、白河迂回汇聚、排水不畅，湖泊沼泽化形成泥炭。' },
  ];
  svg.setAttribute('viewBox', '0 0 720 340');
  LAYERS.forEach(L => {
    const g = el('svg:g', { class: 'strata-layer' }, svg);
    el('svg:rect', { x: 40, y: L.y, width: 560, height: L.h, fill: L.fill, rx: 3 }, g);
    el('svg:text', { x: 56, y: L.y + L.h / 2 + 5, fill: '#e8e2d5', 'font-size': 15, text: L.name }, g);
    g.addEventListener('mouseenter', () => { tip.textContent = L.tip; });
    g.addEventListener('click', () => { tip.textContent = L.tip; });
  });
  /* 水草纹理 + 陷溺箭头 */
  for (let i = 0; i < 14; i++) {
    el('svg:path', {
      d: `M ${60 + i * 38} 52 q 4 -14 8 0`, stroke: '#5d8168', 'stroke-width': 2, fill: 'none',
    }, svg);
  }
  const arrow = el('svg:g', {}, svg);
  el('svg:path', { d: 'M 640 60 L 640 130 M 632 118 L 640 132 L 648 118', stroke: '#c14b36', 'stroke-width': 3, fill: 'none' }, arrow);
  el('svg:text', { x: 640, y: 152, fill: '#c14b36', 'font-size': 13, 'text-anchor': 'middle', text: '陷溺风险' }, arrow);
  el('svg:text', { x: 40, y: 330, fill: '#5f6f7d', 'font-size': 12, text: '示意剖面 · 层厚未按严格比例（泥炭层一般2–3m vs 冻土≤0.72m）' }, svg);
  tip.textContent = '悬停 / 点按各层查看说明';
}

/* 3c. 泸定桥 · SVG 侧视 + 水流粒子 */
function renderLuding(svg, riverCanvas) {
  svg.setAttribute('viewBox', '0 0 720 300');
  /* 两岸悬崖 */
  el('svg:path', { d: 'M0 300 L0 96 L64 84 L96 118 L96 300 Z', fill: '#2b3540' }, svg);
  el('svg:path', { d: 'M720 300 L720 96 L656 84 L624 118 L624 300 Z', fill: '#2b3540' }, svg);
  /* 13 根铁索：9 底 + 4 扶手（悬链弧线） */
  for (let i = 0; i < 9; i++) {
    el('svg:path', {
      d: `M 92 ${122 + i * 2.2} Q 360 ${196 + i * 1.4} 628 ${122 + i * 2.2}`,
      stroke: '#9aa5ac', 'stroke-width': 1.6, fill: 'none', opacity: 0.9,
    }, svg);
  }
  [0, 1].forEach(s => {
    [0, 1].forEach(k => {
      el('svg:path', {
        d: `M 92 ${96 + k * 6 + s * 3} Q 360 ${150 + k * 6 + s * 3} 628 ${96 + k * 6 + s * 3}`,
        stroke: '#c8b28a', 'stroke-width': 1.4, fill: 'none', opacity: 0.85,
      }, svg);
    });
  });
  /* 桥长标注 */
  el('svg:path', { d: 'M 92 46 L 628 46 M 92 38 L 92 54 M 628 38 L 628 54', stroke: '#d4a24e', 'stroke-width': 1.5, fill: 'none' }, svg);
  el('svg:text', { x: 360, y: 36, fill: '#f0c168', 'font-size': 16, 'text-anchor': 'middle', 'font-family': 'ui-monospace, monospace', text: '103.67 m' }, svg);
  el('svg:text', { x: 360, y: 232, fill: '#9aa5ac', 'font-size': 13, 'text-anchor': 'middle', text: '13 根铁索：9 根底链 + 4 根扶手 · 12164 个铁环 · 全桥 40 余吨' }, svg);
  el('svg:text', { x: 48, y: 80, fill: '#5f6f7d', 'font-size': 12, 'text-anchor': 'middle', text: '西岸' }, svg);
  el('svg:text', { x: 672, y: 80, fill: '#5f6f7d', 'font-size': 12, 'text-anchor': 'middle', text: '东岸' }, svg);

  /* 大渡河水流粒子（canvas 小动画） */
  const ctx = riverCanvas.getContext('2d');
  const DPR = devicePixelRatio || 1;
  let w = 0, h = 0, parts = [], raf = 0, running = false;
  function resize() {
    w = riverCanvas.clientWidth; h = 110;
    riverCanvas.width = w * DPR; riverCanvas.height = h * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    parts = Array.from({ length: 90 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      len: 12 + Math.random() * 30, sp: 1.5 + Math.random() * 3.5, a: 0.15 + Math.random() * 0.4,
    }));
  }
  function tick() {
    if (!running) return;
    ctx.clearRect(0, 0, w, h);
    parts.forEach(p => {
      p.x += p.sp; if (p.x - p.len > w) { p.x = -p.len; p.y = Math.random() * h; }
      ctx.strokeStyle = `rgba(127,179,200,${p.a})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(p.x - p.len, p.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    });
    raf = requestAnimationFrame(tick);
  }
  resize();
  addEventListener('resize', resize);
  if (RM) { // 静态一帧
    running = true; tick(); running = false; cancelAnimationFrame(raf);
  } else {
    new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting && !running) { running = true; tick(); }
      else if (!e.isIntersecting) { running = false; cancelAnimationFrame(raf); }
    }), { threshold: 0.1 }).observe(riverCanvas);
  }
}

/* 3d. 皎平渡 · SVG 俯视 + 摆渡动画（夜色版：深蓝黑江面 + 月光碎波 + 船形马灯 + 尾迹） */
function renderJiaopingdu(svg, dayEl, countEl) {
  svg.setAttribute('viewBox', '0 0 720 380');
  const defs = el('svg:defs', {}, svg);
  const riverGrad = el('svg:linearGradient', { id: 'jpd-river', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('svg:stop', { offset: '0', 'stop-color': '#0a1520' }, riverGrad);
  el('svg:stop', { offset: '.55', 'stop-color': '#122c3d' }, riverGrad);
  el('svg:stop', { offset: '1', 'stop-color': '#0a1520' }, riverGrad);
  const cliffGrad = el('svg:linearGradient', { id: 'jpd-cliff', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('svg:stop', { offset: '0', 'stop-color': '#171f29' }, cliffGrad);
  el('svg:stop', { offset: '1', 'stop-color': '#0c1219' }, cliffGrad);
  const glowF = el('svg:filter', { id: 'jpd-glow', x: '-80%', y: '-80%', width: '260%', height: '260%' }, defs);
  el('svg:feGaussianBlur', { stdDeviation: 3, result: 'b' }, glowF);
  const merge = el('svg:feMerge', {}, glowF);
  el('svg:feMergeNode', { in: 'b' }, merge);
  el('svg:feMergeNode', { in: 'SourceGraphic' }, merge);

  /* 峡谷两岸（上：北岸四川会理；下：南岸云南禄劝） */
  el('svg:path', { d: 'M0 0 H720 V118 Q520 132 360 122 T0 126 Z', fill: 'url(#jpd-cliff)' }, svg);
  el('svg:path', { d: 'M0 380 H720 V262 Q520 248 360 258 T0 254 Z', fill: 'url(#jpd-cliff)' }, svg);
  el('svg:rect', { x: 0, y: 122, width: 720, height: 136, fill: 'url(#jpd-river)' }, svg);
  /* 月光碎波：江面中部几条斜向微光带，缓慢漂移 */
  const shimmers = [];
  for (let i = 0; i < 5; i++) {
    const sh = el('svg:ellipse', {
      cx: 260 + i * 46, cy: 150 + (i % 3) * 34, rx: 60 + (i % 2) * 30, ry: 4.5,
      fill: 'rgba(216,228,238,.07)',
    }, svg);
    shimmers.push({ node: sh, ph: i * 1.3 });
  }
  /* 流速箭头（4–5 m/s，调柔） */
  for (let r = 0; r < 3; r++) {
    el('svg:path', {
      d: `M 30 ${150 + r * 36} H 690`, class: 'flow-arrow',
      stroke: 'rgba(127,179,200,.28)', 'stroke-width': 1.6, fill: 'none',
      'stroke-dasharray': '14 26',
    }, svg);
  }
  const style = document.createElement('style');
  style.textContent = '@keyframes flowdash{to{stroke-dashoffset:-40}}.flow-arrow{animation:flowdash 1.8s linear infinite}';
  if (!RM) svg.appendChild(style);
  /* 标注 */
  el('svg:path', { d: 'M 690 124 L 690 256 M 684 124 L 696 124 M 684 256 L 696 256', stroke: '#d4a24e', 'stroke-width': 1.4, fill: 'none' }, svg);
  el('svg:text', { x: 678, y: 192, fill: '#f0c168', 'font-size': 13, 'text-anchor': 'end', 'font-family': 'ui-monospace, monospace', text: '江面宽约150m' }, svg);
  el('svg:text', { x: 360, y: 66, fill: '#9aa5ac', 'font-size': 14, 'text-anchor': 'middle', text: '北岸 · 四川会理通安镇' }, svg);
  el('svg:text', { x: 360, y: 330, fill: '#9aa5ac', 'font-size': 14, 'text-anchor': 'middle', text: '南岸 · 云南禄劝皎平渡镇' }, svg);
  el('svg:text', { x: 20, y: 66, fill: '#5f6f7d', 'font-size': 12, text: '岭谷高差 1000–1500 m' }, svg);
  el('svg:text', { x: 20, y: 86, fill: '#5f6f7d', 'font-size': 12, text: '流速 4–5 m/s' }, svg);
  /* 6 条木船：船形 hull + 马灯暖光点；尾迹波纹层在船下层 */
  const wakeLayer = el('svg:g', {}, svg);
  const HULL = 'M -15 -3 L 10 -3 L 16 0 L 10 5 L -11 5 L -17 1 Z';   // 船头尖、船尾方
  const boats = [];
  for (let i = 0; i < 6; i++) {
    const grp = el('svg:g', {}, svg);
    el('svg:path', { d: HULL, fill: '#4a3a28', stroke: '#8a6b46', 'stroke-width': 1.2 }, grp);
    el('svg:circle', { cx: -6, cy: -1, r: 2.2, fill: '#f0c168', filter: 'url(#jpd-glow)' }, grp);
    boats.push({ node: grp, phase: i / 6, x: 90 + i * 104, lastWake: 0 });
  }
  const wakes = [];
  /* 摆渡动画 + 计数（21s 一轮 = 7 天 × 3s） */
  let running = false, raf = 0, t0 = 0;
  const TOP = 136, BOT = 232;
  function tick(t) {
    if (!running) return;
    if (!t0) t0 = t;
    const el_s = (t - t0) / 1000;
    boats.forEach(b => {
      const k = (el_s * 0.22 + b.phase) % 1;
      const tri = k < 0.5 ? k * 2 : (1 - k) * 2;   // 往返
      const y = TOP + tri * (BOT - TOP) + Math.sin(el_s * 2.2 + b.phase * 9) * 1.6;   // 轻微起伏
      b.node.setAttribute('transform', `translate(${b.x} ${y.toFixed(1)})`);
      /* 尾迹：周期性在船后留下扩散涟漪 */
      if (el_s - b.lastWake > 0.55) {
        b.lastWake = el_s;
        const wk = el('svg:ellipse', {
          cx: b.x, cy: y, rx: 6, ry: 2.4,
          fill: 'none', stroke: 'rgba(127,179,200,.4)', 'stroke-width': 1,
        }, wakeLayer);
        wakes.push({ node: wk, born: el_s });
      }
    });
    for (let i = wakes.length - 1; i >= 0; i--) {
      const age = el_s - wakes[i].born;
      if (age > 1.4) { wakes[i].node.remove(); wakes.splice(i, 1); continue; }
      const k = age / 1.4;
      wakes[i].node.setAttribute('rx', (6 + k * 22).toFixed(1));
      wakes[i].node.setAttribute('ry', (2.4 + k * 7).toFixed(1));
      wakes[i].node.setAttribute('stroke-opacity', (0.4 * (1 - k)).toFixed(2));
    }
    /* 月光碎波漂移 */
    shimmers.forEach((sh, i) => {
      const base = 260 + i * 46;
      sh.node.setAttribute('cx', (base + Math.sin(el_s * 0.35 + sh.ph) * 26).toFixed(1));
      sh.node.setAttribute('opacity', (0.6 + Math.sin(el_s * 0.8 + sh.ph) * 0.4).toFixed(2));
    });
    const cyc = el_s % 21;
    dayEl.textContent = '第 ' + Math.min(7, Math.floor(cyc / 3) + 1) + ' 天 / 7 天';
    countEl.textContent = Math.round(30000 * cyc / 21).toLocaleString() + ' 人';
    raf = requestAnimationFrame(tick);
  }
  if (RM) {
    dayEl.textContent = '7 天 7 夜（一说九天九夜）';
    countEl.textContent = '30,000+ 人';
    boats.forEach(b => b.node.setAttribute('transform', `translate(${b.x} ${(TOP + BOT) / 2})`));
  } else {
    new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting && !running) { running = true; t0 = 0; raf = requestAnimationFrame(tick); }
      else if (!e.isIntersecting) { running = false; cancelAnimationFrame(raf); }
    }), { threshold: 0.15 }).observe(svg);
  }
}

/* 3e. 腊子口 · SVG 峡谷横截面（真实比例） */
function renderLazikou(svg) {
  svg.setAttribute('viewBox', '0 0 720 380');
  /* 比例：100m 崖高 → 280px；8m 隘口 → 22.4px */
  const S = 2.8, base = 330, cx = 240, gapHalf = 4 * S;
  const cl = cx - gapHalf, cr = cx + gapHalf;
  /* 左、右崖壁（100m） */
  el('svg:path', { d: `M 20 ${base} L 20 ${base - 100 * S} L ${cl - 30} ${base - 100 * S} L ${cl} ${base - 88 * S} L ${cl} ${base} Z`, fill: '#2b3540' }, svg);
  el('svg:path', { d: `M 460 ${base} L 460 ${base - 100 * S} L ${cr + 30} ${base - 100 * S} L ${cr} ${base - 88 * S} L ${cr} ${base} Z`, fill: '#2b3540' }, svg);
  /* 崖壁纹理 */
  for (let i = 0; i < 5; i++) {
    el('svg:path', { d: `M ${50 + i * 30} ${base - 12} L ${64 + i * 30} ${base - 100 * S + 20}`, stroke: '#39434e', 'stroke-width': 2, fill: 'none' }, svg);
    el('svg:path', { d: `M ${480 + i * 30} ${base - 12} L ${494 + i * 30} ${base - 100 * S + 20}`, stroke: '#39434e', 'stroke-width': 2, fill: 'none' }, svg);
  }
  /* 高度标注 100m */
  el('svg:path', { d: `M 36 ${base} L 36 ${base - 100 * S} M 30 ${base} L 42 ${base} M 30 ${base - 100 * S} L 42 ${base - 100 * S}`, stroke: '#d4a24e', 'stroke-width': 1.3, fill: 'none' }, svg);
  el('svg:text', { x: 48, y: base - 50 * S, fill: '#f0c168', 'font-size': 13, 'font-family': 'ui-monospace, monospace', text: '崖壁 100m+' }, svg);
  /* 腊子河 + 1m 木桥 + 碉堡 */
  el('svg:rect', { x: cl, y: base - 8, width: gapHalf * 2, height: 8, fill: '#16303d' }, svg);
  el('svg:rect', { x: cl - 2, y: base - 12, width: gapHalf * 2 + 4, height: 3, fill: '#8a6b46' }, svg);
  el('svg:rect', { x: cr + 8, y: base - 34, width: 20, height: 26, fill: '#4a3a2c', stroke: '#c14b36', 'stroke-width': 1.2 }, svg);
  el('svg:text', { x: cr + 34, y: base - 20, fill: '#c8a79b', 'font-size': 12, text: '桥头碉堡' }, svg);
  el('svg:text', { x: cx, y: base + 18, fill: '#7fb3c8', 'font-size': 12, 'text-anchor': 'middle', text: '腊子河 · 1m 木桥' }, svg);
  /* 隘口 8m 标注 + 放大框（延迟淡入） */
  const co = el('svg:g', { class: 'lazikou-callout' }, svg);
  el('svg:path', { d: `M ${cx} ${base - 30} L 560 90`, stroke: '#d4a24e', 'stroke-width': 1.2, 'stroke-dasharray': '4 4', fill: 'none' }, co);
  el('svg:rect', { x: 470, y: 40, width: 220, height: 96, fill: '#10161e', stroke: '#d4a24e', 'stroke-width': 1, rx: 4 }, co);
  /* 放大 ×10：8m → 80px（框内示意） */
  el('svg:rect', { x: 490, y: 66, width: 60, height: 44, fill: '#2b3540' }, co);
  el('svg:rect', { x: 630, y: 66, width: 44, height: 44, fill: '#2b3540' }, co);
  el('svg:path', { d: 'M 552 118 L 628 118 M 552 112 L 552 124 M 628 112 L 628 124', stroke: '#f0c168', 'stroke-width': 1.4, fill: 'none' }, co);
  el('svg:text', { x: 590, y: 60, fill: '#f0c168', 'font-size': 13, 'text-anchor': 'middle', 'font-family': 'ui-monospace, monospace', text: '最窄处 8 m（放大×10）' }, co);
  el('svg:text', { x: 590, y: 132, fill: '#5f6f7d', 'font-size': 11, 'text-anchor': 'middle', text: '主图按 100m 崖高 : 8m 隘口真实比例绘制' }, co);
  el('svg:text', { x: 240, y: base + 40, fill: '#5f6f7d', 'font-size': 12, 'text-anchor': 'middle', text: '甘川古道咽喉 · 唯一通道' }, svg);
}

/* ── 险关氛围粒子（进入视口才渲染，移动端密度减半，RM 不启用） ── */
function initAmbient(panel, type) {
  if (RM) return;
  const cv = el('canvas', { class: 'ambient-canvas' }, panel);
  const ctx = cv.getContext('2d');
  const DPR = Math.min(devicePixelRatio || 1, 2);
  const k = innerWidth <= 720 ? 0.5 : 1;   // 移动端密度减半
  let w = 0, h = 0, parts = [], running = false, raf = 0, t0 = 0;

  function spawn() {
    const R = Math.random;
    parts = [];
    if (type === 'snow') {
      for (let i = 0; i < 60 * k; i++)
        parts.push({ x: R() * w, y: R() * h, r: 0.7 + R() * 1.7, vy: 0.25 + R() * 0.55, ph: R() * 6.28 });
    } else if (type === 'fog') {
      for (let i = 0; i < 7 * k; i++)
        parts.push({ x: R() * w, y: h * 0.25 + R() * h * 0.6, r: 70 + R() * 130, vx: 0.12 + R() * 0.2, a: 0.035 + R() * 0.045 });
    } else if (type === 'sparkle') {
      for (let i = 0; i < 34 * k; i++)
        parts.push({ x: R() * w, y: h * 0.45 + R() * h * 0.5, len: 6 + R() * 18, sp: 1 + R() * 2.4, ph: R() * 6.28, vx: 0.2 + R() * 0.4 });
    } else if (type === 'dust') {
      for (let i = 0; i < 24 * k; i++)
        parts.push({ x: w * 0.32 + R() * w * 0.36, y: R() * h, r: 0.6 + R() * 1.3, vy: 0.06 + R() * 0.18, ph: R() * 6.28 });
    }
  }
  function resize() {
    w = panel.clientWidth; h = panel.clientHeight;
    cv.width = w * DPR; cv.height = h * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    spawn();
  }
  function tick(t) {
    if (!running) return;
    if (!t0) t0 = t;
    const time = (t - t0) / 1000;
    ctx.clearRect(0, 0, w, h);
    if (type === 'snow') {
      parts.forEach(p => {
        p.y += p.vy; p.x += Math.sin(time + p.ph) * 0.3;
        if (p.y > h + 4) { p.y = -4; p.x = Math.random() * w; }
        ctx.fillStyle = `rgba(238,243,246,${0.16 + p.r * 0.12})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      });
    } else if (type === 'fog') {
      parts.forEach(p => {
        p.x += p.vx;
        if (p.x - p.r > w) p.x = -p.r;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgba(150,170,190,${p.a})`);
        g.addColorStop(1, 'rgba(150,170,190,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      });
    } else if (type === 'sparkle') {
      parts.forEach(p => {
        p.x += p.vx;
        if (p.x - p.len > w) p.x = -p.len;
        const a = Math.max(0, Math.sin(time * p.sp + p.ph)) * 0.35;
        if (a < 0.02) return;
        ctx.strokeStyle = `rgba(168,222,244,${a})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(p.x - p.len, p.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      });
    } else if (type === 'dust') {
      /* 光柱 + 缓落尘埃 */
      const beam = ctx.createLinearGradient(w * 0.3, 0, w * 0.7, 0);
      beam.addColorStop(0, 'rgba(240,209,140,0)');
      beam.addColorStop(0.5, 'rgba(240,209,140,.05)');
      beam.addColorStop(1, 'rgba(240,209,140,0)');
      ctx.fillStyle = beam;
      ctx.fillRect(w * 0.3, 0, w * 0.4, h);
      parts.forEach(p => {
        p.y += p.vy; p.x += Math.sin(time * 0.6 + p.ph) * 0.12;
        if (p.y > h + 3) { p.y = -3; p.x = w * 0.32 + Math.random() * w * 0.36; }
        ctx.fillStyle = 'rgba(240,209,140,.3)';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      });
    }
    raf = requestAnimationFrame(tick);
  }
  resize();
  addEventListener('resize', resize);
  new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting && !running) { running = true; raf = requestAnimationFrame(tick); }
    else if (!e.isIntersecting) { running = false; cancelAnimationFrame(raf); t0 = 0; }
  }), { threshold: 0.08 }).observe(panel);
}

/* ────────────────────────────────
   3.0 夹金山 · Three.js 3D 地形穿越（真实 SRTM 地形）
   懒加载：夹金山 section 接近视口才加载 three.iife.js 与高度图；
   主路径 canvas 解码 terrarium PNG（http），file:// 下 canvas 读像素
   被浏览器拦截，自动降级到预生成的内联网格（jiajinshan-heights.js）。
   ──────────────────────────────── */
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}
function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src;
  });
}
async function loadHeightGrid(T) {
  try {
    const img = await loadImage('assets/img/jiajinshan-height.png');
    const cw = T.pxW, ch = T.pxH;
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const px = cx.getImageData(0, 0, cw, ch).data;   // file:// 下此处抛 SecurityError
    const h = new Float32Array(cw * ch);
    for (let i = 0; i < cw * ch; i++) {
      h[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;   // terrarium
    }
    return { w: cw, h: ch, data: h };
  } catch (e) {
    /* file:// 降级：预生成网格（448×647，int16 米） */
    if (!window.JJS_HEIGHTS) await loadScript('assets/data/jiajinshan-heights.js');
    const g = window.JJS_HEIGHTS;
    const bin = atob(g.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const i16 = new Int16Array(bytes.buffer);
    return { w: g.w, h: g.h, data: Float32Array.from(i16) };
  }
}

function initTerrain3D(panel) {
  const T = window.JJS_TERRAIN;
  const stageBox = panel.querySelector('.t3d-stage');
  const loadingEl = panel.querySelector('.t3d-loading');
  const hud = panel.querySelector('.t3d-hud');
  const flyBtn = panel.querySelector('.t3d-fly');
  const zoomIn = panel.querySelector('.t3d-zoomin');
  const zoomOut = panel.querySelector('.t3d-zoomout');
  if (RM) flyBtn.style.display = 'none';

  let renderer = null, scene = null, camera = null, canvas = null;
  let routeCurve = null, routePts = [];
  let running = false, raf = 0, disposed = false;
  let lastT = 0;

  /* 轨道状态（方位角/俯仰/距离，俯仰 15°–80° 钳制） */
  const orbit = { az: -0.9, pol: 0.85, dist: 120, target: null };
  const POL_MIN = 15 * Math.PI / 180, POL_MAX = 80 * Math.PI / 180;
  const DIST_MIN = 26, DIST_MAX = 420;

  /* 穿越状态 */
  const fly = { active: false, paused: false, t: 0, returning: 0 };

  const nearIO = new IntersectionObserver(async es => {
    if (!es[0].isIntersecting || disposed) return;
    nearIO.disconnect();
    try {
      loadingEl.textContent = '加载 3D 引擎…';
      await loadScript('assets/vendor/three.iife.js');
      loadingEl.textContent = '加载地形数据（SRTM）…';
      const grid = await loadHeightGrid(T);
      loadingEl.textContent = '构建地形…';
      await new Promise(r => setTimeout(r, 30));
      build(grid);
      loadingEl.remove();
    } catch (err) {
      panel.style.display = 'none';   // WebGL 不可用 / 数据缺失：整块隐藏不报错
    }
  }, { rootMargin: '700px' });
  nearIO.observe(panel);

  addEventListener('pagehide', () => {
    disposed = true;
    cancelAnimationFrame(raf);
    if (renderer) {
      scene.traverse(o => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose && o.material.dispose(); });
      renderer.dispose();
    }
  });

  function build(grid) {
    const THREE = window.THREE;
    const W = stageBox.clientWidth, H = stageBox.clientHeight;

    /* 世界比例：经度跨度按 cos(纬度) 修正为真实公里 */
    const latMid = (T.lat0 + T.lat1) / 2 * Math.PI / 180;
    const wKm = (T.lon1 - T.lon0) * 111.32 * Math.cos(latMid);   // ≈75.7 km
    const hKm = (T.lat0 - T.lat1) * 110.94;                      // ≈109.0 km
    const VEX = 1.3;                                             // 垂直夸张

    const sample = (u, v) => {   // 双线性采样（u,v ∈ [0,1]，v=0 为北缘）
      const gx = clamp(u, 0, 1) * (grid.w - 1), gy = clamp(v, 0, 1) * (grid.h - 1);
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const x1 = Math.min(x0 + 1, grid.w - 1), y1 = Math.min(y0 + 1, grid.h - 1);
      const fx = gx - x0, fy = gy - y0;
      const d = grid.data;
      return (d[y0 * grid.w + x0] * (1 - fx) + d[y0 * grid.w + x1] * fx) * (1 - fy)
           + (d[y1 * grid.w + x0] * (1 - fx) + d[y1 * grid.w + x1] * fx) * fy;
    };
    const lonLatToWorld = (lon, lat) => {
      const u = (lon - T.lon0) / (T.lon1 - T.lon0);
      const v = (T.lat0 - lat) / (T.lat0 - T.lat1);   // lat0 为北缘 = 图像第 0 行
      return { u, v, x: (u - 0.5) * wKm, z: (v - 0.5) * hKm, h: sample(u, v) };
    };

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    canvas = renderer.domElement;
    stageBox.appendChild(canvas);
    canvas.addEventListener('webglcontextlost', () => { panel.style.display = 'none'; disposed = true; });

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b0f14, 160, 560);
    camera = new THREE.PerspectiveCamera(46, W / H, 0.5, 1500);
    orbit.target = new THREE.Vector3(6, 3.2, -2);

    /* 地形网格 */
    const seg = innerWidth <= 720 ? 128 : 384;
    const geo = new THREE.PlaneGeometry(wKm, hKm, seg, seg);
    geo.rotateX(-Math.PI / 2);   // 平面顶行（y=+h/2）→ z=-h/2（北缘）
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const kmPerU = wKm, kmPerV = hKm;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const u = (x + wKm / 2) / wKm, v = (z + hKm / 2) / hKm;
      const h = sample(u, v);
      pos.setY(i, h / 1000 * VEX);
      /* 坡度（m/km）用于压暗岩壁 */
      const e = 1.5 / Math.min(grid.w, grid.h);
      const gx = (sample(u + e, v) - sample(u - e, v)) / (2 * e * kmPerU * 1000);
      const gz = (sample(u, v + e) - sample(u, v - e)) / (2 * e * kmPerV * 1000);
      const slope = Math.hypot(gx, gz);
      /* 高程配色：谷底墨绿 → 岩壁灰蓝 → 雪线以上雪白 */
      let r, g, b;
      const C = (hex) => [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];
      const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
      const n = Math.abs((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1);   // 顶点噪声去塑料感
      if (h < 2600) [r, g, b] = mixC(C(0x0d1614), C(0x1e2f28), clamp((h - 700) / 1900, 0, 1));
      else if (h < 3400) [r, g, b] = mixC(C(0x1e2f28), C(0x4a5a68), (h - 2600) / 800);
      else if (h < 3900) [r, g, b] = mixC(C(0x4a5a68), C(0x93a7b4), (h - 3400) / 500);
      else [r, g, b] = mixC(C(0xdfe6ec), C(0xffffff), clamp((h - 3900) / 700, 0, 1));
      const kn = h > 3900 ? 0.88 + n * 0.2 : 0.94 + n * 0.1;
      r *= kn; g *= kn; b *= kn;
      const dark = h > 3900 ? clamp(1 - slope * 0.3, 0.72, 1)   // 雪坡少压暗，突出雪线
           : clamp(1 - slope * 0.45, 0.5, 1);       // 陡坡压暗
      colors[i * 3] = r * dark; colors[i * 3 + 1] = g * dark; colors[i * 3 + 2] = b * dark;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 }));
    scene.add(terrain);

    /* 灯光：鎏金低角度「月光」+ 冷青环境光 */
    const moon = new THREE.DirectionalLight(0xb8cfe0, 1.2);   // 冷调月光
    moon.position.set(-140, 42, 160);
    scene.add(moon);
    scene.add(new THREE.AmbientLight(0x5f7d94, 0.22));
    const rim = new THREE.DirectionalLight(0xd4a24e, 0.22);      // 极弱鎏金侧后 rim
    rim.position.set(120, 26, -140);
    scene.add(rim);

    /* 星空 */
    const starN = 420, starPos = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      const az = Math.random() * Math.PI * 2, el = (5 + Math.random() * 75) * Math.PI / 180, rr = 700;
      starPos[i * 3] = Math.cos(az) * Math.cos(el) * rr;
      starPos[i * 3 + 1] = Math.sin(el) * rr;
      starPos[i * 3 + 2] = Math.sin(az) * Math.cos(el) * rr;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xe8e2d5, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.75, fog: false })));

    /* 月亮 sprite（canvas 生成） */
    const mc = document.createElement('canvas'); mc.width = mc.height = 128;
    const mctx = mc.getContext('2d');
    const mg = mctx.createRadialGradient(64, 64, 8, 64, 64, 64);
    mg.addColorStop(0, 'rgba(245,240,225,1)');
    mg.addColorStop(0.28, 'rgba(240,225,190,.95)');
    mg.addColorStop(0.34, 'rgba(212,162,78,.35)');
    mg.addColorStop(1, 'rgba(212,162,78,0)');
    mctx.fillStyle = mg; mctx.fillRect(0, 0, 128, 128);
    const moonSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mc), transparent: true, fog: false }));
    moonSpr.position.set(250, 135, -240);
    moonSpr.scale.set(64, 64, 1);
    scene.add(moonSpr);

    /* 路线：4 途经点（王母寨垭口按 SRTM 山脊匹配），Catmull-Rom 平滑 */
    const SNAP = { '王母寨垭口': { lon: 102.6523, lat: 30.8207 } };
    const wps = T.route_points.map(p => {
      const s = SNAP[p.name] || p;
      const wpt = lonLatToWorld(s.lon, s.lat);
      return { name: p.name, ...wpt, y: wpt.h / 1000 * VEX + 0.35 };
    });
    routeCurve = new THREE.CatmullRomCurve3(wps.map(p => new THREE.Vector3(p.x, p.y, p.z)));
    routePts = routeCurve.getSpacedPoints(240);
    /* 贴地修正：采样点低于地形时抬升 */
    routePts.forEach(p => {
      const u = (p.x + wKm / 2) / wKm, v = (p.z + hKm / 2) / hKm;
      const ground = sample(u, v) / 1000 * VEX + 0.35;
      if (p.y < ground) p.y = ground;
    });
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(routeCurve, 200, 0.09, 6, false),
      new THREE.MeshBasicMaterial({ color: 0xd4a24e }));
    scene.add(tube);
    const glow = new THREE.Mesh(
      new THREE.TubeGeometry(routeCurve, 200, 0.4, 6, false),
      new THREE.MeshBasicMaterial({ color: 0xd4a24e, transparent: true, opacity: 0.1 }));
    scene.add(glow);

    /* 途经点标记：金球 + 中文名牌 sprite（距离补偿缩放 + 贴近淡出） */
    const labelSprs = [];
    wps.forEach(p => {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf0c168 }));
      ball.position.set(p.x, p.y, p.z);
      scene.add(ball);
      const lc = document.createElement('canvas'); lc.width = 320; lc.height = 88;
      const lctx = lc.getContext('2d');
      lctx.fillStyle = 'rgba(16,22,30,.88)';
      lctx.fillRect(6, 8, 308, 66);
      lctx.strokeStyle = '#d4a24e'; lctx.lineWidth = 3;
      lctx.strokeRect(6, 8, 308, 66);
      lctx.fillStyle = '#f0c168';
      lctx.font = '600 38px "Noto Serif SC", "STSong", "SimSun", serif';
      lctx.textAlign = 'center'; lctx.textBaseline = 'middle';
      lctx.fillText(p.name, 160, 42);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(lc), transparent: true }));
      spr.position.set(p.x, p.y + 2.6, p.z);
      scene.add(spr);
      labelSprs.push(spr);
    });

    /* 地形高度查询（HUD 用，真实海拔无垂直夸张） */
    const terrainAlt = (x, z) => sample((x + wKm / 2) / wKm, (z + hKm / 2) / hKm);

    /* 相机专用平滑路径：路线 tube 保持原样（routePts 不动），
       camPath 做 3 次 ±8 移动平均 + 前后向最大坡度钳制 + 轻量贴地，消除 SRTM 格网噪声导致的颠簸 */
    const camPath = routePts.map(p => p.clone());
    for (let pass = 0; pass < 3; pass++) {
      const ys = camPath.map(p => p.y);
      for (let i = 0; i < camPath.length; i++) {
        let sum = 0, n = 0;
        for (let j = Math.max(0, i - 8); j <= Math.min(camPath.length - 1, i + 8); j++) { sum += ys[j]; n++; }
        camPath[i].y = sum / n;
      }
    }
    const MAX_DY = 0.15;   // 相邻采样最大高差（世界单位）
    for (let i = 1; i < camPath.length; i++)
      camPath[i].y = clamp(camPath[i].y, camPath[i - 1].y - MAX_DY, camPath[i - 1].y + MAX_DY);
    for (let i = camPath.length - 2; i >= 0; i--)
      camPath[i].y = clamp(camPath[i].y, camPath[i + 1].y - MAX_DY, camPath[i + 1].y + MAX_DY);
    camPath.forEach(p => {
      const ground = terrainAlt(p.x, p.z) / 1000 * VEX + 0.5;
      if (p.y < ground) p.y = ground;
    });

    /* ── 轨道交互 ── */
    let oDrag = null;
    canvas.addEventListener('pointerdown', e => {
      if (fly.active) return;
      oDrag = { x: e.clientX, y: e.clientY, az: orbit.az, pol: orbit.pol };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!oDrag || fly.active) return;
      orbit.az = oDrag.az - (e.clientX - oDrag.x) * 0.005;
      orbit.pol = clamp(oDrag.pol + (e.clientY - oDrag.y) * 0.005, POL_MIN, POL_MAX);
    });
    canvas.addEventListener('pointerup', () => { oDrag = null; });
    canvas.addEventListener('wheel', e => {
      if (!e.ctrlKey && !e.metaKey) return;   // 普通滚轮不劫持页面滚动
      e.preventDefault();
      orbit.dist = clamp(orbit.dist * Math.exp(e.deltaY * 0.0015), DIST_MIN, DIST_MAX);
    }, { passive: false });
    zoomIn.addEventListener('click', () => { orbit.dist = clamp(orbit.dist * 0.8, DIST_MIN, DIST_MAX); });
    zoomOut.addEventListener('click', () => { orbit.dist = clamp(orbit.dist * 1.25, DIST_MIN, DIST_MAX); });

    /* ── 穿越 ── */
    flyBtn.addEventListener('click', () => {
      if (!fly.active) {
        fly.active = true; fly.paused = false; fly.t = 0; fly.returning = 0;
        camInit = false;   // 重新穿越时阻尼状态重置到新起点
        flyBtn.textContent = '⏸ 暂停';
        hud.classList.add('show');
        if (window.CGAudio) { window.CGAudio.sfx('whoosh'); window.CGAudio.flyBoost(true); }
      } else {
        fly.paused = !fly.paused;
        flyBtn.textContent = fly.paused ? '▶ 继续' : '⏸ 暂停';
        if (window.CGAudio) window.CGAudio.flyBoost(!fly.paused);
      }
    });

    const ease = t => t * t * t * (t * (t * 6 - 15) + 10);   // smootherstep
    const currentLook = new THREE.Vector3();
    const _op = new THREE.Vector3();
    /* 相机时间域阻尼状态 */
    const smPos = new THREE.Vector3(), smLook = new THREE.Vector3();
    let camInit = false, lastHud = 0;
    function orbitPose(out) {
      const sp = Math.sin(orbit.pol), cp = Math.cos(orbit.pol);
      out.set(
        orbit.target.x + orbit.dist * cp * Math.sin(orbit.az),
        orbit.target.y + orbit.dist * sp,
        orbit.target.z + orbit.dist * cp * Math.cos(orbit.az));
      return out;
    }
    function flyFrame(dt) {
      if (fly.active && !fly.paused) {
        fly.t += dt / 34;
        if (fly.t >= 1) {
          /* 穿越结束：记录当前位姿，平滑回归俯瞰 */
          fly.t = 1; fly.active = false;
          fly.returning = 1e-6;
          fly.returnFrom = camera.position.clone();
          fly.returnLook = currentLook.clone();
          flyBtn.textContent = '▶ 开始穿越';
          camInit = false;
          if (window.CGAudio) window.CGAudio.flyBoost(false);
        }
      }
      if (fly.active) {
        const et = ease(fly.t);
        const fi = et * (camPath.length - 1);
        const i0 = Math.floor(fi), i1 = Math.min(i0 + 1, camPath.length - 1), ft = fi - i0;
        const p = camPath[i0].clone().lerp(camPath[i1], ft);
        /* 方向用前后各 14 个采样点差分，抗格网噪声 */
        const iA = Math.max(0, i0 - 14), iB = Math.min(camPath.length - 1, i0 + 14);
        const dir = camPath[iB].clone().sub(camPath[iA]).normalize();
        const targetPos = p.clone().addScaledVector(dir, -3.2);
        targetPos.y = p.y + 2.1;
        const g2 = terrainAlt(targetPos.x, targetPos.z) / 1000 * VEX + 1.0;
        if (targetPos.y < g2) targetPos.y = g2;
        const li = Math.min(camPath.length - 1, i0 + 16);
        const targetLook = camPath[li].clone();
        targetLook.y += 1.2;
        if (!camInit) { smPos.copy(targetPos); smLook.copy(targetLook); camInit = true; }
        smPos.lerp(targetPos, 1 - Math.exp(-dt * 4));
        smLook.lerp(targetLook, 1 - Math.exp(-dt * 3));
        camera.position.copy(smPos);
        currentLook.copy(smLook);
        camera.lookAt(smLook);
        /* HUD 5Hz 节流，避免文字高频闪动 */
        const now = performance.now();
        if (now - lastHud > 200) {
          lastHud = now;
          const alt = terrainAlt(p.x, p.z);
          const temp = 18 - 0.006 * (alt - 2300);
          hud.innerHTML = `海拔 ${Math.round(alt)} m<br>推算气温 ≈ ${temp.toFixed(1)} ℃<br>等效含氧 ≈ ${Math.round(oxygenAt(alt))}%`;
        }
      } else if (fly.returning > 0) {
        fly.returning = Math.min(1, fly.returning + dt / 1.4);
        const k = ease(fly.returning);
        camera.position.lerpVectors(fly.returnFrom, orbitPose(_op), k);
        currentLook.lerpVectors(fly.returnLook, orbit.target, k);
        camera.lookAt(currentLook);
        if (fly.returning >= 1) { fly.returning = 0; hud.classList.remove('show'); }
      } else {
        camera.position.copy(orbitPose(_op));
        camera.lookAt(orbit.target);
      }
    }

    /* ── 渲染循环（仅在视口内运行） ── */
    function resize() {
      const w2 = stageBox.clientWidth, h2 = stageBox.clientHeight;
      renderer.setSize(w2, h2);
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
    }
    addEventListener('resize', resize);

    const visIO = new IntersectionObserver(es => {
      es.forEach(e => {
        if (e.isIntersecting && !running && !disposed) {
          running = true; lastT = 0; raf = requestAnimationFrame(loop);
        } else if (!e.isIntersecting) {
          running = false; cancelAnimationFrame(raf);
        }
      });
    }, { threshold: 0.05 });
    visIO.observe(stageBox);

    function loop(t) {
      if (!running || disposed) return;
      const dt = lastT ? Math.min((t - lastT) / 1000, 0.1) : 0.016;
      lastT = t;
      flyFrame(dt);
      /* 名牌：表观尺寸按距离补偿（近小远大），贴脸渐隐，穿越时不挡视野 */
      for (let i = 0; i < labelSprs.length; i++) {
        const spr = labelSprs[i];
        const dist = camera.position.distanceTo(spr.position);
        const f = clamp(dist / 60, 0.4, 2.4);
        spr.scale.set(4.3 * f, 1.18 * f, 1);
        spr.material.opacity = clamp((dist - 6) / 14, 0, 0.95);
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    }
  }
}

/* ── 循环视频（无缝 loop）：统一注册与播放管理 ──
   经典滚动模式：IntersectionObserver 驱动播放/暂停；
   剧场模式：仅当前场景 + 当前步骤内的视频播放；
   RM：不自动播放，停留 poster 静帧；加载失败优雅回退静态图。 */
const LOOP_VIDEOS = [];
function makeLoopVideo(id, cls) {
  const v = document.createElement('video');
  v.className = cls || 'loop-video';
  v.muted = true; v.loop = true; v.playsInline = true;
  v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
  v.preload = 'none';
  v.poster = `assets/img/decision-${id}.jpg`;
  v.dataset.gate = id;
  v.autoplay = false;
  LOOP_VIDEOS.push(v);
  return v;
}
function attachLoopVideo(v, id, onFail) {
  const src = document.createElement('source');
  src.src = `assets/video/${id}-loop.mp4`;
  src.type = 'video/mp4';
  src.addEventListener('error', () => { fail(); });
  v.addEventListener('error', fail);
  v.appendChild(src);
  let failed = false;
  function fail() {
    if (failed) return;
    failed = true;
    v.__failed = true;
    const i = LOOP_VIDEOS.indexOf(v);
    if (i >= 0) LOOP_VIDEOS.splice(i, 1);
    v.remove();
    if (onFail) onFail();
  }
  if (v.poster) {
    /* poster 探测：decision 图缺失则退 gate 图 */
    const im = new Image();
    im.onerror = () => { v.poster = `assets/img/gate-${id}.jpg`; };
    im.src = v.poster;
  }
  return v;
}
function loopVideoActive(v) {
  if (v.__failed) return false;
  if (document.documentElement.classList.contains('theater')) {
    const scene = v.closest('.scene-active');
    if (!scene) return false;
    const gs = v.closest('.gstep');
    if (gs && !gs.classList.contains('gs-active')) return false;
    const dt = v.closest('.decision-theater');
    if (dt && !dt.classList.contains('on')) return false;
    return true;
  }
  return !!v.__inView;
}
function syncLoopVideos() {
  LOOP_VIDEOS.forEach(v => {
    const want = loopVideoActive(v) && !RM;
    if (want && v.paused) v.play().catch(() => {});
    else if (!want && !v.paused) v.pause();
  });
}
/* 经典模式兜底：IO 驱动 __inView */
function observeLoopVideos() {
  const io = new IntersectionObserver(es => es.forEach(e => {
    e.target.__inView = e.isIntersecting;
    syncLoopVideos();
  }), { threshold: 0.05 });
  LOOP_VIDEOS.forEach(v => io.observe(v));
}
window.__syncLoopVideos = syncLoopVideos;

/* ── 险关渲染主函数 ── */
function renderGates(gates) {
  const root = $('#gates');
  gates.forEach(g => {
    const sec = el('section', { class: 'gate', id: 'gate-' + g.id }, root);

    /* 节头 */
    const head = el('div', { class: 'gate-header reveal' }, sec);
    el('span', { class: 'gate-no', text: g.order }, head);
    el('h2', { class: 'gate-title', text: g.name }, head);
    el('span', { class: 'gate-badge', text: g.type }, head);
    el('span', { class: 'gate-meta', text: `${g.date} · ${g.location}` }, head);
    const taglineEl = el('p', { class: 'gate-tagline reveal', text: g.tagline }, sec);

    /* 入场插图：循环视频优先，失败回退静态图，再失败隐藏 */
    const art = el('div', { class: 'gate-art' }, sec);
    const artVideo = attachLoopVideo(makeLoopVideo(g.id, 'loop-video gate-art-video'), g.id, () => {
      const img = el('img', { 'data-art': `assets/img/gate-${g.id}.jpg`, alt: `${g.name} 配图` }, art);
      img.addEventListener('error', () => art.remove());
      img.src = img.dataset.art;
    });
    art.appendChild(artVideo);

    /* 数字仪表盘 */
    const dashPanel = el('div', { class: 'panel reveal' }, sec);
    el('h4', { text: '数字险关' }, dashPanel);
    const dash = el('div', { class: 'dash' }, dashPanel);
    g.dash.forEach(d => {
      const item = el('div', { class: 'dash-item' + (d.warn ? ' warn' : '') }, dash);
      el('b', { text: '0' }, item);
      el('span', { text: `${d.label}（${d.unit}）` }, item);
      onceVisible(item, () => countUp(item.querySelector('b'), d.value, decimalsOf(d.value), 1500), 0.5);
    });

    /* 科学信息面板 */
    const sciPanel = el('div', { class: 'panel reveal' }, sec);
    el('h4', { text: '科学解码' }, sciPanel);
    const grid = el('div', { class: 'science-grid' }, sciPanel);
    g.science.forEach(s => {
      const card = el('div', { class: 'scard' }, grid);
      el('h5', { html: `${s.kind}<em>${s.title}</em>` }, card);
      const dl = el('dl', {}, card);
      s.items.forEach(it => {
        el('dt', { text: it.k }, dl);
        const dd = el('dd', { text: it.v }, dl);
        el('small', { text: it.note }, dd);
      });
    });

    /* 特色可视化 */
    let t3dPanel = null;
    if (g.id === 'jiajinshan') {
      /* 旗舰：Three.js 3D 地形穿越（真实 SRTM），置于 2D 剖面之前 */
      const t3d = t3dPanel = el('div', { class: 'panel feature reveal t3d-panel' }, sec);
      el('h4', { text: '3D 地形穿越 · 硗碛 → 王母寨垭口 → 达维（真实 SRTM 地形）' }, t3d);
      const stage3d = el('div', { class: 't3d-stage' }, t3d);
      el('div', { class: 't3d-loading', text: '准备加载 3D 地形…' }, stage3d);
      el('div', { class: 't3d-hud' }, stage3d);
      const ctrls = el('div', { class: 't3d-controls' }, stage3d);
      el('button', { class: 't3d-fly', type: 'button', text: '▶ 开始穿越' }, ctrls);
      el('button', { class: 't3d-zoomin', type: 'button', text: '＋', title: '拉近' }, ctrls);
      el('button', { class: 't3d-zoomout', type: 'button', text: '－', title: '拉远' }, ctrls);
      el('div', { class: 't3d-hint', text: '拖拽环绕 · Ctrl+滚轮缩放 · ＋－按钮' }, stage3d);
      el('p', { class: 'feature-note', text: '地形数据：NASA SRTM（terrarium z12，约65×95km），垂直夸张 1.3×；「王母寨垭口」途经点按 SRTM 山脊匹配（格网高度 3958m 与实测 4114m 存在约 4% 格网误差）。' }, t3d);
      initTerrain3D(t3d);
    }
    const feat = el('div', { class: 'panel feature reveal' }, sec);
    if (g.id === 'jiajinshan') {
      el('h4', { text: '地形剖面 · 硗碛 → 达维（约50km）' }, feat);
      const wrap = el('div', { class: 'profile-wrap' }, feat);
      const cv = el('canvas', { class: 'profile-canvas' }, wrap);
      const ro = el('div', { class: 'profile-readout' }, feat);
      el('p', { class: 'feature-note', text: '鼠标移动或拖动右侧海拔滑杆，读取里程 / 海拔 / 推算气温（0.6℃/100m 递减）/ 等效含氧（标准大气对照表插值）；标注「待考」点为插值推算。' }, feat);
      renderProfile(cv, g.profile, ro);
    } else if (g.id === 'songpan') {
      el('h4', { text: '地层剖面示意 · 为什么会陷人' }, feat);
      const svg = el('svg:svg', {}, feat);
      const tip = el('div', { class: 'strata-tip' }, feat);
      el('p', { class: 'feature-note', text: '海拔高气温低蒸发弱 + 四周高中间低排水不畅 + 冻土与基岩隔水 → 地表常年过湿，草甸之下泥炭深达数米。' }, feat);
      renderStrata(svg, tip);
    } else if (g.id === 'luding') {
      el('h4', { text: '铁索桥侧视示意 + 大渡河汛期水流' }, feat);
      const svg = el('svg:svg', {}, feat);
      const rc = el('canvas', { class: 'river-canvas' }, feat);
      el('p', { class: 'feature-note', text: '泸定站汛期平均流量 1460 m³/s（年最大洪峰多在6–9月）；5月底正值汛期开始、冰雪融水叠加（当年流量无实测，待考）。' }, feat);
      renderLuding(svg, rc);
    } else if (g.id === 'jiaopingdu') {
      el('h4', { text: '渡口俯视 · 6 条木船的 7 天 7 夜' }, feat);
      const svg = el('svg:svg', {}, feat);
      const counter = el('div', { class: 'ferry-counter' }, feat);
      const d1 = el('div', {}, counter), d2 = el('div', {}, counter), d3 = el('div', {}, counter);
      const dayB = el('b', { text: '—' }, d1); el('span', { text: '摆渡进度' }, d1);
      const cntB = el('b', { text: '—' }, d2); el('span', { text: '累计渡江' }, d2);
      el('b', { text: '0' }, d3); el('span', { text: '损失（未失一人一马）' }, d3);
      el('p', { class: 'feature-note', text: '演示动画为节奏示意：6条木船、37名船工昼夜摆渡；实际历时7天7夜（一说7条船、九天九夜），3万余人全部过江。' }, feat);
      renderJiaopingdu(svg, dayB, cntB);
    } else if (g.id === 'lazikou') {
      el('h4', { text: '峡谷横截面 · 8m 隘口 vs 100m 崖壁' }, feat);
      const svg = el('svg:svg', {}, feat);
      el('p', { class: 'feature-note', text: '隘口最窄处仅约 8 m（一说隘口段宽约 30 m），两侧 100 多米陡峭石崖；腊子河穿口而过，1m 木桥与桥头碉堡扼守唯一通道。海拔约 2200 m（待考）。' }, feat);
      renderLazikou(svg);
    }
    /* 氛围粒子：雪山飘雪 / 草地雾气 / 河面波光 / 隘口尘埃光柱 */
    initAmbient(feat, { jiajinshan: 'snow', songpan: 'fog', luding: 'sparkle', jiaopingdu: 'sparkle', lazikou: 'dust' }[g.id]);

    /* 历史事实 */
    const hist = el('div', { class: 'panel reveal' }, sec);
    el('h4', { text: '历史事实' }, hist);
    const hb = el('div', { class: 'history-block' }, hist);
    el('p', { class: 'h-event', html: `<strong>事件：</strong>${g.history.event}` }, hb);
    el('p', { class: 'h-unit', html: `<strong>部队：</strong>${g.history.unit}` }, hb);
    el('p', { class: 'h-casualty', html: `<strong>减员：</strong>${g.history.casualty}` }, hb);
    el('p', { class: 'history-sources', text: '来源：' + g.history.sources.join('、') }, hb);

    /* 决策时刻 · 视觉小说式剧场 */
    const dec = el('div', { class: 'panel decision reveal' }, sec);
    el('h4', { text: '决策时刻' }, dec);
    el('p', { class: 'decision-q', text: g.decision.question }, dec);
    const optBox = el('div', { class: 'decision-options' }, dec);

    /* 剧场舞台（点选后进入） */
    const th = el('div', { class: 'decision-theater' }, dec);
    const thBg = el('div', { class: 'dt-bg' }, th);
    el('div', { class: 'dt-vignette' }, th);
    const thTag = el('div', { class: 'dt-tag' }, th);
    const thCap = el('div', { class: 'dt-caption' }, th);
    const thText = el('span', { class: 'dt-text' }, thCap);
    el('span', { class: 'dt-cursor', text: '▍' }, thCap);
    const thNext = el('button', { class: 'dt-next', type: 'button', text: '▸ 继续' }, th);
    const thOut = el('div', { class: 'dt-outcome' }, th);
    el('h5', { text: '推演结果' }, thOut);
    const thStamp = el('div', { class: 'dt-stamp' }, thOut);
    const thTruth = el('div', { class: 'decision-truth dt-truth' }, th);
    const thActions = el('div', { class: 'dt-actions' }, th);
    const thReplay = el('button', { class: 'dt-replay', type: 'button', text: '↺ 重新抉择' }, thActions);
    const thNextScene = el('button', { class: 'dt-nextscene', type: 'button', text: '下一幕 ▶' }, thActions);
    thNextScene.addEventListener('click', () => { if (window.__theaterNext) window.__theaterNext(); });

    /* 背景：decision 循环视频 → decision/gate 静态图 Ken Burns → 纯 CSS 深色渐变 */
    (function probeBg(id) {
      const dtv = attachLoopVideo(makeLoopVideo(id, 'loop-video dt-video'), id, fallbackImg);
      dtv.addEventListener('canplay', () => {
        thBg.classList.remove('has-img');   // 视频可用时关掉图片层
        th.insertBefore(dtv, thBg);
        syncLoopVideos();
      }, { once: true });
      dtv.load();
      function fallbackImg() {
        const tryLoad = (src, next) => {
          const im = new Image();
          im.onload = () => { thBg.style.backgroundImage = `url('${src}')`; thBg.classList.add('has-img'); };
          im.onerror = () => next && next();
          im.src = src;
        };
        tryLoad(`assets/img/decision-${id}.jpg`, () => tryLoad(`assets/img/gate-${id}.jpg`, null));
      }
    })(g.id);

    let dtTimer = 0, dtLines = [], dtIdx = 0, dtTyping = false, dtOpt = null;
    function dtCleanup() { clearInterval(dtTimer); dtTimer = 0; dtTyping = false; }

    function playLine() {
      dtCleanup();
      const line = dtLines[dtIdx];
      thNext.classList.add('show');
      thText.textContent = '';
      dtTyping = true;
      if (window.CGAudio && window.CGAudio.duck) window.CGAudio.duck(true);
      let i = 0;
      dtTimer = setInterval(() => {
        i++;
        thText.textContent = line.slice(0, i);
        if (i % 4 === 0 && window.CGAudio) window.CGAudio.sfx('type');   // 每 4 字极轻 tick
        if (i >= line.length) dtCleanup();
      }, 1000 / 28);   // ≈28 字/秒
    }

    function showOutcome() {
      thNext.classList.remove('show');
      thCap.classList.add('dt-hide');   // 结果阶段字幕条让位
      th.classList.add('dt-dim');       // 背景整体压暗一档，保证文字对比度
      if (window.CGAudio && window.CGAudio.duck) window.CGAudio.duck(false);
      const opt = dtOpt;
      opt.outcome.forEach(o => {
        const row = el('div', { class: 'obar' }, null);
        el('span', { text: o.label }, row);
        const track = el('div', { class: 'obar-track' }, row);
        const fill = el('div', { class: 'obar-fill' }, track);
        el('b', { text: o.level }, row);
        thOut.insertBefore(row, thStamp);
        requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = o.pct + '%'; }));
      });
      thOut.classList.add('show');
      /* 判定印章 */
      let cls, text;
      if (opt.key === g.decision.history.choice) { cls = 'stamp-gold'; text = '与历史同途'; }
      else {
        const mx = Math.max(...opt.outcome.map(o => o.pct));
        cls = mx >= 80 ? 'stamp-red' : mx >= 50 ? 'stamp-orange' : 'stamp-cyan';
        text = mx >= 80 ? '危局' : mx >= 50 ? '险中求' : '尚可一搏';
      }
      thStamp.textContent = text;
      thStamp.classList.add(cls);
      setTimeout(() => {
        thStamp.classList.add('slam');
        if (window.CGAudio) window.CGAudio.sfx('thud');
      }, RM ? 0 : 450);
      thTruth.innerHTML =
        `<strong>历史的选择：${g.decision.history.choice}</strong> — ${g.decision.history.text}` +
        `<small>史料来源：${g.decision.history.source}</small>`;
      setTimeout(() => thTruth.classList.add('show'), RM ? 0 : 850);
      setTimeout(() => thActions.classList.add('show'), RM ? 0 : 1150);
    }

    function advance() {
      if (dtTyping) {   // 打字中：立即补全当前行
        dtCleanup();
        thText.textContent = dtLines[dtIdx];
        return;
      }
      dtIdx++;
      if (dtIdx < dtLines.length) playLine();
      else showOutcome();
    }
    thNext.addEventListener('click', () => { if (window.CGAudio) window.CGAudio.sfx('tick'); });
    thNext.addEventListener('click', advance);
    thCap.addEventListener('click', advance);

    function startTheater(opt) {
      dtOpt = opt;
      sec.dataset.decisionState = 'done';   // 已抉择：解锁前进（重新抉择不再回锁）
      const thNextBtn = document.querySelector('.th-next');
      if (thNextBtn) thNextBtn.classList.remove('locked');
      dtCleanup();
      thOut.classList.remove('show');
      thOut.querySelectorAll('.obar').forEach(n => n.remove());
      thStamp.className = 'dt-stamp'; thStamp.textContent = '';
      thTruth.classList.remove('show');
      thActions.classList.remove('show');
      thCap.querySelectorAll('.dt-line').forEach(n => n.remove());
      thCap.classList.remove('dt-hide');
      th.classList.remove('dt-dim');
      thText.style.display = '';
      thText.textContent = '';
      optBox.classList.add('hidden');
      th.classList.add('on');
      syncLoopVideos();
      thTag.textContent = `决策时刻 · 你的选择：${opt.key}`;
      dtLines = opt.lines || [];
      if (!dtLines.length) { showOutcome(); return; }
      if (RM || innerWidth <= 720) {
        /* RM / 移动端：一次性渲染全部行，无打字机 */
        thText.style.display = 'none';
        dtLines.forEach(l => el('div', { class: 'dt-line', text: l }, thCap));
        thNext.classList.add('show');
        dtIdx = dtLines.length - 1;
      } else {
        dtIdx = 0;
        playLine();
      }
    }

    thReplay.addEventListener('click', () => {
      dtCleanup();
      th.classList.remove('on');
      optBox.classList.remove('hidden');
      syncLoopVideos();
      optBox.querySelectorAll('.decision-btn').forEach(b => {
        b.classList.remove('picked', 'dim');
        const badge = b.querySelector('.hist-badge');
        if (badge) badge.remove();
      });
      thText.textContent = '';
      thCap.querySelectorAll('.dt-line').forEach(n => n.remove());
    });

    g.decision.options.forEach(opt => {
      const btn = el('button', { class: 'decision-btn', type: 'button', 'data-key': opt.key }, optBox);
      el('span', { class: 'opt-key', text: opt.key }, btn);
      btn.appendChild(document.createTextNode(opt.text));
      btn.addEventListener('click', () => {
        optBox.querySelectorAll('.decision-btn').forEach(b => {
          b.classList.toggle('picked', b === btn);
          b.classList.toggle('dim', b !== btn);
          /* 无论选对选错，都在历史正确选项上揭示徽章（不提前剧透） */
          if (b.dataset.key === g.decision.history.choice && !b.querySelector('.hist-badge')) {
            el('span', { class: 'hist-badge', text: '历史的选择' }, b);
          }
        });
        if (window.CGAudio) window.CGAudio.sfx('tick');
        startTheater(opt);
      }, { once: false });
    });

    /* 剧场模式步骤分组（经典滚动模式下 .gstep 为 display:contents，不改变布局与行为） */
    const gsteps = [
      [head, taglineEl, art], [dashPanel], [sciPanel],
      ...(t3dPanel ? [[t3dPanel]] : []),
      [feat], [hist], [dec],
    ];
    sec.dataset.decisionState = 'pending';   // 剧场模式决策锁定用
    gsteps.forEach((nodes, i) => {
      const gs = el('div', { class: 'gstep' + (i === 0 ? ' gs-entry' : '') + (nodes.includes(dec) ? ' gs-decision' : '') }, null);
      /* 剧场氛围层：压暗关图 + 超大半透明关次水印（经典模式 display:contents 下不渲染） */
      const bg = el('div', { class: 'gs-bg' }, gs);
      const pim = new Image();
      pim.onload = () => { bg.style.backgroundImage = `url('assets/img/decision-${g.id}.jpg')`; };
      pim.onerror = () => { bg.style.backgroundImage = `url('assets/img/gate-${g.id}.jpg')`; };
      pim.src = `assets/img/decision-${g.id}.jpg`;
      el('span', { class: 'gs-mark', text: g.order.replace('GATE ', '') }, gs);
      const inner = el('div', { class: 'gs-scale' }, gs);   // 单屏适配缩放包裹层
      nodes.forEach(n => { if (n && n.isConnected) inner.appendChild(n); });
      sec.appendChild(gs);
    });
  });
}

/* ────────────────────────────────
   4. 结语 / 尾声
   ──────────────────────────────── */
function collectSources(gates) {
  const all = new Set();
  gates.forEach(g => g.history.sources.forEach(s => all.add(s)));
  return [...all];
}

/* 尾声 · 滚动字幕内容（与结语页同源生成，不手抄来源列表） */
function renderFinale(gates) {
  const track = $('#finale-track');
  const mk = (cls, html) => el('div', { class: 'cr-item ' + cls, html }, track);
  mk('cr-para', '1936年10月，红一、二、四方面军在甘肃会宁胜利会师，长征宣告结束。约二万五千里征程，翻越18座大山，跨过24条大河，历经380余次战斗。');
  mk('cr-gap', '');
  [
    ['皎平渡', '6条木船 · 7天7夜 · 3万余人未失一人一马'],
    ['泸定桥', '一昼夜240里 · 22名勇士 · 13根铁索'],
    ['夹金山', '海拔4114米 · 含氧六成 · 单衣草鞋过雪线'],
    ['松潘草地', '300公里沼泽 · 5–7天 · 与断粮和泥潭赛跑'],
    ['腊子口', '8米隘口 · 攀崖迂回 · 一夜破关'],
  ].forEach(([n, t]) => mk('cr-gate', `<b>${n}</b><span>${t}</span>`));
  mk('cr-gap', '');
  mk('cr-h', '数据来源');
  mk('cr-line', '标准地图 审图号 GS(2023)2767号（自然资源部监制 · 原幅引用）');
  mk('cr-line', '地形 NASA SRTM（terrarium z12）');
  collectSources(gates).forEach(src => mk('cr-line', src));
  mk('cr-line', '科学数据《长征险阻解码——五大险关科学数据（调研稿，2026-09）》');
  mk('cr-line', '推算方法：气温垂直递减率 0.6℃/100m、海拔—含氧对照表插值（非 1935 年实测）');
  mk('cr-line', '音乐：Imperial China Cinematic — Shane Ivers（CC BY 4.0，经压缩）；加载失败时回退原创生成式配乐');
  mk('cr-gap', '');
  mk('cr-line', '制作：原生 Web 技术 · Three.js 3D 地形 · WebAudio 程序化音景 · Remotion 动态影像');
  mk('cr-final', '谨以此作品<br>纪念中国工农红军长征胜利90周年');

  const actions = $('#finale-actions');
  const replay = el('button', { class: 'fa-btn', type: 'button', text: '重走一遍 ↺' }, actions);
  replay.addEventListener('click', () => {
    if (window.__theaterGoTo && window.__theaterGoTo('hero')) return;
    scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' });
  });
  const srcBtn = el('button', { class: 'fa-btn fa-sources', type: 'button', text: '查看数据来源 ▶' }, actions);
  srcBtn.addEventListener('click', () => {
    if (window.__theaterGoTo && window.__theaterGoTo('colophon')) return;
    $('#colophon').scrollIntoView({ behavior: RM ? 'auto' : 'smooth' });
  });
  const freeBtn = el('button', { class: 'fa-btn fa-scroll', type: 'button', text: '自由滚动' }, actions);
  freeBtn.addEventListener('click', () => { const t = document.querySelector('.theater-toggle'); if (t) t.click(); });
}

function renderColophon(gates) {
  const box = $('#colophon-sources');
  const all = new Set(collectSources(gates));
  el('p', { class: 'source-item', html: '<strong style="color:var(--paper)">史料与数据来源（按险关汇总去重）：</strong>' }, box);
  [...all].forEach(s => el('p', { class: 'source-item', text: '· ' + s }, box));
  el('p', { class: 'source-item', text: '· 地图底图：自然资源部标准地图，审图号 GS(2023)2767号（原幅引用，未做修改；路线与标注为独立叠加层）' }, box);
  el('p', { class: 'source-item', text: '· 科学数据整理自《长征险阻解码——五大险关科学数据（调研稿，2026-09）》，「待考」项均已在页面保留标注' }, box);
  el('p', { class: 'source-item', text: '· 背景音乐：Imperial China Cinematic — Shane Ivers（silvermansound.com），CC BY 4.0 许可证（经压缩至 128kbps）；加载失败时回退站内原创生成式配乐（A 宫五声，WebAudio 实时合成）' }, box);

  el('p', { class: 'source-item', html: '<strong style="color:var(--paper)">数据推算方法：</strong>' }, box);
  el('p', { class: 'source-item', text: '· 气温垂直递减率：海拔每升高 100 m，气温约降 0.6 ℃（通用气象学规律，用于推算，非 1935 年实测）' }, box);
  const tbl = el('table', { class: 'method-table' }, box);
  tbl.innerHTML =
    '<tr><th>海拔</th><td>0m</td><td>1000m</td><td>2000m</td><td>3000m</td><td>3500m</td><td>4000m</td><td>4500m</td></tr>' +
    '<tr><th>等效含氧</th><td>100%</td><td>89%</td><td>79%</td><td>70%</td><td>66%</td><td>62%</td><td>58%</td></tr>';
  el('p', { class: 'source-item', text: '· 海拔—含氧对照表（工程标准附录、国家矿山安全监察局），页面读数按此表线性插值' }, box);
}

/* ────────────────────────────────
   5. 滚动淡入
   ──────────────────────────────── */
function initReveal() {
  const io = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(n => io.observe(n));
}

/* ────────────────────────────────
   6. 整站剧场模式（游戏式分幕）
   默认开启：innerWidth>900 且非 RM；否则保持经典滚动模式（零改动）。
   ──────────────────────────────── */
function initTheater(gatesData) {
  const htmlEl = document.documentElement;
  const GATE_ORDER = ['jiaopingdu', 'luding', 'jiajinshan', 'songpan', 'lazikou'];
  const NUM_CN = ['一', '二', '三', '四', '五'];

  const scenes = [
    { id: 'hero', el: $('#hero'), label: '序章', steps: 1 },
    { id: 'background', el: $('#background'), label: '背景', steps: 1 },
    { id: 'map', el: $('#map-main'), label: '长征地图', steps: 10 },
    ...GATE_ORDER.map((id, i) => {
      const g = gatesData.gates.find(x => x.id === id);
      return {
        id: 'gate-' + id, el: $('#gate-' + id), label: g.name, gate: g, num: NUM_CN[i],
        steps: $('#gate-' + id).querySelectorAll('.gstep').length,
      };
    }),
    { id: 'finale', el: $('#finale'), label: '尾声', steps: 1 },
    { id: 'colophon', el: $('#colophon'), label: '结语', steps: 1 },
  ];
  const totalSteps = scenes.reduce((a, s) => a + s.steps, 0);
  const cumBefore = []; { let c = 0; scenes.forEach(s => { cumBefore.push(c); c += s.steps; }); }

  let active = false, sceneIdx = 0, stepIdx = 0, wheelLock = 0;
  const beat = { beat: 0 };   // 地图场景的 beat 状态（initMap 每帧读取）
  beat.sync = b => {   // 时间轴刷选 → 同步剧场步进（保留浮点平滑）
    if (!active || scenes[sceneIdx].id !== 'map') return;
    stepIdx = clamp(Math.round(b), 0, scenes[sceneIdx].steps - 1);
    apply(sceneIdx, true);
  };

  /* ── UI：切换按钮 / 翻页按钮 / 章节轨道 ── */
  const toggle = el('button', { class: 'theater-toggle', type: 'button', text: '剧场模式 ⛶' }, document.body);
  const nav = el('div', { class: 'th-nav' }, document.body);
  const prevBtn = el('button', { class: 'th-prev', type: 'button', text: '◀ 上一幕' }, nav);
  const nextBtn = el('button', { class: 'th-next', type: 'button', text: '下一幕 ▶' }, nav);
  const rail = el('div', { class: 'th-rail' }, document.body);
  scenes.forEach((s, i) => {
    const item = el('button', { class: 'th-rail-item', type: 'button' }, rail);
    el('span', { class: 'th-rail-dot' }, item);
    el('span', { class: 'th-rail-label', text: s.label }, item);
    item.addEventListener('click', () => goTo(i, 0));
  });

  /* ── 幕间过场（进入险关场景） ── */
  let interTimer = 0;
  const aim = new Image();   // 幕间过场压暗底图（缺失则保持黑金样式）
  aim.onload = () => htmlEl.classList.add('has-act-bg');
  aim.src = 'assets/img/act-transition.jpg';
  function playInterstitial(sc) {
    clearTimeout(interTimer);
    document.querySelectorAll('.th-interstitial').forEach(n => n.remove());
    const it = el('div', { class: 'th-interstitial' }, document.body);
    el('div', { class: 'th-int-no', text: `第${sc.num}险` }, it);
    el('h3', { text: sc.gate.name }, it);
    el('p', { text: sc.gate.tagline }, it);
    el('span', { class: 'th-int-skip', text: '点击继续' }, it);
    it.addEventListener('click', () => { it.classList.add('out'); setTimeout(() => it.remove(), 400); });
    interTimer = setTimeout(() => { it.classList.add('out'); setTimeout(() => it.remove(), 400); }, 1400);
  }

  /* ── 单屏适配：内容超高时对步骤内容整体缩放（k≥0.62，宽度按 1/k 补偿） ── */
  function fitStep() {
    if (!active) return;
    const sc = scenes[sceneIdx];
    let pairs = [];
    if (sc.gate) {
      const gs = sc.el.querySelector('.gstep.gs-active');
      const w = gs && gs.querySelector('.gs-scale');
      if (gs && w) pairs.push([gs, w]);
    } else if (sc.id === 'colophon') {
      const w = sc.el.querySelector('.colophon-inner');
      if (w) pairs.push([sc.el, w]);
    } else if (sc.id === 'background' || sc.id === 'finale') {
      const w = sc.el.querySelector('.gs-scale');
      if (w) pairs.push([sc.el, w]);
    } else if (sc.id === 'map') {
      const w = sc.el.querySelector('.map-narrative');
      if (w) pairs.push([w.parentElement, w]);
    }
    pairs.forEach(([holder, w]) => {
      w.style.transform = ''; w.style.width = '';
      const avail = holder.clientHeight;
      const need = w.scrollHeight;
      let k = 1;
      if (avail > 0 && need > avail) k = Math.max(0.62, avail / need);
      if (k < 0.999) {
        w.style.transform = `scale(${k.toFixed(3)})`;
        w.style.width = (100 / k).toFixed(2) + '%';
      }
      holder.dataset.scaleK = k.toFixed(2);   // QA 断言用
    });
  }

  /* ── 尾声滚动字幕（电影字幕式：固定遮罩框内上滚，终帧停住） ── */
  const finaleMask = $('#finale-mask'), finaleTrack = $('#finale-track'), finaleActions = $('#finale-actions');
  const cr = { active: false, done: false, paused: false, hold: false, y: 0, raf: 0, last: 0, ctrl: null };
  function creditsTick(t) {
    if (!cr.active) return;
    const dt = cr.last ? Math.min((t - cr.last) / 1000, 0.1) : 0.016;
    cr.last = t;
    if (!cr.paused && !cr.hold) {
      const trackH = finaleTrack.scrollHeight, maskH = finaleMask.clientHeight;
      const end = Math.max(0, trackH - maskH * 0.42);
      cr.y = Math.min(end, cr.y + ((trackH + maskH) / 75) * dt);   // 全程约 75s
      finaleTrack.style.transform = `translateY(${(-cr.y).toFixed(1)}px)`;
      if (cr.y >= end) { creditsFinish(); return; }
    }
    cr.raf = requestAnimationFrame(creditsTick);
  }
  function creditsBegin() {
    if (cr.active || cr.done || RM) return;
    cr.active = true; cr.paused = false; cr.y = 0; cr.last = 0;
    finaleTrack.style.transform = 'translateY(0px)';
    finaleActions.classList.add('wait');
    if (!cr.ctrl) {
      cr.ctrl = el('div', { class: 'finale-ctrl' }, null);
      const pauseB = el('button', { class: 'fa-btn', type: 'button', text: '⏸ 暂停' }, cr.ctrl);
      pauseB.addEventListener('click', () => {
        cr.paused = !cr.paused;
        pauseB.textContent = cr.paused ? '▶ 继续' : '⏸ 暂停';
      });
      el('button', { class: 'fa-btn', type: 'button', text: '⏭ 跳过' }, cr.ctrl)
        .addEventListener('click', creditsFinish);
      finaleMask.parentElement.appendChild(cr.ctrl);
    }
    cr.raf = requestAnimationFrame(creditsTick);
  }
  function creditsFinish() {
    cr.active = false; cr.done = true; cr.paused = false;
    cancelAnimationFrame(cr.raf);
    const trackH = finaleTrack.scrollHeight, maskH = finaleMask.clientHeight;
    cr.y = Math.max(0, trackH - maskH * 0.42);
    finaleTrack.style.transform = `translateY(${(-cr.y).toFixed(1)}px)`;
    if (cr.ctrl) { cr.ctrl.remove(); cr.ctrl = null; }
    finaleActions.classList.remove('wait');
    fitStep();
  }
  /* 悬停 / 按住暂停 */
  finaleMask.addEventListener('mouseenter', () => { cr.hold = true; });
  finaleMask.addEventListener('mouseleave', () => { cr.hold = false; });
  finaleMask.addEventListener('touchstart', () => { cr.hold = true; }, { passive: true });
  finaleMask.addEventListener('touchend', () => { cr.hold = false; }, { passive: true });

  /* ── 场景应用 ── */
  function apply(prevSceneIdx, keepBeat) {
    const sc = scenes[sceneIdx];
    window.__theaterScene = sc.id;
    scenes.forEach((s, i) => s.el.classList.toggle('scene-active', i === sceneIdx));
    rail.querySelectorAll('.th-rail-item').forEach((n, i) => n.classList.toggle('cur', i === sceneIdx));
    nextBtn.classList.toggle('pulse', sc.id === 'background');   // 背景场景四段播完后高亮引导
    if (sc.id === 'map') {
      if (!keepBeat) beat.beat = stepIdx;
    } else if (sc.gate) {
      sc.el.querySelectorAll('.gstep').forEach((gs, i) => gs.classList.toggle('gs-active', i === stepIdx));
      const gsel = sc.el.querySelector('.gstep.gs-active');
      if (gsel) gsel.scrollTop = 0;
      if (prevSceneIdx !== undefined && prevSceneIdx !== sceneIdx) playInterstitial(sc);
    }
    /* 进度条：(场景累计 + 步进) / 总量 */
    const within = sc.id === 'map' ? beat.beat : stepIdx;
    $('.progress-bar').style.width = (((cumBefore[sceneIdx] + within + 1) / totalSteps) * 100).toFixed(2) + '%';
    prevBtn.disabled = sceneIdx === 0 && stepIdx === 0;
    nextBtn.disabled = sceneIdx === scenes.length - 1 && stepIdx === scenes[scenes.length - 1].steps - 1;
    nextBtn.classList.toggle('locked', decisionLocked());
    syncLoopVideos();
    /* 尾声场景：启动滚动字幕；离开则暂停 */
    if (sc.id === 'finale') creditsBegin();
    else if (cr.active) { cr.active = false; cancelAnimationFrame(cr.raf); }
    /* 场景环境声 + 配乐心境（剧场模式） */
    if (window.CGAudio) {
      window.__cgaScene = sc.gate ? sc.gate.id : null;
      window.CGAudio.setAmbient(window.__cgaScene);
      if (window.CGAudio.setMood) {
        window.CGAudio.setMood(sc.id === 'hero' ? 'hero' : sc.id === 'background' ? 'background'
          : sc.id === 'map' ? 'map' : sc.gate ? 'gate' : sc.id === 'finale' ? 'finale' : 'colophon');
      }
    }
    requestAnimationFrame(() => requestAnimationFrame(fitStep));
  }

  /* 决策时刻未抉择：锁定前进（上一幕始终放行；经典滚动模式不锁） */
  function decisionLocked() {
    const sc = scenes[sceneIdx];
    if (!sc.gate) return false;
    const gs = sc.el.querySelector('.gstep.gs-active');
    return !!(gs && gs.classList.contains('gs-decision') && sc.el.dataset.decisionState !== 'done');
  }
  function lockFeedback() {
    const sc = scenes[sceneIdx];
    const dec = sc.el.querySelector('.gstep.gs-active .decision');
    if (!dec) return;
    const opts = dec.querySelector('.decision-options');
    opts.classList.remove('shake');
    void opts.offsetWidth;   // 重触发动画
    opts.classList.add('shake');
    let hint = dec.querySelector('.dec-lock-hint');
    if (!hint) hint = el('div', { class: 'dec-lock-hint', text: '⚠ 请先做出你的抉择' }, dec);
    hint.classList.add('show');
    setTimeout(() => hint.classList.remove('show'), 2000);
    if (window.CGAudio) window.CGAudio.sfx('tick');
  }
  function next() {
    const prevS = sceneIdx;
    const sc = scenes[sceneIdx];
    /* 决策时刻未抉择：拦截一切前进输入并反馈 */
    if (decisionLocked()) { lockFeedback(); return; }
    /* 尾声字幕未滚完：先跳到终帧，再按才进结语 */
    if (sc.id === 'finale' && cr.active && !cr.done) { creditsFinish(); return; }
    if (stepIdx < sc.steps - 1) stepIdx++;
    else if (sceneIdx < scenes.length - 1) { sceneIdx++; stepIdx = 0; }
    if (window.CGAudio) window.CGAudio.sfx('whoosh');
    apply(prevS);
  }
  function prev() {
    const prevS = sceneIdx;
    if (stepIdx > 0) stepIdx--;
    else if (sceneIdx > 0) { sceneIdx--; stepIdx = scenes[sceneIdx].steps - 1; }
    if (window.CGAudio) window.CGAudio.sfx('whoosh');
    apply(prevS);
  }
  function goTo(i, st) {
    const prevS = sceneIdx;
    sceneIdx = clamp(i, 0, scenes.length - 1);
    stepIdx = clamp(st || 0, 0, scenes[sceneIdx].steps - 1);
    if (window.CGAudio) window.CGAudio.sfx('whoosh');
    apply(prevS);
  }
  window.__theaterNext = () => { if (active) next(); };
  window.__theaterGoTo = (id) => {
    if (!active) return false;
    const i = scenes.findIndex(s => s.id === id);
    if (i >= 0) { goTo(i, 0); return true; }
    return false;
  };

  /* ── 输入：键盘 / 滚轮 / 触摸 ── */
  addEventListener('keydown', e => {
    if (!active) return;
    if (e.target.matches('input, textarea')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prev(); }
  });
  addEventListener('wheel', e => {
    if (!active || e.ctrlKey || e.metaKey) return;   // ctrl+滚轮留给 3D 缩放
    const now = performance.now();
    if (now - wheelLock < 900) return;
    /* 步骤强制单屏不可滚：滚轮一律翻页；仅 3D 舞台与时间轴豁免 */
    if (e.target.closest('.t3d-stage, .map-timeline')) return;
    if (Math.abs(e.deltaY) < 12) return;
    wheelLock = now;
    if (e.deltaY > 0) next(); else prev();
  }, { passive: true });
  let touchY = null;
  addEventListener('touchstart', e => { if (active) touchY = e.touches[0].clientY; }, { passive: true });
  addEventListener('touchend', e => {
    if (!active || touchY === null) return;
    const now = performance.now();
    if (now - wheelLock < 900) { touchY = null; return; }
    const dy = touchY - e.changedTouches[0].clientY;
    touchY = null;
    if (Math.abs(dy) < 40) return;
    const t = e.target;
    if (t.closest && t.closest('.t3d-stage, .map-timeline')) return;
    wheelLock = now;
    if (dy > 0) next(); else prev();
  }, { passive: true });

  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);
  addEventListener('resize', () => { if (active) fitStep(); });

  /* hero CTA 在剧场模式下改为进入下一场景 */
  $('.hero-cta').addEventListener('click', e => {
    if (!active) return;
    e.preventDefault();
    goTo(1, 0);
  });

  /* ── 模式切换 ── */
  function setTheater(on, save = true, inferFromScroll = true) {
    active = on;
    htmlEl.classList.toggle('theater', on);
    toggle.textContent = on ? '自由滚动 ↩' : '剧场模式 ⛶';
    window.__theater = on ? beat : null;
    window.__theaterScene = on ? scenes[sceneIdx].id : null;
    if (save) { try { localStorage.setItem('cguan-theater', on ? '1' : '0'); } catch (e) { /* file:// 容错 */ } }
    if (on) {
      if (inferFromScroll) {
        /* 从当前滚动位置推断场景 */
        const y = scrollY + innerHeight / 2;
        let best = 0;
        scenes.forEach((s, i) => { if (s.el.offsetTop <= y) best = i; });
        sceneIdx = best;
      } else {
        sceneIdx = 0;
      }
      stepIdx = 0; beat.beat = 0;
      apply();
    } else {
      syncLoopVideos();
      /* 回经典模式：清 beat 卡片态与字幕位移（字幕轨道恢复静态布局），滚到当前场景 */
      const ft = $('#finale-track');
      if (ft) ft.style.transform = '';
      document.querySelectorAll('.narrative-card').forEach(c => c.classList.remove('beat-current'));
      scenes.forEach(s => s.el.classList.remove('scene-active'));
      const target = scenes[sceneIdx].el;
      requestAnimationFrame(() => target.scrollIntoView({ behavior: 'auto', block: 'start' }));
    }
  }
  toggle.addEventListener('click', () => {
    if (window.CGAudio) window.CGAudio.sfx('tick');
    setTheater(!active);
  });

  /* 默认开启条件：宽屏 + 非 RM；localStorage 记忆优先；每次加载都从序章开始 */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  scrollTo(0, 0);
  let saved = null;
  try { saved = localStorage.getItem('cguan-theater'); } catch (e) { /* file:// */ }
  /* 剧场模式默认开启：桌面与移动端一致（一幕一幕滑）；RM 用户保持经典滚动兜底 */
  const canTheater = !RM;
  if (canTheater && saved !== '0') setTheater(true, false, false);
}

/* ────────────────────────────────
   启动
   ──────────────────────────────── */
async function boot() {
  /* 数据经 assets/data/data.js 内联（window 全局），file:// 双击即可运行 */
  const geo = window.MAP_GEOMETRY;
  const gatesData = window.GATES;
  if (!geo || !gatesData) throw new Error('数据未加载：请确认 assets/data/data.js 存在');
  initProgress();
  initHero();
  initMap(geo);
  renderGates(gatesData.gates);
  renderColophon(gatesData.gates);
  renderFinale(gatesData.gates);
  initReveal();
  initTheater(gatesData);
  observeLoopVideos();   /* 经典模式视频播放兜底（剧场模式由 apply 驱动） */

  /* 经典滚动模式环境声：IO 按当前 section 切换（剧场模式由 apply 驱动） */
  if (window.CGAudio) {
    const classic = () => !document.documentElement.classList.contains('theater');
    const gateIO = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting || !classic()) return;
      window.__cgaScene = e.target.id.replace('gate-', '');
      window.CGAudio.setAmbient(window.__cgaScene);
    }), { threshold: 0.35 });
    document.querySelectorAll('.gate').forEach(g => gateIO.observe(g));
    const MOOD_BY_ID = { hero: 'hero', background: 'background', 'map-main': 'map', finale: 'finale', colophon: 'colophon' };
    Object.keys(MOOD_BY_ID).forEach(id => {
      new IntersectionObserver(es => es.forEach(e => {
        if (!e.isIntersecting || !classic()) return;
        window.__cgaScene = null;
        window.CGAudio.setAmbient(null);
        if (window.CGAudio.setMood) window.CGAudio.setMood(MOOD_BY_ID[id]);
      }), { threshold: 0.3 }).observe(document.getElementById(id));
    });
  }
}

boot().catch(err => {
  console.error('初始化失败：', err);
  const m = el('p', {
    style: 'position:fixed;left:16px;bottom:16px;color:#c14b36;font-size:13px;z-index:999',
    text: '初始化失败：数据文件缺失或浏览器不兼容，请使用现代浏览器打开。',
  }, document.body);
});
