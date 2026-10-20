import * as THREE from 'three';
import { PaletteItem, FarmPlotStage } from '../types';

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

/**
 * 4b. Stylized Meadow Wild Grass (Rumput Padang Asli)
 * Built with 32+ slender blades arranged organically:
 * - Upright tall blades in center (tegak)
 * - Radially slanted arching blades (serong acak)
 * - Tapered low-poly geometries with rich botanical hue variations
 * - Delicate wild seedhead spikes
 */
export function createMeadowGrass(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'meadow_grass';
  group.userData = { isWindFoliage: true };

  // Natural botanical color spectrum for lush meadow grass
  const matForest = createMobileMat({ color: 0x15803d, roughness: 0.65 });
  const matLush = createMobileMat({ color: 0x16a34a, roughness: 0.60 });
  const matEmerald = createMobileMat({ color: 0x22c55e, roughness: 0.60 });
  const matSpring = createMobileMat({ color: 0x4ade80, roughness: 0.58 });
  const matLime = createMobileMat({ color: 0x84cc16, roughness: 0.55 });
  const matGolden = createMobileMat({ color: 0xa3e635, roughness: 0.55 });
  const matSeed = createMobileMat({ color: 0xd97706, roughness: 0.50 }); // warm seed tip

  // Slender 3-sided tapered grass blade geometries (ultra-fast, precomputed non-indexed normals)
  const bladeTallGeo = makeFlatShadedGeo(new THREE.ConeGeometry(0.045, 1.35, 3));
  const bladeMedGeo = makeFlatShadedGeo(new THREE.ConeGeometry(0.040, 1.05, 3));
  const bladeShortGeo = makeFlatShadedGeo(new THREE.ConeGeometry(0.035, 0.75, 3));
  const bladeTinyGeo = makeFlatShadedGeo(new THREE.ConeGeometry(0.030, 0.50, 3));
  const seedHeadGeo = makeFlatShadedGeo(new THREE.ConeGeometry(0.06, 0.35, 4));

  // Organic cluster: Center upright (tegak), mid-tier slanted (serong), outer low fringe
  const bladeList: {
    geo: THREE.BufferGeometry;
    mat: THREE.Material;
    x: number;
    z: number;
    rotX: number;
    rotZ: number;
    rotY: number;
    scaleY: number;
  }[] = [
    // 1. Central Core - Tegak (Upright & Tall)
    { geo: bladeTallGeo, mat: matForest, x: 0.02, z: -0.01, rotX: 0.04, rotZ: 0.03, rotY: 0.2, scaleY: 1.15 },
    { geo: bladeTallGeo, mat: matLush, x: -0.04, z: 0.03, rotX: -0.05, rotZ: 0.04, rotY: 1.1, scaleY: 1.20 },
    { geo: bladeTallGeo, mat: matEmerald, x: 0.06, z: 0.04, rotX: 0.06, rotZ: -0.05, rotY: 2.3, scaleY: 1.10 },
    { geo: bladeTallGeo, mat: matSpring, x: -0.03, z: -0.05, rotX: -0.04, rotZ: -0.06, rotY: 3.4, scaleY: 1.05 },
    { geo: bladeMedGeo, mat: matLime, x: 0.00, z: 0.07, rotX: 0.09, rotZ: 0.02, rotY: 4.5, scaleY: 1.00 },

    // 2. Mid Ring - Serong (Slanted at varied angles 15° - 35°)
    { geo: bladeMedGeo, mat: matLush, x: 0.14, z: 0.05, rotX: 0.24, rotZ: -0.18, rotY: 0.4, scaleY: 1.02 },
    { geo: bladeMedGeo, mat: matEmerald, x: -0.12, z: 0.08, rotX: 0.28, rotZ: 0.22, rotY: 1.3, scaleY: 0.98 },
    { geo: bladeMedGeo, mat: matLime, x: -0.15, z: -0.10, rotX: -0.26, rotZ: 0.20, rotY: 2.1, scaleY: 1.05 },
    { geo: bladeMedGeo, mat: matForest, x: 0.12, z: -0.12, rotX: -0.22, rotZ: -0.25, rotY: 3.1, scaleY: 0.95 },
    { geo: bladeMedGeo, mat: matGolden, x: 0.08, z: 0.16, rotX: 0.32, rotZ: 0.08, rotY: 4.2, scaleY: 1.00 },
    { geo: bladeMedGeo, mat: matSpring, x: -0.08, z: 0.15, rotX: 0.30, rotZ: -0.12, rotY: 5.2, scaleY: 0.94 },
    { geo: bladeMedGeo, mat: matLush, x: 0.16, z: -0.04, rotX: -0.12, rotZ: -0.32, rotY: 0.8, scaleY: 1.08 },
    { geo: bladeMedGeo, mat: matEmerald, x: -0.17, z: -0.02, rotX: 0.10, rotZ: 0.34, rotY: 2.7, scaleY: 0.97 },

    // 3. Wide Ring - Serong Lebih Miring (Slanted 30° - 48°)
    { geo: bladeShortGeo, mat: matLime, x: 0.22, z: 0.12, rotX: 0.42, rotZ: -0.26, rotY: 0.6, scaleY: 0.90 },
    { geo: bladeShortGeo, mat: matSpring, x: -0.20, z: 0.16, rotX: 0.45, rotZ: 0.30, rotY: 1.5, scaleY: 0.88 },
    { geo: bladeShortGeo, mat: matGolden, x: -0.24, z: -0.14, rotX: -0.40, rotZ: 0.35, rotY: 2.5, scaleY: 0.92 },
    { geo: bladeShortGeo, mat: matEmerald, x: 0.20, z: -0.18, rotX: -0.38, rotZ: -0.36, rotY: 3.6, scaleY: 0.85 },
    { geo: bladeShortGeo, mat: matLush, x: 0.02, z: 0.25, rotX: 0.48, rotZ: 0.06, rotY: 4.7, scaleY: 0.93 },
    { geo: bladeShortGeo, mat: matForest, x: -0.04, z: -0.24, rotX: -0.46, rotZ: -0.08, rotY: 5.8, scaleY: 0.89 },
    { geo: bladeShortGeo, mat: matLime, x: 0.24, z: -0.02, rotX: 0.05, rotZ: -0.45, rotY: 0.1, scaleY: 0.91 },
    { geo: bladeShortGeo, mat: matGolden, x: -0.25, z: 0.04, rotX: -0.04, rotZ: 0.48, rotY: 1.9, scaleY: 0.87 },

    // 4. Low Outer Fringe - Rebah Acak (Tiny shoots hugging soil)
    { geo: bladeTinyGeo, mat: matEmerald, x: 0.30, z: 0.10, rotX: 0.55, rotZ: -0.35, rotY: 0.9, scaleY: 0.80 },
    { geo: bladeTinyGeo, mat: matSpring, x: -0.28, z: 0.18, rotX: 0.52, rotZ: 0.42, rotY: 1.8, scaleY: 0.85 },
    { geo: bladeTinyGeo, mat: matLush, x: -0.29, z: -0.16, rotX: -0.50, rotZ: 0.45, rotY: 2.8, scaleY: 0.78 },
    { geo: bladeTinyGeo, mat: matLime, x: 0.28, z: -0.22, rotX: -0.48, rotZ: -0.44, rotY: 3.9, scaleY: 0.82 },
    { geo: bladeTinyGeo, mat: matForest, x: 0.05, z: 0.32, rotX: 0.58, rotZ: 0.10, rotY: 5.0, scaleY: 0.75 },
    { geo: bladeTinyGeo, mat: matGolden, x: -0.06, z: -0.30, rotX: -0.56, rotZ: -0.12, rotY: 6.0, scaleY: 0.80 },
    { geo: bladeTinyGeo, mat: matEmerald, x: 0.15, z: 0.28, rotX: 0.54, rotZ: -0.20, rotY: 1.2, scaleY: 0.85 },
    { geo: bladeTinyGeo, mat: matSpring, x: -0.18, z: -0.26, rotX: -0.52, rotZ: 0.25, rotY: 3.5, scaleY: 0.77 },
  ];

  bladeList.forEach((b) => {
    const mesh = new THREE.Mesh(b.geo, b.mat);
    mesh.position.set(b.x, (0.5 * b.scaleY * (b.geo === bladeTallGeo ? 1.35 : b.geo === bladeMedGeo ? 1.05 : 0.75)) * 0.9, b.z);
    mesh.rotation.set(b.rotX, b.rotY, b.rotZ);
    mesh.scale.set(0.9, b.scaleY, 1.2);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    group.add(mesh);
  });

  // Tall Meadow Seedhead Stalks (Bulir Rumput Padang)
  const seedStalkGeo = makeFlatShadedGeo(new THREE.CylinderGeometry(0.015, 0.02, 1.45, 3));
  const stalk1 = new THREE.Mesh(seedStalkGeo, matForest);
  stalk1.position.set(0.08, 0.70, -0.05);
  stalk1.rotation.set(0.12, 0.5, -0.10);
  stalk1.castShadow = false;
  stalk1.receiveShadow = false;
  stalk1.frustumCulled = true;
  group.add(stalk1);

  const head1 = new THREE.Mesh(seedHeadGeo, matSeed);
  head1.position.set(0.14, 1.42, -0.09);
  head1.rotation.set(0.18, 0.5, -0.14);
  head1.castShadow = false;
  head1.receiveShadow = false;
  head1.frustumCulled = true;
  group.add(head1);

  const stalk2 = new THREE.Mesh(seedStalkGeo, matLush);
  stalk2.position.set(-0.06, 0.65, 0.06);
  stalk2.rotation.set(-0.10, 2.2, 0.14);
  stalk2.castShadow = false;
  stalk2.receiveShadow = false;
  stalk2.frustumCulled = true;
  group.add(stalk2);

  const head2 = new THREE.Mesh(seedHeadGeo, matSeed);
  head2.position.set(-0.11, 1.35, 0.11);
  head2.rotation.set(-0.14, 2.2, 0.18);
  head2.castShadow = false;
  head2.receiveShadow = false;
  head2.frustumCulled = true;
  group.add(head2);

  return group;
}

