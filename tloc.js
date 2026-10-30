// TLOC GĐ1–GĐ5 | tloc.js | Auth + Editor lõi + Media/3D + Animation + Quiz + Pop-up + Phòng/RBAC + /watch + Xuất website ZIP + Kiểm thử, gộp 1 file.
(() => {
'use strict';
// GĐ5: ĐIỀN Supabase URL + ANON KEY (khóa công khai) để /watch chạy khi người xem chưa đăng nhập. CẤM dán service_role.
const CFG = { url: 'https://mgscuzkmirzrxbithllt.supabase.co', key: 'sb_publishable_C_t4FXZtsOdW4vkAYp7kzw_LiEO1MLW' };
// TLOC Auth Wrapper — dùng lại phiên đăng nhập NXHN, KHÔNG tạo bảng user riêng.
// Không import supabase-js: truyền createClient hoặc client có sẵn của NXHN vào (khớp mọi framework).

/** Tạo client chỉ với ANON KEY; chặn nếu lỡ dán service_role. */
function createTlocClient(createClient, url, anonKey) {
  if (!url || !anonKey) throw new Error('Thiếu SUPABASE_URL hoặc ANON_KEY');
  try {
    const b64 = anonKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    if (JSON.parse(atob(b64)).role === 'service_role') throw new Error('SERVICE_ROLE');
  } catch (e) {
    if (e.message === 'SERVICE_ROLE') throw new Error('CẤM dùng service_role key ở Frontend');
  }
  // Cùng project + cùng origin => cùng storageKey => dùng chung session & refresh token với NXHN
  return createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
}

/** Bọc client Supabase (của NXHN hoặc createTlocClient). */
function createTlocAuth(sb) {
  const getSession = async () => (await sb.auth.getSession()).data.session;
  const getUser = async () => (await getSession())?.user ?? null;
  // Khớp is_tloc_admin() (= nxhn_is_admin() của NXHN). Chỉ để ẩn/hiện UI, quyền thật do RLS quyết định
  const isAdmin = async () => !!(await sb.rpc('is_tloc_admin')).data;
  const requireAuth = async (loginUrl = '/login') => {
    const s = await getSession();
    if (!s) location.assign(`${loginUrl}?next=${encodeURIComponent(location.pathname + location.search)}`);
    return s;
  };
  const onChange = (cb) => sb.auth.onAuthStateChange((_e, s) => cb(s)).data.subscription;
  return { sb, getSession, getUser, isAdmin, requireAuth, onChange, signOut: () => sb.auth.signOut() };
}

const $ = (s) => document.querySelector(s);
const uuid = () => crypto.randomUUID();
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const px = (n) => Math.round(n) + 'px';
const snap10 = (n) => Math.round(n / 10) * 10; // Grid snap 10px
let auth, uid, pid, title = 'Untitled', W = 1920, H = 1080, scale = 0.5;
let S = { slides: [{ id: uuid(), els: [] }], cur: 0 }, sel = [], past = [], future = [], cur = '', timer, drag, dragId;
const stage = $('#stage');
const slide = () => S.slides[S.cur];
const find = (id, list = slide().els) => { for (const e of list) { if (e.id === id) return e; const c = e.ch && find(id, e.ch); if (c) return c; } };
const status = (t) => ($('#status').textContent = t);

// ---------- GĐ3: helpers (Media/3D, Animation, Quiz, Pop-up, Biểu đồ, Player) ----------
const cap = (k) => k[0].toUpperCase() + k.slice(1);
const safeUrl = (u) => { u = String(u ?? '').trim(); return /^(https?:\/\/|mailto:|assets\/|\/(?!\/))/i.test(u) ? u : ''; }; // chặn javascript:/data:; cho phép assets/ (gói xuất)
const sid = (i) => String(i ?? '').replace(/[^\w-]/g, ''); // id an toàn khi chèn vào HTML/CSS
const cssOk = (v) => !/[<>{};]/.test(String(v)); // chặn thoát khỏi khối <style> / khai báo CSS
const fmtOf = (u) => ((String(u ?? '').split(/[?#]/)[0].match(/\.(glb|gltf|obj|stl)$/i) || [])[1] || '').toLowerCase();
const getPath = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
const setPath = (o, p, v) => { const ks = p.split('.'), l = ks.pop(); ks.reduce((a, k) => (a[k] ??= {}), o)[l] = v; };
const MIME = { mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm', glb: 'model/gltf-binary', gltf: 'model/gltf+json', obj: 'model/obj', stl: 'model/stl' };
const MTYPE = { mp3: 'audio', wav: 'audio', mp4: 'video', webm: 'video', glb: 'model', gltf: 'model', obj: 'model', stl: 'model' };
const INFO = () => ({ name: 'Thông tin', w: 80, h: 80, t: 'i', st: { background: '#4f8cff', color: '#ffffff', 'border-radius': '50%', 'font-size': '48px', 'font-weight': '700', display: 'flex', 'align-items': 'center', 'justify-content': 'center' }, pop: { on: true, t: 'Thông tin', b: 'Nội dung chi tiết…\n**In đậm** và *in nghiêng*.' } });

// Keyframes dùng thuộc tính translate/scale riêng (không đè transform định vị translate3d+rotate của phần tử)
const FX = {
  fadeIn: ['in', 'Hiện dần', 'from{opacity:0}to{opacity:1}'],
  fadeInUp: ['in', 'Hiện dần từ dưới lên', 'from{opacity:0;translate:0 40px}to{opacity:1;translate:0 0}'],
  slideInRight: ['in', 'Trượt vào từ phải', 'from{opacity:0;translate:600px 0}to{opacity:1;translate:0 0}'],
  slideInLeft: ['in', 'Trượt vào từ trái', 'from{opacity:0;translate:-600px 0}to{opacity:1;translate:0 0}'],
  zoomIn: ['in', 'Phóng to vào', 'from{opacity:0;scale:.5}to{opacity:1;scale:1}'],
  pulse: ['em', 'Nhấp nháy phóng', '0%,100%{scale:1}50%{scale:1.1}'],
  shake: ['em', 'Rung lắc', '0%,100%{translate:0 0}20%,60%{translate:-12px 0}40%,80%{translate:12px 0}'],
  fadeOut: ['out', 'Mờ dần', 'from{opacity:1}to{opacity:0}'],
  slideOutRight: ['out', 'Trượt ra phải', 'from{opacity:1;translate:0 0}to{opacity:0;translate:600px 0}'],
  zoomOut: ['out', 'Thu nhỏ ra', 'from{opacity:1;scale:1}to{opacity:0;scale:.5}'],
};
const kf = (k) => `@keyframes tloc${cap(k)}{${FX[k][2]}}\n`;
// Pha: Vào (delay tính từ đầu slide) → Nhấn → Ra (delay tính sau pha trước)
const animPh = (e) => {
  let t = 0;
  return ['in', 'em', 'out'].flatMap((p) => {
    const c = e.anim?.[p]; if (!c?.fx || !FX[c.fx]) return [];
    const d = Math.min(10, Math.max(0.1, +c.dur || 0.8)), dl = Math.min(30, Math.max(0, +c.delay || 0)); t += dl;
    const r = { p, fx: c.fx, d, at: t }; t += d; return [r];
  });
};
const hasAnim = (e) => animPh(e).length > 0;
const animTotal = (e) => { const a = animPh(e), l = a[a.length - 1]; return l ? l.at + l.d : 0; };
const usedFx = (els) => { const u = new Set(); const w = (l) => l.forEach((e) => { animPh(e).forEach((p) => u.add(p.fx)); if (e.ch) w(e.ch); }); w(els); return u; };
const animCss = (e) => {
  const a = animPh(e); if (!a.length) return '';
  const fill = { in: 'both', em: 'none', out: 'forwards' };
  return `#${sid(e.id)}.tloc-animated-element{animation-name:${a.map((x) => 'tloc' + cap(x.fx))};animation-duration:${a.map((x) => x.d + 's')};animation-delay:${a.map((x) => x.at + 's')};animation-fill-mode:${a.map((x) => fill[x.p])};animation-timing-function:ease-out}\n`;
};

const popData = (p = {}) => ({ t: p.t || '', b: p.b || '', i: safeUrl(p.i), l: safeUrl(p.l), ll: p.ll || '', g: Math.floor(+p.g) || 0 });
const quizErr = (q) => (!q?.q ? 'Cần nhập câu hỏi' : !(q.opts?.length >= 2 && q.opts.length <= 4) ? 'Cần 2–4 đáp án' : !(q.ok >= 0 && q.ok < q.opts.length) ? 'Cần đánh dấu 1 đáp án đúng' : '');
const quizHTML = (q = {}) => `<div class="tq-q">${esc(q.q)}</div><ol class="tq-o">${(q.opts || []).map((o, i) => `<li><button type="button" class="tq-b" data-i="${i}">${esc(o)}</button></li>`).join('')}</ol><div class="tq-r" aria-live="polite"></div>`;

// Biểu đồ: SVG phẳng (viewBox cố định + meet => co giãn theo container, không vỡ layout)
function chartSVG(c = {}) {
  const P = ['#4f8cff', '#ff7a59', '#2fbf71', '#f5b82e', '#9b6dff', '#19b5c9'], t = c.type || 'bar', raw = String(c.data ?? '').trim();
  const L = String(c.labels ?? '').split(',').map((s) => s.trim()), V = raw ? raw.split(',').map((s) => Math.max(0, +s || 0)).slice(0, 12) : [], n = V.length;
  const mx = Math.max(...V, 1), x0 = 60, x1 = 580, y0 = 60, y1 = 330, bw = (x1 - x0) / (n || 1);
  const T = (x, y, s, fs = 14, w = 400) => `<text x="${x}" y="${y}" font-size="${fs}" font-weight="${w}" fill="#333" text-anchor="middle">${esc(s)}</text>`;
  let g = '';
  if (t === 'pie') {
    const sum = V.reduce((a, b) => a + b, 0) || 1; let a0 = -Math.PI / 2;
    g = V.map((v, i) => {
      const a1 = a0 + (v / sum) * 2 * Math.PI, pt = (a) => `${(190 + 130 * Math.cos(a)).toFixed(1)} ${(210 + 130 * Math.sin(a)).toFixed(1)}`;
      const d = v / sum > 0.9999 ? `<circle cx="190" cy="210" r="130" fill="${P[i % 6]}"/>` : v ? `<path d="M190 210L${pt(a0)}A130 130 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${pt(a1)}Z" fill="${P[i % 6]}"/>` : '';
      a0 = a1;
      return d + `<rect x="380" y="${80 + i * 24}" width="14" height="14" fill="${P[i % 6]}"/><text x="402" y="${92 + i * 24}" font-size="14" fill="#333">${esc(L[i] || '')} (${V[i]})</text>`;
    }).join('');
  } else {
    g = `<path d="M${x0} ${y0}V${y1}H${x1}" stroke="#999" fill="none"/>`;
    const cx = (i) => (x0 + bw * (i + 0.5)).toFixed(1), cy = (v) => (y1 - ((y1 - y0) * v) / mx).toFixed(1);
    if (t === 'line') g += `<polyline points="${V.map((v, i) => cx(i) + ',' + cy(v)).join(' ')}" fill="none" stroke="${P[0]}" stroke-width="3"/>` + V.map((v, i) => `<circle cx="${cx(i)}" cy="${cy(v)}" r="5" fill="${P[0]}"/>${T(cx(i), +cy(v) - 10, v)}`).join('');
    else g += V.map((v, i) => `<rect x="${(x0 + bw * i + bw * 0.15).toFixed(1)}" y="${cy(v)}" width="${(bw * 0.7).toFixed(1)}" height="${(y1 - cy(v)).toFixed(1)}" fill="${P[i % 6]}"/>${T(cx(i), +cy(v) - 6, v)}`).join('');
    g += V.map((_, i) => T(cx(i), y1 + 20, L[i] || '')).join('');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid meet" font-family="system-ui,sans-serif"><rect width="600" height="400" fill="#fff"/>${c.title ? T(300, 34, c.title, 22, 700) : ''}${n ? g : T(300, 200, 'Chưa có dữ liệu')}</svg>`;
}

const BASE_CSS = '.tloc-el{box-sizing:border-box}\n.tloc-audio audio,.tloc-video video{width:100%;height:100%;display:block}\n.tloc-video video{object-fit:contain;background:#000}\n.tloc-model .m3{position:absolute;inset:0}\n.tloc-fb{display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#eef1f6;color:#555;font:20px system-ui,sans-serif;text-align:center}\n.tloc-chart svg{display:block;width:100%;height:100%}\n.tloc-pop{cursor:pointer}\n.tloc-quiz{padding:24px;font:30px/1.4 system-ui,sans-serif;color:#111;overflow:auto}\n.tq-q{font-weight:700;margin-bottom:16px}\n.tq-o{list-style:none;margin:0;padding:0;display:grid;gap:10px}\n.tq-b{display:block;width:100%;text-align:left;font:inherit;font-size:.85em;padding:10px 14px;border:2px solid #cfd6e4;border-radius:10px;background:#fff;color:#111;cursor:pointer;white-space:normal}\n.tq-b:disabled{cursor:default;color:#111}\n.tq-b.ok{background:#d9f7e4;border-color:#1f9d57}\n.tq-b.bad{background:#fde1e1;border-color:#d93a3a}\n.tq-r{margin-top:12px;font-size:.8em}\n.tq-r.ok{color:#14803f}\n.tq-r.bad{color:#c62828}\n';

// ----- Mã dùng chung Editor + Player (được .toString() chèn vào file xuất, nên phải TỰ CHỨA, không dùng biến ngoài) -----
function webglOK() {
  if (webglOK.r === undefined) { try { const c = document.createElement('canvas'); webglOK.r = !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { webglOK.r = false; } }
  return webglOK.r;
}
function rich(t) { // escape trước rồi mới đổi **đậm**, *nghiêng*, xuống dòng => an toàn XSS
  return String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/\n/g, '<br>');
}
function placeModal(a, mw, mh, vw, vh) { // Smart Positioning: dưới → trên → bên cạnh; luôn nằm trong màn hình, không che kín phần tử gốc
  const g = 12, m = 8, cl = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  const rb = vh - (a.t + a.h) - g - m, rt = a.t - g - m, rr = vw - (a.l + a.w) - g - m, rl = a.l - g - m;
  let x = cl(a.l + a.w / 2 - mw / 2, m, vw - mw - m), y;
  if (rb >= mh) y = a.t + a.h + g;
  else if (rt >= mh) y = a.t - g - mh;
  else {
    y = cl(a.t + a.h / 2 - mh / 2, m, vh - mh - m);
    if (rr >= mw) x = a.l + a.w + g; else if (rl >= mw) x = a.l - g - mw;
  }
  if (x <= a.l && y <= a.t && x + mw >= a.l + a.w && y + mh >= a.t + a.h) y = a.t + a.h / 2 < vh / 2 ? vh - mh - m : m;
  return { x: Math.round(cl(x, m, Math.max(m, vw - mw - m))), y: Math.round(cl(y, m, Math.max(m, vh - mh - m))) };
}
async function mountThree(host, c) { // OBJ / STL bằng Three.js (OrbitControls: xoay 360°)
  const T = await import('three'), { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  const stl = c.fmt === 'stl', Ld = stl ? (await import('three/addons/loaders/STLLoader.js')).STLLoader : (await import('three/addons/loaders/OBJLoader.js')).OBJLoader;
  const raw = await new Ld().loadAsync(c.src), o = stl ? new T.Mesh(raw, new T.MeshStandardMaterial({ color: 0xb8c4d8, metalness: 0.1, roughness: 0.6 })) : raw;
  if (stl) o.rotation.x = -Math.PI / 2;
  const ren = new T.WebGLRenderer({ antialias: true, alpha: true }), sc = new T.Scene(), cam = new T.PerspectiveCamera(45, 1, 0.1, 1000);
  const bx = new T.Box3().setFromObject(o), sz = bx.getSize(new T.Vector3()).length() || 1; o.position.sub(bx.getCenter(new T.Vector3())); sc.add(o);
  sc.add(new T.HemisphereLight(0xffffff, 0x555566, 2.4)); const dl = new T.DirectionalLight(0xffffff, 2.2); dl.position.set(1, 2, 3); sc.add(dl);
  cam.near = sz / 100; cam.far = sz * 100; cam.position.set(sz * 0.6, sz * 0.4, sz * 0.9); cam.updateProjectionMatrix();
  ren.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); ren.domElement.style.cssText = 'display:block;width:100%;height:100%'; host.appendChild(ren.domElement);
  const ctl = new OrbitControls(cam, ren.domElement); ctl.enableDamping = true; ctl.autoRotate = !!c.auto;
  const fit = () => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; ren.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  const ro = new ResizeObserver(fit); ro.observe(host); fit();
  ren.setAnimationLoop(() => { ctl.update(); ren.render(sc, cam); });
  return () => { ren.setAnimationLoop(null); ro.disconnect(); ctl.dispose(); ren.dispose(); ren.forceContextLoss(); ren.domElement.remove(); };
}
function mount3D(host, c) { // luôn trả về hàm dọn dẹp
  const noop = () => {};
  const fb = (msg) => { // Fallback: ảnh poster hoặc thông báo
    host.textContent = '';
    if (c.poster) { const i = new Image(); i.src = c.poster; i.alt = ''; i.style.cssText = 'width:100%;height:100%;object-fit:contain'; host.append(i); }
    else { const d = document.createElement('div'); d.className = 'tloc-fb'; d.textContent = msg; host.append(d); }
  };
  host.textContent = '';
  if (!c.src) { fb('Chưa có mô hình 3D'); return noop; }
  if (!webglOK()) { fb('Thiết bị không hỗ trợ WebGL'); return noop; }
  if (c.fmt === 'glb' || c.fmt === 'gltf') {
    import('https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js').catch(() => fb('Không tải được trình xem 3D'));
    const m = document.createElement('model-viewer');
    m.setAttribute('src', c.src); m.setAttribute('alt', 'Mô hình 3D'); m.setAttribute('camera-controls', ''); m.setAttribute('shadow-intensity', '1'); m.setAttribute('environment-image', 'neutral');
    if (c.auto) m.setAttribute('auto-rotate', ''); if (c.poster) m.setAttribute('poster', c.poster);
    m.style.cssText = 'display:block;width:100%;height:100%;background:transparent'; m.addEventListener('error', () => fb('Không tải được mô hình 3D'));
    host.append(m); return () => m.remove();
  }
  let off, dead = false;
  mountThree(host, c).then((d) => { if (dead) d(); else off = d; }).catch(() => { if (!dead) fb('Không tải được mô hình 3D'); });
  return () => { dead = true; if (off) off(); };
}
function tlocNav(W, H, start) { // Điều hướng + chuyển cảnh + Pop-up + vuốt + toàn màn hình. KHÔNG có mã gọi mạng/CSDL.
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const S = $$('.tloc-slide'), tv = $('#tv'), ok = (u) => /^(https?:\/\/|mailto:|assets\/|\/(?!\/))/i.test(u || '');
  let cur = -1, offs = [], from = null;
  document.body.classList.add('tp');
  const fit = () => { const k = Math.min(innerWidth / W, innerHeight / H); tv.style.transform = `translate(${(innerWidth - W * k) / 2}px,${(innerHeight - H * k) / 2}px) scale(${k})`; };
  addEventListener('resize', fit); fit();
  function closeM() { $('#tm').hidden = true; $('#tmo').hidden = true; if (from) from.focus({ preventScroll: true }); from = null; }
  function go(i) {
    i = Math.max(0, Math.min(S.length - 1, i | 0)); if (i === cur) return;
    if (cur >= 0) { offs.forEach((f) => f()); offs = []; $$('audio,video', S[cur]).forEach((m) => m.pause()); }
    closeM(); S.forEach((s, k) => s.classList.toggle('on', k === i)); cur = i;
    const s = S[i], fx = s.dataset.fx, d = +s.dataset.dur || 0.6;
    s.style.animation = 'none'; void s.offsetWidth; s.style.animation = fx && fx !== 'none' ? `tlocT${fx} ${d}s ease both` : '';
    $$('.m3', s).forEach((h) => offs.push(mount3D(h, { src: h.dataset.src, fmt: h.dataset.fmt, poster: h.dataset.poster, auto: 'auto' in h.dataset })));
    $$('audio[data-auto],video[data-auto]', s).forEach((m) => { m.muted = true; m.currentTime = 0; m.play().catch(() => {}); }); // Autoplay Policy: luôn Muted
    $('#tc').textContent = (i + 1) + ' / ' + S.length;
    try { history.replaceState(null, '', '#' + (i + 1)); } catch { /* iframe sandbox: bỏ qua */ }
  }
  function openM(el) {
    let p; try { p = JSON.parse(el.dataset.pop); } catch { return; }
    const m = $('#tm'), c = $('#tmb'), place = () => { const a = el.getBoundingClientRect(), q = placeModal({ l: a.left, t: a.top, w: a.width, h: a.height }, m.offsetWidth, m.offsetHeight, innerWidth, innerHeight); m.style.left = q.x + 'px'; m.style.top = q.y + 'px'; };
    from = el; $('#tmt').textContent = p.t || ''; $('#tmt').hidden = !p.t; c.textContent = '';
    if (ok(p.i)) { const im = new Image(); im.alt = ''; im.style.cssText = 'display:block;max-width:100%;max-height:200px;margin:0 auto 8px;border-radius:8px'; im.onload = place; im.src = p.i; c.append(im); }
    const b = document.createElement('div'); b.innerHTML = rich(p.b); c.append(b);
    if (ok(p.l)) { const a = document.createElement('a'); a.href = p.l; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.className = 'tmb'; a.textContent = p.ll || p.l; c.append(a); }
    if (p.g >= 1 && p.g <= S.length) { const n = document.createElement('button'); n.type = 'button'; n.className = 'tmb'; n.textContent = 'Đến slide ' + p.g; n.onclick = () => { closeM(); go(p.g - 1); }; c.append(n); }
    $('#tmo').hidden = false; m.hidden = false; place(); $('#tmx').focus({ preventScroll: true });
  }
  document.addEventListener('click', (ev) => {
    const t = ev.target;
    const p = t.closest('.tloc-pop');
    if (p) openM(p); else if (t.closest('#tmo') || t.closest('#tmx')) closeM();
  });
  addEventListener('keydown', (ev) => {
    const t = ev.target, k = ev.key;
    if (k === 'Escape') return closeM();
    if ((k === 'Enter' || k === ' ') && t.matches && t.matches('.tloc-pop')) { ev.preventDefault(); return openM(t); }
    if (!$('#tm').hidden || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const onBtn = !!(t.closest && t.closest('button,a,[role=button]'));
    if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !onBtn)) { ev.preventDefault(); go(cur + 1); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { ev.preventDefault(); go(cur - 1); }
    else if (k === 'Home') go(0); else if (k === 'End') go(S.length - 1); else if (k === 'f' || k === 'F') fs();
  });
  $('#tp').onclick = () => go(cur - 1); $('#tnx').onclick = () => go(cur + 1);
  const fs = () => { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); };
  $('#tf').onclick = fs;
  let hid; const nv = $('#nv'), show = () => { nv.classList.remove('h'); clearTimeout(hid); hid = setTimeout(() => nv.classList.add('h'), 3000); }; // nút Trước/Sau tự ẩn, hiện lại khi thao tác
  ['mousemove', 'pointerdown', 'keydown'].forEach((t) => addEventListener(t, show)); show();
  let sx = 0, sy = 0, st = 0, ig = false; // vuốt cảm ứng (không vuốt khi đang xoay 3D / kéo video)
  addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); ig = !!(e.target.closest && e.target.closest('.m3,video,audio,input')); show(); }, { passive: true });
  addEventListener('touchend', (e) => { const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; if (!ig && $('#tm').hidden && Date.now() - st < 800 && Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) go(cur + (dx < 0 ? 1 : -1)); }, { passive: true });
  const h = parseInt(location.hash.slice(1), 10);
  go(h >= 1 ? h - 1 : Math.max(0, Math.min(S.length - 1, start | 0)));
}
function tlocQuiz() { // Quiz: trạng thái làm bài chỉ nằm trong DOM/RAM của người xem. KHÔNG có mã gọi mạng/CSDL.
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  document.addEventListener('click', (ev) => {
    const t = ev.target, b = t.closest('.tq-b'), re = t.closest('.tq-re');
    if (b || re) {
      const r = (b || re).closest('.tloc-quiz'); let q; try { q = JSON.parse(r.dataset.quiz); } catch { return; }
      const bs = $$('.tq-b', r), out = $('.tq-r', r);
      if (re) { delete r.dataset.done; bs.forEach((x) => { x.className = 'tq-b'; x.disabled = false; }); out.className = 'tq-r'; out.textContent = ''; return; }
      if (r.dataset.done) return; // trạng thái làm bài chỉ nằm trong DOM/RAM của người xem
      r.dataset.done = '1'; const good = +b.dataset.i === q.ok;
      bs.forEach((x) => { x.disabled = true; }); b.classList.add(good ? 'ok' : 'bad'); if (!good && bs[q.ok]) bs[q.ok].classList.add('ok');
      out.className = 'tq-r ' + (good ? 'ok' : 'bad'); out.textContent = (good ? '✓ Chính xác! ' : '✗ Chưa đúng. ') + (q.ex || '');
      const a = document.createElement('button'); a.type = 'button'; a.className = 'tq-re'; a.textContent = 'Làm lại'; a.style.cssText = 'margin-left:12px;font:inherit;font-size:.8em;cursor:pointer'; out.append(a);
      return;
    }
  });
}
const HELP = [webglOK, mountThree, mount3D, placeModal, rich].map((f) => f.toString()).join('\n');
const navSrc = (start) => HELP + `\n(${tlocNav.toString()})(${W},${H},${+start || 0});`; // -> js/navigation.js
const quizSrc = () => `(${tlocQuiz.toString()})();`; // -> js/quiz.js
const runtimeSrc = (start) => navSrc(start) + '\n' + quizSrc();
const playerBase = () => `[hidden]{display:none!important}html,body{margin:0;background:#111}.tloc-slide{position:relative;width:${W}px;height:${H}px;margin:0 auto 16px;background:#fff;overflow:hidden}body.tp{overflow:hidden;height:100vh}body.tp #tv{position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}body.tp .tloc-slide{position:absolute;left:0;top:0;margin:0;display:none}body.tp .tloc-slide.on{display:block}#nv{display:none;position:fixed;bottom:8px;left:50%;transform:translateX(-50%);align-items:center;gap:10px;padding:4px 12px;border-radius:20px;background:rgba(0,0,0,.55);color:#fff;font:14px system-ui,sans-serif;z-index:10;transition:opacity .3s}#nv.h{opacity:0;pointer-events:none}body.tp #nv{display:flex}#nv button{font:inherit;font-size:20px;color:#fff;background:none;border:0;cursor:pointer;padding:0 6px}#tmo{position:fixed;inset:0;z-index:19;background:rgba(0,0,0,.25)}#tm{position:fixed;z-index:20;box-sizing:border-box;width:min(360px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;padding:16px;border-radius:12px;background:#fff;color:#111;box-shadow:0 12px 40px rgba(0,0,0,.4);font:15px/1.5 system-ui,sans-serif}#tm h3{margin:0 28px 8px 0;font-size:18px}#tmx{position:absolute;right:8px;top:6px;font-size:22px;line-height:1;background:none;border:0;cursor:pointer;color:#333}.tmb{display:inline-block;margin:8px 8px 0 0;padding:6px 12px;border-radius:8px;border:1px solid #4f8cff;background:#fff;color:#1f5fd6;font:inherit;text-decoration:none;cursor:pointer}`;
const playerAnim = () => `@keyframes tlocTfade{from{opacity:0}to{opacity:1}}@keyframes tlocTslide{from{translate:${W}px 0}to{translate:0 0}}@keyframes tlocTzoom{from{opacity:0;scale:.85}to{opacity:1;scale:1}}@media(prefers-reduced-motion:reduce){.tloc-animated-element,.tloc-slide{animation:none!important}}`;
const playerCss = () => playerBase() + playerAnim();
const PLAYER_HTML = '<nav id="nv"><button id="tp" type="button" aria-label="Slide trước">‹</button><span id="tc"></span><button id="tnx" type="button" aria-label="Slide sau">›</button><button id="tf" type="button" aria-label="Toàn màn hình">⛶</button></nav><div id="tmo" hidden></div><div id="tm" role="dialog" aria-modal="true" aria-labelledby="tmt" tabindex="-1" hidden><button id="tmx" type="button" aria-label="Đóng">×</button><h3 id="tmt"></h3><div id="tmb"></div></div>';
const IMPORTMAP = '{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}';
const fromModel = (Z) => Z.slides.map((s) => ({ html: s.els.map((e) => HTMLGenerator.html(e)).join(''), css: rules(s.els), fx: s.trans?.fx || 'none', dur: +s.trans?.dur || 0.6 }));
const secs = (sl) => sl.map((s) => `<section class="tloc-slide" data-fx="${esc(s.fx || 'none')}" data-dur="${+s.dur || 0.6}">${s.html}</section>`).join('\n');
const dedupe = (sl) => [...new Set(sl.map((s) => s.css).join('\n').split('\n'))].filter(Boolean).join('\n');
function inlineDoc(sl, start = 0) { // Xem trước + /watch: 1 tài liệu (chạy trong iframe sandbox). sl = [{html, css, fx, dur}]
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><script type="importmap">${IMPORTMAP}</script><style>${playerCss()}${dedupe(sl)}</style></head><body><div id="tv">${secs(sl)}</div>${PLAYER_HTML}<script>${runtimeSrc(start)}</script></body></html>`;
}
function buildDoc(start = 0, Z = S) { return inlineDoc(fromModel(Z), start); }

// ----- Editor: 3D sống trên Canvas (cache node để render() không tải lại mô hình mỗi lần) -----
const M3 = new Map(); let live3 = '';
const m3cfg = (e) => ({ src: safeUrl(e.src), fmt: e.fmt || fmtOf(e.src), poster: safeUrl(e.poster), auto: !!e.auto });
function attach3D() {
  const ids = new Set();
  stage.querySelectorAll('.m3').forEach((h) => {
    const e = find(h.parentElement.id); if (!e) return;
    const c = m3cfg(e), sig = JSON.stringify(c); ids.add(e.id);
    let m = M3.get(e.id);
    if (!m || m.sig !== sig) { if (m) m.off(); const box = document.createElement('div'); box.style.cssText = 'position:absolute;inset:0'; m = { sig, box, off: null }; M3.set(e.id, m); m.off = mount3D(box, c); }
    h.appendChild(m.box); h.classList.toggle('live', live3 === e.id);
  });
  for (const [id, m] of M3) if (!ids.has(id)) { m.off(); M3.delete(id); }
}
const tags = (e) => (e.pop?.on ? ' ⓘ' : '') + (hasAnim(e) ? ' ✦' : '') + ({ audio: ' ♪', video: ' ▶', model: ' 3D', chart: ' 📊', quiz: ' ?' }[e.type] || '');
const fps = (ms) => new Promise((res) => { let n = 0, t0; const f = (t) => { t0 ??= t; if (t - t0 < ms) { n++; requestAnimationFrame(f); } else res(Math.round((n * 1000) / (t - t0))); }; requestAnimationFrame(f); });

// ---------- HTMLGenerator ----------
const HTMLGenerator = {
  css: (e, p) => (p === 'a' ? '' : `#${sid(e.id)}{position:absolute;left:0;top:0;width:${px(e.w)};height:${px(e.h)};transform:translate3d(${px(e.x)},${px(e.y)},0) rotate(${e.r}deg);${Object.entries(e.st).filter(([k, v]) => cssOk(k) && cssOk(v)).map(([k, v]) => `${k}:${v};`).join('')}${e.hide ? 'display:none;' : ''}}\n`) + (p === 'l' ? '' : animCss(e)) + (e.ch || []).map((c) => HTMLGenerator.css(c, p)).join(''),
  html: (e, a = true, ed = false) => { // a: gắn class animation (Editor tắt để không tự chạy); ed: chế độ Editor (media dạng placeholder)
    const pop = !!e.pop?.on, ph = safeUrl(e.poster), ctl = e.ctl === false ? '' : ' controls';
    const inner = {
      group: () => e.ch.map((x) => HTMLGenerator.html(x, a, ed)).join(''),
      image: () => `<img src="${esc(e.src)}" alt="" style="width:100%;height:100%;object-fit:cover">`,
      audio: () => (ed ? `<div class="ph"><b>♪ ${esc(e.name)}</b></div>` : `<audio src="${esc(safeUrl(e.src))}" preload="metadata"${ctl}${e.auto ? ' muted data-auto' : ''}></audio>`),
      video: () => (ed ? `<div class="ph">${ph ? `<img src="${esc(ph)}" alt="">` : ''}<b>▶ ${esc(e.name)}</b></div>` : `<video src="${esc(safeUrl(e.src))}"${ph ? ` poster="${esc(ph)}"` : ''} preload="metadata" playsinline${ctl}${e.auto ? ' muted loop data-auto' : ''}></video>`),
      model: () => { const c = m3cfg(e); return `<div class="m3" data-src="${esc(c.src)}" data-fmt="${esc(c.fmt)}" data-poster="${esc(c.poster)}"${c.auto ? ' data-auto' : ''}></div>`; },
      chart: () => chartSVG(e.chart),
      quiz: () => quizHTML(e.quiz),
    }[e.type];
    const at = (pop ? ` data-pop="${esc(JSON.stringify(popData(e.pop)))}" tabindex="0" role="button"` : '') + (e.type === 'quiz' ? ` data-quiz="${esc(JSON.stringify(e.quiz || {}))}"` : '');
    return `<div id="${sid(e.id)}" class="tloc-el tloc-${e.type}${a && hasAnim(e) ? ' tloc-animated-element' : ''}${pop ? ' tloc-pop' : ''}"${at}>${inner ? inner() : esc(e.t)}</div>`;
  },
  updateNodeStyle: (id, p) => Object.assign(find(id), p), // cập nhật model; HTML/CSS luôn sinh lại từ model
};
const rules = (els) => BASE_CSS + [...usedFx(els)].map(kf).join('') + els.map((e) => HTMLGenerator.css(e)).join('');

// ---------- GĐ5: /watch (trình chiếu công khai: không công cụ chỉnh sửa, không cần đăng nhập nếu dự án Public) ----------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const watchId = () => { // null = không phải /watch; '' hoặc sai định dạng => 404. Hỗ trợ /watch/<id> (cần rewrite), ?watch=<id>, /watch?p=<id>
  const q = new URLSearchParams(location.search), m = location.pathname.match(/\/watch\/([^/]+)\/?$/);
  return m || q.has('watch') || /\/watch\/?$/.test(location.pathname) ? (m?.[1] || q.get('watch') || q.get('p') || '') : null;
};
const WID = watchId();
if (WID !== null) { startWatch(WID); return; }
async function startWatch(id) {
  document.documentElement.className = 'w'; document.body.className = 'watch';
  const wv = $('#wv'), f = $('#wf'), e4 = $('#w404'); wv.hidden = false;
  const bye = (h, p, robots) => { f.srcdoc = ''; f.hidden = true; e4.hidden = false; $('#w404 h1').textContent = h; $('#w404 p').textContent = p; document.title = h; if (robots) document.head.insertAdjacentHTML('beforeend', '<meta name="robots" content="noindex">'); };
  const deny = () => bye('404 · Access Denied', 'Dự án không tồn tại hoặc đã bị khóa.', true);
  let sb; const getD = async () => { const r = await sb.rpc('tloc_watch', { p_project: id }); if (r.error) throw r.error; return r.data; }; // RPC trả HTML/CSS đã render, không trả mã/quản trị
  try {
    if (!UUID.test(id)) return deny();
    sb = createTlocClient(window.supabase.createClient, CFG.url, CFG.key);
    const d = await getD(); if (!d) return deny();
    title = d.title || 'TLOC'; W = +d.w || 1920; H = +d.h || 1080; document.title = title;
    const sl = (d.slides || []).map((x) => ({ html: x.html || '', css: x.css || '', fx: x.trans?.fx, dur: x.trans?.dur }));
    if (!sl.length) return bye('Chưa có nội dung', 'Dự án này chưa có slide.');
    f.hidden = false; f.onload = () => { try { f.contentWindow.focus(); } catch { /* bỏ qua */ } }; f.srcdoc = inlineDoc(sl, 0); // sandbox: HTML của dự án không chạm được trang chủ / phiên đăng nhập
    addEventListener('keydown', () => { try { f.contentWindow.focus(); } catch { /* bỏ qua */ } });
    if (!d.public) wv.insertAdjacentHTML('beforeend', '<p id="wb">Riêng tư: chỉ bạn xem được — link công khai đang tắt</p>');
    const chk = async () => { try { if (!(await getD())) deny(); } catch { /* lỗi mạng: giữ nguyên */ } }; // Thu hồi có hiệu lực cả với tab đang mở (≤30s)
    setInterval(chk, 30000); document.addEventListener('visibilitychange', () => { if (!document.hidden) chk(); });
  } catch (e) { bye('Không tải được', 'Kiểm tra mạng / cấu hình CFG rồi tải lại (F5). ' + (e.message || '')); }
}

function updateElementTransform(id, x, y, w, h, r) {
  const n = document.getElementById(id); if (!n) return;
  n.style.transform = `translate3d(${px(x)},${px(y)},0) rotate(${r}deg)`;
  n.style.width = px(w); n.style.height = px(h);
  HTMLGenerator.updateNodeStyle(id, { x, y, w, h, r });
}

// ---------- Render ----------
function render() {
  const els = slide().els;
  if (live3 && sel[0] !== live3) live3 = '';
  stage.innerHTML = `<style>${rules(els)}</style>` + els.map((e) => HTMLGenerator.html(e, false, true)).join('');
  attach3D();
  sel = sel.filter((id) => els.some((e) => e.id === id));
  sel.forEach((id) => { const n = document.getElementById(id); n.classList.add('sel'); if (sel.length === 1) n.insertAdjacentHTML('beforeend', '<i class="hd rz"></i><i class="hd ro"></i>'); });
  $('#layers').innerHTML = [...els].reverse().map((e) => `<li draggable="true" data-id="${e.id}" class="${sel.includes(e.id) ? 'on' : ''}"><span>${esc(e.name)}${tags(e)}</span><button data-a="ren" aria-label="Đổi tên">✎</button><button data-a="lock" aria-label="Khóa">${e.lock ? '🔒' : '🔓'}</button><button data-a="hide" aria-label="Ẩn">${e.hide ? '🙈' : '👁'}</button></li>`).join('');
  $('#slides').innerHTML = S.slides.map((_, i) => `<button data-i="${i}" class="${i === S.cur ? 'on' : ''}">${i + 1}</button>`).join('') + '<button data-i="+">+ Slide</button><button data-i="-">Xóa slide</button>';
  const e = find(sel[0] ?? ''); $('#insp').classList.toggle('off', !e); syncAdv(e);
  if (e) { $('#fill').value = e.st.background || '#4f8cff'; $('#fc').value = e.st.color || '#111111'; $('#fs').value = parseInt(e.st['font-size']) || 48; $('#rd').value = parseInt(e.st['border-radius']) || 0; $('#op').value = e.st.opacity ?? 1; $('#sh').checked = !!e.st['box-shadow'] && e.st['box-shadow'] !== 'none'; $('#tx').value = e.t ?? ''; }
  document.title = title + ' · TLOC'; // đồng bộ <title>
  lockUI(); syncLocks();
}

// ---------- Undo/Redo (LIFO, tối đa 9) ----------
const snap = () => JSON.stringify(S);
function commit() { past.push(cur); if (past.length > 9) past.shift(); future = []; cur = snap(); dirty(); }
function undo() { if (!past.length) return; future.push(cur); cur = past.pop(); S = JSON.parse(cur); sel = []; render(); dirty(); }
function redo() { if (!future.length) return; past.push(cur); cur = future.pop(); S = JSON.parse(cur); sel = []; render(); dirty(); }

// ---------- Lưu (auto 3s / chính thức) ----------
function dirty() { if (!canEdit()) return; status('Đang lưu...'); clearTimeout(timer); timer = setTimeout(save, 3000); }
async function save() {
  timer = 0;
  if (!auth || !pid) return status('Chưa kết nối');
  if (!canEdit()) return;
  try {
    if (room && (await mergeRemote())) render(); // gộp thay đổi của người khác trước khi ghi
    const slides = S.slides.map((s, i) => ({ id: s.id, order_index: i, html_content: s.els.map((x) => HTMLGenerator.html(x)).join(''), css_content: rules(s.els), metadata: { els: s.els, trans: s.trans || { fx: 'none', dur: 0.6 } } }));
    let r = await auth.sb.rpc('tloc_save_slides', { p_project: pid, p_slides: slides }); if (r.error) throw r.error;
    if (isOA()) { r = await auth.sb.from('tloc_projects').update({ title }).eq('id', pid); if (r.error) throw r.error; }
    status('Đã lưu'); afterSave();
  } catch (e) { status('Lỗi lưu: ' + (e.message || e)); }
}

// ---------- Thao tác đối tượng ----------
const D = { text: { w: 600, h: 120, t: 'Văn bản', st: { 'font-size': '48px', color: '#111111', 'white-space': 'pre-wrap' } }, shape: { w: 360, h: 240, st: { background: '#4f8cff', 'border-radius': '12px' } }, image: { w: 480, h: 320, st: {} },
  audio: { w: 480, h: 80, ctl: true, st: {} }, video: { w: 640, h: 360, ctl: true, st: {} }, model: { w: 480, h: 360, auto: true, st: {} },
  chart: { w: 600, h: 400, chart: { type: 'bar', title: 'Biểu đồ', labels: 'A,B,C,D', data: '3,5,2,4' }, st: {} },
  quiz: { w: 720, h: 460, quiz: { q: 'Câu hỏi của bạn?', opts: ['Đáp án A', 'Đáp án B', 'Đáp án C'], ok: 0, ex: 'Giải thích ngắn.' }, st: { background: '#ffffff', border: '2px solid #4f8cff', 'border-radius': '12px' } } };
function add(type, extra = {}) {
  const e = { id: 'e' + uuid().slice(0, 6), type, name: type + ' ' + (slide().els.length + 1), x: 160, y: 120, r: 0, ...structuredClone(D[type]), ...extra };
  slide().els.push(e); sel = [e.id]; commit(); render();
}
function group() {
  const s = slide(), g = s.els.filter((e) => sel.includes(e.id)); if (g.length < 2) return;
  const x = Math.min(...g.map((e) => e.x)), y = Math.min(...g.map((e) => e.y));
  const G = { id: 'e' + uuid().slice(0, 6), type: 'group', name: 'Group', x, y, w: Math.max(...g.map((e) => e.x + e.w)) - x, h: Math.max(...g.map((e) => e.y + e.h)) - y, r: 0, st: {}, ch: g.map((e) => ({ ...e, x: e.x - x, y: e.y - y })) };
  s.els = s.els.filter((e) => !g.includes(e)); s.els.push(G); sel = [G.id]; commit(); render();
}
function ungroup() {
  const g = find(sel[0] ?? ''); if (!g || g.type !== 'group') return;
  const els = slide().els; els.splice(els.indexOf(g), 1, ...g.ch.map((c) => ({ ...c, x: c.x + g.x, y: c.y + g.y })));
  sel = g.ch.map((c) => c.id); commit(); render();
}
function del() { if (!sel.length) return; slide().els = slide().els.filter((e) => !sel.includes(e.id)); sel = []; commit(); render(); }

// ---------- Canvas: kéo / resize / xoay (pointer = chuột + cảm ứng) ----------
stage.addEventListener('pointerdown', (ev) => {
  if (!canEdit()) return; // Viewer: chỉ xem
  if (ev.target.closest('.m3.live')) return; // đang xoay 3D: không kéo/chọn phần tử
  let n = ev.target.closest('.tloc-el');
  while (n && n.parentElement !== stage) n = n.parentElement;
  if (!n) { sel = []; return render(); }
  const e = find(n.id), c = ev.target.classList, mode = c.contains('rz') ? 'rz' : c.contains('ro') ? 'ro' : 'mv';
  const lb = blockedBy(e); if (lb) { status((lb.name || 'Người khác') + ' đang chỉnh sửa'); sel = sel.filter((i) => i !== e.id); return render(); }
  if (ev.shiftKey) sel = sel.includes(e.id) ? sel.filter((i) => i !== e.id) : [...sel, e.id];
  else if (!sel.includes(e.id)) sel = [e.id];
  if (e.lock) return render();
  const r = n.getBoundingClientRect();
  drag = { mode, x: ev.clientX, y: ev.clientY, cx: r.left + r.width / 2, cy: r.top + r.height / 2, moved: false, o: sel.map((id) => ({ ...find(id) })) };
  stage.setPointerCapture(ev.pointerId); render();
});
stage.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const dx = (ev.clientX - drag.x) / scale, dy = (ev.clientY - drag.y) / scale;
  if (!drag.moved && Math.hypot(dx, dy) < 3) return;
  drag.moved = true;
  drag.o.forEach((o) => {
    if (drag.mode === 'mv') updateElementTransform(o.id, snap10(o.x + dx), snap10(o.y + dy), o.w, o.h, o.r);
    else if (drag.mode === 'rz') updateElementTransform(o.id, o.x, o.y, Math.max(20, snap10(o.w + dx)), Math.max(20, snap10(o.h + dy)), o.r);
    else { const a = Math.atan2(ev.clientY - drag.cy, ev.clientX - drag.cx) * 180 / Math.PI + 90; updateElementTransform(o.id, o.x, o.y, o.w, o.h, Math.round(ev.shiftKey ? Math.round(a / 15) * 15 : a)); }
  });
});
const endDrag = () => { if (drag?.moved) { commit(); render(); } drag = null; };
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);

