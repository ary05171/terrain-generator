import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PaletteItem, FarmPlotStage } from '../types';

/**
 * High-performance geometry consolidation helper.
 * Combines multiple transformed geometries into a single non-indexed BufferGeometry.
 * Drastically reduces draw calls for vegetation clumps, curbs, and composite props.
 */
export function mergeGeometriesWithTransforms(
  items: {
    geometry: THREE.BufferGeometry;
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
  }[]
): THREE.BufferGeometry {
  if (items.length === 0) return new THREE.BufferGeometry();
  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const rot = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();

  const prepared: THREE.BufferGeometry[] = [];

  for (const item of items) {
    const geo = item.geometry.index ? item.geometry.toNonIndexed() : item.geometry.clone();
    pos.set(...(item.position || [0, 0, 0]));
    rot.set(...(item.rotation || [0, 0, 0]));
    quat.setFromEuler(rot);
    scl.set(...(item.scale || [1, 1, 1]));
    matrix.compose(pos, quat, scl);
    geo.applyMatrix4(matrix);
    prepared.push(geo);
  }

  const merged = BufferGeometryUtils.mergeGeometries(prepared, false);
  prepared.forEach((g) => g.dispose());
  if (merged) {
    merged.computeVertexNormals();
    return merged;
  }
  return new THREE.BufferGeometry();
}

// Pre-create reusable contact shadow texture & material
let contactShadowTexture: THREE.CanvasTexture | null = null;
let sharedContactShadowMat: THREE.MeshBasicMaterial | null = null;
const shadowGeoCache = new Map<number, THREE.PlaneGeometry>();

function getContactShadowTexture(): THREE.CanvasTexture {
  if (contactShadowTexture) return contactShadowTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 64; // lightweight 64x64 on mobile
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);

  const gradient = ctx.createRadialGradient(32, 32, 5, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.3)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  contactShadowTexture = new THREE.CanvasTexture(canvas);
  contactShadowTexture.colorSpace = THREE.SRGBColorSpace;
  return contactShadowTexture;
}

