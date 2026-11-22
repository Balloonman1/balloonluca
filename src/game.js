// One flight: builds the 3D scene for a map and runs the balloon.
import * as B from './b.js';
import { MAPS, L, W, YMAX, YMIN, LAYER_H, mulberry } from './maps.js';

const GEM_PTS = 10, RING_PTS = 50;
const SPEED = 12;       // the balloon's own forward speed
const BALLOON_R = 3.2;  // collision size of the envelope

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function makeBalloon(scene, color, name) {
  const root = new B.TransformNode('balloon', scene);
  const tex = new B.DynamicTexture('stripes', { width: 256, height: 8 }, scene, false);
  const ctx = tex.getContext();
  for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : color; ctx.fillRect(i * 32, 0, 32, 8); }
  tex.update();
  const em = new B.StandardMaterial('env', scene);
  em.diffuseTexture = tex; em.specularColor = B.Color3.Black(); em.emissiveColor = new B.Color3(0.25, 0.25, 0.25);
  const env = B.MeshBuilder.CreateSphere('env', { diameter: 6, segments: 16 }, scene);
  env.scaling.y = 1.15; env.material = em; env.parent = root;
  const sm = new B.StandardMaterial('skirt', scene);
  sm.diffuseColor = B.Color3.FromHexString(color); sm.specularColor = B.Color3.Black(); sm.emissiveColor = sm.diffuseColor.scale(0.25);
  const skirt = B.MeshBuilder.CreateCylinder('skirt', { height: 2.4, diameterTop: 4.0, diameterBottom: 1.6, tessellation: 16 }, scene);
  skirt.position.y = -3.5; skirt.material = sm; skirt.parent = root;
  const bm = new B.StandardMaterial('basket', scene);
  bm.diffuseColor = new B.Color3(0.5, 0.33, 0.16); bm.specularColor = B.Color3.Black();
  const basket = B.MeshBuilder.CreateBox('basket', { size: 1.3 }, scene);
  basket.position.y = -5.7; basket.material = bm; basket.parent = root;
  const fm = new B.StandardMaterial('flame', scene);
  fm.emissiveColor = new B.Color3(1, 0.6, 0.1); fm.disableLighting = true;
  const flame = B.MeshBuilder.CreateSphere('flame', { diameter: 1, segments: 6 }, scene);
  flame.scaling.y = 1.8; flame.position.y = -4.6; flame.material = fm; flame.parent = root; flame.isVisible = false;

  if (name) {
    const lt = new B.DynamicTexture('label', { width: 256, height: 64 }, scene, false);
    const c = lt.getContext();
    c.clearRect(0, 0, 256, 64);
    c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 8; c.strokeStyle = '#000'; c.strokeText(name, 128, 34);
    c.fillStyle = '#fff'; c.fillText(name, 128, 34);
    lt.update(); lt.hasAlpha = true;
    const lm = new B.StandardMaterial('labelm', scene);
    lm.diffuseTexture = lt; lm.emissiveColor = B.Color3.White(); lm.disableLighting = true; lm.useAlphaFromDiffuseTexture = true; lm.backFaceCulling = false;
    const label = B.MeshBuilder.CreatePlane('label', { width: 10, height: 2.5 }, scene);
    label.position.y = 5.6; label.material = lm; label.parent = root; label.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
  }
  return { root, flame };
}