// ---------- Layer panel (khóa / ẩn / đổi tên / kéo thả z-index) ----------
const L = $('#layers');
L.onclick = (ev) => {
  const li = ev.target.closest('li'); if (!li) return;
  const e = find(li.dataset.id), a = ev.target.dataset.a;
  if (blockedBy(e)) return status('Phần tử đang được người khác chỉnh sửa');
  if (a === 'ren') { const n = prompt('Tên layer', e.name); if (!n) return; e.name = n; } else if (a) e[a] = !e[a]; else sel = [e.id];
  if (a) commit(); render();
};
L.ondragstart = (ev) => (dragId = ev.target.dataset.id);
L.ondragover = (ev) => ev.preventDefault();
L.ondrop = (ev) => {
  const li = ev.target.closest('li'), els = slide().els, f = els.findIndex((e) => e.id === dragId), t = els.findIndex((e) => e.id === li?.dataset.id);
  if (f < 0 || t < 0 || f === t) return; els.splice(t, 0, els.splice(f, 1)[0]); commit(); render();
};

// ---------- Slide + Inspector ----------
$('#slides').onclick = (ev) => {
  const i = ev.target.dataset.i; if (i == null) return;
  if (i === '+') { S.slides.push({ id: uuid(), els: [] }); S.cur = S.slides.length - 1; commit(); }
  else if (i === '-') { if (S.slides.length < 2) return; S.slides.splice(S.cur, 1); S.cur = Math.max(0, S.cur - 1); commit(); }
  else { S.cur = +i; cur = snap(); }
  sel = []; render();
};
const F = { fill: ['background', (v) => v], fc: ['color', (v) => v], fs: ['font-size', (v) => v + 'px'], rd: ['border-radius', (v) => v + 'px'], op: ['opacity', (v) => v] };
$('#insp').addEventListener('change', (ev) => {
  const t = ev.target, es = sel.map((id) => find(id)).filter(Boolean); if (!es.length) return;
  es.forEach((e) => { if (t.id === 'tx') e.t = t.value; else if (t.id === 'sh') e.st['box-shadow'] = t.checked ? '0 8px 24px rgba(0,0,0,.35)' : 'none'; else { const [k, f] = F[t.id]; e.st[k] = f(t.value); } });
  commit(); render();
});