/**
 * 4c. Stylized Wildflower Patch with Intertwined Meadow Grass (Bunga Padang & Rumput Liar)
 * Organically blends colourful wildflowers rising directly between and overlapping with
 * random meadow grass blades (tumpang tindih dengan rumput acak).
 */
export function createFlowerPatch(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'flower_patch';
  group.userData = { isWindFoliage: true };

  // 1. Botanical materials for base grass blades
  const matGrassDark = createMobileMat({ color: 0x15803d, roughness: 0.65 });
  const matGrassMid = createMobileMat({ color: 0x16a34a, roughness: 0.60 });
  const matGrassBright = createMobileMat({ color: 0x22c55e, roughness: 0.60 });
  const matGrassLime = createMobileMat({ color: 0x84cc16, roughness: 0.55 });
  const matStem = createMobileMat({ color: 0x22c55e, roughness: 0.60 });

  // Blade geometries for intermixed grass
  const grassTallGeo = makeFlatShadedGeo(new THREE.ConeGeometry(0.040, 1.25, 3));
  const grassMedGeo = makeFlatShadedGeo(new THREE.ConeGeometry(0.035, 0.95, 3));
  const grassShortGeo = makeFlatShadedGeo(new THREE.ConeGeometry(0.030, 0.65, 3));

  // Dense randomized grass blades intertwining throughout the flower patch
  const grassConfigs = [
    // Center & mid grass blades surrounding flower stems
    { geo: grassTallGeo, mat: matGrassDark, x: 0.02, z: 0.01, rotX: 0.05, rotZ: 0.04, rotY: 0.3, scaleY: 1.1 },
    { geo: grassTallGeo, mat: matGrassMid, x: -0.06, z: 0.08, rotX: 0.12, rotZ: -0.15, rotY: 1.2, scaleY: 1.15 },
    { geo: grassTallGeo, mat: matGrassBright, x: 0.09, z: -0.07, rotX: -0.14, rotZ: 0.12, rotY: 2.1, scaleY: 1.05 },
    { geo: grassMedGeo, mat: matGrassLime, x: -0.12, z: -0.08, rotX: -0.22, rotZ: -0.18, rotY: 3.0, scaleY: 1.0 },
    { geo: grassMedGeo, mat: matGrassMid, x: 0.15, z: 0.12, rotX: 0.25, rotZ: 0.16, rotY: 3.9, scaleY: 0.95 },
    { geo: grassMedGeo, mat: matGrassBright, x: -0.18, z: 0.14, rotX: 0.28, rotZ: -0.22, rotY: 4.8, scaleY: 1.05 },
    { geo: grassMedGeo, mat: matGrassDark, x: 0.18, z: -0.14, rotX: -0.24, rotZ: 0.26, rotY: 5.7, scaleY: 0.92 },
    { geo: grassMedGeo, mat: matGrassLime, x: 0.04, z: 0.22, rotX: 0.34, rotZ: 0.05, rotY: 0.7, scaleY: 0.98 },
    { geo: grassMedGeo, mat: matGrassMid, x: -0.05, z: -0.22, rotX: -0.32, rotZ: -0.07, rotY: 1.9, scaleY: 1.02 },
    // Outer angled grass blades leaning outward
    { geo: grassShortGeo, mat: matGrassBright, x: 0.25, z: 0.05, rotX: 0.38, rotZ: 0.32, rotY: 0.4, scaleY: 0.9 },
    { geo: grassShortGeo, mat: matGrassLime, x: -0.24, z: -0.06, rotX: -0.35, rotZ: -0.36, rotY: 1.6, scaleY: 0.88 },
    { geo: grassShortGeo, mat: matGrassDark, x: 0.22, z: 0.22, rotX: 0.42, rotZ: -0.25, rotY: 2.7, scaleY: 0.85 },
    { geo: grassShortGeo, mat: matGrassMid, x: -0.20, z: 0.24, rotX: 0.44, rotZ: 0.28, rotY: 3.8, scaleY: 0.92 },
    { geo: grassShortGeo, mat: matGrassBright, x: -0.22, z: -0.20, rotX: -0.40, rotZ: 0.32, rotY: 4.9, scaleY: 0.87 },
    { geo: grassShortGeo, mat: matGrassLime, x: 0.20, z: -0.24, rotX: -0.38, rotZ: -0.30, rotY: 5.9, scaleY: 0.85 },
    { geo: grassShortGeo, mat: matGrassMid, x: 0.00, z: 0.32, rotX: 0.50, rotZ: 0.04, rotY: 0.1, scaleY: 0.82 },
    { geo: grassShortGeo, mat: matGrassDark, x: 0.02, z: -0.30, rotX: -0.48, rotZ: -0.06, rotY: 2.4, scaleY: 0.80 },
    { geo: grassShortGeo, mat: matGrassBright, x: 0.32, z: -0.08, rotX: -0.15, rotZ: 0.52, rotY: 3.3, scaleY: 0.78 },
    { geo: grassShortGeo, mat: matGrassLime, x: -0.30, z: 0.08, rotX: 0.18, rotZ: -0.50, rotY: 4.5, scaleY: 0.80 },
  ];

  grassConfigs.forEach((g) => {
    const blade = new THREE.Mesh(g.geo, g.mat);
    blade.position.set(g.x, (0.5 * g.scaleY * (g.geo === grassTallGeo ? 1.25 : g.geo === grassMedGeo ? 0.95 : 0.65)) * 0.9, g.z);
    blade.rotation.set(g.rotX, g.rotY, g.rotZ);
    blade.scale.set(0.85, g.scaleY, 1.15);
    blade.castShadow = false;
    blade.receiveShadow = false;
    blade.frustumCulled = true;
    group.add(blade);
  });

  // 2. Wildflower Color Materials (Natural meadow blossoms)
  const flowerMatWhite = createMobileMat({ color: 0xffffff, roughness: 0.35, metalness: 0.02 });
  const flowerMatYellow = createMobileMat({ color: 0xfacc15, roughness: 0.30, metalness: 0.05 });
  const flowerMatOrange = createMobileMat({ color: 0xf97316, roughness: 0.35, metalness: 0.05 });
  const flowerMatRose = createMobileMat({ color: 0xf43f5e, roughness: 0.35, metalness: 0.03 });
  const flowerMatPurple = createMobileMat({ color: 0xa855f7, roughness: 0.35, metalness: 0.04 });
  const flowerMatBlue = createMobileMat({ color: 0x38bdf8, roughness: 0.35, metalness: 0.03 });
  const flowerMatLavender = createMobileMat({ color: 0xc084fc, roughness: 0.35, metalness: 0.03 });
  const centerMatGold = createMobileMat({ color: 0xeab308, roughness: 0.40 });
  const centerMatAmber = createMobileMat({ color: 0xb45309, roughness: 0.40 });
  const leafMat = createMobileMat({ color: 0x16a34a, roughness: 0.60 });

  // Reusable flower geometries
  const stemGeo = makeFlatShadedGeo(new THREE.CylinderGeometry(0.022, 0.028, 0.85, 4));
  const shortStemGeo = makeFlatShadedGeo(new THREE.CylinderGeometry(0.020, 0.025, 0.55, 4));
  const petalDiscGeo = makeFlatShadedGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 6));
  const blossomDomeGeo = makeFlatShadedGeo(new THREE.DodecahedronGeometry(0.13, 0));
  const centerPollenGeo = makeFlatShadedGeo(new THREE.DodecahedronGeometry(0.065, 0));
  const stemLeafGeo = makeFlatShadedGeo(new THREE.ConeGeometry(0.03, 0.16, 3));

  // Helper to add a realistic wildflower nestled among grass
  const addWildflower = (
    stemX: number,
    stemZ: number,
    height: number,
    tiltX: number,
    tiltZ: number,
    petalMat: THREE.Material,
    centerMat: THREE.Material,
    isDaisy = true
  ) => {
    // 1. Curved/angled stem
    const currentStemGeo = height > 0.7 ? stemGeo : shortStemGeo;
    const stem = new THREE.Mesh(currentStemGeo, matStem);
    stem.position.set(stemX, height * 0.48, stemZ);
    stem.rotation.set(tiltX, Math.random() * Math.PI, tiltZ);
    stem.scale.set(1.0, height / 0.85, 1.0);
    stem.castShadow = false;
    stem.receiveShadow = false;
    stem.frustumCulled = true;
    group.add(stem);

    // Stem leaf node nestled in grass
    const leaf = new THREE.Mesh(stemLeafGeo, leafMat);
    leaf.position.set(stemX + tiltX * 0.2, height * 0.35, stemZ + tiltZ * 0.2);
    leaf.rotation.set(tiltX + 0.6, Math.random() * Math.PI, tiltZ);
    leaf.frustumCulled = true;
    group.add(leaf);

    // Blossom position at the stem tip
    const blossomY = height * 0.94;
    const blossomX = stemX + tiltZ * (height * 0.35);
    const blossomZ = stemZ - tiltX * (height * 0.35);

    if (isDaisy) {
      // Petal wheel (daisy / chamomile / buttercup)
      const petals = new THREE.Mesh(petalDiscGeo, petalMat);
      petals.position.set(blossomX, blossomY, blossomZ);
      petals.rotation.set(tiltX * 0.8 + 0.1, Math.random() * Math.PI, tiltZ * 0.8);
      petals.castShadow = false;
      petals.receiveShadow = false;
      petals.frustumCulled = true;
      group.add(petals);

      // Golden center pollen dome
      const pollen = new THREE.Mesh(centerPollenGeo, centerMat);
      pollen.position.set(blossomX, blossomY + 0.03, blossomZ);
      pollen.castShadow = false;
      pollen.receiveShadow = false;
      pollen.frustumCulled = true;
      group.add(pollen);
    } else {
      // Rounded multi-faceted blossom (poppy / rose / cornflower)
      const flowerDome = new THREE.Mesh(blossomDomeGeo, petalMat);
      flowerDome.position.set(blossomX, blossomY, blossomZ);
      flowerDome.rotation.set(tiltX * 0.6, Math.random() * Math.PI, tiltZ * 0.6);
      flowerDome.scale.set(1.15, 0.95, 1.15);
      flowerDome.castShadow = false;
      flowerDome.receiveShadow = false;
      flowerDome.frustumCulled = true;
      group.add(flowerDome);

      const pollen = new THREE.Mesh(centerPollenGeo, centerMat);
      pollen.position.set(blossomX, blossomY + 0.05, blossomZ);
      pollen.castShadow = false;
      pollen.receiveShadow = false;
      pollen.frustumCulled = true;
      group.add(pollen);
    }
  };

  // 8 distinct wildflowers placed across the clump at varied heights, nested within the grass blades:
  // 1. Tall White Chamomile Daisy (rising slightly above center grass)
  addWildflower(0.08, 0.05, 0.92, 0.12, -0.15, flowerMatWhite, centerMatGold, true);

  // 2. Bright Golden Buttercup (mid height, framed by blades)
  addWildflower(-0.10, 0.12, 0.82, 0.18, 0.20, flowerMatYellow, centerMatAmber, true);

  // 3. Scarlet Wild Poppy (vivid blossom peeking through side grass)
  addWildflower(0.16, -0.08, 0.76, -0.20, -0.18, flowerMatRose, centerMatAmber, false);

  // 4. Sky Blue Alpine Blossom (delicate pastel petals)
  addWildflower(-0.14, -0.12, 0.88, -0.15, 0.18, flowerMatBlue, centerMatGold, true);

  // 5. Lavender Wildflower (tall elegant floret)
  addWildflower(0.02, 0.18, 0.96, 0.22, 0.05, flowerMatLavender, centerMatGold, false);

  // 6. Warm Orange Meadow Bloom (low nestled in grass blades)
  addWildflower(-0.04, -0.16, 0.62, -0.25, -0.10, flowerMatOrange, centerMatAmber, true);

  // 7. Small White Daisy (tucked in front fringe)
  addWildflower(0.20, 0.10, 0.68, 0.26, -0.22, flowerMatWhite, centerMatGold, true);

  // 8. Soft Purple Cornflower (side leaning blossom)
  addWildflower(-0.18, 0.02, 0.72, 0.05, 0.28, flowerMatPurple, centerMatGold, false);

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

