// A hot air balloon built the way a real one is shaped: a natural-shape
// envelope made of bulging gores between load tapes, a scoop at the mouth,
// burner frame, uprights and a wicker basket.
import * as B from './b.js';

const GORES = 24, SEG = GORES * 6, RINGS = 44, ROWS = 16;
// [height, radius] from the mouth up to the crown
const PROFILE = [[-4.3, 0.95], [-3.7, 1.3], [-2.8, 1.9], [-1.6, 2.62], [-0.4, 3.15], [0.8, 3.45], [1.8, 3.38], [2.6, 2.95], [3.2, 2.25], [3.58, 1.35], [3.76, 0.55], [3.8, 0.02]];

function cr(p0, p1, p2, p3, t) {
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}
function profile(v) {
  const n = PROFILE.length - 1, u = Math.min(v * n, n - 1e-6), i = Math.floor(u), t = u - i;
  const P = (k) => PROFILE[Math.max(0, Math.min(n, k))];
  return [cr(P(i - 1)[0], P(i)[0], P(i + 1)[0], P(i + 2)[0], t), Math.max(0.02, cr(P(i - 1)[1], P(i)[1], P(i + 1)[1], P(i + 2)[1], t))];
}

let envelopeData = null;
function envelopeGeometry() {
  if (envelopeData) return envelopeData;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= RINGS; j++) {
    const v = j / RINGS, [y, r] = profile(v);
    const amt = 0.05 * Math.sqrt(Math.sin(Math.PI * Math.min(1, v * 1.05)));
    for (let k = 0; k <= SEG; k++) {
      const th = (k / SEG) * Math.PI * 2;
      const f = Math.sqrt(Math.abs(Math.sin((GORES * th) / 2)));
      const rr = r * (1 - amt * (1 - f));
      pos.push(Math.cos(th) * rr, y, Math.sin(th) * rr);
      uv.push(k / SEG, v);
    }
  }
  for (let j = 0; j < RINGS; j++) for (let k = 0; k < SEG; k++) {
    const a = j * (SEG + 1) + k, b = a + 1, c = a + SEG + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const nor = [];
  B.VertexData.ComputeNormals(pos, idx, nor);
  // make sure normals face outward
  const m = Math.floor(RINGS / 2) * (SEG + 1) * 3;
  if (nor[m] * pos[m] + nor[m + 2] * pos[m + 2] < 0) {
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    B.VertexData.ComputeNormals(pos, idx, nor);
  }
  envelopeData = { pos, uv, idx, nor };
  return envelopeData;
}

function shade(hex, k) {
  const c = B.Color3.FromHexString(hex);
  return new B.Color3(c.r * k, c.g * k, c.b * k).toHexString();
}

function envelopeTexture(scene, color) {
  const Wd = 1024, Ht = 512;
  const tex = new B.DynamicTexture('envtex', { width: Wd, height: Ht }, scene, true);
  const c = tex.getContext();
  const accent = color === '#ffd60a' ? '#e63946' : '#ffd23f';
  const pal = [color, color, color, '#f4f1ea', shade(color, 0.5), shade(color, 0.5), shade(color, 0.5), accent];
  const gw = Wd / GORES, rh = Ht / ROWS;
  for (let g = 0; g < GORES; g++) for (let p = 0; p < ROWS; p++) {
    let col = pal[(g + p) % pal.length];
    if (p < 2) col = shade(color, 0.8);          // parachute top
    if (p === ROWS - 1) col = '#26221f';         // scoop
    if (p === ROWS - 2) col = shade(color, 0.5);
    c.fillStyle = col;
    c.fillRect(Math.floor(g * gw), Math.floor(p * rh), Math.ceil(gw), Math.ceil(rh));
  }
  // soft fabric shading inside each gore, load tapes and panel seams
  for (let g = 0; g < GORES; g++) {
    const x = g * gw, grd = c.createLinearGradient(x, 0, x + gw, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0.28)'); grd.addColorStop(0.18, 'rgba(0,0,0,0)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.07)');
    grd.addColorStop(0.82, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.28)');
    c.fillStyle = grd; c.fillRect(x, 0, gw, Ht);
    c.fillStyle = 'rgba(20,20,20,0.55)'; c.fillRect(Math.round(x) - 1, 0, 2, Ht);
  }
  c.fillStyle = 'rgba(0,0,0,0.16)';
  for (let p = 1; p < ROWS; p++) c.fillRect(0, Math.round(p * rh), Wd, 1);
  tex.update();
  tex.anisotropicFilteringLevel = 8;
  return tex;
}

let wickerCanvas = null;
function wickerTexture(scene) {
  const tex = new B.DynamicTexture('wicker', { width: 256, height: 256 }, scene, true);
  const c = tex.getContext();
  if (!wickerCanvas) {
    wickerCanvas = document.createElement('canvas'); wickerCanvas.width = wickerCanvas.height = 256;
    const w = wickerCanvas.getContext('2d');
    w.fillStyle = '#4a2f17'; w.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) {
      const ox = (y % 2) * 8, px = x * 16 + ox - 8, py = y * 8;
      const g = w.createLinearGradient(px, py, px, py + 8);
      const l = 0.85 + ((x * 7 + y * 13) % 5) * 0.05;
      g.addColorStop(0, `rgb(${70 * l | 0},${45 * l | 0},${22 * l | 0})`);
      g.addColorStop(0.45, `rgb(${178 * l | 0},${128 * l | 0},${70 * l | 0})`);
      g.addColorStop(1, `rgb(${84 * l | 0},${54 * l | 0},${26 * l | 0})`);
      w.fillStyle = g; w.fillRect(px + 1, py + 1, 14, 6);
    }
  }
  c.drawImage(wickerCanvas, 0, 0);
  tex.update();
  return tex;
}