// ---------- Top bar / toolbar / phím tắt ----------
const zoom = (s) => { scale = Math.min(2, Math.max(0.1, s)); stage.style.transform = `scale(${scale})`; $('#wrap').style.cssText = `width:${W * scale}px;height:${H * scale}px`; };
let mtype = '';
document.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => {
  const t = b.dataset.add;
  if (t === 'image') $('#img').click();
  else if (['audio', 'video', 'model'].includes(t)) { mtype = t; $('#mf').accept = { audio: '.mp3,.wav', video: '.mp4,.webm', model: '.glb,.gltf,.obj,.stl' }[t]; $('#mf').click(); }
  else if (t === 'info') add('shape', INFO());
  else add(t);
}));
$('#img').onchange = async (ev) => {
  const f = ev.target.files[0]; if (!f) return;
  if (!uid) return status('Cần đăng nhập');
  if (f.size > 10485760) return status('Ảnh vượt 10MB'); // fix: bucket nay cho tệp tới 50MB nên kiểm ảnh ở client
  const p = `${uid}/${Date.now()}-${f.name.replace(/[^\w.-]/g, '_')}`, b = auth.sb.storage.from('tloc-media');
  const { error } = await b.upload(p, f, { contentType: f.type }); ev.target.value = '';
  if (error) return status('Lỗi tải ảnh: ' + error.message);
  add('image', { src: b.getPublicUrl(p).data.publicUrl });
};
$('#undo').onclick = undo; $('#redo').onclick = redo; $('#grp').onclick = group; $('#ugrp').onclick = ungroup;
$('#zi').onclick = () => zoom(scale + 0.1); $('#zo').onclick = () => zoom(scale - 0.1);
$('#tg').onclick = () => $('#right').classList.toggle('open');
$('#title').oninput = (ev) => { title = ev.target.value || 'Untitled'; document.title = title + ' · TLOC'; dirty(); };
$('#codeb').onclick = () => { const els = slide().els; $('#ch').value = els.map((x) => HTMLGenerator.html(x)).join('\n'); $('#cc').value = rules(els); $('#code').showModal(); };
$('#copy').onclick = () => navigator.clipboard.writeText($('#ch').value + '\n\n<style>\n' + $('#cc').value + '</style>');
$('#close').onclick = () => $('#code').close();
$('#save').onclick = async () => {
  if (!pid) return status('Chưa kết nối');
  if (!confirm('Lưu chính thức sẽ xóa ngăn Undo/Redo hiện tại (không xóa dữ liệu hay phiên bản). Tiếp tục?')) return;
  clearTimeout(timer); await save();
  const { error } = await auth.sb.from('tloc_versions').insert({ project_id: pid, snapshot_data: S });
  if (error) return status('Lỗi phiên bản: ' + error.message);
  past = []; future = []; cur = snap(); status('Đã lưu chính thức');
};
$('#exp').onclick = exportSite; // GĐ5: ZIP độc lập + kiểm tra trước khi xuất
addEventListener('keydown', (ev) => {
  if (!canEdit() || /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName) || document.querySelector('dialog[open]:not(#lib)')) return; // fix: Delete/Backspace trong select/hộp thoại không xóa phần tử
  const k = ev.key.toLowerCase(), m = ev.ctrlKey || ev.metaKey;
  if (m && k === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); }
  else if (m && k === 'y') { ev.preventDefault(); redo(); }
  else if (m && k === 'g') { ev.preventDefault(); ev.shiftKey ? ungroup() : group(); }
  else if (k === 'delete' || k === 'backspace') del();
});

