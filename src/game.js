// One flight: builds the 3D scene for a map and runs the balloon.
import * as B from './b.js';
import { MAPS, L, W, YMAX, YMIN, LAYER_H, mulberry } from './maps.js';
import { makeBalloon } from './balloon.js';

const ASSET = import.meta.env.BASE_URL + 'assets/';

const GEM_PTS = 10, RING_PTS = 50;
const SPEED = 12;       // the balloon's own forward speed
const BALLOON_R = 3.4;  // collision size of the envelope

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Flight {
  constructor(engine, mapIndex, players, myId, cb) {
    const map = (this.map = MAPS[mapIndex]);
    this.cb = cb;
    this.timeLimit = cb.timeLimit || 180;
    this.input = { left: false, right: false, up: false, down: false };
    const low = (this.low = !!cb.low);
    const scene = (this.scene = new B.Scene(engine));
    scene.clearColor = new B.Color4(map.fog[0], map.fog[1], map.fog[2], 1);
    scene.fogMode = B.Scene.FOGMODE_EXP2;
    scene.fogColor = new B.Color3(...map.fog);
    scene.fogDensity = map.fogDensity;
    scene.environmentTexture = B.CubeTexture.CreateFromPrefilteredData(ASSET + 'country.env', scene);
    scene.environmentIntensity = 0.9;

    // sun, sky light and shadows
    const sunDir = (this.sunDir = new B.Vector3(...map.sun).normalize());
    const hemi = new B.HemisphericLight('hemi', new B.Vector3(0, 1, 0), scene);
    hemi.intensity = map.hemiI;
    hemi.diffuse = new B.Color3(...map.hemiSky);
    hemi.groundColor = new B.Color3(...map.hemiGround);
    hemi.specular = B.Color3.Black();
    const sun = (this.sun = new B.DirectionalLight('sun', sunDir.scale(-1), scene));
    sun.intensity = map.sunI;
    sun.diffuse = new B.Color3(1, 0.95, 0.86);
    let shadows = null;
    if (!low) {
      shadows = new B.ShadowGenerator(2048, sun);
      shadows.usePercentageCloserFiltering = true;
      shadows.bias = 0.004; shadows.normalBias = 0.6;
      shadows.darkness = 0.25;
      sun.autoUpdateExtends = false;
      sun.orthoLeft = -280; sun.orthoRight = 280; sun.orthoTop = 280; sun.orthoBottom = -280;
      sun.shadowMinZ = 1; sun.shadowMaxZ = 1100;
    }
    const cast = (m) => { if (shadows) shadows.addShadowCaster(m, false); };

    // physically based sky
    const sky = new B.SkyMaterial('sky', scene);
    sky.backFaceCulling = false;
    sky.turbidity = map.turbidity; sky.rayleigh = map.rayleigh; sky.luminance = map.luminance;
    sky.mieCoefficient = 0.005; sky.mieDirectionalG = 0.82;
    sky.useSunPosition = true; sky.sunPosition = sunDir.scale(1000);
    const skybox = B.MeshBuilder.CreateBox('skybox', { size: 9000 }, scene);
    skybox.material = sky; skybox.infiniteDistance = true; skybox.applyFog = false;

    this.cam = new B.FreeCamera('cam', new B.Vector3(0, 55, -40), scene);
    this.cam.minZ = 0.5; this.cam.maxZ = 9000; this.cam.fov = 0.9;

    // film-style tone mapping, bloom and anti-aliasing
    const pipe = new B.DefaultRenderingPipeline('pipe', true, scene, [this.cam]);
    pipe.fxaaEnabled = true;
    pipe.imageProcessingEnabled = true;
    pipe.imageProcessing.toneMappingEnabled = true;
    pipe.imageProcessing.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
    pipe.imageProcessing.exposure = map.exposure;
    pipe.imageProcessing.contrast = 1.12;
    pipe.imageProcessing.vignetteEnabled = true;
    pipe.imageProcessing.vignetteWeight = 0.7;
    if (!low) {
      pipe.bloomEnabled = true; pipe.bloomThreshold = 1.5; pipe.bloomWeight = 0.18; pipe.bloomScale = 0.5; pipe.bloomKernel = 48;
      const glow = new B.GlowLayer('glow', scene, { blurKernelSize: 24 });
      glow.intensity = 0.35;
    }
    this.onUpdate = [];

    // helpers handed to the map builder
    const mats = new Map();
    const h = {
      scene, B, MB: B.MeshBuilder, rng: mulberry(map.seed), low, cast, onUpdate: this.onUpdate,
      asset: (f) => ASSET + f,
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
        g.material = h.mat(c, { emis }); g.receiveShadows = true;
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
    this.bots = []; this.botSkill = new Map(); this.botsOn = false; this.clock = 0;
    const n = players.length;
    players.forEach((p, i) => {
      const sx = (i - (n - 1) / 2) * 16;
      if (p.id === myId) {
        this.me = makeBalloon(scene, p.color, '', cast);
        this.pos = new B.Vector3(sx, 45, 0);
        this.me.root.position.copyFrom(this.pos);
      } else {
        const b = makeBalloon(scene, p.color, p.name, cast);
        b.root.position.set(sx, 45, 0);
        this.remotes.set(p.id, { b, t: [sx, 45, 0, 0] });
        if (p.bot && cb.isHost) {
          const bot = { id: p.id, pos: new B.Vector3(sx, 45, 0), h: 0, vy: 0, wx: 0, wz: 0, layer: 1, pts: 0, done: false,
            taken: new Set(), skip: new Set(), inp: { left: false, right: false, up: false, down: false }, target: null, rethink: 0 };
          this.bots.push(bot); this.botSkill.set(p.id, p.skill ?? 0.6);
        }
      }
    });
    if (!this.pos) { this.pos = new B.Vector3(0, 45, 0); this.me = makeBalloon(scene, '#e63946', '', cast); }

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

  start() {
    this.running = true; this.botsOn = true;
    // each bot overlooks some pickups, depending on its skill
    for (const b of this.bots) {
      const sk = this.botSkill.get(b.id);
      for (let i = 0; i < this.pickups.length; i++) if (Math.random() > sk) b.skip.add(i);
    }
  }
  stop() { this.running = false; }

  setRemote(id, d) { const r = this.remotes.get(id); if (r) r.t = d; }
  removeRemote(id) { const r = this.remotes.get(id); if (r) { r.b.root.dispose(); this.remotes.delete(id); } }

  placeCamera(k) {
    const p = this.pos, s = Math.sin(this.h), c = Math.cos(this.h);
    const want = new B.Vector3(p.x - s * 34, p.y + 5, p.z - c * 34);
    // keep the camera out of the rock
    for (const o of this.obstacles) {
      if (o.t !== 's' || Math.abs(o.z - want.z) > o.r + 4) continue;
      const dx = want.x - o.x, dy = want.y - o.y, dz = want.z - o.z, d = Math.hypot(dx, dy, dz) || 1, rr = o.r + 3;
      if (d < rr) { want.x = o.x + (dx / d) * rr; want.y = o.y + (dy / d) * rr; want.z = o.z + (dz / d) * rr; }
    }
    B.Vector3.LerpToRef(this.cam.position, want, k, this.cam.position);
    this.cam.setTarget(new B.Vector3(p.x + s * 14, p.y - 1, p.z + c * 14));
  }

  // Flight physics shared by the player and the bots.
  stepBody(b, inp, dt) {
    const p = b.pos;
    const turn = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    b.h = clamp(b.h + turn * 1.1 * dt, -1.25, 1.25);
    const vt = ((inp.up ? 1 : 0) - (inp.down ? 1 : 0)) * 11;
    b.vy += (vt - b.vy) * Math.min(1, dt * 2.4);
    b.layer = clamp(Math.floor(p.y / LAYER_H), 0, 3);
    const w = this.map.winds[b.layer];
    const k = Math.min(1, dt * 1.6);
    b.wx += (w.wx - b.wx) * k; b.wz += (w.wz - b.wz) * k;
    const sp = p.y <= YMIN + 0.3 ? SPEED * 0.5 : SPEED; // dragging along the ground is slow
    p.x += (Math.sin(b.h) * sp + b.wx) * dt;
    p.z += (Math.cos(b.h) * sp + b.wz) * dt;
    p.y += b.vy * dt;
    if (p.y < YMIN) { p.y = YMIN; if (b.vy < 0) b.vy = 0; }
    if (p.y > YMAX) { p.y = YMAX; if (b.vy > 0) b.vy = 0; }
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
  }

  // ---------- computer pilots (run on the host only) ----------
  botThink(b, dt, timeLeft) {
    const p = b.pos, winds = this.map.winds, inp = b.inp;
    const need = (L - p.z) / Math.max(1, timeLeft);
    const hurry = need > SPEED + 2.5; // behind schedule: ride the good wind and stop wandering
    b.rethink -= dt;
    const t = b.target;
    if (b.rethink <= 0 || !t || b.taken.has(t.i) || t.q.z < p.z + 4) {
      b.rethink = 0.5 + Math.random() * 0.5;
      b.target = null;
      let best = 0;
      for (let i = 0; i < this.pickups.length; i++) {
        const q = this.pickups[i], dz = q.z - p.z;
        if (dz < 10 || dz > 170 || b.taken.has(i) || b.skip.has(i)) continue;
        const dx = Math.abs(q.x - p.x), dy = Math.abs(q.y - p.y);
        if (dx > dz * 0.8 + 4 || dy > dz * 0.55 + 3) continue;
        if (hurry && winds[clamp(Math.floor(q.y / LAYER_H), 0, 3)].wz < 3) continue;
        const sc = q.pts / (dz + 2 * dx + 2 * dy + 25);
        if (sc > best) { best = sc; b.target = { i, q }; }
      }
    }
    let ax, ay, az;
    if (b.target) { ax = b.target.q.x; ay = b.target.q.y; az = b.target.q.z; }
    else {
      // no target: cruise in the best wind layer that is close by
      let bl = b.layer, bs = -99;
      for (let i = 0; i < 4; i++) { const sc = winds[i].wz - Math.abs(i - b.layer) * (hurry ? 0.5 : 2); if (sc > bs) { bs = sc; bl = i; } }
      ax = p.x * 0.9; ay = clamp(bl * LAYER_H + LAYER_H / 2, YMIN + 4, YMAX - 4); az = p.z + 80;
    }
    // steer around scenery
    let near = 1e9;
    for (const o of this.obstacles) {
      const dz = o.z - p.z;
      if (dz < -6 || dz > 60 || dz > near) continue;
      const pad = BALLOON_R + 5;
      if (o.t === 's') {
        if (Math.abs(o.x - p.x) > o.r + pad || Math.abs(o.y - p.y) > o.r + pad) continue;
        const opts = [[o.x - o.r - pad - 3, p.y], [o.x + o.r + pad + 3, p.y], [p.x, o.y + o.r + pad + 3], [p.x, o.y - o.r - pad - 3]]
          .filter((c) => Math.abs(c[0]) < W - 4 && c[1] > YMIN + 2 && c[1] < YMAX - 2);
        if (!opts.length) continue;
        opts.sort((c, d) => Math.hypot(c[0] - p.x, c[1] - p.y) - Math.hypot(d[0] - p.x, d[1] - p.y));
        near = dz; ax = opts[0][0]; ay = opts[0][1]; az = o.z;
      } else {
        const rad = o.r * clamp(1 - p.y / o.h, 0, 1) + pad;
        if (p.y > o.h + pad || Math.abs(o.x - p.x) > rad) continue;
        near = dz; ax = o.x + (p.x >= o.x ? 1 : -1) * (rad + 4); ay = p.y; az = o.z;
        if (Math.abs(ax) > W - 4) ax = o.x - (p.x >= o.x ? 1 : -1) * (rad + 4);
      }
    }
    const dz = Math.max(8, az - p.z), tt = dz / (SPEED + Math.max(-4, b.wz));
    const wantH = clamp(Math.atan2(ax - p.x - b.wx * tt, dz), -1.1, 1.1);
    inp.left = wantH < b.h - 0.04; inp.right = wantH > b.h + 0.04;
    const pred = p.y + b.vy * 0.45;
    inp.up = ay - pred > 1.5; inp.down = ay - pred < -1.5;
  }

  updateBots(dt, timeLeft) {
    for (const b of this.bots) {
      if (b.done) continue;
      this.botThink(b, dt, timeLeft);
      this.stepBody(b, b.inp, dt);
      const p = b.pos;
      for (let i = 0; i < this.pickups.length; i++) {
        const q = this.pickups[i];
        if (Math.abs(q.z - p.z) > 10 || b.taken.has(i)) continue;
        const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
        if (dx * dx + dy * dy + dz * dz < q.rad * q.rad) { b.taken.add(i); b.pts += q.pts; }
      }
      const r = this.remotes.get(b.id);
      if (r) r.t = [p.x, p.y, p.z, b.h];
      if (p.z >= L) { b.done = true; this.cb.onBotDone(b.id, true, b.pts); }
    }
  }
  botsTimeUp() { for (const b of this.bots) if (!b.done) { b.done = true; this.cb.onBotDone(b.id, false, b.pts); } }
  botState(id) { const b = this.bots.find((x) => x.id === id); return b ? [+b.pos.x.toFixed(1), +b.pos.y.toFixed(1), +b.pos.z.toFixed(1), +b.h.toFixed(2), b.pts] : null; }

  update(dt) {
    const p = this.pos, inp = this.input;
    if (this.running && !this.finished) {
      this.stepBody(this, inp, dt);

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

    if (this.botsOn) { this.clock += dt; this.updateBots(dt, this.timeLimit - this.clock); }

    this.me.root.position.copyFrom(p);
    this.me.root.rotation.y = this.h;
    const burning = this.running && !this.finished && inp.up;
    this.me.flame.isVisible = burning;
    if (burning) { const fl = 0.8 + Math.random() * 0.5; this.me.flame.scaling.set(fl, 0.8 + Math.random() * 0.6, fl); }
    const glowT = burning ? 0.3 : 0.07, ec = this.me.envMat.emissiveColor;
    ec.r += (glowT * 1.2 - ec.r) * Math.min(1, dt * 6); ec.g += (glowT - ec.g) * Math.min(1, dt * 6); ec.b += (glowT * 0.75 - ec.b) * Math.min(1, dt * 6);
    this.sun.position.copyFrom(p).addInPlace(this.sunDir.scale(550));
    for (const f of this.onUpdate) f(dt);

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
