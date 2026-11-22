// The three maps. Each one has its own scenery, colors and wind layers.
// Everything is generated from a fixed seed so every player sees the same course.

export const L = 1900;          // distance from start to finish line
export const W = 130;           // half-width of the course
export const YMAX = 118;        // ceiling
export const YMIN = 9;          // lowest you can fly
export const LAYER_H = 30;      // height of each wind layer
export const FLIGHT_TIME = 180; // seconds per flight

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Random spot on the course that leaves the start area clear.
function spot(r, extra = 0) {
  for (;;) {
    const x = (r() * 2 - 1) * (W + extra);
    const z = 40 + r() * (L + 160);
    if (z < 130 && Math.abs(x) < 70) continue;
    return [x, z];
  }
}

function buildCandy(h) {
  const r = h.rng, obs = [];
  h.ground([1.0, 0.76, 0.87], 0);
  const stick = h.src(h.MB.CreateCylinder('stick', { height: 1, diameter: 1, tessellation: 8 }, h.scene), h.mat([1, 1, 1]));
  const cols = [[1, 0.25, 0.4], [0.3, 0.8, 1], [1, 0.85, 0.2], [0.55, 0.9, 0.4], [0.75, 0.4, 1], [1, 0.55, 0.15]];
  const heads = cols.map((c, i) => h.src(h.MB.CreateSphere('head' + i, { diameter: 1, segments: 10 }, h.scene), h.mat(c)));
  const drops = cols.map((c, i) => h.src(h.MB.CreateSphere('drop' + i, { diameter: 1, segments: 10 }, h.scene), h.mat(c)));
  for (let i = 0; i < 52; i++) {
    const [x, z] = spot(r, 50);
    const ht = 28 + r() * 80, d = 15 + r() * 9;
    h.inst(stick, x, ht / 2, z, 1.6, ht, 1.6);
    h.inst(heads[i % heads.length], x, ht, z, d, d, d * 0.6);
    obs.push({ t: 's', x, y: ht, z, r: d * 0.44 });
  }
  for (let i = 0; i < 55; i++) {
    const [x, z] = spot(r, 120);
    const rad = 8 + r() * 15;
    h.inst(drops[(i * 5 + 2) % drops.length], x, 0, z, rad * 2, rad * 2.4, rad * 2);
    obs.push({ t: 's', x, y: 0, z, r: rad * 1.05 });
  }
  // cotton candy clouds above the ceiling
  const puff = h.src(h.MB.CreateSphere('puff', { diameter: 1, segments: 8 }, h.scene), h.mat([1, 0.85, 0.95], { emis: 0.35 }));
  for (let i = 0; i < 40; i++) {
    const x = (r() * 2 - 1) * 400, z = r() * (L + 400), s = 30 + r() * 50;
    h.inst(puff, x, 165 + r() * 60, z, s * 1.8, s * 0.6, s);
  }
  return obs;
}

// ---------- noise used to sculpt rock ----------
function hash3(x, y, z, s) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683) ^ Math.imul(s, 951274213);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, z, s) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const sm = (t) => t * t * (3 - 2 * t);
  const u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, s);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm(x, y, z, s, oct) {
  let a = 0.5, f = 1, t = 0;
  for (let o = 0; o < oct; o++) { t += a * (vnoise(x * f, y * f, z * f, s + o) * 2 - 1); a *= 0.5; f *= 2.03; }
  return t;
}