// ---------- GĐ3: Timeline / Pop-up / Quiz / Phương tiện / Xem trước ----------
document.querySelectorAll('select[data-g]').forEach((s) => (s.innerHTML = '<option value="">— Không —</option>' + Object.entries(FX).filter(([, v]) => v[0] === s.dataset.g).map(([k, v]) => `<option value="${k}">${v[1]}</option>`).join('')));
function syncAdv(e) {
  const t = e?.type || '', A = $('#adv');
  A.classList.toggle('off', !e);
  $('#p-media').hidden = !/^(audio|video|model)$/.test(t); $('#p-chart').hidden = t !== 'chart'; $('#p-quiz').hidden = t !== 'quiz';
  $('#l-poster').hidden = !/^(video|model)$/.test(t); $('#l-ctl').hidden = t === 'model'; $('#live3').hidden = t !== 'model';
  $('#live3').classList.toggle('on', !!e && live3 === e.id);
  $('#auto-l').textContent = t === 'model' ? ' Tự xoay mô hình' : ' Tự phát (luôn tắt tiếng)';
  $('#m-warn').textContent = t === 'model' ? (e.mb > 15 ? `⚠ Tệp 3D ${e.mb}MB (>15MB): có thể chậm hoặc treo trên thiết bị yếu.` : 'GLB/glTF/OBJ/STL. Thiết bị không có WebGL sẽ hiện ảnh poster.') : t === 'audio' || t === 'video' ? 'MP3/WAV · MP4/WebM. Tự phát bắt buộc tắt tiếng (chính sách trình duyệt).' : '';
  if (e) {
    A.querySelectorAll('[data-k]').forEach((i) => { const v = getPath(e, i.dataset.k); if (i.type === 'checkbox') i.checked = i.dataset.k === 'ctl' ? v !== false : !!v; else i.value = v ?? ''; });
    if (t === 'quiz') { const q = e.quiz || { opts: [] }; $('#qq').value = q.q || ''; $('#qe').value = q.ex || ''; A.querySelectorAll('.qr').forEach((r, i) => { r.querySelector('.qt').value = q.opts?.[i] ?? ''; r.querySelector('input[type=radio]').checked = q.ok === i; }); }
  }
  const s = slide(); $('#trf').value = s.trans?.fx || 'none'; $('#trd').value = s.trans?.dur ?? 0.6;
}
// Gán giá trị chung theo data-k (anim.*, pop.*, src, poster, ctl, auto, chart.*)
$('#adv').addEventListener('change', (ev) => {
  const t = ev.target, k = t.dataset.k; if (!k) return;
  const es = sel.map((id) => find(id)).filter(Boolean); if (!es.length) return;
  const v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? (t.value === '' ? '' : +t.value) : t.value.trim();
  es.forEach((e) => setPath(e, k, v)); commit(); render();
});
// Quiz: 2–4 đáp án + 1 đáp án đúng, lưu JSON trong e.quiz (sinh ra data-quiz)
$('#p-quiz').addEventListener('change', () => {
  const e = find(sel[0] ?? ''); if (e?.type !== 'quiz') return;
  const rows = [...document.querySelectorAll('#p-quiz .qr')].map((r) => ({ t: r.querySelector('.qt').value.trim(), ok: r.querySelector('input[type=radio]').checked })).filter((r) => r.t);
  const q = { q: $('#qq').value.trim(), opts: rows.map((r) => r.t), ok: rows.findIndex((r) => r.ok), ex: $('#qe').value.trim() };
  const err = quizErr(q); if (err) return status('Quiz: ' + err);
  e.quiz = q; commit(); render();
});
$('#ap').onclick = async () => { // Xem thử Timeline + đo FPS
  const e = find(sel[0] ?? ''); if (!e || !hasAnim(e)) return status('Chọn đối tượng và ít nhất 1 hiệu ứng');
  const n = document.getElementById(e.id); n.classList.remove('tloc-animated-element'); void n.offsetWidth; n.classList.add('tloc-animated-element');
  status('Đang chạy hiệu ứng…'); const f = await fps(animTotal(e) * 1000 + 100);
  document.getElementById(e.id)?.classList.remove('tloc-animated-element'); status(`Xem thử xong · ≈${f} FPS${f >= 55 ? ' (mượt)' : ' (thấp hơn 60)'}`);
};
$('#live3').onclick = () => { const e = find(sel[0] ?? ''); if (e?.type !== 'model') return; live3 = live3 === e.id ? '' : e.id; render(); };
$('#trf').onchange = $('#trd').onchange = () => { slide().trans = { fx: $('#trf').value, dur: Math.min(5, Math.max(0.1, +$('#trd').value || 0.6)) }; commit(); render(); };
$('#mf').onchange = async (ev) => { // Tải âm thanh / video / 3D lên bucket tloc-media
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  if (!uid) return status('Cần đăng nhập');
  const ext = (f.name.split('.').pop() || '').toLowerCase(), mb = f.size / 1048576;
  if (!MIME[ext] || MTYPE[ext] !== mtype) return status('Định dạng .' + ext + ' không phù hợp với loại đã chọn');
  if (mb > 50) return status('Tệp ' + mb.toFixed(1) + 'MB vượt giới hạn 50MB');
  if (mtype === 'model' && mb > 15 && !confirm(`Mô hình 3D nặng ${mb.toFixed(1)}MB (> 15MB) có thể làm trình duyệt chậm hoặc treo. Vẫn tải lên?`)) return;
  status('Đang tải lên ' + mb.toFixed(1) + 'MB…');
  const p = `${uid}/${Date.now()}-${f.name.replace(/[^\w.-]/g, '_')}`, b = auth.sb.storage.from('tloc-media');
  const { error } = await b.upload(p, f, { contentType: MIME[ext] });
  if (error) return status('Lỗi tải tệp: ' + error.message);
  add(mtype, { src: b.getPublicUrl(p).data.publicUrl, fmt: ext, mb: +mb.toFixed(1), name: f.name });
};
$('#prev').onclick = () => { $('#pvf').srcdoc = buildDoc(S.cur); $('#pv').showModal(); };
$('#pvc').onclick = () => $('#pv').close();
$('#pv').addEventListener('close', () => ($('#pvf').srcdoc = '')); // dừng media/3D khi đóng
window.TLOC = { buildDoc, runtimeSrc, placeModal }; // /watch có thể dùng chung runtime này