function getContactShadowMaterial(): THREE.MeshBasicMaterial {
  if (!sharedContactShadowMat) {
    sharedContactShadowMat = new THREE.MeshBasicMaterial({
      map: getContactShadowTexture(),
      transparent: true,
      opacity: 0.40,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    sharedContactShadowMat.name = 'contact_shadow_material';
  }
  return sharedContactShadowMat;
}

function createContactShadowDisc(radius = 2.0): THREE.Mesh {
  let geo = shadowGeoCache.get(radius);
  if (!geo) {
    geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
    geo.rotateX(-Math.PI / 2);
    shadowGeoCache.set(radius, geo);
  }
  const shadowMesh = new THREE.Mesh(geo, getContactShadowMaterial());
  shadowMesh.name = 'contact_shadow_disc';
  shadowMesh.position.y = 0.02; // avoid z-fighting
  shadowMesh.castShadow = false;
  shadowMesh.receiveShadow = false;
  shadowMesh.renderOrder = 1;
  return shadowMesh;
}

// Reusable Ground Light Pool Texture & Material Cache
let warmGroundLightTexture: THREE.CanvasTexture | null = null;
let cyanGroundLightTexture: THREE.CanvasTexture | null = null;
const groundLightGeoCache = new Map<number, THREE.PlaneGeometry>();

export function getGroundLightTexture(type: 'warm' | 'cyan' = 'warm'): THREE.CanvasTexture {
  if (type === 'warm' && warmGroundLightTexture) return warmGroundLightTexture;
  if (type === 'cyan' && cyanGroundLightTexture) return cyanGroundLightTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  if (type === 'warm') {
    // Warm golden amber lantern illumination glow pool
    gradient.addColorStop(0, 'rgba(254, 240, 138, 0.95)'); // Core #fef08a
    gradient.addColorStop(0.25, 'rgba(251, 191, 36, 0.75)'); // Warm amber #fbbf24
    gradient.addColorStop(0.55, 'rgba(245, 158, 11, 0.38)'); // Warm golden #f59e0b
    gradient.addColorStop(0.80, 'rgba(217, 119, 6, 0.12)'); // Soft edge
    gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  } else {
    // Magical / Cyber cyan neon illumination glow pool
    gradient.addColorStop(0, 'rgba(224, 242, 254, 0.95)');
    gradient.addColorStop(0.25, 'rgba(56, 189, 248, 0.75)');
    gradient.addColorStop(0.55, 'rgba(14, 165, 233, 0.38)');
    gradient.addColorStop(0.80, 'rgba(2, 132, 199, 0.12)');
    gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (type === 'warm') {
    warmGroundLightTexture = tex;
  } else {
    cyanGroundLightTexture = tex;
  }
  return tex;
}

export function createGroundLightDisc(
  radius = 3.8,
  color: THREE.ColorRepresentation = 0xfbbf24,
  initialOpacity = 0.85,
  lightCategory: 'street_lamp' | 'lighthouse' | 'cottage' | 'crystal' | 'brazier' = 'street_lamp'
): THREE.Mesh {
  let geo = groundLightGeoCache.get(radius);
  if (!geo) {
    geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
    geo.rotateX(-Math.PI / 2);
    groundLightGeoCache.set(radius, geo);
  }

  const isCyan = lightCategory === 'crystal';
  const mat = new THREE.MeshBasicMaterial({
    map: getGroundLightTexture(isCyan ? 'cyan' : 'warm'),
    color: color,
    transparent: true,
    opacity: initialOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ground_light_disc';
  mesh.userData = {
    isGroundLight: true,
    baseOpacity: initialOpacity,
    baseRadius: radius,
    lightCategory,
  };
  mesh.position.y = 0.05; // Placed neatly above terrain and contact shadow (0.02)
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 3;
  return mesh;
}

/**
 * Pre-computes per-face vertex normals on non-indexed geometry.
 * Completely eliminates fragment shader dFdx(vViewPosition) breakdown on mobile GPUs
 * which previously caused tree foliage and low-poly meshes to turn pitch black when zooming in close!
 */
export function makeFlatShadedGeo<T extends THREE.BufferGeometry>(geo: T): THREE.BufferGeometry {
  const nonIndexed = geo.index ? geo.toNonIndexed() : geo.clone();
  nonIndexed.computeVertexNormals();
  return nonIndexed;
}

/**
 * 1. Cyberpunk Skyscraper (Neo Tower - 8 composite parts)
 */
/**
 * Mobile-optimized materials (Rule 3):
 * Uses MeshLambertMaterial for matte elements and MeshPhongMaterial (FlatShading)
 * for metallic, shiny, or translucent elements. Zero heavy PBR fragment overhead.
 */
export function createMobileMat(options: {
  color?: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  flatShading?: boolean;
  shininess?: number;
  wireframe?: boolean;
  side?: THREE.Side;
}): THREE.MeshLambertMaterial | THREE.MeshPhongMaterial {
  const isMetallicOrShiny =
    (options.metalness !== undefined && options.metalness >= 0.4) ||
    (options.roughness !== undefined && options.roughness <= 0.3) ||
    options.shininess !== undefined;

  if (isMetallicOrShiny) {
    return new THREE.MeshPhongMaterial({
      color: options.color,
      emissive: options.emissive,
      emissiveIntensity: options.emissiveIntensity,
      transparent: options.transparent,
      opacity: options.opacity,
      flatShading: options.flatShading ?? true,
      shininess: options.shininess ?? Math.round((options.metalness ?? 0.3) * 60),
      wireframe: options.wireframe,
      side: options.side,
    });
  }

  return new THREE.MeshLambertMaterial({
    color: options.color,
    emissive: options.emissive,
    emissiveIntensity: options.emissiveIntensity,
    transparent: options.transparent,
    opacity: options.opacity,
    flatShading: options.flatShading ?? true,
    wireframe: options.wireframe,
    side: options.side,
  });
}

export function createCyberSkyscraper(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'cyber_skyscraper';

  // 1. Foundation base podium
  const baseGeo = new THREE.BoxGeometry(6, 3, 6);
  const baseMat = createMobileMat({
    color: 0x273549,
    roughness: 0.8,
    metalness: 0.3,
  });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 1.5;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // 2. Main lower tower shaft
  const towerGeo = new THREE.BoxGeometry(4.8, 16, 4.8);
  const towerMat = createMobileMat({
    color: 0x384963,
    roughness: 0.35,
    metalness: 0.7,
  });
  const tower = new THREE.Mesh(towerGeo, towerMat);
  tower.position.y = 3 + 8;
  tower.castShadow = true;
  tower.receiveShadow = true;
  group.add(tower);

  // 3. Setback upper penthouse block
  const upperGeo = new THREE.BoxGeometry(3.6, 6, 3.6);
  const upperMat = createMobileMat({
    color: 0x2a394f,
    roughness: 0.3,
    metalness: 0.75,
  });
  const upper = new THREE.Mesh(upperGeo, upperMat);
  upper.position.y = 19 + 3;
  upper.castShadow = true;
  group.add(upper);

  // 4. Glowing Neon vertical light strips (Accent)
  const stripGeo = new THREE.BoxGeometry(0.2, 18, 0.2);
  const stripMat = createMobileMat({
    color: 0x06b6d4,
    emissive: 0x06b6d4,
    emissiveIntensity: 2.5,
    roughness: 0.1,
  });
  const strip1 = new THREE.Mesh(stripGeo, stripMat);
  strip1.position.set(2.45, 12, 2.45);
  const strip2 = new THREE.Mesh(stripGeo, stripMat);
  strip2.position.set(-2.45, 12, -2.45);
  group.add(strip1, strip2);

  // 5. Rooftop Helipad Disc
  const helipadGeo = new THREE.CylinderGeometry(1.6, 1.6, 0.3, 16);
  const helipadMat = createMobileMat({
    color: 0x334155,
    roughness: 0.5,
    metalness: 0.6,
  });
  const helipad = new THREE.Mesh(helipadGeo, helipadMat);
  helipad.position.y = 25.15;
  group.add(helipad);

  // 6. Helipad border neon ring
  const ringGeo = new THREE.TorusGeometry(1.5, 0.08, 8, 24);
  const ringMat = createMobileMat({
    color: 0xf43f5e,
    emissive: 0xf43f5e,
    emissiveIntensity: 3.0,
    roughness: 0.2,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 25.32;
  group.add(ring);

  // 7. Communications Spire Antenna
  const mastGeo = new THREE.CylinderGeometry(0.08, 0.2, 5, 8);
  const mastMat = createMobileMat({
    color: 0x94a3b8,
    metalness: 0.95,
    roughness: 0.15,
  });
  const mast = new THREE.Mesh(mastGeo, mastMat);
  mast.position.set(0.8, 27.8, 0.8);
  group.add(mast);

  // 8. Warning Strobe Beacon
  const beaconGeo = new THREE.SphereGeometry(0.2, 8, 8);
  const beaconMat = createMobileMat({
    color: 0xff0055,
    emissive: 0xff0055,
    emissiveIntensity: 4.0,
    roughness: 0.1,
  });
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.position.set(0.8, 30.4, 0.8);
  group.add(beacon);

  // Radial Ground Contact Shadow
  group.add(createContactShadowDisc(4.5));

  return group;
}

/**
 * 2. Cyberpunk Apartment / Modular Complex (7 parts)
 */
export function createCyberApartment(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'cyber_apartment';

  // 1. Lower concrete base
  const bGeo = new THREE.BoxGeometry(7, 3, 5);
  const bMat = createMobileMat({ color: 0x334155, roughness: 0.75, metalness: 0.25 });
  const b = new THREE.Mesh(bGeo, bMat);
  b.position.y = 1.5;
  b.castShadow = true;
  group.add(b);

  // 2. Middle block with indented balconies
  const mGeo = new THREE.BoxGeometry(6.4, 6, 4.4);
  const mMat = createMobileMat({ color: 0x475569, roughness: 0.45, metalness: 0.5 });
  const m = new THREE.Mesh(mGeo, mMat);
  m.position.y = 6;
  m.castShadow = true;
  group.add(m);

  // 3. Staggered modular balcony boxes
  const balcGeo = new THREE.BoxGeometry(2.2, 1.2, 0.6);
  const balcMat = createMobileMat({ color: 0xd97706, roughness: 0.3, metalness: 0.7 });
  const balc1 = new THREE.Mesh(balcGeo, balcMat);
  balc1.position.set(-1.8, 5.5, 2.4);
  const balc2 = new THREE.Mesh(balcGeo, balcMat);
  balc2.position.set(1.6, 7.5, 2.4);
  group.add(balc1, balc2);

  // 4. Rooftop HVAC unit
  const hvacGeo = new THREE.BoxGeometry(1.8, 1.2, 2.0);
  const hvacMat = createMobileMat({ color: 0x475569, roughness: 0.6, metalness: 0.5 });
  const hvac = new THREE.Mesh(hvacGeo, hvacMat);
  hvac.position.set(-1.5, 9.6, 0);
  group.add(hvac);

  // 5. Water tower cylinder
  const wtGeo = new THREE.CylinderGeometry(0.9, 0.9, 1.8, 12);
  const wtMat = createMobileMat({ color: 0x78716c, roughness: 0.7, metalness: 0.3 });
  const wt = new THREE.Mesh(wtGeo, wtMat);
  wt.position.set(1.6, 9.9, 0.4);
  group.add(wt);

  // 6. Glowing billboard / neon sign
  const signGeo = new THREE.BoxGeometry(3.0, 1.4, 0.15);
  const signMat = createMobileMat({
    color: 0x10b981,
    emissive: 0x10b981,
    emissiveIntensity: 2.2,
    roughness: 0.2,
  });
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.set(0, 10.4, 1.8);
  group.add(sign);

  group.add(createContactShadowDisc(4.2));
  return group;
}

/**
 * 3. Stylized Low-Poly Pine Tree (5 composite parts)
 */
export function createPineTree(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'pine_tree';
  group.userData = { isWindFoliage: true };

  // 1. Tapered Wooden Trunk
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.45, 2.2, 7);
  const trunkMat = createMobileMat({
    color: 0x5c3d2e,
    roughness: 0.9,
    metalness: 0.05,
  });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 1.1;
  trunk.castShadow = true;
  group.add(trunk);

  // 2. Bottom Foliage Tier
  const botGeo = makeFlatShadedGeo(new THREE.ConeGeometry(2.4, 2.6, 7));
  const foliageMat1 = createMobileMat({
    color: 0x1e5e3a,
    roughness: 0.75,
    metalness: 0.05,
  });
  const bot = new THREE.Mesh(botGeo, foliageMat1);
  bot.position.y = 2.4;
  bot.castShadow = true;
  group.add(bot);

  // 3. Middle Foliage Tier (slight rotation for stylized asymmetry)
  const midGeo = makeFlatShadedGeo(new THREE.ConeGeometry(1.8, 2.2, 7));
  const foliageMat2 = createMobileMat({
    color: 0x2d7a4c,
    roughness: 0.7,
    metalness: 0.05,
  });
  const mid = new THREE.Mesh(midGeo, foliageMat2);
  mid.position.y = 3.6;
  mid.rotation.y = 0.4;
  mid.castShadow = true;
  group.add(mid);

  // 4. Top Crown Spire (lighter apex highlight)
  const topGeo = makeFlatShadedGeo(new THREE.ConeGeometry(1.2, 1.8, 7));
  const foliageMat3 = createMobileMat({
    color: 0x48a065,
    roughness: 0.65,
    metalness: 0.05,
  });
  const top = new THREE.Mesh(topGeo, foliageMat3);
  top.position.y = 4.7;
  top.rotation.y = 0.9;
  top.castShadow = true;
  group.add(top);

  group.add(createContactShadowDisc(2.2));
  return group;
}

/**
 * 4. Stylized Broadleaf / Oak Tree (6 composite parts)
 */
export function createBroadleafTree(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'broadleaf_tree';
  group.userData = { isWindFoliage: true };

  // 1. Organic Trunk
  const trunkGeo = makeFlatShadedGeo(new THREE.CylinderGeometry(0.35, 0.6, 2.6, 8));
  const trunkMat = createMobileMat({
    color: 0x6e473b,
    roughness: 0.85,
    metalness: 0.05,
  });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 1.3;
  trunk.castShadow = true;
  group.add(trunk);

  // Canopy Clusters (Stylized low-poly icos/spheres with baked face normals)
  const leafMat = createMobileMat({
    color: 0x55a630,
    roughness: 0.75,
    metalness: 0.05,
  });
  const leafMatLight = createMobileMat({
    color: 0x80b918,
    roughness: 0.70,
    metalness: 0.05,
  });

  // 2. Central main cloud
  const c1Geo = makeFlatShadedGeo(new THREE.DodecahedronGeometry(1.8, 1));
  const c1 = new THREE.Mesh(c1Geo, leafMat);
  c1.position.set(0, 3.6, 0);
  c1.castShadow = true;
  group.add(c1);

  // 3. Side cluster left
  const c2Geo = makeFlatShadedGeo(new THREE.DodecahedronGeometry(1.3, 1));
  const c2 = new THREE.Mesh(c2Geo, leafMatLight);
  c2.position.set(-1.1, 3.2, 0.4);
  c2.castShadow = true;
  group.add(c2);

  // 4. Side cluster right
  const c3Geo = makeFlatShadedGeo(new THREE.DodecahedronGeometry(1.4, 1));
  const c3 = new THREE.Mesh(c3Geo, leafMat);
  c3.position.set(1.0, 3.4, -0.3);
  c3.castShadow = true;
  group.add(c3);

  // 5. Crown top tuft
  const c4Geo = makeFlatShadedGeo(new THREE.DodecahedronGeometry(1.2, 1));
  const c4 = new THREE.Mesh(c4Geo, leafMatLight);
  c4.position.set(0.2, 4.7, 0.1);
  c4.castShadow = true;
  group.add(c4);

  group.add(createContactShadowDisc(2.4));
  return group;
}

let cachedMeadowGrassBladeGeo: THREE.BufferGeometry | null = null;
let cachedMeadowGrassSeedGeo: THREE.BufferGeometry | null = null;

/**
 * 4b. Stylized Meadow Wild Grass (Rumput Padang Asli - Merged High Performance)
 * Consolidates all grass blades and seedhead spikes into 2 single draw calls.
 */
export function createMeadowGrass(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'meadow_grass';
  group.userData = { isWindFoliage: true };

  const matLush = createMobileMat({ color: 0x16a34a, roughness: 0.60 });
  const matSeed = createMobileMat({ color: 0xd97706, roughness: 0.50 });

  if (!cachedMeadowGrassBladeGeo) {
    const bladeTallGeo = makeFlatShadedGeo(new THREE.ConeGeometry(0.045, 1.35, 3));
    const bladeMedGeo = makeFlatShadedGeo(new THREE.ConeGeometry(0.040, 1.05, 3));
    const bladeShortGeo = makeFlatShadedGeo(new THREE.ConeGeometry(0.035, 0.75, 3));
    const bladeTinyGeo = makeFlatShadedGeo(new THREE.ConeGeometry(0.030, 0.50, 3));

    const rawBlades = [
      { geo: bladeTallGeo, x: 0.02, z: -0.01, rotX: 0.04, rotZ: 0.03, rotY: 0.2, scaleY: 1.15, h: 1.35 },
      { geo: bladeTallGeo, x: -0.04, z: 0.03, rotX: -0.05, rotZ: 0.04, rotY: 1.1, scaleY: 1.20, h: 1.35 },
      { geo: bladeTallGeo, x: 0.06, z: 0.04, rotX: 0.06, rotZ: -0.05, rotY: 2.3, scaleY: 1.10, h: 1.35 },
      { geo: bladeTallGeo, x: -0.03, z: -0.05, rotX: -0.04, rotZ: -0.06, rotY: 3.4, scaleY: 1.05, h: 1.35 },
      { geo: bladeMedGeo, x: 0.00, z: 0.07, rotX: 0.09, rotZ: 0.02, rotY: 4.5, scaleY: 1.00, h: 1.05 },
      { geo: bladeMedGeo, x: 0.14, z: 0.05, rotX: 0.24, rotZ: -0.18, rotY: 0.4, scaleY: 1.02, h: 1.05 },
      { geo: bladeMedGeo, x: -0.12, z: 0.08, rotX: 0.28, rotZ: 0.22, rotY: 1.3, scaleY: 0.98, h: 1.05 },
      { geo: bladeMedGeo, x: -0.15, z: -0.10, rotX: -0.26, rotZ: 0.20, rotY: 2.1, scaleY: 1.05, h: 1.05 },
      { geo: bladeMedGeo, x: 0.12, z: -0.12, rotX: -0.22, rotZ: -0.25, rotY: 3.1, scaleY: 0.95, h: 1.05 },
      { geo: bladeMedGeo, x: 0.08, z: 0.16, rotX: 0.32, rotZ: 0.08, rotY: 4.2, scaleY: 1.00, h: 1.05 },
      { geo: bladeShortGeo, x: 0.22, z: 0.12, rotX: 0.42, rotZ: -0.26, rotY: 0.6, scaleY: 0.90, h: 0.75 },
      { geo: bladeShortGeo, x: -0.20, z: 0.16, rotX: 0.45, rotZ: 0.30, rotY: 1.5, scaleY: 0.88, h: 0.75 },
      { geo: bladeShortGeo, x: -0.24, z: -0.14, rotX: -0.40, rotZ: 0.35, rotY: 2.5, scaleY: 0.92, h: 0.75 },
      { geo: bladeShortGeo, x: 0.20, z: -0.18, rotX: -0.38, rotZ: -0.36, rotY: 3.6, scaleY: 0.85, h: 0.75 },
      { geo: bladeShortGeo, x: 0.02, z: 0.25, rotX: 0.48, rotZ: 0.06, rotY: 4.7, scaleY: 0.93, h: 0.75 },
      { geo: bladeTinyGeo, x: 0.30, z: 0.10, rotX: 0.55, rotZ: -0.35, rotY: 0.9, scaleY: 0.80, h: 0.50 },
      { geo: bladeTinyGeo, x: -0.28, z: 0.18, rotX: 0.52, rotZ: 0.42, rotY: 1.8, scaleY: 0.85, h: 0.50 },
      { geo: bladeTinyGeo, x: -0.29, z: -0.16, rotX: -0.50, rotZ: 0.45, rotY: 2.8, scaleY: 0.78, h: 0.50 },
      { geo: bladeTinyGeo, x: 0.28, z: -0.22, rotX: -0.48, rotZ: -0.44, rotY: 3.9, scaleY: 0.82, h: 0.50 },
      { geo: bladeTinyGeo, x: 0.05, z: 0.32, rotX: 0.58, rotZ: 0.10, rotY: 5.0, scaleY: 0.75, h: 0.50 },
    ];

    cachedMeadowGrassBladeGeo = mergeGeometriesWithTransforms(
      rawBlades.map((b) => ({
        geometry: b.geo,
        position: [b.x, (0.5 * b.scaleY * b.h) * 0.9, b.z] as [number, number, number],
        rotation: [b.rotX, b.rotY, b.rotZ] as [number, number, number],
        scale: [0.9, b.scaleY, 1.2] as [number, number, number],
      }))
    );
  }

  const blades = new THREE.Mesh(cachedMeadowGrassBladeGeo, matLush);
  blades.castShadow = false;
  blades.receiveShadow = false;
  blades.frustumCulled = true;
  group.add(blades);

  if (!cachedMeadowGrassSeedGeo) {
    const seedStalkGeo = makeFlatShadedGeo(new THREE.CylinderGeometry(0.015, 0.02, 1.45, 3));
    const seedHeadGeo = makeFlatShadedGeo(new THREE.ConeGeometry(0.06, 0.35, 4));
    cachedMeadowGrassSeedGeo = mergeGeometriesWithTransforms([
      { geometry: seedStalkGeo, position: [0.08, 0.70, -0.05], rotation: [0.12, 0.5, -0.10] },
      { geometry: seedHeadGeo, position: [0.14, 1.42, -0.09], rotation: [0.18, 0.5, -0.14] },
      { geometry: seedStalkGeo, position: [-0.06, 0.65, 0.06], rotation: [-0.10, 2.2, 0.14] },
      { geometry: seedHeadGeo, position: [-0.11, 1.35, 0.11], rotation: [-0.14, 2.2, 0.18] },
    ]);
  }

  const seeds = new THREE.Mesh(cachedMeadowGrassSeedGeo, matSeed);
  seeds.castShadow = false;
  seeds.receiveShadow = false;
  seeds.frustumCulled = true;
  group.add(seeds);

  return group;
}

let cachedFlowerPatchGrassGeo: THREE.BufferGeometry | null = null;
let cachedFlowerPatchStemGeo: THREE.BufferGeometry | null = null;
let cachedFlowerPatchBlossomGeo: THREE.BufferGeometry | null = null;

/**
 * 4c. Stylized Wildflower Patch with Intertwined Meadow Grass (Merged High Performance)
 * Consolidates ~50 individual meshes into 3 clean merged draw calls.
 */
export function createFlowerPatch(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'flower_patch';
  group.userData = { isWindFoliage: true };

  const matGrass = createMobileMat({ color: 0x16a34a, roughness: 0.60 });
  const matStem = createMobileMat({ color: 0x15803d, roughness: 0.70 });
  const matBlossom = createMobileMat({ color: 0xfef08a, roughness: 0.40 });

  // 1. Intertwining Grass Blades (Merged into 1 geometry)
  if (!cachedFlowerPatchGrassGeo) {
    const grassTallGeo = makeFlatShadedGeo(new THREE.ConeGeometry(0.040, 1.25, 3));
    const grassMedGeo = makeFlatShadedGeo(new THREE.ConeGeometry(0.035, 0.95, 3));
    const grassShortGeo = makeFlatShadedGeo(new THREE.ConeGeometry(0.030, 0.65, 3));

    const grassConfigs = [
      { geo: grassTallGeo, x: 0.02, z: 0.01, rotX: 0.05, rotZ: 0.04, rotY: 0.3, scaleY: 1.1, h: 1.25 },
      { geo: grassTallGeo, x: -0.06, z: 0.08, rotX: 0.12, rotZ: -0.15, rotY: 1.2, scaleY: 1.15, h: 1.25 },
      { geo: grassTallGeo, x: 0.09, z: -0.07, rotX: -0.14, rotZ: 0.12, rotY: 2.1, scaleY: 1.05, h: 1.25 },
      { geo: grassMedGeo, x: -0.12, z: -0.08, rotX: -0.22, rotZ: -0.18, rotY: 3.0, scaleY: 1.0, h: 0.95 },
      { geo: grassMedGeo, x: 0.15, z: 0.12, rotX: 0.25, rotZ: 0.16, rotY: 3.9, scaleY: 0.95, h: 0.95 },
      { geo: grassMedGeo, x: -0.18, z: 0.14, rotX: 0.28, rotZ: -0.22, rotY: 4.8, scaleY: 1.05, h: 0.95 },
      { geo: grassMedGeo, x: 0.18, z: -0.14, rotX: -0.24, rotZ: 0.26, rotY: 5.7, scaleY: 0.92, h: 0.95 },
      { geo: grassMedGeo, x: 0.04, z: 0.22, rotX: 0.34, rotZ: 0.05, rotY: 0.7, scaleY: 0.98, h: 0.95 },
      { geo: grassShortGeo, x: 0.25, z: 0.05, rotX: 0.38, rotZ: 0.32, rotY: 0.4, scaleY: 0.9, h: 0.65 },
      { geo: grassShortGeo, x: -0.24, z: -0.06, rotX: -0.35, rotZ: -0.36, rotY: 1.6, scaleY: 0.88, h: 0.65 },
      { geo: grassShortGeo, x: 0.22, z: 0.22, rotX: 0.42, rotZ: -0.25, rotY: 2.7, scaleY: 0.85, h: 0.65 },
      { geo: grassShortGeo, x: -0.20, z: 0.24, rotX: 0.44, rotZ: 0.28, rotY: 3.8, scaleY: 0.92, h: 0.65 },
      { geo: grassShortGeo, x: 0.00, z: 0.32, rotX: 0.50, rotZ: 0.04, rotY: 0.1, scaleY: 0.82, h: 0.65 },
      { geo: grassShortGeo, x: 0.02, z: -0.30, rotX: -0.48, rotZ: -0.06, rotY: 2.4, scaleY: 0.80, h: 0.65 },
    ];

    cachedFlowerPatchGrassGeo = mergeGeometriesWithTransforms(
      grassConfigs.map((g) => ({
        geometry: g.geo,
        position: [g.x, (0.5 * g.scaleY * g.h) * 0.9, g.z] as [number, number, number],
        rotation: [g.rotX, g.rotY, g.rotZ] as [number, number, number],
        scale: [0.85, g.scaleY, 1.15] as [number, number, number],
      }))
    );
  }

  const grass = new THREE.Mesh(cachedFlowerPatchGrassGeo, matGrass);
  grass.castShadow = false;
  grass.receiveShadow = false;
  grass.frustumCulled = true;
  group.add(grass);

  // 2. Wildflower Stems (Merged into 1 geometry)
  if (!cachedFlowerPatchStemGeo) {
    const stemGeo = makeFlatShadedGeo(new THREE.CylinderGeometry(0.020, 0.025, 0.75, 4));
    const stemTransforms = [
      { geometry: stemGeo, position: [0.08, 0.38, 0.05] as [number, number, number], rotation: [0.12, 0.4, -0.15] as [number, number, number] },
      { geometry: stemGeo, position: [-0.10, 0.35, 0.12] as [number, number, number], rotation: [0.18, 1.2, 0.20] as [number, number, number] },
      { geometry: stemGeo, position: [0.16, 0.32, -0.08] as [number, number, number], rotation: [-0.20, 2.3, -0.18] as [number, number, number] },
      { geometry: stemGeo, position: [-0.14, 0.36, -0.12] as [number, number, number], rotation: [-0.15, 3.1, 0.18] as [number, number, number] },
      { geometry: stemGeo, position: [0.02, 0.39, 0.18] as [number, number, number], rotation: [0.22, 4.0, 0.05] as [number, number, number] },
      { geometry: stemGeo, position: [-0.04, 0.28, -0.16] as [number, number, number], rotation: [-0.25, 4.9, -0.10] as [number, number, number] },
    ];
    cachedFlowerPatchStemGeo = mergeGeometriesWithTransforms(stemTransforms);
  }

  const stems = new THREE.Mesh(cachedFlowerPatchStemGeo, matStem);
  stems.castShadow = false;
  stems.receiveShadow = false;
  stems.frustumCulled = true;
  group.add(stems);

  // 3. Cheerful Wildflower Blossoms (Merged into 1 geometry)
  if (!cachedFlowerPatchBlossomGeo) {
    const blossomGeo = makeFlatShadedGeo(new THREE.DodecahedronGeometry(0.12, 0));
    const blossomTransforms = [
      { geometry: blossomGeo, position: [0.08, 0.78, 0.05] as [number, number, number] },
      { geometry: blossomGeo, position: [-0.10, 0.72, 0.12] as [number, number, number] },
      { geometry: blossomGeo, position: [0.16, 0.65, -0.08] as [number, number, number] },
      { geometry: blossomGeo, position: [-0.14, 0.74, -0.12] as [number, number, number] },
      { geometry: blossomGeo, position: [0.02, 0.80, 0.18] as [number, number, number] },
      { geometry: blossomGeo, position: [-0.04, 0.58, -0.16] as [number, number, number] },
    ];
    cachedFlowerPatchBlossomGeo = mergeGeometriesWithTransforms(blossomTransforms);
  }

  const blossoms = new THREE.Mesh(cachedFlowerPatchBlossomGeo, matBlossom);
  blossoms.castShadow = false;
  blossoms.receiveShadow = false;
  blossoms.frustumCulled = true;
  group.add(blossoms);

  return group;
}

/**
 * 5. Medieval Stone Windmill (8 composite parts)
 */
export function createStoneWindmill(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stone_windmill';

  // 1. Octagonal stone foundation
  const baseGeo = makeFlatShadedGeo(new THREE.CylinderGeometry(2.4, 2.8, 1.8, 8));
  const stoneMat = createMobileMat({
    color: 0x64748b,
    roughness: 0.9,
    metalness: 0.1,
  });
  const base = new THREE.Mesh(baseGeo, stoneMat);
  base.position.y = 0.9;
  base.castShadow = true;
  group.add(base);

  // 2. Tapered timber tower
  const towerGeo = makeFlatShadedGeo(new THREE.CylinderGeometry(1.8, 2.3, 4.5, 8));
  const woodMat = createMobileMat({
    color: 0xa16207,
    roughness: 0.7,
    metalness: 0.05,
  });
  const tower = new THREE.Mesh(towerGeo, woodMat);
  tower.position.y = 1.8 + 2.25;
  tower.castShadow = true;
  group.add(tower);

  // 3. Conical shingle roof
  const roofGeo = makeFlatShadedGeo(new THREE.ConeGeometry(2.2, 2.2, 8));
  const roofMat = createMobileMat({
    color: 0x991b1b,
    roughness: 0.6,
    metalness: 0.1,
  });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 6.3 + 1.1;
  roof.castShadow = true;
  group.add(roof);

  // 4. Windmill rotor hub
  const hubGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.6, 8);
  const hubMat = createMobileMat({ color: 0x334155, metalness: 0.8, roughness: 0.2 });
  const hub = new THREE.Mesh(hubGeo, hubMat);
  hub.rotation.x = Math.PI / 2;
  hub.position.set(0, 5.8, 2.0);
  group.add(hub);

  // 5. Four windmill sail blades
  const rotor = new THREE.Group();
  rotor.position.set(0, 5.8, 2.3);
  rotor.name = 'windmill_rotor';

  const bladeMat = createMobileMat({
    color: 0xfef08a,
    roughness: 0.8,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const beamMat = createMobileMat({ color: 0x451a03, roughness: 0.9 });

  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const arm = new THREE.Group();
    arm.rotation.z = angle;

    const sparGeo = new THREE.BoxGeometry(0.12, 3.8, 0.12);
    const spar = new THREE.Mesh(sparGeo, beamMat);
    spar.position.y = 1.9;
    arm.add(spar);

    const sailGeo = new THREE.PlaneGeometry(0.9, 2.8);
    const sail = new THREE.Mesh(sailGeo, bladeMat);
    sail.position.set(0.48, 2.2, 0.02);
    sail.rotation.y = 0.2;
    arm.add(sail);

    rotor.add(arm);
  }
  group.add(rotor);

  // 6. Arched wooden doorway
  const doorGeo = new THREE.BoxGeometry(0.8, 1.4, 0.2);
  const doorMat = createMobileMat({ color: 0x451a03, roughness: 0.85 });
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, 0.7, 2.65);
  group.add(door);

  group.add(createContactShadowDisc(3.2));
  return group;
}

/**
 * 6. Island Coastal Lighthouse (8 composite parts)
 */
export function createIslandLighthouse(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'island_lighthouse';

  // 1. Rocky footing foundation
  const rockGeo = makeFlatShadedGeo(new THREE.CylinderGeometry(2.8, 3.2, 1.2, 8));
  const rockMat = createMobileMat({
    color: 0x475569,
    roughness: 0.95,
    metalness: 0.1,
    flatShading: true,
  });
  const rock = new THREE.Mesh(rockGeo, rockMat);
  rock.position.y = 0.6;
  group.add(rock);

  // 2. Lower white tower band (octagonal low-poly faceted)
  const lowerGeo = makeFlatShadedGeo(new THREE.CylinderGeometry(2.0, 2.4, 4.0, 8));
  const whiteMat = createMobileMat({ color: 0xf8fafc, roughness: 0.4, metalness: 0.1, flatShading: true });
  const lower = new THREE.Mesh(lowerGeo, whiteMat);
  lower.position.y = 1.2 + 2.0;
  lower.castShadow = true;
  group.add(lower);

  // 3. Middle red stripe band
  const redGeo = makeFlatShadedGeo(new THREE.CylinderGeometry(1.6, 2.0, 3.0, 8));
  const redMat = createMobileMat({ color: 0xdc2626, roughness: 0.4, metalness: 0.1, flatShading: true });
  const redBand = new THREE.Mesh(redGeo, redMat);
  redBand.position.y = 5.2 + 1.5;
  redBand.castShadow = true;
  group.add(redBand);

  // 4. Upper white column
  const upGeo = makeFlatShadedGeo(new THREE.CylinderGeometry(1.3, 1.6, 3.0, 8));
  const upper = new THREE.Mesh(upGeo, whiteMat);
  upper.position.y = 8.2 + 1.5;
  upper.castShadow = true;
  group.add(upper);

  // 5. Gallery iron walkway
  const galGeo = makeFlatShadedGeo(new THREE.CylinderGeometry(1.8, 1.8, 0.3, 8));
  const ironMat = createMobileMat({ color: 0x1e293b, roughness: 0.5, metalness: 0.8, flatShading: true });
  const gal = new THREE.Mesh(galGeo, ironMat);
  gal.position.y = 11.35;
  group.add(gal);

  // 6. Glass Lantern Room
  const glassGeo = makeFlatShadedGeo(new THREE.CylinderGeometry(1.2, 1.2, 1.6, 8));
  const glassMat = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.65,
    shininess: 90,
    flatShading: true,
  });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.y = 12.3;
  group.add(glass);

  // 7. Rotating beacon light core
  const lampGeo = makeFlatShadedGeo(new THREE.DodecahedronGeometry(0.35, 0));
  const lampMat = createMobileMat({
    color: 0xfef08a,
    emissive: 0xfef08a,
    emissiveIntensity: 4.0,
    roughness: 0.1,
    flatShading: true,
  });
  const lamp = new THREE.Mesh(lampGeo, lampMat);
  lamp.position.y = 12.3;
  group.add(lamp);

  // 8. Copper roof dome & spire
  const domeGeo = makeFlatShadedGeo(new THREE.ConeGeometry(1.4, 1.2, 8));
  const domeMat = createMobileMat({ color: 0x0f766e, roughness: 0.3, metalness: 0.7, flatShading: true });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.position.y = 13.7;
  group.add(dome);

  group.add(createContactShadowDisc(3.6));
  // Warm wide-radius lighthouse coastal ground light halo
  group.add(createGroundLightDisc(8.0, 0xfef08a, 0.75, 'lighthouse'));
  return group;
}

/**
 * 7. Alpine Cozy Cottage (7 composite parts)
 */
export function createAlpineCottage(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'alpine_cottage';

  // 1. Stone foundation
  const baseGeo = new THREE.BoxGeometry(4.4, 0.8, 3.4);
  const stoneMat = createMobileMat({ color: 0x64748b, roughness: 0.95 });
  const base = new THREE.Mesh(baseGeo, stoneMat);
  base.position.y = 0.4;
  group.add(base);

  // 2. Timber chalet walls
  const wallGeo = new THREE.BoxGeometry(4.0, 2.2, 3.0);
  const woodMat = createMobileMat({ color: 0x78350f, roughness: 0.8 });
  const walls = new THREE.Mesh(wallGeo, woodMat);
  walls.position.y = 1.9;
  walls.castShadow = true;
  group.add(walls);

  // 3. Overhanging pitched roof
  const roofGeo = makeFlatShadedGeo(new THREE.ConeGeometry(3.2, 1.8, 4));
  const roofMat = createMobileMat({
    color: 0x451a03,
    roughness: 0.6,
    metalness: 0.1,
  });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.2, 1.0, 0.9);
  roof.position.y = 3.9;
  roof.castShadow = true;
  group.add(roof);

  // 4. Stone chimney stack
  const chimGeo = new THREE.BoxGeometry(0.7, 2.8, 0.7);
  const chimMat = createMobileMat({ color: 0x57534e, roughness: 0.9 });
  const chim = new THREE.Mesh(chimGeo, chimMat);
  chim.position.set(1.4, 3.8, 0.6);
  chim.castShadow = true;
  group.add(chim);

  // 5. Warm glowing windows
  const winGeo = new THREE.PlaneGeometry(0.8, 0.8);
  const winMat = createMobileMat({
    color: 0xfef08a,
    emissive: 0xfbbf24,
    emissiveIntensity: 1.8,
  });
  const win1 = new THREE.Mesh(winGeo, winMat);
  win1.position.set(1.0, 2.0, 1.52);
  const win2 = new THREE.Mesh(winGeo, winMat);
  win2.position.set(-1.0, 2.0, 1.52);
  group.add(win1, win2);

  // 6. Porch wooden canopy
  const porchGeo = new THREE.BoxGeometry(1.6, 0.1, 1.0);
  const porch = new THREE.Mesh(porchGeo, woodMat);
  porch.position.set(0, 2.2, 1.9);
  group.add(porch);

  group.add(createContactShadowDisc(3.0));
  // Warm cozy window/porch light spill
  const cottageGlow = createGroundLightDisc(5.2, 0xfbbf24, 0.70, 'cottage');
  cottageGlow.position.set(0, 0.05, 1.2);
  group.add(cottageGlow);
  return group;
}

/**
 * 8. Fantasy Crystal Spire (6 composite parts)
 */
export function createFantasyCrystal(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'fantasy_crystal';

  // 1. Runic Carved Base Pedestal
  const baseGeo = new THREE.CylinderGeometry(1.6, 2.2, 1.0, 6);
  const stoneMat = createMobileMat({
    color: 0x312e81,
    roughness: 0.7,
    metalness: 0.3,
    flatShading: true,
  });
  const base = new THREE.Mesh(baseGeo, stoneMat);
  base.position.y = 0.5;
  group.add(base);

  // 2. Large Central Floating Crystal (Octahedron/Bipyramid)
  const cryGeo = new THREE.OctahedronGeometry(1.6, 0);
  const cryMat = new THREE.MeshPhongMaterial({
    color: 0xa855f7,
    emissive: 0x7c3aed,
    emissiveIntensity: 1.4,
    transparent: true,
    opacity: 0.85,
    shininess: 90,
    flatShading: true,
  });
  const mainCrystal = new THREE.Mesh(cryGeo, cryMat);
  mainCrystal.scale.set(0.8, 2.4, 0.8);
  mainCrystal.position.y = 3.6;
  mainCrystal.castShadow = true;
  group.add(mainCrystal);

  // 3. Orbiting Shard 1
  const shardGeo = new THREE.OctahedronGeometry(0.5, 0);
  const shard1 = new THREE.Mesh(shardGeo, cryMat);
  shard1.scale.set(0.6, 1.8, 0.6);
  shard1.position.set(1.6, 3.2, 0.8);
  group.add(shard1);

  // 4. Orbiting Shard 2
  const shard2 = new THREE.Mesh(shardGeo, cryMat);
  shard2.scale.set(0.5, 1.4, 0.5);
  shard2.position.set(-1.4, 4.2, -0.6);
  group.add(shard2);

  // 5. Levitating Magic Ring
  const ringGeo = new THREE.TorusGeometry(2.0, 0.08, 8, 24);
  const ringMat = createMobileMat({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 2.5,
    metalness: 0.9,
    roughness: 0.1,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 3;
  ring.rotation.y = 0.4;
  ring.position.y = 3.6;
  group.add(ring);

  group.add(createContactShadowDisc(2.6));
  // Resonant ethereal magic light pool
  group.add(createGroundLightDisc(5.5, 0x38bdf8, 0.85, 'crystal'));
  return group;
}

/**
 * 9. Sci-Fi Biosphere Habitat Dome (7 composite parts)
 */
export function createSciFiDome(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'scifi_dome';

  // 1. Hexagonal airlock base
  const baseGeo = new THREE.CylinderGeometry(3.6, 4.0, 0.8, 6);
  const baseMat = createMobileMat({ color: 0x334155, roughness: 0.4, metalness: 0.7 });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.4;
  group.add(base);

  // 2. Translucent geodesic biosphere dome
  const domeGeo = new THREE.SphereGeometry(3.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const domeMat = new THREE.MeshPhongMaterial({
    color: 0x67e8f9,
    transparent: true,
    opacity: 0.6,
    shininess: 80,
    flatShading: true,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.position.y = 0.8;
  group.add(dome);

  // 3. Central interior greenhouse biome
  const treeTrunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.25, 1.6, 6),
    createMobileMat({ color: 0x78350f, roughness: 0.9 })
  );
  treeTrunk.position.y = 1.6;
  const treeFoliage = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.9),
    createMobileMat({ color: 0x22c55e, roughness: 0.7, flatShading: true })
  );
  treeFoliage.position.y = 2.6;
  group.add(treeTrunk, treeFoliage);

  // 4. Airlock entrance corridor
  const tunnelGeo = new THREE.BoxGeometry(1.6, 1.4, 2.2);
  const tunnel = new THREE.Mesh(tunnelGeo, baseMat);
  tunnel.position.set(0, 1.1, 3.2);
  group.add(tunnel);

  // 5. Dual Solar Power Collectors
  const solarGeo = new THREE.BoxGeometry(2.0, 0.1, 1.2);
  const solarMat = createMobileMat({
    color: 0x1e3a8a,
    metalness: 0.9,
    roughness: 0.2,
  });
  const solar1 = new THREE.Mesh(solarGeo, solarMat);
  solar1.position.set(-3.6, 2.2, 0);
  solar1.rotation.z = 0.4;
  const solar2 = new THREE.Mesh(solarGeo, solarMat);
  solar2.position.set(3.6, 2.2, 0);
  solar2.rotation.z = -0.4;
  group.add(solar1, solar2);

  group.add(createContactShadowDisc(4.8));
  return group;
}

/**
 * 10. Desert Ancient Mesa Monolith (5 composite parts)
 */
export function createDesertMonolith(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'desert_monolith';

  const stoneMat = createMobileMat({
    color: 0x9a3412,
    roughness: 0.9,
    metalness: 0.05,
    flatShading: true,
  });

  // 1. Stepped altar base
  const bGeo = new THREE.BoxGeometry(4.0, 1.0, 3.0);
  const base = new THREE.Mesh(bGeo, stoneMat);
  base.position.y = 0.5;
  group.add(base);

  // 2. Left pillar column
  const p1Geo = new THREE.BoxGeometry(0.9, 4.5, 0.9);
  const p1 = new THREE.Mesh(p1Geo, stoneMat);
  p1.position.set(-1.2, 3.25, 0);
  p1.castShadow = true;
  group.add(p1);

  // 3. Right pillar column
  const p2 = new THREE.Mesh(p1Geo, stoneMat);
  p2.position.set(1.2, 3.25, 0);
  p2.castShadow = true;
  group.add(p2);

  // 4. Heavy lintel arch slab
  const lintGeo = new THREE.BoxGeometry(4.2, 1.0, 1.2);
  const lint = new THREE.Mesh(lintGeo, stoneMat);
  lint.position.set(0, 5.8, 0);
  lint.castShadow = true;
  group.add(lint);

  // 5. Ancient brass brazier
  const brazGeo = new THREE.CylinderGeometry(0.5, 0.3, 0.6, 8);
  const brazMat = createMobileMat({
    color: 0xf59e0b,
    emissive: 0xd97706,
    emissiveIntensity: 1.5,
    metalness: 0.8,
  });
  const brazier = new THREE.Mesh(brazGeo, brazMat);
  brazier.position.set(0, 1.3, 0.8);
  group.add(brazier);

  group.add(createContactShadowDisc(3.2));
  // Warm flickering brazier fire pool
  const fireGlow = createGroundLightDisc(4.5, 0xf97316, 0.80, 'brazier');
  fireGlow.position.set(0, 0.05, 0.8);
  group.add(fireGlow);
  return group;
}

/**
 * 11. Renewable Clean Wind Turbine (5 composite parts)
 */
export function createWindTurbine(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wind_turbine';

  // 1. Concrete Base Anchor
  const bGeo = new THREE.CylinderGeometry(1.0, 1.3, 0.5, 12);
  const bMat = createMobileMat({ color: 0x94a3b8, roughness: 0.8 });
  const base = new THREE.Mesh(bGeo, bMat);
  base.position.y = 0.25;
  group.add(base);

  // 2. Sleek Tapered Pylon Mast
  const mastGeo = new THREE.CylinderGeometry(0.2, 0.55, 14, 16);
  const whiteMat = createMobileMat({ color: 0xf1f5f9, roughness: 0.25, metalness: 0.6 });
  const mast = new THREE.Mesh(mastGeo, whiteMat);
  mast.position.y = 7.25;
  mast.castShadow = true;
  group.add(mast);

  // 3. Aerodynamic Nacelle Motor Pod
  const podGeo = new THREE.BoxGeometry(0.8, 0.8, 2.2);
  const pod = new THREE.Mesh(podGeo, whiteMat);
  pod.position.set(0, 14.3, 0.2);
  group.add(pod);

  // 4. Rotor Spinner & 3 Aerofoil Blades
  const rotor = new THREE.Group();
  rotor.position.set(0, 14.3, 1.4);
  rotor.name = 'turbine_rotor';

  const noseGeo = new THREE.ConeGeometry(0.35, 0.8, 12);
  const nose = new THREE.Mesh(noseGeo, whiteMat);
  nose.rotation.x = Math.PI / 2;
  rotor.add(nose);

  const bladeGeo = new THREE.BoxGeometry(0.25, 6.0, 0.06);
  bladeGeo.translate(0, 3.0, 0); // pivot at base
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(bladeGeo, whiteMat);
    blade.rotation.z = (i * Math.PI * 2) / 3;
    blade.castShadow = true;
    rotor.add(blade);
  }
  group.add(rotor);

  // 5. Red Safety Warning Strobe
  const strobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    createMobileMat({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 3 })
  );
  strobe.position.set(0, 14.8, 0);
  group.add(strobe);

  group.add(createContactShadowDisc(2.4));
  return group;
}

/**
 * 12. Stylized Street / Cyber Lamp (5 composite parts)
 */
export function createStreetLamp(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'street_lamp';

  const ironMat = createMobileMat({ color: 0x3b4c68, roughness: 0.45, metalness: 0.7 });

  // 1. Base collar
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.4, 8), ironMat);
  b.position.y = 0.2;
  group.add(b);

  // 2. Vertical post
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 3.6, 8), ironMat);
  post.position.y = 2.2;
  post.castShadow = true;
  group.add(post);

  // 3. Curved top bracket arm
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.1), ironMat);
  arm.position.set(0.45, 3.9, 0);
  group.add(arm);

  // 4. Lantern head housing
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.3, 6), ironMat);
  head.position.set(0.9, 3.8, 0);
  group.add(head);

  // 5. Glowing lamp bulb core
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 8),
    createMobileMat({
      color: 0xfef08a,
      emissive: 0xfef08a,
      emissiveIntensity: 3.5,
      roughness: 0.1,
    })
  );
  bulb.name = 'lamp_bulb_emitter';
  bulb.position.set(0.9, 3.6, 0);
  group.add(bulb);

  group.add(createContactShadowDisc(1.2));

  // 6. Warm Ground Light Illumination Pool Disc (placed under lantern bulb)
  const lampLight = createGroundLightDisc(4.2, 0xfbbf24, 0.90, 'street_lamp');
  lampLight.position.set(0.9, 0.05, 0);
  group.add(lampLight);

  return group;
}