/**
 * 19. Batu Pembatas Paving (Path Curb Stones - 8 composite parts)
 * Modular solid curb stone blocks with beveled edges and dark mortar joints.
 */
export function createPathCurbStones(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'path_curb_stones';

  const stoneMatA = createMobileMat({ color: 0x526075, roughness: 0.85, metalness: 0.08 });
  const stoneMatB = createMobileMat({ color: 0x475569, roughness: 0.88, metalness: 0.06 });
  const skirtMat = createMobileMat({ color: 0x334155, roughness: 0.95 });

  // Subterranean foundation skirt (anchors deep into slope so underside never floats in air)
  const skirtGeo = new THREE.BoxGeometry(0.28, 0.28, 0.92);
  const skirt = new THREE.Mesh(skirtGeo, skirtMat);
  skirt.position.set(0, -0.06, 0);
  skirt.receiveShadow = true;
  group.add(skirt);

  // 2 compact beveled curb blocks (0.42m each = 0.88m total length)
  const blockGeo = makeFlatShadedGeo(new THREE.BoxGeometry(0.24, 0.16, 0.42));
  const zPositions = [-0.22, 0.22];

  zPositions.forEach((zp, idx) => {
    const block = new THREE.Mesh(blockGeo, idx % 2 === 0 ? stoneMatA : stoneMatB);
    block.position.set(0, 0.08, zp);
    block.castShadow = true;
    block.receiveShadow = true;
    group.add(block);
  });

  return group;
}