// ---------- GĐ4: Phân quyền (RBAC) · Phòng · Cộng tác realtime + khóa phần tử · Thư viện PNG · Phiên bản ----------
let role = 'owner', room = '', adm = false, myName = '', ownerId = '', chan = null, pull = false;
const locks = new Map(), mine = new Set(), rel = new Set(), pend = new Set(); // mine: khóa đang giữ; rel: chờ nhả sau khi lưu
const canEdit = () => role === 'owner' || role === 'admin' || role === 'edit';
const isOA = () => role === 'owner' || role === 'admin';
const lockedBy = (id) => { const l = locks.get(id); return l && l.by !== uid && Date.parse(l.exp) > Date.now() ? l : null; };
const ids = (e) => [e.id, ...(e.ch || []).flatMap((c) => ids(c))];
const blockedBy = (e) => ids(e).map(lockedBy).find(Boolean);
const sj = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
const nmOf = (p, id) => p?.display_name || p?.username || p?.full_name || p?.name || 'User ' + String(id).slice(0, 6);
const pubUrl = (p) => auth.sb.storage.from('tloc-media').getPublicUrl(p).data.publicUrl;

async function meName() {
  const u = await auth.getUser(), r = await auth.sb.from('profiles').select('*').eq('id', uid).maybeSingle(), p = r.data || {};
  return nmOf(p, uid) !== 'User ' + uid.slice(0, 6) ? nmOf(p, uid) : (u?.email || '').split('@')[0] || 'User ' + uid.slice(0, 4);
}
async function initCollab() { // xác định vai trò: owner / admin / edit / view + phòng đang mở của dự án
  adm = await auth.isAdmin(); myName = await meName();
  role = ownerId === uid ? 'owner' : adm ? 'admin' : 'view';
  const rooms = (await auth.sb.from('tloc_rooms').select('id').eq('project_id', pid).eq('status', 'open')).data || [];
  const ms = rooms.length ? (await auth.sb.from('tloc_room_members').select('room_id,role').eq('user_id', uid).eq('status', 'approved').in('room_id', rooms.map((r) => r.id))).data || [] : [];
  const ed = ms.find((m) => m.role === 'edit' || m.role === 'admin');
  if (role === 'view' && ed) role = 'edit';
  room = role === 'view' ? ms[0]?.room_id || '' : ed?.room_id || rooms[0]?.id || '';
  document.body.classList.toggle('ro', !canEdit());
  $('#rolel').textContent = { owner: 'Chủ dự án', admin: 'Admin', edit: 'Editor', view: 'Viewer · chỉ xem' }[role];
  g('title').disabled = !canEdit(); $('#vhb').hidden = !isOA(); $('#save').hidden = !isOA(); $('#shb').hidden = !isOA(); $('#ladm').hidden = !adm;
  startRoom();
}

// ----- Khóa phần tử (tloc_element_locks, hết hạn 30s, gia hạn mỗi 10s) -----
async function lockRpc(id) { // true = đã khóa · false = người khác đang giữ · null = lỗi
  const r = await auth.sb.rpc('tloc_lock_element', { p_room: room, p_element: id, p_name: myName });
  if (r.error || !r.data) return null;
  locks.set(id, { by: r.data.locked_by, name: r.data.name, exp: r.data.expires_at }); return !!r.data.ok;
}
function syncLocks() { // cuối render(): khóa phần tử đang chọn, phần tử bỏ chọn chuyển sang hàng chờ nhả
  if (!room || !canEdit()) return;
  const want = new Set(sel.flatMap((id) => { const e = find(id); return e ? ids(e) : []; }));
  for (const id of [...mine]) if (!want.has(id)) { mine.delete(id); rel.add(id); }
  for (const id of want) {
    rel.delete(id); if (mine.has(id) || pend.has(id)) continue; pend.add(id);
    lockRpc(id).then((ok) => {
      pend.delete(id);
      if (ok) mine.add(id);
      else if (ok === false) { sel = sel.filter((s) => s !== id); if (drag) { drag = null; S = JSON.parse(cur); } render(); status((locks.get(id)?.name || 'Người khác') + ' đang chỉnh sửa phần tử này'); }
    });
  }
}
async function flushRel() { if (!room || !rel.size) return; const a = [...rel]; rel.clear(); a.forEach((id) => locks.delete(id)); await auth.sb.rpc('tloc_unlock_elements', { p_room: room, p_elements: a }); }
const beat = () => [...mine, ...rel].forEach((id) => lockRpc(id));
function lockUI() { // viền đỏ + tên người đang sửa (CSS .lk, biến --lock)
  stage.querySelectorAll('.tloc-el').forEach((n) => { const l = lockedBy(n.id); n.classList.toggle('lk', !!l); if (l) n.dataset.lk = (l.name || 'Người dùng') + ' đang chỉnh sửa'; else delete n.dataset.lk; });
}
function lockRefresh() { if (sel.some((id) => lockedBy(id))) { sel = sel.filter((id) => !lockedBy(id)); drag = null; render(); } else lockUI(); }
async function loadLocks() {
  if (!room) return;
  const r = await auth.sb.from('tloc_element_locks').select('element_id,locked_by,locked_name,expires_at').eq('room_id', room); if (r.error) return;
  locks.clear(); r.data.forEach((l) => locks.set(l.element_id, { by: l.locked_by, name: l.locked_name, exp: l.expires_at })); lockRefresh();
}

// ----- Realtime: khóa (postgres_changes) + thông báo "đã lưu" (broadcast) -> gộp thay đổi từ người khác -----
async function mergeRemote() { // giữ nguyên phần tử mình đang khóa, lấy phần còn lại từ máy chủ
  const r = await auth.sb.from('tloc_slides').select('id,metadata').eq('project_id', pid).order('order_index');
  if (r.error || !r.data.length) return false;
  const keep = new Set([...mine, ...rel]), loc = new Map(S.slides.map((s) => [s.id, s])), before = sj(S.slides);
  const next = r.data.map((rs) => {
    const l = loc.get(rs.id), le = new Map((l?.els || []).map((e) => [e.id, e]));
    const els = (rs.metadata?.els || []).filter((e) => !keep.has(e.id) || le.has(e.id)).map((e) => (keep.has(e.id) ? le.get(e.id) : e));
    (l?.els || []).forEach((e) => { if (keep.has(e.id) && !els.some((x) => x.id === e.id)) els.push(e); });
    return { id: rs.id, els, trans: timer && l ? l.trans : rs.metadata?.trans };
  });
  if (timer) S.slides.filter((s) => !r.data.some((rs) => rs.id === s.id)).forEach((s) => next.push(s)); // slide mới chưa lưu
  if (sj(next) === before) return false;
  S.slides = next; S.cur = Math.min(S.cur, next.length - 1); past = []; future = []; cur = snap(); return true;
}
function wantPull() { pull = true; if (timer || drag) return; pull = false; mergeRemote().then((c) => c && render()); }
async function afterSave() { // gọi sau khi lưu thành công
  if (!room) return;
  if (chan) chan.send({ type: 'broadcast', event: 'saved', payload: { by: uid } });
  await flushRel(); if (pull && !timer) { pull = false; if (await mergeRemote()) render(); }
}
function startRoom() {
  if (!room || chan) return;
  chan = auth.sb.channel('tloc-room-' + room)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tloc_element_locks' }, (p) => {
      const o = p.eventType === 'DELETE' ? p.old : p.new; if (!o || (o.room_id && o.room_id !== room)) return;
      if (p.eventType === 'DELETE') locks.delete(o.element_id); else locks.set(o.element_id, { by: o.locked_by, name: o.locked_name, exp: o.expires_at });
      lockRefresh();
    })
    .on('broadcast', { event: 'saved' }, () => wantPull())
    .subscribe();
  setInterval(loadLocks, 5000); setInterval(beat, 10000); loadLocks(); // poll dự phòng + gia hạn khóa
}