/**
 * 13. Cobblestone Path Segment (Jalan Setapak Batu - 8 composite parts)
 */
export function createCobblestonePath(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'cobblestone_path';

  // Base earth foundation
  const baseGeo = new THREE.BoxGeometry(4.2, 0.15, 6.2);
  const baseMat = createMobileMat({
    color: 0x524636,
    roughness: 0.95,
  });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.08;
  base.receiveShadow = true;
  group.add(base);

  // Varied cobblestone pavers
  const stoneMat1 = createMobileMat({ color: 0x78716c, roughness: 0.85 });
  const stoneMat2 = createMobileMat({ color: 0xa8a29e, roughness: 0.8 });
  const stoneMat3 = createMobileMat({ color: 0x57534e, roughness: 0.9 });

  const paverConfigs = [
    { x: -1.2, z: -2.0, w: 1.4, d: 1.6, h: 0.22, mat: stoneMat1 },
    { x: 0.8, z: -2.1, w: 1.6, d: 1.4, h: 0.25, mat: stoneMat2 },
    { x: -0.6, z: -0.6, w: 1.8, d: 1.3, h: 0.24, mat: stoneMat3 },
    { x: 1.1, z: -0.5, w: 1.3, d: 1.5, h: 0.22, mat: stoneMat1 },
    { x: -1.1, z: 0.9, w: 1.5, d: 1.4, h: 0.26, mat: stoneMat2 },
    { x: 0.7, z: 1.0, w: 1.7, d: 1.2, h: 0.23, mat: stoneMat3 },
    { x: -0.5, z: 2.2, w: 1.6, d: 1.3, h: 0.25, mat: stoneMat1 },
    { x: 1.0, z: 2.3, w: 1.3, d: 1.2, h: 0.22, mat: stoneMat2 },
  ];

  paverConfigs.forEach((cfg) => {
    const rawGeo = new THREE.CylinderGeometry(cfg.w * 0.5, cfg.w * 0.55, cfg.h, 7);
    rawGeo.scale(1, 1, cfg.d / cfg.w);
    const paverGeo = makeFlatShadedGeo(rawGeo);
    const paver = new THREE.Mesh(paverGeo, cfg.mat);
    paver.position.set(cfg.x, 0.16 + cfg.h * 0.5, cfg.z);
    paver.castShadow = true;
    paver.receiveShadow = true;
    group.add(paver);
  });

  group.add(createContactShadowDisc(3.2));
  return group;
}