function rod(scene, a, b, d, mat, parent) {
  const dir = b.subtract(a), len = dir.length();
  const m = B.MeshBuilder.CreateCylinder('rod', { height: len, diameter: d, tessellation: 6 }, scene);
  m.position = a.add(b).scale(0.5);
  m.rotationQuaternion = new B.Quaternion();
  B.Quaternion.FromUnitVectorsToRef(B.Vector3.Up(), dir.normalize(), m.rotationQuaternion);
  m.material = mat; m.parent = parent;
  return m;
}

export function makeBalloon(scene, color, name, cast) {
  const root = new B.TransformNode('balloon', scene);
  const g = envelopeGeometry();
  const env = new B.Mesh('envelope', scene);
  const vd = new B.VertexData();
  vd.positions = g.pos; vd.indices = g.idx; vd.normals = g.nor; vd.uvs = g.uv;
  vd.applyToMesh(env);
  const tex = envelopeTexture(scene, color);
  const em = new B.PBRMaterial('envm', scene);
  em.albedoTexture = tex; em.metallic = 0; em.roughness = 0.48;
  em.backFaceCulling = false; em.twoSidedLighting = true;
  em.emissiveTexture = tex; em.emissiveColor = new B.Color3(0.07, 0.07, 0.07); // light through the fabric
  env.material = em; env.parent = root;

  const wm = new B.PBRMaterial('wickerm', scene);
  wm.albedoTexture = wickerTexture(scene); wm.metallic = 0; wm.roughness = 0.85;
  const leather = new B.PBRMaterial('leather', scene);
  leather.albedoColor = new B.Color3(0.13, 0.08, 0.05); leather.metallic = 0; leather.roughness = 0.6;
  const steel = new B.PBRMaterial('steel', scene);
  steel.albedoColor = new B.Color3(0.75, 0.75, 0.78); steel.metallic = 1; steel.roughness = 0.3;
  const cable = new B.PBRMaterial('cable', scene);
  cable.albedoColor = new B.Color3(0.1, 0.1, 0.1); cable.metallic = 0; cable.roughness = 0.7;

  const BY = -7.15; // basket centre
  const basket = B.MeshBuilder.CreateBox('basket', { width: 1.3, height: 1.05, depth: 1.3 }, scene);
  basket.position.y = BY; basket.material = wm; basket.parent = root;
  const rim = B.MeshBuilder.CreateBox('rim', { width: 1.4, height: 0.13, depth: 1.4 }, scene);
  rim.position.y = BY + 0.55; rim.material = leather; rim.parent = root;
  const base = B.MeshBuilder.CreateBox('base', { width: 1.36, height: 0.1, depth: 1.36 }, scene);
  base.position.y = BY - 0.55; base.material = leather; base.parent = root;
  const FY = -5.45; // burner frame
  const V = (x, y, z) => new B.Vector3(x, y, z);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    rod(scene, V(sx * 0.6, BY + 0.55, sz * 0.6), V(sx * 0.5, FY, sz * 0.5), 0.07, leather, root);
    for (const a of [0.25, 1.3]) {
      const th = Math.atan2(sz, sx) + (a - 0.78);
      rod(scene, V(sx * 0.5, FY, sz * 0.5), V(Math.cos(th) * 0.93, -4.3, Math.sin(th) * 0.93), 0.025, cable, root);
    }
  }
  rod(scene, V(-0.5, FY, -0.5), V(0.5, FY, -0.5), 0.06, steel, root);
  rod(scene, V(-0.5, FY, 0.5), V(0.5, FY, 0.5), 0.06, steel, root);
  rod(scene, V(-0.5, FY, -0.5), V(-0.5, FY, 0.5), 0.06, steel, root);
  rod(scene, V(0.5, FY, -0.5), V(0.5, FY, 0.5), 0.06, steel, root);
  for (const sx of [-0.2, 0.2]) {
    const bn = B.MeshBuilder.CreateCylinder('burner', { height: 0.45, diameterTop: 0.26, diameterBottom: 0.18, tessellation: 12 }, scene);
    bn.position.set(sx, FY + 0.2, 0); bn.material = steel; bn.parent = root;
  }

  const fm = new B.StandardMaterial('flamem', scene);
  fm.emissiveColor = new B.Color3(1, 0.62, 0.18); fm.disableLighting = true; fm.alpha = 0.9;
  const flame = B.MeshBuilder.CreateCylinder('flame', { height: 2.2, diameterTop: 0, diameterBottom: 0.5, tessellation: 10 }, scene);
  flame.position.y = FY + 1.5; flame.material = fm; flame.parent = root; flame.isVisible = false;

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
    label.position.y = 5.8; label.material = lm; label.parent = root; label.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
    label.applyFog = false;
  }
  if (cast) { cast(env); cast(basket); }
  return { root, flame, envMat: em };
}