// ----- Hộp thoại Phòng & Thành viên -----
async function rmLoad() {
  const box = $('#rmlist'); box.textContent = 'Đang tải…';
  const [rs, my] = await Promise.all([auth.sb.from('tloc_rooms').select('id,room_code,status,project_id'), auth.sb.from('tloc_room_members').select('room_id,role,status').eq('user_id', uid)]);
  if (rs.error) { box.textContent = rs.error.message; return; }
  const st = new Map((my.data || []).map((m) => [m.room_id, m]));
  let h = rs.data.map((r) => { const m = st.get(r.id); return `<div class="row" data-r="${r.id}"><span><b>${esc(r.room_code)}</b> · ${esc(r.status)} · dự án ${esc(r.project_id.slice(0, 6))}${m ? ' · bạn: ' + esc(m.role) : ''}</span><button data-a="open" data-p="${r.project_id}">Mở dự án</button>${m && m.status === 'approved' && m.role === 'view' ? '<button data-a="req">Xin quyền sửa</button>' : ''}${adm ? '<button data-a="mem">Thành viên</button>' : ''}</div><div class="mem" id="m-${r.id}"></div>`; }).join('');
  (my.data || []).filter((m) => m.status === 'pending').forEach((m) => (h += `<div class="row"><span>Yêu cầu vào phòng ${esc(m.room_id.slice(0, 6))}… đang chờ Admin duyệt</span></div>`));
  box.innerHTML = h || '<p class="hint">Chưa có phòng.</p>';
}
async function memLoad(rid) {
  const box = $('#m-' + rid); let r = await auth.sb.from('tloc_room_members').select('user_id,role,status,edit_requested,profiles(*)').eq('room_id', rid);
  if (r.error) r = await auth.sb.from('tloc_room_members').select('user_id,role,status,edit_requested').eq('room_id', rid);
  box.innerHTML = (r.data || []).map((m) => `<div class="row" data-u="${m.user_id}" data-r="${rid}"><span>${esc(nmOf(m.profiles, m.user_id))} · ${esc(m.status)}${m.edit_requested ? ' · ✋ xin quyền sửa' : ''}</span>${m.status === 'pending' ? '<button data-a="ok">Duyệt</button>' : ''}<select data-a="role" aria-label="Quyền">${['view', 'comment', 'edit', 'admin'].map((x) => `<option${x === m.role ? ' selected' : ''}>${x}</option>`).join('')}</select><button data-a="del">Xóa</button></div>`).join('') || '<p class="hint">Chưa có thành viên.</p>';
}
const rmMsg = (t) => ($('#rmmsg').textContent = t);
$('#rmb').onclick = () => { rmMsg(''); $('#rm').showModal(); rmLoad(); };
$('#rmclose').onclick = () => $('#rm').close();
$('#rmnew').onclick = async () => { // chỉ Admin tạo phòng — RLS (rooms_admin_all) chặn user thường ở Backend
  if (!pid) return rmMsg('Chưa có dự án');
  const { error } = await auth.sb.from('tloc_rooms').insert({ project_id: pid });
  if (error) return rmMsg(error.code === '42501' || /row-level security|permission/i.test(error.message) ? 'Không đủ thẩm quyền: chỉ Admin được tạo phòng.' : error.message);
  rmMsg('Đã tạo phòng'); rmLoad();
};
$('#rmjoin').onclick = async () => {
  const c = $('#rmcode').value.trim(); if (!c) return rmMsg('Nhập mã phòng');
  const { error } = await auth.sb.rpc('tloc_request_join', { p_room_code: c });
  rmMsg(error ? 'Không vào được: ' + error.message : 'Đã gửi yêu cầu, chờ Admin duyệt'); rmLoad();
};
$('#rm').addEventListener('click', async (ev) => {
  const b = ev.target.closest('button[data-a]'); if (!b) return; const row = b.closest('.row'), a = b.dataset.a, rid = row.dataset.r, u = row.dataset.u;
  try {
    if (a === 'open') return location.assign('?p=' + b.dataset.p);
    if (a === 'mem') return memLoad(rid);
    let r;
    if (a === 'req') { r = await auth.sb.rpc('tloc_request_edit', { p_room: rid }); if (!r.error) rmMsg('Đã gửi yêu cầu chỉnh sửa tới Admin'); }
    else if (a === 'ok') r = await auth.sb.from('tloc_room_members').update({ status: 'approved' }).eq('room_id', rid).eq('user_id', u);
    else if (a === 'del') { if (!confirm('Thu hồi quyền / xóa thành viên này?')) return; r = await auth.sb.from('tloc_room_members').delete().eq('room_id', rid).eq('user_id', u); }
    if (r?.error) throw r.error; if (a === 'ok' || a === 'del') memLoad(rid);
  } catch (e) { rmMsg(e.message || String(e)); }
});
$('#rm').addEventListener('change', async (ev) => { // cấp / đổi quyền
  const s = ev.target.closest('select[data-a=role]'); if (!s) return; const row = s.closest('.row');
  const { error } = await auth.sb.from('tloc_room_members').update({ role: s.value, edit_requested: false }).eq('room_id', row.dataset.r).eq('user_id', row.dataset.u);
  rmMsg(error ? error.message : 'Đã cập nhật quyền: ' + s.value); memLoad(row.dataset.r);
});

// ----- Thư viện PNG chung (Admin upload batch/xóa; thành viên kéo thả vào Canvas) -----
let LIB = [];
async function libLoad() { const r = await auth.sb.from('tloc_assets').select('id,file_name,file_path,category,tags').order('file_name'); if (r.error) { $('#lgrid').textContent = r.error.message; return; } LIB = r.data; libDraw(); }
function libDraw() {
  const q = $('#lq').value.trim().toLowerCase();
  $('#lgrid').innerHTML = LIB.filter((a) => !q || a.file_name.toLowerCase().includes(q) || (a.category || '').toLowerCase().includes(q) || a.tags.some((t) => t.toLowerCase().includes(q))).map((a) => `<figure draggable="true" data-p="${esc(a.file_path)}" data-id="${a.id}"><img src="${esc(pubUrl(a.file_path))}" alt="${esc(a.file_name)}" loading="lazy"><figcaption>${esc(a.file_name)}<br><small>${esc(a.category || '')} ${a.tags.map(esc).join(', ')}</small></figcaption>${adm ? '<button data-a="del">Xóa</button>' : ''}</figure>`).join('') || '<p class="hint">Thư viện trống.</p>';
}
async function libDel(f) { // quét tloc_slides trước khi xóa
  const r = await auth.sb.rpc('tloc_asset_usage', { p_path: f.dataset.p }); if (r.error) return status('Lỗi quét: ' + r.error.message);
  const u = r.data || [], list = u.slice(0, 15).map((x) => `• Slide ${x.slide_no} của Dự án "${x.title}"`).join('\n') + (u.length > 15 ? `\n… và ${u.length - 15} nơi khác` : '');
  if (!confirm(u.length ? `Ảnh này đang dùng trong:\n${list}\n\nXóa sẽ làm hỏng các slide trên. Vẫn xóa?` : 'Xóa ảnh này khỏi thư viện?')) return;
  const d = await auth.sb.from('tloc_assets').delete().eq('id', f.dataset.id); if (d.error) return status(d.error.message);
  await auth.sb.storage.from('tloc-media').remove([f.dataset.p]); libLoad(); status('Đã xóa asset');
}
$('#libb').onclick = () => { const d = $('#lib'); if (d.open) d.close(); else { d.show(); libLoad(); } };
$('#lclose').onclick = () => $('#lib').close();
$('#lq').oninput = libDraw;
$('#lgrid').onclick = (ev) => {
  const f = ev.target.closest('figure'); if (!f) return;
  if (ev.target.dataset.a === 'del') return libDel(f);
  if (!canEdit()) return status('Chỉ Editor/Owner/Admin mới thêm được ảnh vào Canvas');
  add('image', { src: pubUrl(f.dataset.p), name: f.querySelector('img').alt });
};
$('#lgrid').ondragstart = (ev) => { const f = ev.target.closest('figure'); if (f) ev.dataTransfer.setData('text/tloc-asset', f.dataset.p); };
stage.addEventListener('dragover', (ev) => { if (ev.dataTransfer.types.includes('text/tloc-asset')) ev.preventDefault(); });
stage.addEventListener('drop', (ev) => {
  const p = ev.dataTransfer.getData('text/tloc-asset'); if (!p || !canEdit()) return; ev.preventDefault();
  const r = stage.getBoundingClientRect(); add('image', { src: pubUrl(p), x: snap10((ev.clientX - r.left) / scale - 240), y: snap10((ev.clientY - r.top) / scale - 160) });
});
$('#lup').onclick = async () => { // chỉ Admin (nút ẩn với người khác; RLS storage + tloc_assets chặn ở Backend)
  const fs = [...$('#lfiles').files]; if (!fs.length) return status('Chọn ảnh PNG');
  const tags = $('#ltag').value.split(',').map((t) => t.trim()).filter(Boolean), cat = $('#lcat').value.trim() || null; let n = 0;
  for (const [i, f] of fs.entries()) {
    if (f.type !== 'image/png' || f.size > 10485760) { status(`Bỏ qua ${f.name}: chỉ nhận PNG ≤ 10MB`); continue; }
    const p = `assets/${Date.now()}-${i}-${f.name.replace(/[^\w.-]/g, '_')}`, b = auth.sb.storage.from('tloc-media');
    const u = await b.upload(p, f, { contentType: 'image/png' }); if (u.error) { status('Lỗi tải ' + f.name + ': ' + u.error.message); continue; }
    const ins = await auth.sb.from('tloc_assets').insert({ file_name: f.name, file_path: p, category: cat, tags });
    if (ins.error) { await b.remove([p]); status('Lỗi lưu ' + f.name + ': ' + ins.error.message); continue; }
    n++; status(`Đã tải ${n}/${fs.length}`);
  }
  $('#lfiles').value = ''; libLoad();
};

// ----- Lịch sử phiên bản (tối đa 10 — trigger GĐ1) -----
async function vLoad() {
  const box = $('#vlist'); box.textContent = 'Đang tải…';
  const r = await auth.sb.from('tloc_versions').select('id,version_number,created_at').eq('project_id', pid).order('version_number', { ascending: false });
  if (r.error) { box.textContent = r.error.message; return; }
  box.innerHTML = r.data.map((v) => `<div class="row" data-id="${v.id}"><span>Phiên bản ${v.version_number} · ${esc(new Date(v.created_at).toLocaleString('vi-VN'))}</span><button data-a="pv">Xem trước</button>${isOA() ? '<button data-a="rs">Khôi phục</button>' : ''}</div>`).join('') || '<p class="hint">Chưa có phiên bản. Dùng "Lưu chính thức".</p>';
}
$('#vhb').onclick = () => { $('#vh').showModal(); vLoad(); };
$('#vclose').onclick = () => $('#vh').close();
$('#vlist').onclick = async (ev) => {
  const b = ev.target.closest('button[data-a]'); if (!b) return; const id = b.closest('.row').dataset.id;
  try {
    const r = await auth.sb.from('tloc_versions').select('snapshot_data').eq('id', id).single(); if (r.error) throw r.error; const sn = r.data.snapshot_data;
    if (b.dataset.a === 'pv') { $('#pvf').srcdoc = buildDoc(0, sn); $('#pv').showModal(); return; } // Read-only, không đụng bản đang mở
    if (!isOA()) throw new Error('Không đủ thẩm quyền: chỉ Admin/Owner được khôi phục');
    if (!confirm('CẢNH BÁO MẤT DỮ LIỆU: trạng thái hiện tại của dự án sẽ bị ghi đè bằng phiên bản này.\nHệ thống tự tạo 1 bản backup trước khi ghi đè (chỉ giữ tối đa 10 bản nên bản cũ nhất có thể bị loại).\nTiếp tục khôi phục?')) return;
    if (!sn?.slides?.length) throw new Error('Phiên bản rỗng, không thể khôi phục');
    clearTimeout(timer); await save();
    const bk = await auth.sb.from('tloc_versions').insert({ project_id: pid, snapshot_data: S }); if (bk.error) throw bk.error;
    S = { slides: sn.slides.map((s) => ({ id: s.id, els: s.els || [], trans: s.trans })), cur: 0 };
    sel = []; past = []; future = []; cur = snap(); render(); await save(); vLoad(); status('Đã khôi phục (đã tạo backup trước đó)');
  } catch (e) { status('Lỗi phiên bản: ' + (e.message || e)); }
};

// Tự kiểm: mở Console, gõ tlocTest() — 10 biến đổi, Undo 9 lần phải về trạng thái sau biến đổi #1
window.tlocTest = () => {
  add('shape'); const id = sel[0];
  for (let i = 1; i <= 10; i++) { find(id).x = i * 10; commit(); }
  for (let i = 0; i < 9; i++) undo();
  console.log(find(id).x === 10 ? 'PASS: undo 9 lần đúng, thao tác thứ 10 không còn lưu' : 'FAIL x=' + find(id).x, 'past=' + past.length);
  sel = [id]; del(); // dọn khối thử
};


// ---------- Kiểm thử Giai đoạn 1 (hộp thoại #chk) ----------

const g = (id) => document.getElementById(id);
const TABLES = ['tloc_projects', 'tloc_slides', 'tloc_versions', 'tloc_rooms', 'tloc_room_members', 'tloc_assets', 'tloc_element_locks'];

const log = (ok, msg) => {
  const li = document.createElement('li');
  li.className = ok ? 'ok' : 'bad';
  li.textContent = (ok ? 'Đạt: ' : 'Lỗi: ') + msg;
  g('log').prepend(li);
};
const guard = (fn) => async () => {
  try { if (!auth) throw new Error('Chưa kết nối Supabase'); await fn(); }
  catch (e) { log(false, e.message || String(e)); }
};

try { // anon key là public nên lưu localStorage dev được
  const c = JSON.parse(localStorage.getItem('tloc_dev_cfg') || '{}');
  g('url').value = c.url || CFG.url; g('key').value = c.key || CFG.key;
} catch { /* bỏ qua */ }

g('connect').onclick = () => {
  try {
    const url = g('url').value.trim(), key = g('key').value.trim();
    auth = createTlocAuth(createTlocClient(window.supabase.createClient, url, key));
    try { localStorage.setItem('tloc_dev_cfg', JSON.stringify({ url, key })); } catch { /* bỏ qua */ }
    log(true, 'Đã tạo client (chỉ ANON KEY)'); boot();
  } catch (e) { log(false, e.message); }
};

g('login').onclick = guard(async () => {
  const { error } = await auth.sb.auth.signInWithPassword({ email: g('email').value.trim(), password: g('pw').value });
  if (error) throw error;
  const s = await auth.getSession();
  g('session').textContent = `${s.user.email} | uid ${s.user.id.slice(0, 8)} | token ${s.access_token.slice(0, 16)}… | admin: ${await auth.isAdmin()}`;
  log(true, 'Đăng nhập NXHN thành công, đã lấy session token');
  await boot();
});

g('tables').onclick = guard(async () => {
  for (const t of TABLES) {
    const { error } = await auth.sb.from(t).select('*', { count: 'exact', head: true });
    log(!error, error ? `${t}: ${error.message}` : `${t} truy vấn được`);
  }
});

g('rls').onclick = guard(async () => {
  const id = g('pid').value.trim();
  if (!id) throw new Error('Nhập ID dự án của người dùng khác');
  const u = await auth.sb.from('tloc_projects').update({ title: 'hacked' }).eq('id', id).select();
  const d = await auth.sb.from('tloc_projects').delete().eq('id', id).select();
  const changed = (u.data?.length || 0) + (d.data?.length || 0);
  log(changed === 0, changed === 0 ? 'RLS chặn sửa/xóa dự án người khác (0 dòng bị tác động)' : 'RLS KHÔNG chặn: kiểm tra lại policy');
});