// One floating mountain, unit size: grassy plateau on top, cliffs, and rock
// tapering to hanging spires underneath. Returns spots for trees and vines.
function makeIsland(h, seed, segs, oct = 4) {
  const { B, scene } = h;
  const m = B.MeshBuilder.CreateSphere('island', { diameter: 2, segments: segs || (h.low ? 30 : 44), updatable: true }, scene);
  const pos = m.getVerticesData(B.VertexBuffer.PositionKind), nor = new Float32Array(pos.length);
  const f = (x, y, z) => {
    const n1 = fbm(x * 1.5 + 3.1, y * 1.5, z * 1.5, seed, oct), n2 = fbm(x * 5, y * 5, z * 5, seed + 11, oct - 1);
    let rh = 1 + 0.34 * n1 + 0.07 * n2, Y;
    if (y >= 0) Y = 0.2 * Math.pow(y, 0.4) * (1 + 0.4 * n1) + 0.025 * n2 * y;
    else {
      const a = -y, sp = Math.max(0, fbm(x * 3.5, 0.5, z * 3.5, seed + 5, 3));
      Y = -Math.pow(a, 1.35) * 1.25 * (1 + 0.4 * n1) - sp * a * 1.4;
      rh *= 1 - 0.5 * a * Math.abs(n2);
    }
    return [x * rh, Y, z * rh];
  };
  const tops = [], hangs = [];
  const E = 0.02;
  for (let i = 0; i < pos.length; i += 3) {
    let x = pos[i], y = pos[i + 1], z = pos[i + 2];
    const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
    const p = f(x, y, z);
    // normal from two nearby points on the surface
    let ax = 0, ay = 1, az = 0; if (Math.abs(y) > 0.9) { ax = 1; ay = 0; }
    let t1x = y * az - z * ay, t1y = z * ax - x * az, t1z = x * ay - y * ax;
    const tl = Math.hypot(t1x, t1y, t1z); t1x /= tl; t1y /= tl; t1z /= tl;
    const t2x = y * t1z - z * t1y, t2y = z * t1x - x * t1z, t2z = x * t1y - y * t1x;
    const nrm = (vx, vy, vz) => { const k = Math.hypot(vx, vy, vz); return f(vx / k, vy / k, vz / k); };
    const pa = nrm(x + E * t1x, y + E * t1y, z + E * t1z), pb = nrm(x + E * t2x, y + E * t2y, z + E * t2z);
    const ux = pa[0] - p[0], uy = pa[1] - p[1], uz = pa[2] - p[2], vx = pb[0] - p[0], vy = pb[1] - p[1], vz = pb[2] - p[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    if (nx * p[0] + ny * (p[1] + 0.4) + nz * p[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
    pos[i] = p[0]; pos[i + 1] = p[1]; pos[i + 2] = p[2];
    nor[i] = nx; nor[i + 1] = ny; nor[i + 2] = nz;
    if (y > 0.25 && ny > 0.9) tops.push(p);
    else if (y < -0.12 && y > -0.6) hangs.push(p);
  }
  m.updateVerticesData(B.VertexBuffer.PositionKind, pos);
  m.updateVerticesData(B.VertexBuffer.NormalKind, nor);
  m.refreshBoundingInfo();
  m.isVisible = false;
  return { mesh: m, tops, hangs };
}

function thin(h, mesh, mats) {
  const buf = new Float32Array(mats.length * 16);
  mats.forEach((m, i) => m.copyToArray(buf, i * 16));
  mesh.thinInstanceSetBuffer('matrix', buf, 16, true);
  mesh.alwaysSelectAsActiveMesh = true;
}

function buildSky(h) {
  const { B, scene } = h, r = h.rng, obs = [];
  const V = (x, y, z) => new B.Vector3(x, y, z);
  // haze under the cloud sea
  const floor = B.MeshBuilder.CreateGround('floor', { width: 12000, height: 12000 }, scene);
  floor.position.set(0, -100, L / 2);
  floor.material = h.mat([0.66, 0.76, 0.9], { emis: 1 });

  const tex = (f, sc) => { const t = new B.Texture(h.asset(f), scene); if (sc) { t.uScale = t.vScale = sc; } t.anisotropicFilteringLevel = 8; return t; };
  const rock = new B.TriPlanarMaterial('rock', scene);
  rock.diffuseTextureX = rock.diffuseTextureZ = tex('rock.jpg');
  rock.diffuseTextureY = tex('grass.png');
  rock.normalTextureX = rock.normalTextureZ = tex('rockn.png');
  rock.normalTextureY = tex('grassn.png');
  rock.tileSize = 0.045;
  rock.specularColor = new B.Color3(0.04, 0.04, 0.04);

  const variants = [];
  for (let i = 0; i < (h.low ? 4 : 6); i++) {
    const v = makeIsland(h, map_seed(i));
    v.mesh.material = rock; v.mesh.receiveShadows = true;
    variants.push(v);
  }

  // foliage
  const leaf = new B.StandardMaterial('leaf', scene);
  leaf.diffuseTexture = tex('grass.png', 2); leaf.bumpTexture = tex('grassn.png', 3);
  leaf.diffuseColor = new B.Color3(0.5, 0.78, 0.42); leaf.specularColor = new B.Color3(0.02, 0.03, 0.02);
  const canopy = B.MeshBuilder.CreateSphere('canopy', { diameter: 2, segments: 9, updatable: true }, scene);
  {
    const p = canopy.getVerticesData(B.VertexBuffer.PositionKind);
    for (let i = 0; i < p.length; i += 3) {
      const k = 1 + 0.32 * fbm(p[i] * 2.2, p[i + 1] * 2.2, p[i + 2] * 2.2, 77, 3);
      p[i] *= k; p[i + 1] *= k * 0.72; p[i + 2] *= k;
    }
    canopy.updateVerticesData(B.VertexBuffer.PositionKind, p);
  }
  canopy.material = leaf;
  const pine = B.Mesh.MergeMeshes([0, 1, 2, 3].map((k) => {
    const c = B.MeshBuilder.CreateCylinder('c', { height: 0.42, diameterTop: 0.02, diameterBottom: 0.52 - k * 0.1, tessellation: 9 }, scene);
    c.position.y = 0.2 + k * 0.22; return c;
  }), true);
  const pineMat = leaf.clone('pine'); pineMat.diffuseColor = new B.Color3(0.28, 0.5, 0.3);
  pine.material = pineMat;
  const vine = B.MeshBuilder.CreateCylinder('vine', { height: 1, diameter: 1, tessellation: 5 }, scene);
  vine.position.y = -0.5; vine.bakeCurrentTransformIntoVertices();
  const vineMat = new B.StandardMaterial('vinem', scene);
  vineMat.diffuseColor = new B.Color3(0.16, 0.3, 0.12); vineMat.specularColor = B.Color3.Black();
  vine.material = vineMat;
  const canopyM = [], pineM = [], vineM = [];

  // waterfalls
  const wt = new B.DynamicTexture('fall', { width: 64, height: 256 }, scene, true);
  {
    const c = wt.getContext(); c.clearRect(0, 0, 64, 256);
    const wr = mulberry(5);
    for (let i = 0; i < 260; i++) {
      const x = 32 + (wr() + wr() + wr() - 1.5) * 26, y = wr() * 256, len = 20 + wr() * 70;
      c.fillStyle = `rgba(255,255,255,${0.15 + wr() * 0.5})`;
      c.fillRect(x, y, 1 + wr() * 2, len); c.fillRect(x, y - 256, 1 + wr() * 2, len);
    }
    wt.update(); wt.hasAlpha = true;
  }
  const fallMat = new B.StandardMaterial('fallm', scene);
  fallMat.diffuseTexture = wt; fallMat.useAlphaFromDiffuseTexture = true; fallMat.emissiveColor = new B.Color3(0.9, 0.95, 1);
  fallMat.disableLighting = true; fallMat.backFaceCulling = false;
  h.onUpdate.push((dt) => { wt.vOffset += dt * 0.5; });

  const place = (v, x, y, z, S, sy, ry, detail) => {
    const mat = B.Matrix.Compose(V(S, S * sy, S), B.Quaternion.RotationYawPitchRoll(ry, 0, 0), V(x, y, z));
    const inst = v.mesh.createInstance('isl');
    inst.position.set(x, y, z); inst.scaling.set(S, S * sy, S); inst.rotation.y = ry;
    inst.freezeWorldMatrix();
    if (detail) h.cast(inst);
    if (!detail) return;
    const at = (p) => B.Vector3.TransformCoordinates(V(p[0], p[1], p[2]), mat);
    const nC = Math.min(70, S * S * 0.035), nP = S * 0.3, nV = S * 0.35;
    for (let i = 0; i < nC && v.tops.length; i++) {
      const w = at(v.tops[(r() * v.tops.length) | 0]), sc = 2.2 + r() * 3.6;
      canopyM.push(B.Matrix.Compose(V(sc, sc * (0.8 + r() * 0.5), sc), B.Quaternion.RotationYawPitchRoll(r() * 6.3, 0, 0), V(w.x, w.y + sc * 0.3, w.z)));
    }
    for (let i = 0; i < nP && v.tops.length; i++) {
      const w = at(v.tops[(r() * v.tops.length) | 0]), sc = 7 + r() * 8;
      pineM.push(B.Matrix.Compose(V(sc * 0.8, sc, sc * 0.8), B.Quaternion.RotationYawPitchRoll(r() * 6.3, 0, 0), V(w.x, w.y - 0.5, w.z)));
    }
    for (let i = 0; i < nV && v.hangs.length; i++) {
      const w = at(v.hangs[(r() * v.hangs.length) | 0]), len = 6 + r() * S * 0.9;
      vineM.push(B.Matrix.Compose(V(0.22, len, 0.22), B.Quaternion.Identity(), V(w.x, w.y, w.z)));
    }
  };

  // islands on the course
  const N = 30;
  let falls = 0;
  for (let i = 0; i < N; i++) {
    const [x, z] = spot(r, 60);
    const S = 15 + r() * r() * 34, sy = 0.8 + r() * 0.7, y = 16 + r() * (YMAX + 30);
    place(variants[i % variants.length], x, y, z, S, sy, r() * 6.3, true);
    obs.push({ t: 's', x, y: y - 0.22 * S * sy, z, r: S * 0.86 });
    obs.push({ t: 's', x, y: y - 0.95 * S * sy, z, r: S * 0.5 });
    if (S > 26 && falls < 8) {
      falls++;
      const a = r() * 6.3, ht = y + 70, wd = 3 + r() * 4;
      const f = B.MeshBuilder.CreatePlane('fall', { width: wd, height: ht }, scene);
      f.position.set(x + Math.cos(a) * S * 0.9, y - ht / 2 + 1, z + Math.sin(a) * S * 0.9);
      f.billboardMode = B.Mesh.BILLBOARDMODE_Y; f.material = fallMat;
    }
  }
  // giant mountains in the distance for scale
  const giants = [0, 1, 2].map((i) => { const v = makeIsland(h, 900 + i * 13, h.low ? 56 : 110, 6); v.mesh.material = rock; return v; });
  for (let i = 0; i < 20; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (900 + r() * 1500), z = -300 + r() * (L + 2400);
    const S = 150 + r() * 260;
    place(giants[i % giants.length], x, 60 + r() * 420, z, S, 0.9 + r() * 0.9, r() * 6.3, false);
  }
  thin(h, canopy, canopyM); thin(h, pine, pineM); thin(h, vine, vineM);
  h.cast(canopy); h.cast(pine);

  // cloud sea below, scattered clouds around and above
  const nSea = h.low ? 200 : 420;
  const sm = new B.SpriteManager('clouds', h.asset('cloud.png'), nSea + 60, { width: 256, height: 256 }, scene);
  sm.fogEnabled = true; sm.isPickable = false;
  const cloud = (x, y, z, w, k = 0.6) => { const s = new B.Sprite('c', sm); s.position.set(x, y, z); s.width = w; s.height = w * k; s.invertU = r() < 0.5; const g = 0.86 + r() * 0.14; s.color = new B.Color4(g, g, g * 1.02, 1); };
  for (let i = 0; i < nSea; i++) cloud((r() * 2 - 1) * 1900, -74 + r() * 14, -600 + r() * (L + 2800), 280 + r() * 220, 0.3);
  for (let i = 0; i < 40; i++) {
    const side = r() < 0.5 ? -1 : 1;
    cloud(side * (260 + r() * 1100), 60 + r() * 380, -200 + r() * (L + 2000), 160 + r() * 260);
  }
  return obs;
}
const map_seed = (i) => 500 + i * 37;

function buildVolcano(h) {
  const r = h.rng, obs = [];
  h.ground([0.05, 0.2, 0.36], 0);
  const spire = h.src(h.MB.CreateCylinder('spire', { height: 1, diameterTop: 0, diameterBottom: 1, tessellation: 8 }, h.scene), h.mat([0.2, 0.15, 0.15]));
  const lava = h.src(h.MB.CreateCylinder('lava', { height: 1, diameterTop: 0, diameterBottom: 1, tessellation: 8 }, h.scene), h.mat([1, 0.35, 0.05], { emis: 1 }));
  const sand = h.src(h.MB.CreateCylinder('sand', { height: 1, diameter: 1, tessellation: 12 }, h.scene), h.mat([0.12, 0.1, 0.1]));
  for (let i = 0; i < 44; i++) {
    const [x, z] = spot(r, 40);
    const ht = 35 + r() * 78, d = 22 + r() * 22;
    h.inst(sand, x, 0.5, z, d * 1.9, 1.2, d * 1.9);
    h.inst(spire, x, ht / 2, z, d, ht, d);
    h.inst(lava, x, ht * 0.93, z, d * 0.17, ht * 0.16, d * 0.17);
    obs.push({ t: 'c', x, z, r: d / 2, h: ht });
  }
  // big volcanoes along both sides of the course
  const big = h.src(h.MB.CreateCylinder('big', { height: 1, diameterTop: 0.28, diameterBottom: 1, tessellation: 12 }, h.scene), h.mat([0.16, 0.12, 0.12]));
  const cap = h.src(h.MB.CreateCylinder('cap', { height: 1, diameter: 1, tessellation: 12 }, h.scene), h.mat([1, 0.4, 0.05], { emis: 1 }));
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (W + 190 + r() * 120), z = i * (L / 8) + r() * 80;
    const d = 240 + r() * 120, ht = 150 + r() * 90;
    h.inst(big, x, ht / 2, z, d, ht, d);
    h.inst(cap, x, ht + 1, z, d * 0.27, 3, d * 0.27);
  }
  return obs;
}

// winds: lowest layer first. wx pushes sideways (+ is right), wz pushes toward the finish (+) or back (-).
// sun: direction toward the sun.
export const MAPS = [
  {
    name: 'Floating Sky Islands', emoji: '☁️', seed: 2022,
    sun: [-0.62, 0.62, -0.48], sunI: 3.0, hemiI: 1.15, hemiSky: [0.8, 0.9, 1.0], hemiGround: [0.72, 0.76, 0.8],
    turbidity: 5, rayleigh: 1.8, luminance: 0.85, exposure: 1.3,
    fog: [0.74, 0.84, 0.96], fogDensity: 0.00085,
    gem: [0.2, 0.9, 1.0], ring: [1, 0.85, 0.1],
    winds: [{ wx: -4, wz: 5 }, { wx: 0, wz: -2 }, { wx: 4, wz: 7 }, { wx: -2, wz: 3 }],
    build: buildSky,
  },
  {
    name: 'Candy Land', emoji: '🍭', seed: 1011,
    sun: [0.4, 0.75, 0.5], sunI: 2.2, hemiI: 1.0, hemiSky: [1, 0.95, 1], hemiGround: [0.9, 0.6, 0.75],
    turbidity: 2, rayleigh: 1.2, luminance: 1.0, exposure: 1.0,
    fog: [0.92, 0.82, 0.95], fogDensity: 0.0011,
    gem: [1.0, 0.3, 0.6], ring: [1, 0.85, 0.1],
    winds: [{ wx: 0, wz: 1 }, { wx: 3, wz: 4 }, { wx: -3, wz: 7 }, { wx: 0, wz: 2 }],
    build: buildCandy,
  },
  {
    name: 'Volcano Island', emoji: '🌋', seed: 3033,
    sun: [0.3, 0.16, 0.94], sunI: 2.4, hemiI: 0.8, hemiSky: [1, 0.7, 0.5], hemiGround: [0.6, 0.25, 0.15],
    turbidity: 12, rayleigh: 3, luminance: 1.0, exposure: 1.0,
    fog: [0.75, 0.42, 0.32], fogDensity: 0.0013,
    gem: [0.3, 1.0, 0.5], ring: [1, 0.9, 0.2],
    winds: [{ wx: 5, wz: -3 }, { wx: -4, wz: 6 }, { wx: 0, wz: 1 }, { wx: 3, wz: 8 }],
    build: buildVolcano,
  },
];
