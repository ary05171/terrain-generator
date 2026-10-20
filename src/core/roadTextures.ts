import * as THREE from 'three';

/**
 * Procedural 2D Texture Generator for Classic Natural Stone Cobblestone Paving
 * (Batu Alam Paving Cobblestone Klasik)
 *
 * Generates seamless, high-resolution 2D diffuse, bump, and roughness maps
 * designed specifically for curved paths and road ribbons to prevent boxy
 * or jagged pixelation on terrain curves.
 */

let cachedDiffuseTexture: THREE.CanvasTexture | null = null;
let cachedBumpTexture: THREE.CanvasTexture | null = null;
let cachedRoughnessTexture: THREE.CanvasTexture | null = null;

// PRNG for deterministic texture generation
function createPrng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function generateClassicCobblestoneCanvases(size = 1024): {
  diffuseCanvas: HTMLCanvasElement;
  bumpCanvas: HTMLCanvasElement;
  roughnessCanvas: HTMLCanvasElement;
} {
  const diffuseCanvas = document.createElement('canvas');
  diffuseCanvas.width = size;
  diffuseCanvas.height = size;
  const ctx = diffuseCanvas.getContext('2d', { willReadFrequently: true })!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d', { willReadFrequently: true })!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d', { willReadFrequently: true })!;

  const prng = createPrng(48291);

  // 1. Dark weathered mortar foundation background
  ctx.fillStyle = '#22201d';
  ctx.fillRect(0, 0, size, size);

  bumpCtx.fillStyle = '#111111'; // Low depth for mortar joints
  bumpCtx.fillRect(0, 0, size, size);

  roughCtx.fillStyle = '#e5e5e5'; // Very rough mortar grout
  roughCtx.fillRect(0, 0, size, size);

  // Micro-grit specks in mortar
  const mortarImg = ctx.getImageData(0, 0, size, size);
  const mortarData = mortarImg.data;
  for (let i = 0; i < mortarData.length; i += 4) {
    const n = (prng() - 0.5) * 18;
    mortarData[i] = Math.max(0, Math.min(255, mortarData[i] + n));
    mortarData[i + 1] = Math.max(0, Math.min(255, mortarData[i + 1] + n));
    mortarData[i + 2] = Math.max(0, Math.min(255, mortarData[i + 2] + n));
  }
  ctx.putImageData(mortarImg, 0, 0);

  // 2. Cobblestone Pavers Configuration
  // Rows across V, pavers along U.
  const rowCount = 20;
  const rowHeight = size / rowCount;

  // Natural stone color variations (andesite, basalt, warm granite, slate)
  const baseStonePalettes = [
    { r: 128, g: 122, b: 114 }, // Warm Granite Grey
    { r: 145, g: 139, b: 130 }, // Light Andesite
    { r: 112, g: 108, b: 102 }, // Weathered Basalt
    { r: 102, g: 98, b: 92 },   // Deep Slate
    { r: 138, g: 130, b: 118 }, // River Pebble
    { r: 154, g: 146, b: 136 }, // Sunlit Sandstone Grey
    { r: 118, g: 115, b: 110 }, // Ash Stone
  ];

  for (let r = 0; r < rowCount; r++) {
    const yTop = r * rowHeight;
    const isOdd = r % 2 === 1;
    // Staggered running bond offset
    const rowOffset = isOdd ? rowHeight * 0.75 : 0;
    let curX = -rowHeight * 1.5 + (rowOffset % rowHeight);

    while (curX < size + rowHeight * 1.5) {
      // Irregular stone paver width and slight height variation
      const stoneW = rowHeight * (1.1 + prng() * 0.7);
      const stoneH = rowHeight * (0.82 + prng() * 0.12);
      const jointW = Math.max(3.5, rowHeight * 0.11);
      const jointH = Math.max(3.5, rowHeight * 0.11);

      const paverX = curX + jointW * 0.5;
      const paverY = yTop + (rowHeight - stoneH) * 0.5;
      const paverW = stoneW - jointW;
      const paverH = stoneH - jointH;

      if (paverW > 6 && paverH > 6) {
        // Pick base stone color
        const colorIdx = Math.floor(prng() * baseStonePalettes.length);
        const baseColor = baseStonePalettes[colorIdx];
        const toneShift = (prng() - 0.5) * 22;
        const sr = Math.max(0, Math.min(255, Math.round(baseColor.r + toneShift)));
        const sg = Math.max(0, Math.min(255, Math.round(baseColor.g + toneShift)));
        const sb = Math.max(0, Math.min(255, Math.round(baseColor.b + toneShift)));

        // Corner rounding radius for tumbled natural stone
        const cornerRadius = Math.min(10, Math.min(paverW, paverH) * 0.28);

        // A. Draw diffuse paver with 3D convex paver radial gradient
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(paverX, paverY, paverW, paverH, cornerRadius);
        ctx.clip();

        // 3D convex crown radial gradient
        const grad = ctx.createRadialGradient(
          paverX + paverW * 0.45,
          paverY + paverH * 0.40,
          paverW * 0.1,
          paverX + paverW * 0.5,
          paverY + paverH * 0.5,
          Math.max(paverW, paverH) * 0.65
        );
        grad.addColorStop(0, `rgb(${Math.min(255, sr + 28)}, ${Math.min(255, sg + 28)}, ${Math.min(255, sb + 28)})`);
        grad.addColorStop(0.7, `rgb(${sr}, ${sg}, ${sb})`);
        grad.addColorStop(1, `rgb(${Math.max(0, sr - 32)}, ${Math.max(0, sg - 32)}, ${Math.max(0, sb - 32)})`);

        ctx.fillStyle = grad;
        ctx.fillRect(paverX, paverY, paverW, paverH);

        // Top-left sunlit bevel rim
        ctx.lineWidth = 2.0;
        ctx.strokeStyle = `rgba(255, 255, 255, 0.22)`;
        ctx.beginPath();
        ctx.moveTo(paverX + cornerRadius, paverY + 1.5);
        ctx.lineTo(paverX + paverW - cornerRadius, paverY + 1.5);
        ctx.stroke();

        // Bottom-right shadow bevel rim
        ctx.strokeStyle = `rgba(0, 0, 0, 0.45)`;
        ctx.beginPath();
        ctx.moveTo(paverX + cornerRadius, paverY + paverH - 1.5);
        ctx.lineTo(paverX + paverW - cornerRadius, paverY + paverH - 1.5);
        ctx.stroke();

        ctx.restore();

        // B. Bump map: high center, mid edges, low mortar
        bumpCtx.save();
        bumpCtx.beginPath();
        bumpCtx.roundRect(paverX, paverY, paverW, paverH, cornerRadius);
        bumpCtx.clip();

        const bumpGrad = bumpCtx.createRadialGradient(
          paverX + paverW * 0.5,
          paverY + paverH * 0.5,
          paverW * 0.05,
          paverX + paverW * 0.5,
          paverY + paverH * 0.5,
          Math.max(paverW, paverH) * 0.6
        );
        bumpGrad.addColorStop(0, '#f2f2f2'); // Peak height at stone center
        bumpGrad.addColorStop(0.75, '#b0b0b0');
        bumpGrad.addColorStop(1, '#555555'); // Tumbled edge bevel

        bumpCtx.fillStyle = bumpGrad;
        bumpCtx.fillRect(paverX, paverY, paverW, paverH);
        bumpCtx.restore();

        // C. Roughness map: smooth polished center, rougher bevel
        roughCtx.save();
        roughCtx.beginPath();
        roughCtx.roundRect(paverX, paverY, paverW, paverH, cornerRadius);
        roughCtx.clip();

        const roughGrad = roughCtx.createRadialGradient(
          paverX + paverW * 0.5,
          paverY + paverH * 0.5,
          paverW * 0.1,
          paverX + paverW * 0.5,
          paverY + paverH * 0.5,
          Math.max(paverW, paverH) * 0.6
        );
        roughGrad.addColorStop(0, '#999999'); // Polished stone top (~0.60 roughness)
        roughGrad.addColorStop(1, '#c0c0c0'); // Tumbled stone edges (~0.75 roughness)

        roughCtx.fillStyle = roughGrad;
        roughCtx.fillRect(paverX, paverY, paverW, paverH);
        roughCtx.restore();
      }

      curX += stoneW;
    }
  }

  // 3. Fine mineral micro-noise across the entire diffuse map for tactile authenticity
  const finalDiffuse = ctx.getImageData(0, 0, size, size);
  const dData = finalDiffuse.data;
  for (let i = 0; i < dData.length; i += 4) {
    const grain = (prng() - 0.5) * 14;
    dData[i] = Math.max(0, Math.min(255, dData[i] + grain));
    dData[i + 1] = Math.max(0, Math.min(255, dData[i + 1] + grain));
    dData[i + 2] = Math.max(0, Math.min(255, dData[i + 2] + grain));
  }
  ctx.putImageData(finalDiffuse, 0, 0);

  // 4. Subtle lateral shoulder edge darkening on the extreme borders (U = 0 and U = 1)
  // This smoothly blends the road mesh edge into the curb stone foundation.
  const edgeGrad = ctx.createLinearGradient(0, 0, size, 0);
  edgeGrad.addColorStop(0, 'rgba(25, 23, 20, 0.45)');
  edgeGrad.addColorStop(0.04, 'rgba(25, 23, 20, 0.0)');
  edgeGrad.addColorStop(0.96, 'rgba(25, 23, 20, 0.0)');
  edgeGrad.addColorStop(1.0, 'rgba(25, 23, 20, 0.45)');
  ctx.fillStyle = edgeGrad;
  ctx.fillRect(0, 0, size, size);

  return { diffuseCanvas, bumpCanvas, roughnessCanvas: roughCanvas };
}