export class Flight {
  constructor(engine, mapIndex, players, myId, cb) {
    const map = (this.map = MAPS[mapIndex]);
    this.cb = cb;
    this.input = { left: false, right: false, up: false, down: false };
    const scene = (this.scene = new B.Scene(engine));
    scene.clearColor = new B.Color4(map.sky[0], map.sky[1], map.sky[2], 1);
    scene.fogMode = B.Scene.FOGMODE_EXP2;
    scene.fogColor = new B.Color3(...map.fog);
    scene.fogDensity = map.fogDensity;
    const hemi = new B.HemisphericLight('hemi', new B.Vector3(0.3, 1, -0.3), scene);
    hemi.intensity = map.light;
    hemi.groundColor = new B.Color3(...map.bounce);
    this.cam = new B.FreeCamera('cam', new B.Vector3(0, 55, -40), scene);
    this.cam.maxZ = 1500; this.cam.fov = 0.95;

    // helpers handed to the map builder
    const mats = new Map();
    const h = {
      scene, MB: B.MeshBuilder, rng: mulberry(map.seed),
      mat(c, o = {}) {
        const key = c.join() + (o.emis || 0) + (o.alpha || 1);
        if (mats.has(key)) return mats.get(key);
        const m = new B.StandardMaterial('m' + mats.size, scene);
        m.diffuseColor = new B.Color3(...c); m.specularColor = B.Color3.Black();
        if (o.emis) m.emissiveColor = m.diffuseColor.scale(o.emis);
        if (o.alpha) m.alpha = o.alpha;
        mats.set(key, m);
        return m;
      },
      src(mesh, mat) { mesh.material = mat; mesh.isVisible = false; return mesh; },
      inst(src, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) {
        const i = src.createInstance('i');
        i.position.set(x, y, z); i.scaling.set(sx, sy, sz); i.rotation.y = ry;
        return i;
      },
      ground(c, y, emis = 0.15) {
        const g = B.MeshBuilder.CreateGround('ground', { width: 3000, height: L + 2400 }, scene);
        g.position.set(0, y, L / 2);
        g.material = h.mat(c, { emis });
        return g;
      },
    };
    this.obstacles = map.build(h);

    // finish line
    const ft = new B.DynamicTexture('finish', { width: 512, height: 256 }, scene, false);
    const fc = ft.getContext();
    for (let i = 0; i < 16; i++) for (let j = 0; j < 8; j++) { fc.fillStyle = (i + j) % 2 ? '#111' : '#fff'; fc.fillRect(i * 32, j * 32, 32, 32); }
    ft.update();
    const fmat = new B.StandardMaterial('finishm', scene);
    fmat.diffuseTexture = ft; fmat.emissiveColor = B.Color3.White(); fmat.disableLighting = true; fmat.alpha = 0.5; fmat.backFaceCulling = false;
    const gate = B.MeshBuilder.CreatePlane('gate', { width: W * 2 + 60, height: YMAX + 30 }, scene);
    gate.position.set(0, (YMAX + 30) / 2 - 5, L); gate.material = fmat;
    const post = h.src(B.MeshBuilder.CreateCylinder('post', { height: YMAX + 40, diameter: 8 }, scene), h.mat([1, 0.2, 0.2], { emis: 0.5 }));
    h.inst(post, -W - 30, (YMAX + 40) / 2 - 10, L);
    h.inst(post, W + 30, (YMAX + 40) / 2 - 10, L);

    // pickups: gems in trails, rings spread through the wind layers
    const r = mulberry(map.seed * 7 + 1);
    const free = (x, y, z) => !this.obstacles.some((o) => this.hits(o, x, y, z, 7));
    const gemSrc = h.src(B.MeshBuilder.CreatePolyhedron('gem', { type: 1, size: 1.7 }, scene), h.mat(map.gem, { emis: 0.7 }));
    const ringSrc = h.src(B.MeshBuilder.CreateTorus('ring', { diameter: 10, thickness: 1.3, tessellation: 20 }, scene), h.mat(map.ring, { emis: 0.8 }));
    this.pickups = [];
    const TR = 42;
    for (let i = 0; i < TR; i++) {
      const z0 = 90 + (i * (L - 190)) / TR + r() * 20;
      const x0 = (r() * 2 - 1) * (W - 30), y0 = 12 + r() * (YMAX - 24);
      const dx = (r() * 2 - 1) * 6, dy = (r() * 2 - 1) * 3;
      for (let k = 0; k < 5; k++) {
        const x = clamp(x0 + dx * k, -W + 8, W - 8), y = clamp(y0 + dy * k, YMIN + 4, YMAX - 4), z = z0 + k * 9;
        if (!free(x, y, z)) continue;
        this.pickups.push({ x, y, z, pts: GEM_PTS, rad: 5.5, mesh: h.inst(gemSrc, x, y, z), on: true });
      }
    }
    const RG = 24;
    for (let j = 0; j < RG; j++) {
      const z = 130 + (j * (L - 220)) / RG + r() * 20;
      const y = 15 + LAYER_H * ((r() * 4) | 0);
      for (let t = 0; t < 8; t++) {
        const x = (r() * 2 - 1) * (W - 25);
        if (!free(x, y, z)) continue;
        const m = h.inst(ringSrc, x, y, z); m.rotation.x = Math.PI / 2;
        this.pickups.push({ x, y, z, pts: RING_PTS, rad: 6.5, mesh: m, on: true, ring: true });
        break;
      }
    }

    // wind streaks so you can see which way each layer blows
    const stSrc = h.src(B.MeshBuilder.CreateBox('streak', { width: 0.35, height: 0.35, depth: 14 }, scene), h.mat([1, 1, 1], { emis: 1, alpha: 0.55 }));
    this.streaks = [];
    const sr = mulberry(99);
    map.winds.forEach((w, li) => {
      const ang = Math.atan2(w.wx, w.wz);
      for (let i = 0; i < 14; i++) {
        const m = h.inst(stSrc, (sr() * 2 - 1) * 170, li * LAYER_H + 4 + sr() * (LAYER_H - 8), sr() * 340, 1, 1, 1, ang);
        this.streaks.push({ m, w });
      }
    });

    // balloons
    this.remotes = new Map();
    const n = players.length;
    players.forEach((p, i) => {
      const sx = (i - (n - 1) / 2) * 16;
      if (p.id === myId) {
        this.me = makeBalloon(scene, p.color, '');
        this.pos = new B.Vector3(sx, 45, 0);
        this.me.root.position.copyFrom(this.pos);
      } else {
        const b = makeBalloon(scene, p.color, p.name);
        b.root.position.set(sx, 45, 0);
        this.remotes.set(p.id, { b, t: [sx, 45, 0, 0] });
      }
    });
    if (!this.pos) { this.pos = new B.Vector3(0, 45, 0); this.me = makeBalloon(scene, '#e63946', ''); }

    this.h = 0; this.vy = 0; this.wx = 0; this.wz = 0;
    this.pts = 0; this.layer = 1; this.running = false; this.finished = false; this.spin = 0;
    this.placeCamera(1);
  }

