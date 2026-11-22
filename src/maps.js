// The three maps. Each one has its own scenery, colors and wind layers.
// Everything is generated from a fixed seed so every player sees the same course.

export const L = 1900;          // distance from start to finish line
export const W = 130;           // half-width of the course
export const YMAX = 118;        // ceiling
export const YMIN = 4;          // lowest you can fly
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

function buildSky(h) {
  const r = h.rng, obs = [];
  h.ground([0.97, 0.98, 1.0], -14, 0.6);
  const rock = h.src(h.MB.CreateCylinder('rock', { height: 1, diameterTop: 1, diameterBottom: 0.2, tessellation: 9 }, h.scene), h.mat([0.5, 0.36, 0.25]));
  const grass = h.src(h.MB.CreateCylinder('grass', { height: 1, diameter: 1, tessellation: 9 }, h.scene), h.mat([0.35, 0.78, 0.3]));
  const tree = h.src(h.MB.CreateCylinder('tree', { height: 1, diameterTop: 0, diameterBottom: 1, tessellation: 7 }, h.scene), h.mat([0.12, 0.5, 0.22]));
  for (let i = 0; i < 46; i++) {
    const [x, z] = spot(r, 40);
    const d = 22 + r() * 30, y = 10 + r() * 96;
    h.inst(rock, x, y - d * 0.3, z, d, d * 0.6, d);
    h.inst(grass, x, y + 1, z, d * 1.05, 2, d * 1.05);
    const n = 1 + ((r() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const th = 6 + r() * 7, a = r() * 6.28, rr = r() * d * 0.3;
      h.inst(tree, x + Math.cos(a) * rr, y + 2 + th / 2, z + Math.sin(a) * rr, th * 0.55, th, th * 0.55);
    }
    obs.push({ t: 's', x, y: y - d * 0.08, z, r: d * 0.5 });
  }
  const cloud = h.src(h.MB.CreateSphere('cloud', { diameter: 1, segments: 8 }, h.scene), h.mat([1, 1, 1], { emis: 0.5 }));
  for (let i = 0; i < 90; i++) {
    const x = (r() * 2 - 1) * 500, z = r() * (L + 500) - 50, s = 30 + r() * 60;
    h.inst(cloud, x, -12 + r() * 6, z, s * 1.6, s * 0.4, s);
  }
  return obs;
}

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
export const MAPS = [
  {
    name: 'Candy Land', emoji: '🍭', seed: 1011,
    sky: [0.62, 0.84, 1.0], fog: [0.92, 0.82, 0.95], fogDensity: 0.0011, light: 1.15, bounce: [0.9, 0.6, 0.75],
    gem: [1.0, 0.3, 0.6], ring: [1, 0.85, 0.1],
    winds: [{ wx: 0, wz: 1 }, { wx: 3, wz: 4 }, { wx: -3, wz: 7 }, { wx: 0, wz: 2 }],
    build: buildCandy,
  },
  {
    name: 'Floating Sky Islands', emoji: '☁️', seed: 2022,
    sky: [0.36, 0.66, 0.98], fog: [0.8, 0.9, 1.0], fogDensity: 0.0012, light: 1.2, bounce: [0.7, 0.8, 0.95],
    gem: [0.2, 0.9, 1.0], ring: [1, 0.85, 0.1],
    winds: [{ wx: -4, wz: 5 }, { wx: 0, wz: -2 }, { wx: 4, wz: 7 }, { wx: -2, wz: 3 }],
    build: buildSky,
  },
  {
    name: 'Volcano Island', emoji: '🌋', seed: 3033,
    sky: [0.95, 0.5, 0.3], fog: [0.75, 0.38, 0.3], fogDensity: 0.0013, light: 1.0, bounce: [0.6, 0.25, 0.15],
    gem: [0.3, 1.0, 0.5], ring: [1, 0.9, 0.2],
    winds: [{ wx: 5, wz: -3 }, { wx: -4, wz: 6 }, { wx: 0, wz: 1 }, { wx: 3, wz: 8 }],
    build: buildVolcano,
  },
];