/**
 * Returns singleton THREE.CanvasTexture for Classic Cobblestone Diffuse Map
 */
export function getClassicCobblestoneTexture(): THREE.CanvasTexture {
  if (cachedDiffuseTexture) return cachedDiffuseTexture;

  const { diffuseCanvas, bumpCanvas, roughnessCanvas } = generateClassicCobblestoneCanvases(1024);

  cachedDiffuseTexture = new THREE.CanvasTexture(diffuseCanvas);
  cachedDiffuseTexture.wrapS = THREE.RepeatWrapping;
  cachedDiffuseTexture.wrapT = THREE.RepeatWrapping;
  cachedDiffuseTexture.generateMipmaps = true;
  cachedDiffuseTexture.minFilter = THREE.LinearMipmapLinearFilter;
  cachedDiffuseTexture.magFilter = THREE.LinearFilter;
  cachedDiffuseTexture.anisotropy = 4;
  cachedDiffuseTexture.needsUpdate = true;

  cachedBumpTexture = new THREE.CanvasTexture(bumpCanvas);
  cachedBumpTexture.wrapS = THREE.RepeatWrapping;
  cachedBumpTexture.wrapT = THREE.RepeatWrapping;
  cachedBumpTexture.generateMipmaps = true;
  cachedBumpTexture.minFilter = THREE.LinearMipmapLinearFilter;
  cachedBumpTexture.magFilter = THREE.LinearFilter;
  cachedBumpTexture.anisotropy = 4;
  cachedBumpTexture.needsUpdate = true;

  cachedRoughnessTexture = new THREE.CanvasTexture(roughnessCanvas);
  cachedRoughnessTexture.wrapS = THREE.RepeatWrapping;
  cachedRoughnessTexture.wrapT = THREE.RepeatWrapping;
  cachedRoughnessTexture.generateMipmaps = true;
  cachedRoughnessTexture.minFilter = THREE.LinearMipmapLinearFilter;
  cachedRoughnessTexture.magFilter = THREE.LinearFilter;
  cachedRoughnessTexture.anisotropy = 4;
  cachedRoughnessTexture.needsUpdate = true;

  return cachedDiffuseTexture;
}