  hits(o, x, y, z, pad) {
    if (o.t === 's') {
      const dx = x - o.x, dy = y - o.y, dz = z - o.z, rr = o.r + pad;
      return dx * dx + dy * dy + dz * dz < rr * rr;
    }
    if (y > o.h + pad) return false;
    const rad = o.r * clamp(1 - y / o.h, 0, 1) + pad;
    const dx = x - o.x, dz = z - o.z;
    return dx * dx + dz * dz < rad * rad;
  }

  start() { this.running = true; }
  stop() { this.running = false; }

  setRemote(id, d) { const r = this.remotes.get(id); if (r) r.t = d; }
  removeRemote(id) { const r = this.remotes.get(id); if (r) { r.b.root.dispose(); this.remotes.delete(id); } }

  placeCamera(k) {
    const p = this.pos, s = Math.sin(this.h), c = Math.cos(this.h);
    const want = new B.Vector3(p.x - s * 30, p.y + 9, p.z - c * 30);
    B.Vector3.LerpToRef(this.cam.position, want, k, this.cam.position);
    this.cam.setTarget(new B.Vector3(p.x + s * 12, p.y + 1, p.z + c * 12));
  }

  update(dt) {
    const p = this.pos, inp = this.input;
    if (this.running && !this.finished) {
      const turn = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      this.h = clamp(this.h + turn * 1.1 * dt, -1.25, 1.25);
      const vt = ((inp.up ? 1 : 0) - (inp.down ? 1 : 0)) * 11;
      this.vy += (vt - this.vy) * Math.min(1, dt * 2.4);
      this.layer = clamp(Math.floor(p.y / LAYER_H), 0, 3);
      const w = this.map.winds[this.layer];
      const k = Math.min(1, dt * 1.6);
      this.wx += (w.wx - this.wx) * k; this.wz += (w.wz - this.wz) * k;
      const sp = p.y <= YMIN + 0.3 ? SPEED * 0.5 : SPEED; // dragging along the ground is slow
      p.x += (Math.sin(this.h) * sp + this.wx) * dt;
      p.z += (Math.cos(this.h) * sp + this.wz) * dt;
      p.y += this.vy * dt;
      if (p.y < YMIN) { p.y = YMIN; if (this.vy < 0) this.vy = 0; }
      if (p.y > YMAX) { p.y = YMAX; if (this.vy > 0) this.vy = 0; }
      p.x = clamp(p.x, -W, W);
      if (p.z < -20) p.z = -20;

      // bump off scenery
      for (const o of this.obstacles) {
        if (Math.abs(o.z - p.z) > 60) continue;
        if (!this.hits(o, p.x, p.y, p.z, BALLOON_R)) continue;
        if (o.t === 's') {
          let dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z;
          const d = Math.hypot(dx, dy, dz) || 1, rr = o.r + BALLOON_R;
          p.x = o.x + (dx / d) * rr; p.y = Math.max(YMIN, o.y + (dy / d) * rr); p.z = o.z + (dz / d) * rr;
        } else {
          let dx = p.x - o.x, dz = p.z - o.z;
          const d = Math.hypot(dx, dz) || 1, rr = o.r * clamp(1 - p.y / o.h, 0, 1) + BALLOON_R;
          p.x = o.x + (dx / d) * rr; p.z = o.z + (dz / d) * rr;
        }
      }

      for (const q of this.pickups) {
        if (!q.on || Math.abs(q.z - p.z) > 10) continue;
        const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
        if (dx * dx + dy * dy + dz * dz < q.rad * q.rad) {
          q.on = false; q.mesh.setEnabled(false);
          this.pts += q.pts;
          this.cb.onPickup(q.pts, !!q.ring);
        }
      }

      if (p.z >= L) { this.finished = true; this.cb.onFinish(); }
    }

    this.me.root.position.copyFrom(p);
    this.me.root.rotation.y = this.h;
    this.me.flame.isVisible = this.running && !this.finished && inp.up;

    this.spin += dt * 2;
    for (const q of this.pickups) if (q.on && Math.abs(q.z - p.z) < 400) { if (!q.ring) q.mesh.rotation.y = this.spin; }

    for (const s of this.streaks) {
      const m = s.m.position;
      m.x += s.w.wx * 4 * dt; m.z += s.w.wz * 4 * dt;
      if (m.z < p.z - 60) m.z += 400; else if (m.z > p.z + 340) m.z -= 400;
      if (m.x < p.x - 170) m.x += 340; else if (m.x > p.x + 170) m.x -= 340;
    }

    const k = Math.min(1, dt * 8);
    for (const r of this.remotes.values()) {
      const q = r.b.root.position;
      q.x += (r.t[0] - q.x) * k; q.y += (r.t[1] - q.y) * k; q.z += (r.t[2] - q.z) * k;
      r.b.root.rotation.y += (r.t[3] - r.b.root.rotation.y) * k;
    }

    this.placeCamera(Math.min(1, dt * 5));
  }

  dispose() { this.scene.dispose(); }
}