/**
 * 20. Batu Pembatas Paving & Rumput Bunga Alami (Path Curb with Natural Foliage)
 * Combines granite curb stones with lush wildflower clusters firmly grounded.
 */
export function createPathCurbWithFoliage(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'path_curb_with_foliage';

  const stoneMatA = createMobileMat({ color: 0x526075, roughness: 0.85 });
  const stoneMatB = createMobileMat({ color: 0x475569, roughness: 0.88 });
  const skirtMat = createMobileMat({ color: 0x334155, roughness: 0.95 });

  // Subterranean anchor skirt
  const skirtGeo = new THREE.BoxGeometry(0.32, 0.28, 0.92);
  const skirt = new THREE.Mesh(skirtGeo, skirtMat);
  skirt.position.set(-0.02, -0.06, 0);
  skirt.receiveShadow = true;
  group.add(skirt);

  // 2 curb stone blocks
  const blockGeo = makeFlatShadedGeo(new THREE.BoxGeometry(0.22, 0.16, 0.42));
  const zPositions = [-0.22, 0.22];

  zPositions.forEach((zp, idx) => {
    const block = new THREE.Mesh(blockGeo, idx % 2 === 0 ? stoneMatA : stoneMatB);
    block.position.set(-0.06, 0.08, zp);
    block.castShadow = true;
    block.receiveShadow = true;
    group.add(block);
  });

  // 2. Natural Meadow Grass tufts along the outer shoulder (X = +0.16)
  const grassMatLush = createMobileMat({ color: 0x16a34a, roughness: 0.65 });
  const grassMatLime = createMobileMat({ color: 0x84cc16, roughness: 0.60 });
  const grassMatSpring = createMobileMat({ color: 0x4ade80, roughness: 0.58 });
  const bladeGeo = makeFlatShadedGeo(new THREE.ConeGeometry(0.04, 0.65, 3));

  const grassOffsets = [
    { x: 0.15, z: -0.85, rotX: 0.2, rotZ: 0.3, mat: grassMatLush },
    { x: 0.18, z: -0.50, rotX: -0.2, rotZ: 0.4, mat: grassMatLime },
    { x: 0.14, z: -0.15, rotX: 0.3, rotZ: 0.25, mat: grassMatSpring },
    { x: 0.20, z: 0.20, rotX: -0.25, rotZ: 0.35, mat: grassMatLush },
    { x: 0.16, z: 0.55, rotX: 0.15, rotZ: 0.4, mat: grassMatLime },
    { x: 0.19, z: 0.90, rotX: -0.3, rotZ: 0.3, mat: grassMatSpring },
  ];

  grassOffsets.forEach((g) => {
    const blade = new THREE.Mesh(bladeGeo, g.mat);
    blade.position.set(g.x, 0.28, g.z);
    blade.rotation.set(g.rotX, Math.random() * Math.PI, g.rotZ);
    blade.castShadow = false;
    group.add(blade);
  });

  // 3. Cheerful Wild Flowers nestled beside the curb stones
  const flowerStemMat = createMobileMat({ color: 0x15803d, roughness: 0.8 });
  const flowerCenterMat = createMobileMat({ color: 0xfbbf24, roughness: 0.4 });
  const flowerPinkMat = createMobileMat({ color: 0xf472b6, roughness: 0.5 });
  const flowerWhiteMat = createMobileMat({ color: 0xf8fafc, roughness: 0.5 });
  const flowerYellowMat = createMobileMat({ color: 0xfacc15, roughness: 0.4 });

  const petalGeo = makeFlatShadedGeo(new THREE.SphereGeometry(0.075, 5, 4));
  const centerGeo = makeFlatShadedGeo(new THREE.SphereGeometry(0.06, 5, 4));
  const stemGeo = makeFlatShadedGeo(new THREE.CylinderGeometry(0.015, 0.02, 0.35, 4));

  const flowerPositions = [
    { x: 0.18, z: -0.65, y: 0.30, petalMat: flowerPinkMat },
    { x: 0.22, z: 0.05, y: 0.34, petalMat: flowerYellowMat },
    { x: 0.17, z: 0.72, y: 0.32, petalMat: flowerWhiteMat },
  ];

  flowerPositions.forEach((fl) => {
    // Stem
    const stem = new THREE.Mesh(stemGeo, flowerStemMat);
    stem.position.set(fl.x, fl.y - 0.15, fl.z);
    group.add(stem);

    // Yellow Core
    const center = new THREE.Mesh(centerGeo, flowerCenterMat);
    center.position.set(fl.x, fl.y, fl.z);
    group.add(center);

    // Petals around center
    for (let p = 0; p < 4; p++) {
      const angle = (p / 4) * Math.PI * 2;
      const petal = new THREE.Mesh(petalGeo, fl.petalMat);
      petal.position.set(fl.x + Math.cos(angle) * 0.09, fl.y, fl.z + Math.sin(angle) * 0.09);
      group.add(petal);
    }
  });

  group.add(createContactShadowDisc(1.8));
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