export function getClassicCobblestoneBumpMap(): THREE.CanvasTexture {
  if (!cachedBumpTexture) {
    getClassicCobblestoneTexture();
  }
  return cachedBumpTexture!;
}

export function getClassicCobblestoneRoughnessMap(): THREE.CanvasTexture {
  if (!cachedRoughnessTexture) {
    getClassicCobblestoneTexture();
  }
  return cachedRoughnessTexture!;
}

export interface RoadTexturePreset {
  id: string;
  name: string;
  desc: string;
  badge: string;
  previewColor: string;
}

export const ROAD_TEXTURE_PRESETS: RoadTexturePreset[] = [
  {
    id: 'classic_cobblestone',
    name: 'Batu Alam Cobblestone',
    desc: 'Batu andesit bulat alami dengan nat gelap klasik',
    badge: 'Cobble',
    previewColor: '#78716c',
  },
  {
    id: 'modern_pavers',
    name: 'Paving Persegi Modern',
    desc: 'Blok paving beton persegi rapi dengan sambungan presisi',
    badge: 'Modern',
    previewColor: '#94a3b8',
  },
  {
    id: 'red_brick',
    name: 'Bata Merah Terracotta',
    desc: 'Jalur susunan bata merah terracotta kuno bertata apik',
    badge: 'Brick',
    previewColor: '#b45309',
  },
  {
    id: 'rustic_gravel',
    name: 'Kerikil Pedesaan',
    desc: 'Pasir kerikil alami halus cocok untuk taman & bukit',
    badge: 'Gravel',
    previewColor: '#d6d3d1',
  },
  {
    id: 'flagstone_slate',
    name: 'Batu Lempeng Andesit',
    desc: 'Lempengan batu pipih asimetris gaya pegunungan',
    badge: 'Slate',
    previewColor: '#475569',
  },
  {
    id: 'custom_png',
    name: 'Upload PNG Kustom',
    desc: 'Gunakan gambar tekstur PNG pilihan Anda sendiri',
    badge: 'PNG File',
    previewColor: '#06b6d4',
  },
];