/**
 * 14. Wooden Boardwalk / Trail Bridge (Jalan Setapak Kayu - 9 composite parts)
 */
export function createWoodenBoardwalk(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wooden_boardwalk';

  // Support stringer beams
  const beamMat = createMobileMat({ color: 0x451a03, roughness: 0.9 });
  const beamGeo = new THREE.BoxGeometry(0.3, 0.4, 6.4);
  const beamL = new THREE.Mesh(beamGeo, beamMat);
  beamL.position.set(-1.4, 0.25, 0);
  beamL.castShadow = true;
  group.add(beamL);

  const beamR = new THREE.Mesh(beamGeo, beamMat);
  beamR.position.set(1.4, 0.25, 0);
  beamR.castShadow = true;
  group.add(beamR);

  // Planks
  const plankMat1 = createMobileMat({ color: 0x78350f, roughness: 0.85 });
  const plankMat2 = createMobileMat({ color: 0x92400e, roughness: 0.85 });
  const plankGeo = new THREE.BoxGeometry(3.4, 0.18, 0.8);

  for (let i = -3; i <= 3; i++) {
    const plank = new THREE.Mesh(plankGeo, i % 2 === 0 ? plankMat1 : plankMat2);
    plank.position.set(0, 0.48, i * 0.9);
    plank.rotation.y = (Math.sin(i * 3.7) * 0.04);
    plank.castShadow = true;
    plank.receiveShadow = true;
    group.add(plank);
  }

  // Corner trail posts
  const postMat = createMobileMat({ color: 0x3f1d0b, roughness: 0.9 });
  const postGeo = new THREE.CylinderGeometry(0.12, 0.15, 1.6, 6);
  const postPositions = [
    [-1.5, 0.8, -2.8],
    [1.5, 0.8, -2.8],
    [-1.5, 0.8, 2.8],
    [1.5, 0.8, 2.8],
  ];

  postPositions.forEach(([x, y, z]) => {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(x, y, z);
    post.castShadow = true;
    group.add(post);
  });

  group.add(createContactShadowDisc(2.8));
  return group;
}