g('upload').onclick = guard(async () => {
  const f = g('file').files[0];
  if (!f) throw new Error('Chọn một file PNG');
  const user = await auth.getUser();
  if (!user) throw new Error('Cần đăng nhập trước');
  const path = `${user.id}/test-${Date.now()}.png`;
  const bucket = auth.sb.storage.from('tloc-media');
  const { error } = await bucket.upload(path, f, { contentType: f.type });
  if (error) throw error;
  const url = bucket.getPublicUrl(path).data.publicUrl;
  const r = await fetch(url, { method: 'HEAD' });
  g('preview').src = url; g('preview').hidden = false;
  log(r.ok, r.ok ? `Upload và URL công khai hoạt động: ${url}` : `URL công khai trả mã ${r.status}`);
});

// ---------- Kiểm thử Giai đoạn 3 (hộp thoại #chk, hoặc Console: tlocTest3()) ----------
async function test3() {
  const R = (ok, m) => { log(ok, 'GĐ3 · ' + m); console.log((ok ? 'PASS' : 'FAIL') + ': ' + m); };
  const q = { q: 'Q?', opts: ['A', 'B', 'C'], ok: 1, ex: 'vì' };
  const hq = HTMLGenerator.html({ id: 'eT', type: 'quiz', x: 0, y: 0, w: 100, h: 100, r: 0, st: {}, quiz: q });
  R(hq.includes('data-quiz=') && (hq.match(/class="tq-b"/g) || []).length === 3, 'Quiz sinh data-quiz + đúng 3 nút đáp án');
  R(!quizErr(q) && !!quizErr({ ...q, opts: ['A'] }) && !!quizErr({ ...q, ok: 5 }) && !!quizErr({ ...q, q: '' }), 'Quiz bắt buộc câu hỏi, 2–4 đáp án, 1 đáp án đúng');
  R(!/fetch\(|XMLHttpRequest|supabase|sendBeacon|rpc\(/.test(tlocNav.toString() + tlocQuiz.toString()), 'Runtime Quiz không chứa mã gọi mạng/CSDL (kết quả chỉ ở RAM)');
  const ea = { id: 'eA', type: 'text', x: 0, y: 0, w: 100, h: 50, r: 0, st: {}, t: 'x', anim: { in: { fx: 'slideInRight', dur: 0.8, delay: 0 } } };
  const css = rules([ea]);
  R(css.includes('@keyframes tlocSlideInRight') && css.includes('#eA.tloc-animated-element{animation-name:tlocSlideInRight'), 'Slide In Right sinh @keyframes + animation (chỉ opacity/translate => 60fps)');
  R(HTMLGenerator.html(ea).includes('tloc-animated-element') && !HTMLGenerator.html(ea, false).includes('tloc-animated-element'), 'Editor không tự chạy hiệu ứng, file xuất thì có');
  const p = placeModal({ l: 1220, t: 670, w: 40, h: 40 }, 360, 240, 1280, 720);
  R(p.y + 240 <= 670 && p.x >= 0 && p.x + 360 <= 1280, `Icon sát góc dưới: pop-up đẩy lên trên (y=${p.y}, x=${p.x})`);
  const p2 = placeModal({ l: 10, t: 10, w: 40, h: 40 }, 360, 240, 1280, 720);
  R(p2.y >= 50 && p2.x >= 0, 'Icon góc trên trái: pop-up hiện bên dưới, không tràn mép');
  R(!safeUrl('javascript:alert(1)') && !safeUrl('data:text/html,x') && !!safeUrl('https://a.b/c.glb'), 'safeUrl chặn javascript:/data:');
  R(!rich('<img src=x onerror=1>').includes('<img') && rich('**a**').includes('<b>a</b>'), 'Nội dung pop-up được escape trước khi định dạng');
  R(chartSVG({ type: 'pie', labels: 'A,B', data: '1,2' }).includes('viewBox="0 0 600 400"'), 'Biểu đồ xuất SVG phẳng có viewBox (co giãn theo container)');
  if (!auth) return log(false, 'GĐ3 · Chưa kết nối Supabase: bỏ qua kiểm tra CSDL');
  const { data, error } = await auth.sb.rpc('tloc_phase3_check');
  if (error) return R(false, 'RPC tloc_phase3_check: ' + error.message + ' (đã chạy lại tloc.sql chưa?)');
  const t = data.tables || [], bad = t.filter((n) => /quiz|score|result|answer|attempt|grade/i.test(n));
  const extra = t.filter((n) => !TABLES.includes(n)); R(!extra.length && !bad.length, `CSDL có ${t.length} bảng tloc_* (6 gốc + khóa phần tử), không có bảng lưu điểm/quiz`);
  const b = data.bucket || {};
  R(b.file_size_limit >= 15728640 && (b.allowed_mime_types || []).includes('model/gltf-binary'), `Bucket tloc-media nhận 3D/âm thanh/video (giới hạn ${Math.round((b.file_size_limit || 0) / 1048576)}MB)`);
}
window.tlocTest3 = test3;
g('t3').onclick = () => test3().catch((e) => log(false, e.message || String(e)));

// ---------- Kiểm thử Giai đoạn 4 (hộp thoại #chk, hoặc Console: tlocTest4()) ----------
async function test4() {
  const R = (ok, m) => { log(ok, 'GĐ4 · ' + m); console.log((ok ? 'PASS' : 'FAIL') + ': ' + m); };
  const r0 = role; role = 'view'; const v = canEdit(); role = 'edit'; const e = canEdit(); role = 'admin'; const a = isOA(); role = r0;
  R(!v && e && a, 'Viewer chỉ xem; Editor/Admin được sửa (UI) — Backend vẫn do RLS quyết định');
  locks.set('zz-test', { by: 'other-user', name: 'User A', exp: new Date(Date.now() + 30000).toISOString() });
  const on = !!lockedBy('zz-test'); locks.set('zz-test', { by: 'other-user', name: 'User A', exp: new Date(Date.now() - 1000).toISOString() });
  R(on && !lockedBy('zz-test'), 'Khóa của người khác chặn chọn; khóa hết hạn (30s) tự mở'); locks.delete('zz-test');
  if (!auth) return log(false, 'GĐ4 · Chưa kết nối Supabase: bỏ qua kiểm tra CSDL');
  const c = await auth.sb.rpc('tloc_phase4_check');
  if (c.error) R(false, 'RPC tloc_phase4_check: ' + c.error.message + ' (đã chạy lại tloc.sql chưa?)');
  else {
    R(!c.data.rls_off.length, c.data.rls_off.length ? 'Bảng chưa bật RLS: ' + c.data.rls_off.join(', ') : 'Mọi bảng tloc_* đã bật RLS');
    R(c.data.max_versions <= 10, `Mỗi dự án tối đa ${c.data.max_versions}/10 phiên bản`);
    R(c.data.realtime, 'Bảng tloc_element_locks nằm trong publication realtime (nếu sai: hệ thống vẫn chạy nhờ poll 5s)');
  }
  if (!adm && pid) { // checklist 1: member thường bấm Tạo phòng phải bị chặn
    const r = await auth.sb.from('tloc_rooms').insert({ project_id: pid }).select();
    if (!r.error && r.data?.length) await auth.sb.from('tloc_rooms').delete().eq('id', r.data[0].id);
    R(!!r.error, r.error ? 'Member thường tạo phòng bị RLS chặn: ' + r.error.message : 'RLS KHÔNG chặn tạo phòng — kiểm tra policy rooms_admin_all');
  } else log(true, 'GĐ4 · Đang là Admin: đăng nhập tài khoản thường để thử chặn "Tạo phòng"');
  if (room && canEdit()) { // khóa phần tử: lấy → gia hạn → nhả
    const k = await lockRpc('zz-selftest'), k2 = await lockRpc('zz-selftest');
    await auth.sb.rpc('tloc_unlock_elements', { p_room: room, p_elements: ['zz-selftest'] }); locks.delete('zz-selftest');
    R(k === true && k2 === true, 'RPC khóa phần tử: lấy khóa + gia hạn thành công, sau đó đã nhả');
  } else log(true, 'GĐ4 · Chưa có phòng mở / không có quyền sửa: bỏ qua thử khóa (thử bằng 2 trình duyệt)');
}
window.tlocTest4 = test4;
g('t4').onclick = () => test4().catch((e) => log(false, e.message || String(e)));

// ---------- GĐ5: Chia sẻ công khai + Thu hồi link · Xuất website ZIP độc lập · Pre-export check · Tự kiểm ----------
const shMsg = (t) => ($('#shm').textContent = t);
const watchUrl = () => new URL('?watch=' + pid, location.href.split('#')[0].split('?')[0]).href;
const cleanUrl = () => new URL('watch/' + pid, location.origin + location.pathname.replace(/[^/]*$/, '')).href; // cần rewrite /watch/* -> tloc.html
async function shLoad() {
  const r = await auth.sb.from('tloc_projects').select('is_public').eq('id', pid).single(), on = !!r.data?.is_public;
  $('#shs').textContent = on ? '● Đang công khai: ai có link đều xem được' : '○ Riêng tư: người lạ thấy 404 Access Denied';
  $('#shon').hidden = on; $('#shoff').hidden = !on; $('#shl').value = watchUrl(); $('#shl2').value = cleanUrl();
}
async function setPublic(v) { // RPC tloc_set_public: chỉ Owner/Admin (Backend kiểm), có hiệu lực ngay
  if (!v && !confirm('Thu hồi link? Mọi người đang giữ link sẽ thấy 404 Access Denied ngay khi tải lại.')) return;
  const r = await auth.sb.rpc('tloc_set_public', { p_project: pid, p_public: v });
  shMsg(r.error ? (/forbidden/.test(r.error.message) ? 'Không đủ thẩm quyền: chỉ Owner/Admin.' : r.error.message) : v ? 'Đã bật chia sẻ công khai' : 'Đã thu hồi link'); shLoad();
}
$('#shb').onclick = () => { shMsg(''); $('#shr').showModal(); shLoad(); };
$('#shclose').onclick = () => $('#shr').close();
$('#shon').onclick = () => setPublic(true); $('#shoff').onclick = () => setPublic(false);
$('#shcopy').onclick = () => navigator.clipboard.writeText($('#shl').value).then(() => shMsg('Đã sao chép link'), () => shMsg('Không sao chép được'));
$('#shopen').onclick = () => window.open($('#shl').value, '_blank', 'noopener');

const GENERIC = /(^|,)\s*(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace)\s*$/i;
const isRemote = (u) => /^https?:\/\//i.test(String(u ?? '').trim());
const refsOf = (e) => [[e, 'src'], [e, 'poster'], [e.pop, 'i']].filter(([o, k]) => o && isRemote(o[k]));
function walk(els, fn) { els.forEach((e) => { fn(e); if (e.ch) walk(e.ch, fn); }); }
function htmlFix(h) { // thẻ đóng/mở không cân => tự làm sạch bằng trình phân tích HTML của trình duyệt
  const VOID = /^(img|br|hr|input|meta|link|source|area|base|col|embed|param|track|wbr)$/i; let d = 0, bad = false;
  for (const m of h.matchAll(/<(\/?)([a-z][\w-]*)\b[^>]*?(\/?)>/gi)) { if (VOID.test(m[2]) || m[3]) continue; d += m[1] ? -1 : 1; if (d < 0) bad = true; }
  if (d !== 0) bad = true;
  if (!bad || typeof DOMParser === 'undefined') return { h, bad };
  return { h: '<!doctype html>' + new DOMParser().parseFromString(h, 'text/html').documentElement.outerHTML, bad };
}
function pkgFiles(Z, assets) { // Cấu trúc: index.html · css/style.css · css/animation.css · js/navigation.js · js/quiz.js · assets/
  const els = Z.slides.flatMap((s) => s.els);
  const fx = htmlFix(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="css/style.css"><link rel="stylesheet" href="css/animation.css"><script type="importmap">${IMPORTMAP}</script></head><body><div id="tv">${secs(fromModel(Z))}</div>${PLAYER_HTML}<script src="js/quiz.js"></script><script src="js/navigation.js"></script></body></html>`);
  const style = playerBase() + 'body{font-family:system-ui,"Segoe UI",Roboto,sans-serif}\n' + BASE_CSS + els.map((e) => HTMLGenerator.css(e, 'l')).join('');
  const anim = playerAnim() + [...usedFx(els)].map(kf).join('') + els.map((e) => HTMLGenerator.css(e, 'a')).join('');
  return { fixed: fx.bad, files: [{ n: 'index.html', t: fx.h }, { n: 'css/style.css', t: style }, { n: 'css/animation.css', t: anim }, { n: 'js/navigation.js', t: navSrc(0) }, { n: 'js/quiz.js', t: quizSrc() }, ...assets] };
}
const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u) => { let c = ~0; for (let i = 0; i < u.length; i++) c = crcT[(c ^ u[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };
function zipStore(files) { // ZIP không nén (không cần thư viện ngoài): files = [{n, d: Uint8Array}]
  const pk = (sp) => { const b = new DataView(new ArrayBuffer(sp.reduce((a, x) => a + x[1], 0))); let o = 0; sp.forEach(([v, n]) => { n === 4 ? b.setUint32(o, v, true) : b.setUint16(o, v, true); o += n; }); return b; };
  const enc = new TextEncoder(), parts = [], cd = []; let off = 0;
  for (const f of files) {
    const nm = enc.encode(f.n), c = crc32(f.d), z = f.d.length;
    parts.push(pk([[0x04034b50, 4], [20, 2], [0x0800, 2], [0, 2], [0, 2], [0x21, 2], [c, 4], [z, 4], [z, 4], [nm.length, 2], [0, 2]]), nm, f.d);
    cd.push(pk([[0x02014b50, 4], [20, 2], [20, 2], [0x0800, 2], [0, 2], [0, 2], [0x21, 2], [c, 4], [z, 4], [z, 4], [nm.length, 2], [0, 2], [0, 2], [0, 2], [0, 2], [0, 4], [off, 4]]), nm);
    off += 30 + nm.length + z;
  }
  const sz = cd.reduce((a, x) => a + (x.byteLength ?? x.length), 0);
  return new Blob([...parts, ...cd, pk([[0x06054b50, 4], [0, 2], [0, 2], [files.length, 2], [files.length, 2], [sz, 4], [off, 4], [0, 2]])], { type: 'application/zip' });
}
async function preflight(say) { // Pre-export check: tài nguyên (Lỗi nặng) · font dự phòng · CSS/HTML/animation (tự làm sạch)
  const E = [], Wn = [], Z = structuredClone(S), urls = new Set(), got = new Map(), map = new Map();
  const cssSup = (k, v) => typeof CSS === 'undefined' || !CSS.supports || k.startsWith('--') || CSS.supports(k, v);
  Z.slides.forEach((s, si) => walk(s.els, (e) => {
    const at = `Slide ${si + 1} · ${e.name || e.id}`;
    for (const [k, v] of Object.entries(e.st || {})) {
      if (!cssOk(k) || !cssOk(v) || !cssSup(k, String(v))) { delete e.st[k]; Wn.push(`${at}: thuộc tính CSS "${k}" không hợp lệ — đã loại bỏ`); }
      else if (k === 'font-family' && !GENERIC.test(String(v).trim())) { e.st[k] = v + ', system-ui, sans-serif'; Wn.push(`${at}: font "${v}" thiếu font dự phòng — đã thêm system-ui, sans-serif`); }
    }
    ['in', 'em', 'out'].forEach((p) => {
      const c = e.anim?.[p]; if (!c?.fx) return;
      if (!FX[c.fx] || FX[c.fx][0] !== p) { delete e.anim[p]; Wn.push(`${at}: hiệu ứng "${c.fx}" không hợp lệ — đã gỡ`); return; }
      if (((c.dur ?? '') !== '' && (+c.dur < 0.1 || +c.dur > 10)) || ((c.delay ?? '') !== '' && (+c.delay < 0 || +c.delay > 30))) Wn.push(`${at}: thời lượng/trễ hiệu ứng ngoài khoảng — đã tự giới hạn`);
    });
    if (e.type === 'quiz') { const q = quizErr(e.quiz); if (q) E.push(`${at}: Quiz — ${q}`); }
    if (e.pop?.on && +e.pop.g > Z.slides.length) Wn.push(`${at}: pop-up trỏ tới slide ${e.pop.g} không tồn tại`);
    if (/^(image|audio|video|model)$/.test(e.type) && !String(e.src ?? '').trim()) E.push(`${at}: chưa có tệp (đường dẫn trống)`);
    refsOf(e).forEach(([o, k]) => { o[k] = String(o[k]).trim(); urls.add(o[k]); });
  }));
  const list = [...urls]; let n = 0;
  const one = async (u) => { try { const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); got.set(u, new Uint8Array(await r.arrayBuffer())); } catch (x) { E.push(`Liên kết tài nguyên hỏng: ${u} (${x.message || x}) — sửa link hoặc tải lại tệp`); } say(`Đang kiểm tra / tải tài nguyên ${++n}/${list.length}…`); };
  for (let i = 0; i < list.length; i += 4) await Promise.all(list.slice(i, i + 4).map(one));
  const files = []; let total = 0;
  list.forEach((u, i) => { const d = got.get(u); if (!d) return; let b = 'file'; try { b = decodeURIComponent(new URL(u).pathname.split('/').pop() || 'file'); } catch { /* giữ 'file' */ } const p = `assets/${i}-${b.replace(/[^\w.-]/g, '_')}`; map.set(u, p); files.push({ n: p, d }); total += d.length; });
  if (total > 100 * 1048576) Wn.push(`Tổng tài nguyên ${(total / 1048576).toFixed(0)}MB (>100MB): gói ZIP nặng`);
  Z.slides.forEach((s) => walk(s.els, (e) => refsOf(e).forEach(([o, k]) => { if (map.has(o[k])) o[k] = map.get(o[k]); })));
  if (E.length) return { E, W: Wn };
  const P = pkgFiles(Z, files); if (P.fixed) Wn.push('HTML có thẻ đóng/mở không cân — đã tự làm sạch trước khi đóng gói');
  if (Z.slides.some((s) => s.els.some((e) => e.type === 'model'))) Wn.push('Có mô hình 3D: cần Internet (trình xem 3D tải từ CDN) và mở qua máy chủ; ngoại tuyến sẽ hiện ảnh poster');
  const enc = new TextEncoder();
  return { E, W: Wn, blob: zipStore(P.files.map((f) => ({ n: f.n, d: f.d || enc.encode(f.t) }))), n: P.files.length };
}
let PKG = null;
async function exportSite() {
  const ul = $('#xl'), st = $('#xs'), btn = $('#xdl'), say = (t) => (st.textContent = t); ul.innerHTML = ''; btn.disabled = true; PKG = null; $('#xp').showModal(); say('Đang kiểm tra…');
  try {
    const r = await preflight(say);
    ul.innerHTML = r.E.map((m) => `<li class="bad">Lỗi nặng: ${esc(m)}</li>`).join('') + r.W.map((m) => `<li class="warn">Cảnh báo: ${esc(m)}</li>`).join('') || '<li class="ok">Không phát hiện vấn đề.</li>';
    if (r.E.length) return say(`Có ${r.E.length} lỗi nặng: sửa rồi bấm "Xuất website" lại.`);
    PKG = r.blob; btn.disabled = false; say(`Sẵn sàng: ${r.n} tệp · ${(r.blob.size / 1048576).toFixed(1)}MB`);
  } catch (e) { say('Lỗi: ' + (e.message || e)); }
}
$('#xdl').onclick = () => {
  if (!PKG) return; const a = document.createElement('a'), nm = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').replace(/\W+/g, '_').replace(/^_|_$/g, '') || 'tloc';
  a.href = URL.createObjectURL(PKG); a.download = nm + '-website.zip'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
$('#xclose').onclick = () => $('#xp').close();
Object.assign(window.TLOC, { inlineDoc, pkgFiles, zipStore });

// ---------- Kiểm thử Giai đoạn 5 (hộp thoại #chk, hoặc Console: tlocTest5()) ----------
async function test5() {
  const R = (ok, m) => { log(ok, 'GĐ5 · ' + m); console.log((ok ? 'PASS' : 'FAIL') + ': ' + m); };
  const Z = { slides: [{ id: 's1', trans: { fx: 'fade', dur: 0.6 }, els: [{ id: 'eQ', type: 'quiz', name: 'Quiz', x: 0, y: 0, w: 600, h: 400, r: 0, st: {}, quiz: { q: 'Q?', opts: ['A', 'B'], ok: 0, ex: '' } }, { id: 'eI', type: 'image', name: 'Ảnh', x: 0, y: 0, w: 100, h: 100, r: 0, st: {}, src: 'assets/0-a.png', anim: { in: { fx: 'fadeIn', dur: 0.8, delay: 0 } } }] }, { id: 's2', trans: { fx: 'none' }, els: [] }] };
  const P = pkgFiles(Z, []), nm = P.files.map((f) => f.n), tx = (n) => P.files.find((f) => f.n === n).t;
  R(['index.html', 'css/style.css', 'css/animation.css', 'js/navigation.js', 'js/quiz.js'].every((n) => nm.includes(n)), 'Gói xuất có index.html + css/ + js/ (assets/ khi có tài nguyên)');
  R(/href="css\/style\.css"/.test(tx('index.html')) && /src="js\/navigation\.js"/.test(tx('index.html')) && !/<script(?![^>]*(src=|importmap))/.test(tx('index.html')) && tx('index.html').includes('src="assets/0-a.png"'), 'index.html nối CSS/JS rời, không script nội tuyến, giữ đường dẫn assets/');
  R(tx('css/animation.css').includes('@keyframes tlocFadeIn') && tx('css/animation.css').includes('@keyframes tlocTfade') && tx('css/style.css').includes('#eI{position:absolute') && !tx('css/style.css').includes('animation-name'), 'Tách đúng: style.css = layout, animation.css = keyframes + hiệu ứng + chuyển cảnh');
  R(tx('js/quiz.js').includes('tq-b') && !/supabase|fetch\(|XMLHttpRequest|sendBeacon|rpc\(/.test(P.files.map((f) => f.t || '').join('\n')), 'Gói xuất không chứa mã Supabase/mạng: chạy độc lập ngoại tuyến');
  const z = zipStore([{ n: 'a.txt', d: new TextEncoder().encode('xin chào') }]); R(z.size === 117 && crc32(new TextEncoder().encode('123456789')) === 0xCBF43926, 'ZIP tự viết: kích thước và CRC32 chuẩn');
  R(!safeUrl('javascript:x') && !!safeUrl('assets/a.png') && sid('a"><script>') === 'ascript' && !cssOk('a}</style>'), 'Chặn XSS: safeUrl/sid/cssOk; cho phép assets/');
  if (!auth) return log(false, 'GĐ5 · Chưa kết nối Supabase: bỏ qua kiểm tra CSDL');
  const c = await auth.sb.rpc('tloc_phase5_check'); if (c.error) return R(false, 'RPC tloc_phase5_check: ' + c.error.message + ' (đã chạy lại tloc.sql chưa?)');
  R(!c.data.anon_direct_read && c.data.public_policies === 0, 'anon không đọc trực tiếp bảng tloc_* (chỉ qua RPC tloc_watch)');
  const an = window.supabase.createClient(auth.sb.supabaseUrl, auth.sb.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'tloc-anon-test' } });
  const w = (id) => an.rpc('tloc_watch', { p_project: id });
  R((await w('00000000-0000-0000-0000-000000000000')).data === null, 'Dự án không tồn tại → null (trang 404 Access Denied)');
  if (!pid || !isOA()) return log(true, 'GĐ5 · Cần Owner/Admin + mở một dự án để thử Bật → Thu hồi link');
  const was = !!(await auth.sb.from('tloc_projects').select('is_public').eq('id', pid).single()).data?.is_public;
  const on = await auth.sb.rpc('tloc_set_public', { p_project: pid, p_public: true }); if (on.error) return R(false, 'tloc_set_public: ' + on.error.message);
  const d = (await w(pid)).data; R(!!d && Array.isArray(d.slides) && !('owner_id' in d) && d.slides.every((x) => Object.keys(x).sort().join() === 'css,html,trans'), 'Bật Public: người lạ xem được; chỉ nhận HTML/CSS đã render (không metadata/owner)');
  await auth.sb.rpc('tloc_set_public', { p_project: pid, p_public: false });
  R((await w(pid)).data === null, 'Thu hồi link: người lạ nhận null NGAY → 404 Access Denied');
  if (was) await auth.sb.rpc('tloc_set_public', { p_project: pid, p_public: true }); // trả về trạng thái ban đầu
}
window.tlocTest5 = test5;
g('t5').onclick = () => test5().catch((e) => log(false, e.message || String(e)));

// ---------- Khởi động ----------
const fit = () => { stage.style.width = W + 'px'; stage.style.height = H + 'px'; zoom(Math.min(($('#center').clientWidth - 24) / W, 1)); };
const openChk = () => { if (!g('chk').open) g('chk').showModal(); };
g('chkb').onclick = openChk; g('cclose').onclick = () => g('chk').close();
let booted = false;
async function boot() {
  if (booted || !auth) return;
  try {
    const u = await auth.getUser();
    if (!u) { status('Chưa đăng nhập: đăng nhập trong "Kiểm thử"'); return openChk(); }
    booted = true; uid = u.id; ownerId = uid; pid = new URLSearchParams(location.search).get('p'); let fresh = false;
    if (pid) {
      const p = await auth.sb.from('tloc_projects').select('title,canvas_size,owner_id').eq('id', pid).single(); if (p.error) throw p.error;
      title = p.data.title; ownerId = p.data.owner_id; W = p.data.canvas_size.width; H = p.data.canvas_size.height;
      const s = await auth.sb.from('tloc_slides').select('id,metadata').eq('project_id', pid).order('order_index'); if (s.error) throw s.error;
      S = { slides: s.data.map((r) => ({ id: r.id, els: r.metadata?.els || [], trans: r.metadata?.trans })), cur: 0 };
    } else {
      const p = await auth.sb.from('tloc_projects').insert({ title }).select('id').single(); if (p.error) throw p.error;
      pid = p.data.id; history.replaceState(null, '', '?p=' + pid); fresh = true;
    }
    if (!S.slides.length) { S.slides = [{ id: uuid(), els: [] }]; fresh = true; }
    g('title').value = title; g('pres').href = '?watch=' + pid; await initCollab();
    fit(); cur = snap(); sel = []; render(); fresh ? await save() : status('Đã tải');
  } catch (e) { booted = false; status('Lỗi: ' + (e.message || e)); }
}
fit(); cur = snap(); render();
try {
  const c = JSON.parse(localStorage.getItem('tloc_dev_cfg') || '{}');
  auth = createTlocAuth(createTlocClient(window.supabase.createClient, c.url || CFG.url, c.key || CFG.key)); boot();
} catch { status('Chưa kết nối: nhập URL + ANON KEY trong "Kiểm thử"'); openChk(); }
})();