// Texture caches
const textureCacheMap = new Map<string, THREE.Texture>();

function createProceduralTextureCanvas(id: string, size = 512): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  if (id === 'modern_pavers') {
    // Modern Pavers: Grid of rectangular stone blocks
    ctx.fillStyle = '#2d3748';
    ctx.fillRect(0, 0, size, size);
    const cols = 8;
    const rows = 16;
    const pw = size / cols;
    const ph = size / rows;
    for (let r = 0; r < rows; r++) {
      const xOff = (r % 2) * (pw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const x = c * pw + xOff;
        const y = r * ph;
        const tone = 150 + ((r * 13 + c * 17) % 45);
        ctx.fillStyle = `rgb(${tone}, ${tone - 4}, ${tone - 10})`;
        ctx.fillRect(x + 2, y + 2, pw - 4, ph - 4);
        ctx.fillStyle = `rgba(255,255,255,0.08)`;
        ctx.fillRect(x + 2, y + 2, pw - 4, 3);
      }
    }
  } else if (id === 'red_brick') {
    // Red Brick: Terracotta running bond
    ctx.fillStyle = '#3f1a14';
    ctx.fillRect(0, 0, size, size);
    const cols = 10;
    const rows = 24;
    const pw = size / cols;
    const ph = size / rows;
    for (let r = 0; r < rows; r++) {
      const xOff = (r % 2) * (pw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const x = c * pw + xOff;
        const y = r * ph;
        const redTone = 175 + ((r * 11 + c * 23) % 45);
        const greenTone = 60 + ((r * 7 + c * 13) % 25);
        const blueTone = 45 + ((r * 5 + c * 9) % 20);
        ctx.fillStyle = `rgb(${redTone}, ${greenTone}, ${blueTone})`;
        ctx.fillRect(x + 1.5, y + 1.5, pw - 3, ph - 3);
      }
    }
  } else if (id === 'rustic_gravel') {
    // Rustic Gravel: Fine pebble grit
    ctx.fillStyle = '#c5beaf';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2800; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const rad = 1.2 + Math.random() * 3.5;
      const g = 140 + Math.floor(Math.random() * 80);
      ctx.fillStyle = `rgba(${g}, ${g - 8}, ${g - 16}, 0.65)`;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (id === 'flagstone_slate') {
    // Flagstone Slate: Natural irregular interlocking plates
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, size, size);
    const step = 64;
    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        const tone = 90 + ((x * 3 + y * 7) % 55);
        ctx.fillStyle = `rgb(${tone}, ${tone + 4}, ${tone + 12})`;
        ctx.beginPath();
        ctx.roundRect(x + 3, y + 3, step - 6, step - 6, 8);
        ctx.fill();
      }
    }
  }

  return canvas;
}

export function getRoadTexture(id: string, customUrl?: string): THREE.Texture {
  if (id === 'custom_png' && customUrl) {
    if (textureCacheMap.has(customUrl)) {
      return textureCacheMap.get(customUrl)!;
    }
    const loader = new THREE.TextureLoader();
    const tex = loader.load(customUrl);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true;
    textureCacheMap.set(customUrl, tex);
    return tex;
  }

  if (id === 'classic_cobblestone' || !id) {
    return getClassicCobblestoneTexture();
  }

  if (textureCacheMap.has(id)) {
    return textureCacheMap.get(id)!;
  }

  const canvas = createProceduralTextureCanvas(id);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  textureCacheMap.set(id, tex);
  return tex;
}

/**
 * Creates high-fidelity standard material for smooth road ribbon curves
 */
export function createCobblestoneRoadMaterial(options?: {
  opacity?: number;
  transparent?: boolean;
  textureId?: string;
  customUrl?: string;
}): THREE.MeshStandardMaterial {
  const textureId = options?.textureId || 'classic_cobblestone';
  const map = getRoadTexture(textureId, options?.customUrl);
  const bumpMap = textureId === 'classic_cobblestone' ? getClassicCobblestoneBumpMap() : null;
  const roughnessMap = textureId === 'classic_cobblestone' ? getClassicCobblestoneRoughnessMap() : null;

  const mat = new THREE.MeshStandardMaterial({
    map,
    bumpMap: bumpMap || undefined,
    bumpScale: 0.04,
    roughnessMap: roughnessMap || undefined,
    roughness: 0.85,
    metalness: 0.05,
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: options?.transparent ?? true,
    opacity: options?.opacity ?? 0.98,
    polygonOffset: true,
    polygonOffsetFactor: -1.8,
    polygonOffsetUnits: -1.8,
    depthWrite: true,
  });

  (mat as any).userData = { textureId, customUrl: options?.customUrl };
  return mat;
}