/**
 * 15. Stepping Stones (Batu Pijakan Setapak - 6 composite parts)
 */
export function createSteppingStones(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stepping_stones';

  const stoneMatA = createMobileMat({ color: 0x71717a, roughness: 0.8 });
  const stoneMatB = createMobileMat({ color: 0xa1a1aa, roughness: 0.85 });

  const stones = [
    { x: -0.6, z: -1.8, r: 0.65, h: 0.18, mat: stoneMatA },
    { x: 0.5, z: -0.9, r: 0.75, h: 0.20, mat: stoneMatB },
    { x: -0.4, z: 0.1, r: 0.70, h: 0.19, mat: stoneMatA },
    { x: 0.6, z: 1.1, r: 0.80, h: 0.22, mat: stoneMatB },
    { x: -0.3, z: 2.0, r: 0.65, h: 0.17, mat: stoneMatA },
  ];

  stones.forEach((s) => {
    const geo = makeFlatShadedGeo(new THREE.CylinderGeometry(s.r, s.r * 1.08, s.h, 7));
    const mesh = new THREE.Mesh(geo, s.mat);
    mesh.position.set(s.x, s.h * 0.5 + 0.04, s.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  group.add(createContactShadowDisc(2.2));
  return group;
}

/**
 * 16. Trail Signpost & Lantern (Plang Jalan Setapak - 7 composite parts)
 */
export function createTrailSignpost(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'trail_signpost';

  // Cairn rock base
  const cairnMat = createMobileMat({ color: 0x52525b, roughness: 0.9 });
  const cairnGeo = new THREE.DodecahedronGeometry(0.75);
  const cairn = new THREE.Mesh(cairnGeo, cairnMat);
  cairn.position.y = 0.45;
  cairn.castShadow = true;
  group.add(cairn);

  // Main wooden post
  const woodMat = createMobileMat({ color: 0x78350f, roughness: 0.85 });
  const postGeo = new THREE.CylinderGeometry(0.18, 0.22, 3.8, 6);
  const post = new THREE.Mesh(postGeo, woodMat);
  post.position.y = 2.1;
  post.castShadow = true;
  group.add(post);

  // Directional signboards
  const signMat = createMobileMat({ color: 0xb45309, roughness: 0.75 });
  const signGeo = new THREE.BoxGeometry(1.6, 0.35, 0.12);

  const sign1 = new THREE.Mesh(signGeo, signMat);
  sign1.position.set(0.65, 3.2, 0);
  sign1.rotation.y = 0.35;
  sign1.castShadow = true;
  group.add(sign1);

  const sign2 = new THREE.Mesh(signGeo, signMat);
  sign2.position.set(-0.65, 2.7, 0);
  sign2.rotation.y = -0.5;
  sign2.castShadow = true;
  group.add(sign2);

  // Hanging lantern
  const ironMat = createMobileMat({ color: 0x1f2937, metalness: 0.8, roughness: 0.3 });
  const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.9);
  armGeo.rotateZ(Math.PI / 3);
  const arm = new THREE.Mesh(armGeo, ironMat);
  arm.position.set(0.4, 3.6, 0);
  group.add(arm);

  const lampGeo = new THREE.OctahedronGeometry(0.28);
  const lampMat = createMobileMat({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.8,
  });
  const lamp = new THREE.Mesh(lampGeo, lampMat);
  lamp.position.set(0.75, 3.4, 0);
  group.add(lamp);

  group.add(createContactShadowDisc(1.8));
  return group;
}

/**
 * 17. Stylized Wooden Stairs (Tangga Kayu Lereng Curam - 12 composite parts)
 * Low-poly cascading wooden staircase automatically placed on steep terrain slopes.
 */
export function createWoodenStairs(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wooden_stairs';

  const stringerMat = createMobileMat({ color: 0x451a03, roughness: 0.9 });
  const treadMat1 = createMobileMat({ color: 0x78350f, roughness: 0.85 });
  const treadMat2 = createMobileMat({ color: 0x92400e, roughness: 0.85 });
  const postMat = createMobileMat({ color: 0x3f1d0b, roughness: 0.9 });
  const railMat = createMobileMat({ color: 0x5c2b0e, roughness: 0.8 });

  // 1. Inclined Left & Right Stringer Beams
  const stringerLength = 4.8;
  const stringerGeo = new THREE.BoxGeometry(0.24, 0.35, stringerLength);
  stringerGeo.rotateX(-Math.PI * 0.14); // ~25 degree incline matching stair steps

  const stringerL = new THREE.Mesh(stringerGeo, stringerMat);
  stringerL.position.set(-1.3, 1.05, 0);
  stringerL.castShadow = true;
  group.add(stringerL);

  const stringerR = new THREE.Mesh(stringerGeo, stringerMat);
  stringerR.position.set(1.3, 1.05, 0);
  stringerR.castShadow = true;
  group.add(stringerR);

  // 2. Cascading Step Treads (6 steps climbing from Z = -1.9 to +1.9 and Y = 0.22 to 2.05)
  const treadGeo = new THREE.BoxGeometry(2.6, 0.16, 0.75);
  const stepCount = 6;
  for (let s = 0; s < stepCount; s++) {
    const t = s / (stepCount - 1);
    const sz = -1.9 + t * 3.8;
    const sy = 0.22 + t * 1.85;

    const tread = new THREE.Mesh(treadGeo, s % 2 === 0 ? treadMat1 : treadMat2);
    tread.position.set(0, sy, sz);
    tread.castShadow = true;
    tread.receiveShadow = true;
    group.add(tread);

    // Vertical riser backing beneath step
    const riserGeo = new THREE.BoxGeometry(2.5, 0.32, 0.10);
    const riser = new THREE.Mesh(riserGeo, stringerMat);
    riser.position.set(0, sy - 0.14, sz - 0.32);
    riser.castShadow = true;
    group.add(riser);
  }

  // 3. Ground Anchor Stilts beneath top and middle of staircase
  const stiltGeo = new THREE.CylinderGeometry(0.12, 0.14, 2.2, 6);
  const stiltPositions = [
    [-1.25, 0.4, 0.2],
    [1.25, 0.4, 0.2],
    [-1.25, 1.0, 1.6],
    [1.25, 1.0, 1.6],
  ];
  stiltPositions.forEach(([sx, sy, sz]) => {
    const stilt = new THREE.Mesh(stiltGeo, postMat);
    stilt.position.set(sx, sy, sz);
    stilt.castShadow = true;
    group.add(stilt);
  });

  // 4. Handrails along left and right sides
  const railGeo = new THREE.BoxGeometry(0.12, 0.16, stringerLength);
  railGeo.rotateX(-Math.PI * 0.14);

  const railL = new THREE.Mesh(railGeo, railMat);
  railL.position.set(-1.3, 1.85, 0);
  railL.castShadow = true;
  group.add(railL);

  const railR = new THREE.Mesh(railGeo, railMat);
  railR.position.set(1.3, 1.85, 0);
  railR.castShadow = true;
  group.add(railR);

  // Handrail upright balusters
  const balusterGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.9, 6);
  for (let b = 0; b < 3; b++) {
    const bz = -1.6 + b * 1.6;
    const by = 0.65 + b * 0.75;

    const bL = new THREE.Mesh(balusterGeo, postMat);
    bL.position.set(-1.3, by, bz);
    bL.castShadow = true;
    group.add(bL);

    const bR = new THREE.Mesh(balusterGeo, postMat);
    bR.position.set(1.3, by, bz);
    bR.castShadow = true;
    group.add(bR);
  }

  group.add(createContactShadowDisc(3.0));
  return group;
}

/**
 * 18. Stylized Wooden Bridge (Jembatan Kayu Penyeberangan Air - 14 composite parts)
 * Sturdy arched timber bridge with vertical water pilings and safety railings.
 */
export function createWoodenBridge(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wooden_bridge';

  const beamMat = createMobileMat({ color: 0x451a03, roughness: 0.9 });
  const plankMatA = createMobileMat({ color: 0x78350f, roughness: 0.85 });
  const plankMatB = createMobileMat({ color: 0x92400e, roughness: 0.85 });
  const pilingMat = createMobileMat({ color: 0x271406, roughness: 0.95 });
  const railMat = createMobileMat({ color: 0x5c2b0e, roughness: 0.8 });

  // 1. Two Main Support Beams beneath bridge deck (length 7.2)
  const beamGeo = new THREE.BoxGeometry(0.32, 0.45, 7.2);
  const beamL = new THREE.Mesh(beamGeo, beamMat);
  beamL.position.set(-1.45, 0.40, 0);
  beamL.castShadow = true;
  group.add(beamL);

  const beamR = new THREE.Mesh(beamGeo, beamMat);
  beamR.position.set(1.45, 0.40, 0);
  beamR.castShadow = true;
  group.add(beamR);

  // 2. Heavy Timber Water Pilings / Stilts extending down into water (Y from -2.4 to 0.5)
  const pilingGeo = new THREE.CylinderGeometry(0.18, 0.22, 3.2, 7);
  const pilingPositions = [
    [-1.4, -0.7, -2.2],
    [1.4, -0.7, -2.2],
    [-1.4, -0.7, 2.2],
    [1.4, -0.7, 2.2],
  ];
  pilingPositions.forEach(([px, py, pz]) => {
    const piling = new THREE.Mesh(pilingGeo, pilingMat);
    piling.position.set(px, py, pz);
    piling.castShadow = true;
    piling.receiveShadow = true;
    group.add(piling);

    // Cross-brace support ring
    const braceGeo = new THREE.BoxGeometry(3.0, 0.18, 0.22);
    const brace = new THREE.Mesh(braceGeo, beamMat);
    brace.position.set(0, py + 0.6, pz);
    brace.castShadow = true;
    group.add(brace);
  });

  // 3. Arched Deck Planks (9 transverse planks with subtle arch rise in middle)
  const plankGeo = new THREE.BoxGeometry(3.2, 0.18, 0.72);
  const plankCount = 9;
  for (let i = 0; i < plankCount; i++) {
    const t = (i / (plankCount - 1)) * 2 - 1; // -1 to +1
    const pz = t * 3.1;
    // Parabolic arch: bridge center is 0.38m higher than ends
    const archH = (1 - t * t) * 0.38;
    const py = 0.65 + archH;

    const plank = new THREE.Mesh(plankGeo, i % 2 === 0 ? plankMatA : plankMatB);
    plank.position.set(0, py, pz);
    // Slight angle tilt following arch curve
    plank.rotation.x = -t * 0.12;
    plank.castShadow = true;
    plank.receiveShadow = true;
    group.add(plank);
  }

  // 4. Side Safety Railings on left and right
  const railLength = 7.4;
  const railBeamGeo = new THREE.BoxGeometry(0.16, 0.18, railLength);
  const railL = new THREE.Mesh(railBeamGeo, railMat);
  railL.position.set(-1.5, 1.45, 0);
  railL.castShadow = true;
  group.add(railL);

  const railR = new THREE.Mesh(railBeamGeo, railMat);
  railR.position.set(1.5, 1.45, 0);
  railR.castShadow = true;
  group.add(railR);

  // Lower safety rail bar
  const subRailGeo = new THREE.BoxGeometry(0.12, 0.12, railLength);
  const subRailL = new THREE.Mesh(subRailGeo, railMat);
  subRailL.position.set(-1.5, 1.05, 0);
  group.add(subRailL);

  const subRailR = new THREE.Mesh(subRailGeo, railMat);
  subRailR.position.set(1.5, 1.05, 0);
  group.add(subRailR);

  // Railing corner and center posts
  const postGeo = new THREE.CylinderGeometry(0.12, 0.14, 1.3, 6);
  const railPostPositions = [
    [-1.5, 1.25, -3.3],
    [1.5, 1.25, -3.3],
    [-1.5, 1.40, 0.0],
    [1.5, 1.40, 0.0],
    [-1.5, 1.25, 3.3],
    [1.5, 1.25, 3.3],
  ];
  railPostPositions.forEach(([rx, ry, rz]) => {
    const post = new THREE.Mesh(postGeo, beamMat);
    post.position.set(rx, ry, rz);
    post.castShadow = true;
    group.add(post);
  });

  // 5. Entrance Lanterns mounted on corner posts
  const lanternLampGeo = new THREE.OctahedronGeometry(0.24);
  const lanternMat = createMobileMat({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 2.2,
  });

  const lantern1 = new THREE.Mesh(lanternLampGeo, lanternMat);
  lantern1.position.set(-1.5, 1.95, -3.3);
  group.add(lantern1);

  const lantern2 = new THREE.Mesh(lanternLampGeo, lanternMat);
  lantern2.position.set(1.5, 1.95, 3.3);
  group.add(lantern2);

  group.add(createContactShadowDisc(4.2));
  return group;
}

let cachedPathCurbStonesGeo: THREE.BufferGeometry | null = null;
let cachedPathCurbFoliageStoneGeo: THREE.BufferGeometry | null = null;
let cachedPathCurbFoliageGrassGeo: THREE.BufferGeometry | null = null;
let cachedPathCurbFoliageFlowerGeo: THREE.BufferGeometry | null = null;

/**
 * 19. Batu Pembatas Paving (Path Curb Stones - Single Merged Draw Call)
 * Modular solid curb stone blocks with beveled edges and natural river stone finish.
 */
export function createPathCurbStones(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'path_curb_stones';

  if (!cachedPathCurbStonesGeo) {
    const blockGeo = makeFlatShadedGeo(new THREE.BoxGeometry(0.24, 0.14, 0.44));
    cachedPathCurbStonesGeo = mergeGeometriesWithTransforms([
      { geometry: blockGeo, position: [0, 0.07, -0.23] },
      { geometry: blockGeo, position: [0, 0.07, 0.23] },
    ]);
  }

  const stoneMat = createMobileMat({ color: 0xdcd8d0, roughness: 0.70 });
  const block = new THREE.Mesh(cachedPathCurbStonesGeo, stoneMat);
  block.castShadow = false;
  block.receiveShadow = false;
  group.add(block);

  return group;
}

/**
 * 20. Batu Pembatas Paving & Rumput Bunga Alami (Path Curb with Natural Foliage)
 * Highly optimized composite with merged geometries and zero contact shadow discs.
 * Completely eliminates the black rectangular quad artifact on mobile terrain slopes.
 */
export function createPathCurbWithFoliage(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'path_curb_with_foliage';

  // 1. Curb Stones (Merged into 1 geometry)
  if (!cachedPathCurbFoliageStoneGeo) {
    const blockGeo = makeFlatShadedGeo(new THREE.BoxGeometry(0.22, 0.14, 0.44));
    cachedPathCurbFoliageStoneGeo = mergeGeometriesWithTransforms([
      { geometry: blockGeo, position: [-0.06, 0.07, -0.23] },
      { geometry: blockGeo, position: [-0.06, 0.07, 0.23] },
    ]);
  }
  const stoneMat = createMobileMat({ color: 0xdcd8d0, roughness: 0.70 });
  const stones = new THREE.Mesh(cachedPathCurbFoliageStoneGeo, stoneMat);
  stones.castShadow = false;
  stones.receiveShadow = false;
  group.add(stones);

  // 2. Natural Meadow Grass tufts along shoulder (Merged into 1 geometry)
  if (!cachedPathCurbFoliageGrassGeo) {
    const bladeGeo = makeFlatShadedGeo(new THREE.ConeGeometry(0.04, 0.65, 3));
    const grassTransforms = [
      { geometry: bladeGeo, position: [0.15, 0.28, -0.85] as [number, number, number], rotation: [0.2, 0.4, 0.3] as [number, number, number] },
      { geometry: bladeGeo, position: [0.18, 0.28, -0.50] as [number, number, number], rotation: [-0.2, 1.2, 0.4] as [number, number, number] },
      { geometry: bladeGeo, position: [0.14, 0.28, -0.15] as [number, number, number], rotation: [0.3, 2.0, 0.25] as [number, number, number] },
      { geometry: bladeGeo, position: [0.20, 0.28, 0.20] as [number, number, number], rotation: [-0.25, 2.8, 0.35] as [number, number, number] },
      { geometry: bladeGeo, position: [0.16, 0.28, 0.55] as [number, number, number], rotation: [0.15, 3.6, 0.4] as [number, number, number] },
      { geometry: bladeGeo, position: [0.19, 0.28, 0.90] as [number, number, number], rotation: [-0.3, 4.4, 0.3] as [number, number, number] },
    ];
    cachedPathCurbFoliageGrassGeo = mergeGeometriesWithTransforms(grassTransforms);
  }
  const grassMat = createMobileMat({ color: 0x22c55e, roughness: 0.60 });
  const grass = new THREE.Mesh(cachedPathCurbFoliageGrassGeo, grassMat);
  grass.castShadow = false;
  grass.receiveShadow = false;
  group.add(grass);

  // 3. Cheerful Wild Flowers nestled beside curb (Merged into 1 blossom mesh)
  if (!cachedPathCurbFoliageFlowerGeo) {
    const stemGeo = makeFlatShadedGeo(new THREE.CylinderGeometry(0.015, 0.02, 0.35, 4));
    const flowerDomeGeo = makeFlatShadedGeo(new THREE.DodecahedronGeometry(0.09, 0));
    const flowerTransforms = [
      { geometry: stemGeo, position: [0.18, 0.15, -0.65] as [number, number, number] },
      { geometry: flowerDomeGeo, position: [0.18, 0.32, -0.65] as [number, number, number] },
      { geometry: stemGeo, position: [0.22, 0.18, 0.05] as [number, number, number] },
      { geometry: flowerDomeGeo, position: [0.22, 0.36, 0.05] as [number, number, number] },
      { geometry: stemGeo, position: [0.17, 0.16, 0.72] as [number, number, number] },
      { geometry: flowerDomeGeo, position: [0.17, 0.34, 0.72] as [number, number, number] },
    ];
    cachedPathCurbFoliageFlowerGeo = mergeGeometriesWithTransforms(flowerTransforms);
  }
  const flowerMat = createMobileMat({ color: 0xfef08a, roughness: 0.45 });
  const flowers = new THREE.Mesh(cachedPathCurbFoliageFlowerGeo, flowerMat);
  flowers.castShadow = false;
  flowers.receiveShadow = false;
  group.add(flowers);

  // Note: createContactShadowDisc is deliberately omitted to prevent black shadow quads on slopes
  return group;
}

export const STANDARD_PALETTE: PaletteItem[] = [
  {
    id: 'meadow_grass',
    name: 'Rumput Padang',
    category: 'foliage',
    icon: 'Sprout',
    description: 'Rumpun rumput padang hijau segar berlapis bunga liar alami',
    defaultScale: [1, 1, 1],
    badge: 'Rumput',
  },
  {
    id: 'flower_patch',
    name: 'Bunga Padang',
    category: 'foliage',
    icon: 'Flower2',
    description: 'Hamparan semak bunga liar warna-warni penghias padang rumput',
    defaultScale: [1, 1, 1],
    badge: 'Bunga',
  },
  {
    id: 'pine_tree',
    name: 'Alpine Pine',
    category: 'foliage',
    icon: 'TreePine',
    description: 'Stylized evergreen conifer with snow-dusted foliage tiers and trunk',
    defaultScale: [1, 1, 1],
    badge: 'Nature',
  },
  {
    id: 'broadleaf_tree',
    name: 'Canopy Oak',
    category: 'foliage',
    icon: 'Trees',
    description: 'Stylized shade tree with multi-cluster spherical canopy and curved trunk',
    defaultScale: [1, 1, 1],
    badge: 'Nature',
  },
  {
    id: 'cobblestone_path',
    name: 'Cobblestone Trail',
    category: 'path',
    icon: 'Compass',
    description: 'Curved stone paver walkway with rustic mortar and varied slabs',
    defaultScale: [1, 1, 1],
    badge: 'Path',
  },
  {
    id: 'wooden_boardwalk',
    name: 'Wooden Boardwalk',
    category: 'path',
    icon: 'Landmark',
    description: 'Elevated timber bridge walkway with rustic planks and pilot posts',
    defaultScale: [1, 1, 1],
    badge: 'Path',
  },
  {
    id: 'stepping_stones',
    name: 'Stepping Stones',
    category: 'path',
    icon: 'Gem',
    description: 'Cluster of natural slate stepping stones embedded in the soil',
    defaultScale: [1, 1, 1],
    badge: 'Path',
  },
  {
    id: 'trail_signpost',
    name: 'Trail Signpost',
    category: 'path',
    icon: 'Compass',
    description: 'Wooden direction post with orientation signs and warm lantern',
    defaultScale: [1, 1, 1],
    badge: 'Path',
  },
  {
    id: 'wooden_stairs',
    name: 'Tangga Kayu Lereng',
    category: 'path',
    icon: 'Layers',
    description: 'Tangga kayu bersusun otomatis terpasang rapi di lereng bukit curam',
    defaultScale: [1, 1, 1],
    badge: 'Smart Path',
  },
  {
    id: 'wooden_bridge',
    name: 'Jembatan Kayu Air',
    category: 'path',
    icon: 'Landmark',
    description: 'Jembatan kayu lengkung kokoh otomatis melintasi aliran air & teluk',
    defaultScale: [1, 1, 1],
    badge: 'Smart Path',
  },
  {
    id: 'cyber_skyscraper',
    name: 'Neo Cyber Tower',
    category: 'cyber',
    icon: 'Building2',
    description: 'Multi-tiered futuristic highrise with emissive holo-bands and comms mast',
    defaultScale: [1, 1, 1],
    badge: 'Cyber',
  },
  {
    id: 'cyber_apartment',
    name: 'Modular Highrise',
    category: 'cyber',
    icon: 'Building',
    description: 'Staggered residential complex with cantilevered neon pods and helipad',
    defaultScale: [1, 1, 1],
    badge: 'Cyber',
  },
  {
    id: 'stone_windmill',
    name: 'Stone Windmill',
    category: 'building',
    icon: 'Wind',
    description: 'Historic fieldstone mill with conical roof and rotating 4-blade lattice',
    defaultScale: [1, 1, 1],
    badge: 'Animated',
  },
  {
    id: 'island_lighthouse',
    name: 'Coastal Lighthouse',
    category: 'building',
    icon: 'Flame',
    description: 'Striped maritime beacon with observation deck and rotating beam',
    defaultScale: [1, 1, 1],
    badge: 'Maritime',
  },
  {
    id: 'alpine_cottage',
    name: 'Alpine Chalet',
    category: 'building',
    icon: 'Home',
    description: 'Rustic timber lodge with fieldstone base, dormers and stone chimney',
    defaultScale: [1, 1, 1],
    badge: 'Rustic',
  },
  {
    id: 'fantasy_crystal',
    name: 'Resonant Crystal',
    category: 'fantasy',
    icon: 'Gem',
    description: 'Hovering amethyst monolith surrounded by levitating shard rings',
    defaultScale: [1, 1, 1],
    badge: 'Magic',
  },
  {
    id: 'scifi_dome',
    name: 'Biosphere Dome',
    category: 'building',
    icon: 'Compass',
    description: 'Geodesic habitat dome with interior ecosystem and solar arrays',
    defaultScale: [1, 1, 1],
    badge: 'Colony',
  },
  {
    id: 'desert_monolith',
    name: 'Mesa Ruin Arch',
    category: 'prop',
    icon: 'Landmark',
    description: 'Ancient sandstone megaliths with glowing runic brazier',
    defaultScale: [1, 1, 1],
    badge: 'Ancient',
  },
  {
    id: 'wind_turbine',
    name: 'Clean Wind Turbine',
    category: 'prop',
    icon: 'Zap',
    description: 'High-efficiency 3-blade wind turbine generator',
    defaultScale: [1, 1, 1],
    badge: 'Eco',
  },
  {
    id: 'street_lamp',
    name: 'Street Lantern',
    category: 'prop',
    icon: 'Lightbulb',
    description: 'Cast-iron decorative lamppost with warm lighting core',
    defaultScale: [1, 1, 1],
    badge: 'Urban',
  },
  {
    id: 'path_curb_stones',
    name: 'Batu Pembatas Paving',
    category: 'path',
    icon: 'Layers',
    description: 'Blok batu andesit/granit pembatas paving tepi jalan ber-nat gelap rapi',
    defaultScale: [1, 1, 1],
    badge: 'Curb Stone',
  },
  {
    id: 'path_curb_with_foliage',
    name: 'Pembatas & Rumput Bunga',
    category: 'path',
    icon: 'Flower2',
    description: 'Kombinasi batu pembatas paving solid dengan semak rumput & bunga liar alami',
    defaultScale: [1, 1, 1],
    badge: 'Curb & Flower',
  },
];

/**
 * Factory dispatcher to build cloned instance for any model type
 */
export function instantiateModel(type: string): THREE.Group {
  switch (type) {
    case 'path_curb_stones':
      return createPathCurbStones();
    case 'path_curb_with_foliage':
      return createPathCurbWithFoliage();
    case 'cobblestone_path':
      return createCobblestonePath();
    case 'wooden_boardwalk':
      return createWoodenBoardwalk();
    case 'wooden_stairs':
      return createWoodenStairs();
    case 'wooden_bridge':
      return createWoodenBridge();
    case 'stepping_stones':
      return createSteppingStones();
    case 'trail_signpost':
      return createTrailSignpost();
    case 'cyber_skyscraper':
      return createCyberSkyscraper();
    case 'cyber_apartment':
      return createCyberApartment();
    case 'pine_tree':
      return createPineTree();
    case 'broadleaf_tree':
      return createBroadleafTree();
    case 'meadow_grass':
      return createMeadowGrass();
    case 'flower_patch':
      return createFlowerPatch();
    case 'stone_windmill':
      return createStoneWindmill();
    case 'island_lighthouse':
      return createIslandLighthouse();
    case 'alpine_cottage':
      return createAlpineCottage();
    case 'fantasy_crystal':
      return createFantasyCrystal();
    case 'scifi_dome':
      return createSciFiDome();
    case 'desert_monolith':
      return createDesertMonolith();
    case 'wind_turbine':
      return createWindTurbine();
    case 'street_lamp':
      return createStreetLamp();
    default:
      // Fallback stylized composite prop
      return createPineTree();
  }
}
