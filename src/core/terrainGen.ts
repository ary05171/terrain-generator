import { SimplexNoise2D, clamp, smoothstep, createPRNG } from './math';
import { BiomeType, PathMaterial, TerrainConfig, AStarNavigationResult } from '../types';

export interface TerrainData {
  heights: Float32Array;
  colors: Float32Array;
  minHeight: number;
  maxHeight: number;
}

// Biome color ramps: [elevation: 0..1, r, g, b]
type ColorStop = [number, number, number, number];

export const BIOME_PALETTES: Record<BiomeType, {
  waterColor: string;
  fogColor: string;
  skyColor: string;
  stops: ColorStop[];
}> = {
  archipelago: {
    waterColor: '#0ea5e9',
    fogColor: '#bae6fd',
    skyColor: '#38bdf8',
    stops: [
      [0.0, 0.10, 0.32, 0.52], // deep ocean floor (clear turquoise-navy)
      [0.15, 0.94, 0.82, 0.52], // sunlit warm golden beach sand
      [0.26, 0.34, 0.74, 0.28], // lush rich green meadow grass (rumput hijau asri cerah)
      [0.50, 0.48, 0.70, 0.26], // sunlit fertile hillside & rich loam (tanah subur & vegetasi)
      [0.72, 0.54, 0.56, 0.40], // highland slopes & warm mossy stone
      [0.95, 0.38, 0.68, 0.32], // vibrant emerald peak
    ],
  },
  cyberpunk: {
    waterColor: '#06b6d4',
    fogColor: '#0f172a',
    skyColor: '#090d16',
    stops: [
      [0.0, 0.05, 0.09, 0.18], // dark abyss
      [0.15, 0.05, 0.85, 0.95], // bright neon cyan shore
      [0.28, 0.16, 0.18, 0.26], // matte carbon grid base
      [0.55, 0.32, 0.22, 0.46], // luminous synthetic strata
      [0.78, 0.92, 0.14, 0.58], // vivid hot magenta cliff edges
      [0.95, 0.12, 0.98, 0.88], // brilliant neon cyber peaks
    ],
  },
  alpine: {
    waterColor: '#38bdf8',
    fogColor: '#e0f2fe',
    skyColor: '#7dd3fc',
    stops: [
      [0.0, 0.20, 0.42, 0.54],
      [0.15, 0.88, 0.84, 0.68], // bright shore pebbles
      [0.28, 0.38, 0.80, 0.32], // sunlit alpine valley meadow (padang rumput hijau cerah)
      [0.54, 0.30, 0.64, 0.28], // rich pine needle loam & evergreen forest zone
      [0.78, 0.62, 0.60, 0.58], // warm sunlit granite crag
      [0.96, 0.96, 0.98, 1.00], // brilliant pristine sunlit snow peak
    ],
  },
  canyon: {
    waterColor: '#0284c7',
    fogColor: '#fed7aa',
    skyColor: '#fb923c',
    stops: [
      [0.0, 0.40, 0.26, 0.18],
      [0.15, 0.94, 0.78, 0.54], // sunlit riverbed sand
      [0.32, 0.88, 0.54, 0.32], // vivid warm red clay band
      [0.56, 0.82, 0.48, 0.28], // golden terracotta sandstone
      [0.78, 0.70, 0.40, 0.24], // sun-baked red sandstone cliff
      [0.95, 0.94, 0.72, 0.46], // sun-drenched golden mesa plateau
    ],
  },
  oasis: {
    waterColor: '#2dd4bf',
    fogColor: '#f5d0fe',
    skyColor: '#e879f9',
    stops: [
      [0.0, 0.15, 0.42, 0.52],
      [0.15, 0.98, 0.88, 0.72], // shimmering bright golden sand
      [0.30, 0.36, 0.84, 0.42], // lush vibrant oasis grass
      [0.60, 0.58, 0.42, 0.78], // radiant violet crystal slope
      [0.82, 0.82, 0.54, 0.90], // sunlit lilac mineral rock
      [0.95, 0.96, 0.86, 0.98], // iridescent crystal summit
    ],
  },
  lowpoly: {
    waterColor: '#38bdf8',
    fogColor: '#f1f5f9',
    skyColor: '#93c5fd',
    stops: [
      [0.0, 0.22, 0.54, 0.68],
      [0.15, 0.96, 0.88, 0.62], // warm sunny sand beach
      [0.28, 0.42, 0.84, 0.34], // vibrant stylized green meadow (rumput hijau segar)
      [0.54, 0.32, 0.72, 0.28], // rich lush foliage & warm earth
      [0.78, 0.56, 0.62, 0.48], // warm sunlit stone & mossy earth
      [0.95, 0.42, 0.74, 0.36], // bright emerald peak
    ],
  },
};

/**
 * Calculates raw height at normalized world coordinate (x, z in [-size/2, size/2])
 */
export function calculateRawHeight(
  x: number,
  z: number,
  noise: SimplexNoise2D,
  config: TerrainConfig
): number {
  const { size, heightScale, roughness, islandFalloff, terraceSteps, biome } = config;
  
  // Normalized 0..1 coordinate
  const nx = x / size;
  const nz = z / size;

  // Base multi-octave noise
  const freq = roughness * 1.5;
  let h = noise.fbm(nx * freq, nz * freq, 5, 0.5, 2.0);

  // Biome-specific height transforms
  if (biome === 'archipelago') {
    // Ridge noise for sharp coral/island spines
    const ridge = 1.0 - Math.abs(noise.noise(nx * freq * 2, nz * freq * 2));
    h = h * 0.7 + ridge * 0.3;
  } else if (biome === 'canyon') {
    // Stepped canyon terraces with sharp walls
    const warpedX = nx + noise.noise(nx * 2, nz * 2) * 0.15;
    const warpedZ = nz + noise.noise(nz * 2, nx * 2) * 0.15;
    h = noise.fbm(warpedX * freq, warpedZ * freq, 4, 0.6, 2.2);
    // Sigmoid plateau effect
    h = Math.sin(h * Math.PI * 2.5) * 0.3 + h * 0.7;
  } else if (biome === 'cyberpunk') {
    // Angular artificial geometric plateaus
    const gridX = Math.round(nx * 12) / 12;
    const gridZ = Math.round(nz * 12) / 12;
    const blockNoise = noise.noise(gridX * 2.5, gridZ * 2.5);
    h = h * 0.6 + blockNoise * 0.4;
  }

  // Island radial falloff mask with configurable islandCoverage
  if (islandFalloff) {
    const coverage = config.islandCoverage ?? 1.45; // Broad expansive island default
    const warpAngle = Math.atan2(nz, nx);
    const warpRadius = (1.0 + 0.18 * Math.sin(warpAngle * 3 + nx * 2) + 0.12 * Math.cos(warpAngle * 5 - nz * 2)) * coverage;
    const distFromCenter = (Math.sqrt(nx * nx + nz * nz) / warpRadius) * 2; // scaled by coverage

    // Smooth cosine edge fade with wider, expansive habitable plateau
    const mask = smoothstep(1.05, 0.25, distFromCenter);

    // Natural satellite islets & coral atolls in archipelago biome to break up empty ocean
    let satelliteBoost = 0;
    if (biome === 'archipelago' && distFromCenter > 0.85 && distFromCenter < 1.7) {
      const satNoise = noise.noise(nx * 4.8 + 15, nz * 4.8 + 15);
      if (satNoise > 0.45) {
        satelliteBoost = (satNoise - 0.45) * 0.52;
      }
    }

    h = (h + 0.32) * mask + satelliteBoost - 0.18;
  }

  // Terracing / contour quantization if enabled
  if (terraceSteps > 0) {
    const steps = terraceSteps;
    const scaled = (h + 1) * 0.5 * steps;
    const quantized = Math.floor(scaled);
    const frac = scaled - quantized;
    // Keep flat terrace tops with steep cliffs in between
    const smoothedFrac = smoothstep(0.7, 0.95, frac);
    h = ((quantized + smoothedFrac) / steps) * 2.0 - 1.0;
  }

  // Map to final vertical world units
  return h * (heightScale * 0.5);
}

/**
 * Applies procedural soil brightness, warmth, and multi-octave micro-noise grain texture
 * to give realistic earthen texture, silt specks, and sunlit warmth without plastic look.
 */
export function applySoilColorAndTexture(
  r: number,
  g: number,
  b: number,
  worldX: number,
  worldZ: number,
  height: number,
  waterLvl: number,
  config: TerrainConfig,
  noise: SimplexNoise2D
): [number, number, number] {
  // Only apply terrestrial soil texturing above or near water level
  if (height < waterLvl - 0.5) {
    return [r, g, b];
  }

  const soilBrightness = config.soilBrightness ?? 1.15;
  const soilWarmth = config.soilWarmth ?? 1.10;
  const soilGrain = config.soilTextureGrain ?? 0.65;

  // 1. Multi-frequency procedural micro-noise texture
  let grainOffset = 0;
  if (soilGrain > 0.001) {
    // Octave 1: Organik humus & variasi tanah gembur
    const n1 = noise.noise(worldX * 0.22, worldZ * 0.22);
    // Octave 2: Butiran tanah & pasir berkerikil halus
    const n2 = noise.noise(worldX * 0.85 + 17.3, worldZ * 0.85 - 23.9);
    // Octave 3: Mikro-silt flecks
    const n3 = noise.noise(worldX * 2.8 - 41.7, worldZ * 2.8 + 67.1);

    grainOffset = (n1 * 0.52 + n2 * 0.33 + n3 * 0.15) * 0.14 * soilGrain;
  }

  // 2. Kehangatan tanah (Warmth / Sunlit soil undertone)
  if (soilWarmth !== 1.0) {
    const warmthDelta = soilWarmth - 1.0;
    // Boost warm tones (golden clay & amber humus)
    r = r * (1.0 + warmthDelta * 0.28);
    g = g * (1.0 + warmthDelta * 0.12);
    b = b * (1.0 - warmthDelta * 0.14);
  }

  // 3. Gabungkan butiran mikro-noise bergradasi
  r = clamp(r + grainOffset * 1.15, 0, 1);
  g = clamp(g + grainOffset * 0.95, 0, 1);
  b = clamp(b + grainOffset * 0.75, 0, 1);

  // 4. Kecerahan tanah (Soil Brightness Curve with highlight preservation)
  if (soilBrightness !== 1.0) {
    const factor = Math.max(0.5, soilBrightness);
    const gamma = 1.0 / (factor * 0.96);
    r = clamp(Math.pow(r, gamma) * (factor > 1 ? 1.04 : 1.0), 0, 1);
    g = clamp(Math.pow(g, gamma) * (factor > 1 ? 1.04 : 1.0), 0, 1);
    b = clamp(Math.pow(b, gamma) * (factor > 1 ? 1.02 : 1.0), 0, 1);
  }

  return [r, g, b];
}

/**
 * Generate full heightmap and vertex color buffers
 */
export function generateTerrainData(config: TerrainConfig): TerrainData {
  const { size, resolution, seed, biome } = config;
  const count = resolution * resolution;
  const heights = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  const noise = new SimplexNoise2D(seed);
  const palette = BIOME_PALETTES[biome] || BIOME_PALETTES.archipelago;

  let minH = Infinity;
  let maxH = -Infinity;

  const halfSize = size / 2;
  const step = size / (resolution - 1);

  // Compute heights
  for (let j = 0; j < resolution; j++) {
    const z = -halfSize + j * step;
    for (let i = 0; i < resolution; i++) {
      const x = -halfSize + i * step;
      const idx = j * resolution + i;
      const h = calculateRawHeight(x, z, noise, config);
      heights[idx] = h;
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
  }

  const waterLvl = config.waterLevel;
  const underDepth = Math.max(0.001, waterLvl - minH);
  const landHeight = Math.max(0.001, maxH - waterLvl);

  // Compute vertex colors based on elevation and slope
  for (let j = 0; j < resolution; j++) {
    const z = -halfSize + j * step;
    for (let i = 0; i < resolution; i++) {
      const x = -halfSize + i * step;
      const idx = j * resolution + i;
      const h = heights[idx];

      // Calculate normalized height specifically partitioned for underwater (0.0 .. 0.15) vs dry land (0.15 .. 1.0)
      let normH = 0;
      if (h < waterLvl) {
        normH = clamp(((h - minH) / underDepth) * 0.15, 0, 0.15);
      } else {
        const landProgress = clamp((h - waterLvl) / landHeight, 0, 1);
        normH = 0.15 + landProgress * 0.85;
      }

      // Estimate slope steepness
      const leftH = i > 0 ? heights[idx - 1] : h;
      const rightH = i < resolution - 1 ? heights[idx + 1] : h;
      const topH = j > 0 ? heights[idx - resolution] : h;
      const bottomH = j < resolution - 1 ? heights[idx + resolution] : h;
      const dx = (rightH - leftH) / (2 * step);
      const dz = (bottomH - topH) / (2 * step);
      const slope = Math.sqrt(dx * dx + dz * dz);

      // Interpolate along color palette
      const stops = palette.stops;
      let r = stops[0][1], g = stops[0][2], b = stops[0][3];
      if (normH <= stops[0][0]) {
        r = stops[0][1];
        g = stops[0][2];
        b = stops[0][3];
      } else if (normH >= stops[stops.length - 1][0]) {
        const last = stops[stops.length - 1];
        r = last[1];
        g = last[2];
        b = last[3];
      } else {
        for (let s = 0; s < stops.length - 1; s++) {
          const s0 = stops[s];
          const s1 = stops[s + 1];
          if (normH >= s0[0] && normH <= s1[0]) {
            const t = (normH - s0[0]) / Math.max(0.0001, s1[0] - s0[0]);
            r = s0[1] + (s1[1] - s0[1]) * t;
            g = s0[2] + (s1[2] - s0[2]) * t;
            b = s0[3] + (s1[3] - s0[3]) * t;
            break;
          }
        }
      }

      // If slope is steep on dry land, blend toward sunlit warm slate stone or rich earth cliff
      if (h >= waterLvl && slope > 0.65) {
        const cliffFactor = clamp((slope - 0.65) * 1.6, 0, 0.70);
        if (biome === 'cyberpunk') {
          r = r * (1 - cliffFactor) + 0.9 * cliffFactor;
          g = g * (1 - cliffFactor) + 0.1 * cliffFactor;
          b = b * (1 - cliffFactor) + 0.8 * cliffFactor;
        } else if (biome === 'canyon') {
          r = r * (1 - cliffFactor) + 0.72 * cliffFactor;
          g = g * (1 - cliffFactor) + 0.44 * cliffFactor;
          b = b * (1 - cliffFactor) + 0.28 * cliffFactor;
        } else {
          // Warm sunlit earthy slate & mossy rock cliff (not dull dark gray)
          r = r * (1 - cliffFactor) + 0.52 * cliffFactor;
          g = g * (1 - cliffFactor) + 0.48 * cliffFactor;
          b = b * (1 - cliffFactor) + 0.42 * cliffFactor;
        }
      }

      // Apply procedural soil brightness, warmth, and multi-octave micro-noise grain texture
      [r, g, b] = applySoilColorAndTexture(r, g, b, x, z, h, waterLvl, config, noise);

      const cIdx = idx * 3;
      colors[cIdx] = r;
      colors[cIdx + 1] = g;
      colors[cIdx + 2] = b;
    }
  }

  return { heights, colors, minHeight: minH, maxHeight: maxH };
}

/**
 * Recalculates natural biome colors for any heightmap without altering terrain elevations,
 * allowing users to cleanly erase old painted roads.
 */
export function generateBiomeColors(
  heights: Float32Array,
  config: TerrainConfig
): Float32Array {
  const { resolution, size, biome, waterLevel } = config;
  const palette = BIOME_PALETTES[biome] || BIOME_PALETTES.archipelago;
  const step = size / (resolution - 1);
  const halfSize = size / 2;
  const colors = new Float32Array(resolution * resolution * 3);
  const noise = new SimplexNoise2D(config.seed || 2026);

  let minH = Infinity;
  let maxH = -Infinity;
  for (let k = 0; k < heights.length; k++) {
    if (heights[k] < minH) minH = heights[k];
    if (heights[k] > maxH) maxH = heights[k];
  }

  const underDepth = Math.max(0.001, waterLevel - minH);
  const landHeight = Math.max(0.001, maxH - waterLevel);

  for (let j = 0; j < resolution; j++) {
    const z = -halfSize + j * step;
    for (let i = 0; i < resolution; i++) {
      const x = -halfSize + i * step;
      const idx = j * resolution + i;
      const h = heights[idx];

      let normH = 0;
      if (h < waterLevel) {
        normH = clamp(((h - minH) / underDepth) * 0.15, 0, 0.15);
      } else {
        const landProgress = clamp((h - waterLevel) / landHeight, 0, 1);
        normH = 0.15 + landProgress * 0.85;
      }

      const leftH = i > 0 ? heights[idx - 1] : h;
      const rightH = i < resolution - 1 ? heights[idx + 1] : h;
      const topH = j > 0 ? heights[idx - resolution] : h;
      const bottomH = j < resolution - 1 ? heights[idx + resolution] : h;
      const dx = (rightH - leftH) / (2 * step);
      const dz = (bottomH - topH) / (2 * step);
      const slope = Math.sqrt(dx * dx + dz * dz);

      const stops = palette.stops;
      let r = stops[0][1], g = stops[0][2], b = stops[0][3];
      if (normH <= stops[0][0]) {
        r = stops[0][1];
        g = stops[0][2];
        b = stops[0][3];
      } else if (normH >= stops[stops.length - 1][0]) {
        const last = stops[stops.length - 1];
        r = last[1];
        g = last[2];
        b = last[3];
      } else {
        for (let s = 0; s < stops.length - 1; s++) {
          const s0 = stops[s];
          const s1 = stops[s + 1];
          if (normH >= s0[0] && normH <= s1[0]) {
            const t = (normH - s0[0]) / Math.max(0.0001, s1[0] - s0[0]);
            r = s0[1] + (s1[1] - s0[1]) * t;
            g = s0[2] + (s1[2] - s0[2]) * t;
            b = s0[3] + (s1[3] - s0[3]) * t;
            break;
          }
        }
      }

      if (h >= waterLevel && slope > 0.65) {
        const cliffFactor = clamp((slope - 0.65) * 1.6, 0, 0.70);
        if (biome === 'cyberpunk') {
          r = r * (1 - cliffFactor) + 0.9 * cliffFactor;
          g = g * (1 - cliffFactor) + 0.1 * cliffFactor;
          b = b * (1 - cliffFactor) + 0.8 * cliffFactor;
        } else if (biome === 'canyon') {
          r = r * (1 - cliffFactor) + 0.72 * cliffFactor;
          g = g * (1 - cliffFactor) + 0.44 * cliffFactor;
          b = b * (1 - cliffFactor) + 0.28 * cliffFactor;
        } else {
          r = r * (1 - cliffFactor) + 0.52 * cliffFactor;
          g = g * (1 - cliffFactor) + 0.48 * cliffFactor;
          b = b * (1 - cliffFactor) + 0.42 * cliffFactor;
        }
      }

      // Apply procedural soil brightness, warmth, and multi-octave micro-noise grain texture
      [r, g, b] = applySoilColorAndTexture(r, g, b, x, z, h, waterLevel, config, noise);

      const cIdx = idx * 3;
      colors[cIdx] = r;
      colors[cIdx + 1] = g;
      colors[cIdx + 2] = b;
    }
  }

  return colors;
}

/**
 * Sample height at continuous world (x, z) coordinates using bilinear interpolation
 */
export function getSampledHeightAt(
  x: number,
  z: number,
  heights: Float32Array,
  size: number,
  resolution: number
): number {
  const halfSize = size / 2;
  // Normalized 0 .. resolution - 1
  const u = ((x + halfSize) / size) * (resolution - 1);
  const v = ((z + halfSize) / size) * (resolution - 1);

  if (u < 0 || u > resolution - 1 || v < 0 || v > resolution - 1) {
    return 0;
  }

  const i0 = Math.floor(u);
  const j0 = Math.floor(v);
  const i1 = Math.min(i0 + 1, resolution - 1);
  const j1 = Math.min(j0 + 1, resolution - 1);

  const fx = u - i0;
  const fz = v - j0;

  const h00 = heights[j0 * resolution + i0];
  const h10 = heights[j0 * resolution + i1];
  const h01 = heights[j1 * resolution + i0];
  const h11 = heights[j1 * resolution + i1];

  const h0 = h00 * (1 - fx) + h10 * fx;
  const h1 = h01 * (1 - fx) + h11 * fx;

  return h0 * (1 - fz) + h1 * fz;
}

/**
 * Sample RGB vertex color at continuous world coordinates (x, z) using bilinear interpolation
 */
export function getSampledColorAt(
  x: number,
  z: number,
  colors: Float32Array,
  size: number,
  resolution: number
): [number, number, number] {
  const halfSize = size / 2;
  const u = clamp(((x + halfSize) / size) * (resolution - 1), 0, resolution - 1);
  const v = clamp(((z + halfSize) / size) * (resolution - 1), 0, resolution - 1);

  const i0 = Math.floor(u);
  const j0 = Math.floor(v);
  const i1 = Math.min(i0 + 1, resolution - 1);
  const j1 = Math.min(j0 + 1, resolution - 1);

  const fx = u - i0;
  const fz = v - j0;

  const idx00 = (j0 * resolution + i0) * 3;
  const idx10 = (j0 * resolution + i1) * 3;
  const idx01 = (j1 * resolution + i0) * 3;
  const idx11 = (j1 * resolution + i1) * 3;

  const r0 = colors[idx00] * (1 - fx) + colors[idx10] * fx;
  const r1 = colors[idx01] * (1 - fx) + colors[idx11] * fx;
  const r = r0 * (1 - fz) + r1 * fz;

  const g0 = colors[idx00 + 1] * (1 - fx) + colors[idx10 + 1] * fx;
  const g1 = colors[idx01 + 1] * (1 - fx) + colors[idx10 + 1] * fx;
  const g = g0 * (1 - fz) + g1 * fz;

  const b0 = colors[idx00 + 2] * (1 - fx) + colors[idx10 + 2] * fx;
  const b1 = colors[idx01 + 2] * (1 - fx) + colors[idx11 + 2] * fx;
  const b = b0 * (1 - fz) + b1 * fz;

  return [r, g, b];
}

function distSqToSegment(px: number, pz: number, x1: number, z1: number, x2: number, z2: number): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const l2 = dx * dx + dz * dz;
  if (l2 === 0) return (px - x1) * (px - x1) + (pz - z1) * (pz - z1);
  let t = ((px - x1) * dx + (pz - z1) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projZ = z1 + t * dz;
  return (px - projX) * (px - projX) + (pz - projZ) * (pz - projZ);
}

/**
 * Checks whether continuous world coordinate (x, z) lies on a roadway, trail, or bridge:
 * 1. Checks continuous segment distance to generated trail centerline points (within trailWidth + buffer).
 * 2. Checks proximity to placed path objects (wooden_bridge, wooden_stairs, curb stones, boardwalk, lanterns).
 * 3. Checks terrain vertex surface color to detect painted road materials (paving, stone, asphalt, gravel, packed loam).
 */
export function isPointOnRoad(
  x: number,
  z: number,
  colors: Float32Array,
  heights: Float32Array,
  size: number,
  resolution: number,
  config: TerrainConfig,
  placedObjects?: { id?: string; type: string; category?: string; position: [number, number, number] }[],
  trailPathPoints?: { x: number; z: number }[],
  clearanceBuffer = 1.8
): boolean {
  const roadWidth = (config.trailWidth ?? 2.2) + clearanceBuffer;
  const roadWidthSq = roadWidth * roadWidth;

  // 1. Continuous segment proximity to procedural trail spline centerline
  if (trailPathPoints && trailPathPoints.length > 0) {
    for (let i = 0; i < trailPathPoints.length; i++) {
      const pt = trailPathPoints[i];
      const dx = pt.x - x;
      const dz = pt.z - z;
      if (dx * dx + dz * dz < roadWidthSq) {
        return true;
      }
      if (i > 0) {
        const prev = trailPathPoints[i - 1];
        const segDistSq = (pt.x - prev.x) * (pt.x - prev.x) + (pt.z - prev.z) * (pt.z - prev.z);
        // If consecutive points belong to the same connected path ribbon (within 15 units):
        if (segDistSq < 225.0) {
          if (distSqToSegment(x, z, prev.x, prev.z, pt.x, pt.z) < roadWidthSq) {
            return true;
          }
        }
      }
    }
  }

  // 2. Proximity to road objects & structures in placedObjects
  if (placedObjects && placedObjects.length > 0) {
    for (let i = 0; i < placedObjects.length; i++) {
      const o = placedObjects[i];
      const ox = o.position[0];
      const oz = o.position[2];
      const dx = ox - x;
      const dz = oz - z;
      const dSq = dx * dx + dz * dz;

      if (o.type === 'wooden_bridge') {
        const r = 6.2 + clearanceBuffer;
        if (dSq < r * r) return true;
      } else if (o.type === 'wooden_stairs') {
        const r = 4.8 + clearanceBuffer;
        if (dSq < r * r) return true;
      } else if (o.type === 'path_curb_stones' || o.type === 'path_curb_with_foliage') {
        const r = 2.4 + clearanceBuffer * 0.6;
        if (dSq < r * r) return true;
      } else if (o.type === 'wooden_boardwalk' || o.type === 'cobblestone_path') {
        const r = 3.6 + clearanceBuffer;
        if (dSq < r * r) return true;
      } else if (o.category === 'path') {
        const r = 3.0 + clearanceBuffer;
        if (dSq < r * r) return true;
      } else if (o.id && (o.id.startsWith('trail_prop_') || o.id.startsWith('path_'))) {
        const r = 2.4 + clearanceBuffer * 0.5;
        if (dSq < r * r) return true;
      }
    }
  }

  // 3. Terrain color check: detect painted stone/asphalt/gravel/dirt roadbed
  const [actualR, actualG, actualB] = getSampledColorAt(x, z, colors, size, resolution);

  const maxDiff = Math.max(
    Math.abs(actualR - actualG),
    Math.abs(actualG - actualB),
    Math.abs(actualR - actualB)
  );

  if (config.biome !== 'canyon') {
    // Slate stone, asphalt, or gravel paver road (desaturated neutral grey/slate)
    if (actualB < actualR + 0.16 && maxDiff < 0.082 && actualG < 0.68) {
      return true;
    }
    // Packed dirt road (warm earthy loam: R dominant, G low, B low)
    if (actualR > 0.40 && actualG < 0.38 && actualB < 0.30 && actualR - actualG > 0.06) {
      return true;
    }
    // Cyber road (neon cyan rim or solid obsidian carbon)
    if (actualB > 0.85 && actualG > 0.80 && actualR < 0.20) {
      return true;
    }
  } else {
    // In canyon (orange/red sandstone): stone/gravel/asphalt road is distinctly neutral grey
    if (maxDiff < 0.075) {
      return true;
    }
  }

  return false;
}

/**
 * Apply brush sculpt edit directly to height array
 */
export function applySculptBrush(
  centerWorldX: number,
  centerWorldZ: number,
  heights: Float32Array,
  size: number,
  resolution: number,
  mode: 'sculpt-raise' | 'sculpt-lower' | 'sculpt-flatten' | 'sculpt-smooth',
  radius: number,
  intensity: number,
  targetFlattenHeight = 0
): void {
  const halfSize = size / 2;
  const step = size / (resolution - 1);
  const radSq = radius * radius;

  // Find index bounds
  const minU = Math.max(0, Math.floor(((centerWorldX - radius + halfSize) / size) * (resolution - 1)));
  const maxU = Math.min(resolution - 1, Math.ceil(((centerWorldX + radius + halfSize) / size) * (resolution - 1)));
  const minV = Math.max(0, Math.floor(((centerWorldZ - radius + halfSize) / size) * (resolution - 1)));
  const maxV = Math.min(resolution - 1, Math.ceil(((centerWorldZ + radius + halfSize) / size) * (resolution - 1)));

  // If smoothing, first compute average in radius
  let avgH = 0;
  let count = 0;
  if (mode === 'sculpt-smooth') {
    for (let j = minV; j <= maxV; j++) {
      const z = -halfSize + j * step;
      for (let i = minU; i <= maxU; i++) {
        const x = -halfSize + i * step;
        const dSq = (x - centerWorldX) * (x - centerWorldX) + (z - centerWorldZ) * (z - centerWorldZ);
        if (dSq <= radSq) {
          avgH += heights[j * resolution + i];
          count++;
        }
      }
    }
    if (count > 0) avgH /= count;
  }

  for (let j = minV; j <= maxV; j++) {
    const z = -halfSize + j * step;
    for (let i = minU; i <= maxU; i++) {
      const x = -halfSize + i * step;
      const dSq = (x - centerWorldX) * (x - centerWorldX) + (z - centerWorldZ) * (z - centerWorldZ);
      if (dSq <= radSq) {
        const dist = Math.sqrt(dSq);
        const falloff = Math.cos((dist / radius) * (Math.PI / 2)); // Smooth cosine falloff
        const delta = intensity * falloff * 0.8;
        const idx = j * resolution + i;

        if (mode === 'sculpt-raise') {
          heights[idx] += delta;
        } else if (mode === 'sculpt-lower') {
          heights[idx] -= delta;
        } else if (mode === 'sculpt-flatten') {
          const current = heights[idx];
          heights[idx] = current + (targetFlattenHeight - current) * delta * 0.6;
        } else if (mode === 'sculpt-smooth') {
          const current = heights[idx];
          heights[idx] = current + (avgH - current) * delta * 0.5;
        }
      }
    }
  }
}

/**
 * Evaluates path surface material at a given point, providing SOLID, CLEAN, and RICH road textures:
 * - Interlocking Paving Stones: Crisp modular paver blocks with distinct dark mortar joints (nat paving gelap jelas)
 *   and convex crowned gradients for high-contrast tactile relief without noisy speckles.
 * - Asphalt: Modern sleek solid roadbed with clean curb borders
 * - Stone: Clean, solid slate cobblestones with pronounced paver seams
 * - Gravel: Clean crushed limestone aggregate with textured joints
 * - Dirt: Warm packed fertile loam with organic shoulder transition
 * - Cyber: Solid dark carbon obsidian with cyan neon rim
 * - Blends: Solid stone/asphalt roadway core with clean gravel & loam edges
 */
export function getPathMaterialColor(
  x: number,
  z: number,
  i: number,
  j: number,
  normDist: number, // 0 at center, 1 at outer boundary
  pathStyle: PathMaterial,
  customBlend?: { stone: number; gravel: number; dirt: number }
): [number, number, number] {
  // Roadway cross-section:
  // normDist < 0.65 -> 100% Solid roadway center
  // 0.65 <= normDist < 0.88 -> Crisp shoulder / curb boundary
  // 0.88 <= normDist <= 1.0 -> Smooth anti-aliased edge blend into terrain

  // Base Solid Color Definitions [R, G, B]
  const stoneColor: [number, number, number] = [0.46, 0.48, 0.52]; // Solid slate/granite paver
  const asphaltColor: [number, number, number] = [0.22, 0.23, 0.26]; // Solid dark asphalt
  const gravelColor: [number, number, number] = [0.62, 0.64, 0.66]; // Solid crushed stone
  const dirtColor: [number, number, number] = [0.48, 0.34, 0.22];   // Solid rich loam

  if (pathStyle === 'asphalt') {
    // Solid dark asphalt road with subtle clean curb border
    const edgeDarken = normDist > 0.75 ? 0.86 : 1.0;
    return [asphaltColor[0] * edgeDarken, asphaltColor[1] * edgeDarken, asphaltColor[2] * edgeDarken];
  }

  if (pathStyle === 'cyber') {
    // Solid dark obsidian carbon with crisp neon edge glow
    if (normDist > 0.82) {
      return [0.06, 0.90, 0.98]; // Bright neon cyan curb
    }
    const centerLine = Math.abs(normDist) < 0.10;
    return centerLine ? [0.95, 0.15, 0.75] : [0.10, 0.12, 0.18];
  }

  // 1. Procedural Interlocking Paver Grid & Crisp Dark Mortar Joints (Nat Paving Gelap Jelas)
  // Grid size in world units (scaled to look realistic on dioramas)
  const paverDimX = 1.35;
  const paverDimZ = 0.90;
  const row = Math.floor(z / paverDimZ);
  const staggerX = (row % 2 === 0 ? 0 : paverDimX * 0.5);
  const col = Math.floor((x + staggerX) / paverDimX);

  // Position within individual paver block [0, 1]
  const u = (((x + staggerX) % paverDimX + paverDimX) % paverDimX) / paverDimX;
  const v = (((z) % paverDimZ + paverDimZ) % paverDimZ) / paverDimZ;

  // Distance to nearest paver edge
  const edgeDistX = Math.min(u, 1.0 - u);
  const edgeDistZ = Math.min(v, 1.0 - v);
  const minEdge = Math.min(edgeDistX, edgeDistZ);

  // Nat Gelap Jelas (Mortar Seam Factor):
  // Seam threshold: minEdge < 0.13 represents the recessed mortar groove
  let mortarMultiplier = 1.0;
  if (minEdge < 0.13) {
    // Deep dark recessed mortar joint
    const seamRatio = minEdge / 0.13;
    mortarMultiplier = 0.64 + seamRatio * 0.26; // 0.64 in deepest joint groove
  } else {
    // Crowned Paver Gradient: convex rise towards center of stone tile for 3D bevel relief
    const crown = Math.sin(((minEdge - 0.13) / 0.37) * (Math.PI / 2));
    mortarMultiplier = 0.92 + crown * 0.16; // 0.92 at paver bevel edge up to 1.08 at crowned highlight
  }

  // Subtle natural shade variation per stone (andesite vs granite) without noisy speckles
  const stoneTone = (((Math.abs(col * 47 + row * 89)) % 7) - 3) * 0.025; // -0.075 .. +0.075

  // Multi-material blend weights
  let wStone = 0;
  let wGravel = 0;
  let wDirt = 0;

  if (customBlend || pathStyle === 'custom_blend') {
    const blend = customBlend || { stone: 50, gravel: 30, dirt: 20 };
    const total = Math.max(0.001, blend.stone + blend.gravel + blend.dirt);
    wStone = blend.stone / total;
    wGravel = blend.gravel / total;
    wDirt = blend.dirt / total;
  } else {
    switch (pathStyle) {
      case 'stone':
        wStone = 1.0;
        break;
      case 'gravel':
        wGravel = 1.0;
        break;
      case 'dirt':
        wDirt = 1.0;
        break;
      case 'blend_stone_gravel':
        // Solid stone center, fine gravel shoulder
        wStone = normDist < 0.65 ? 1.0 : clamp(1.0 - (normDist - 0.65) / 0.35, 0, 1);
        wGravel = 1.0 - wStone;
        break;
      case 'blend_dirt_gravel':
        // Solid gravel core, dirt borders
        wGravel = normDist < 0.60 ? 1.0 : clamp(1.0 - (normDist - 0.60) / 0.40, 0, 1);
        wDirt = 1.0 - wGravel;
        break;
      case 'blend_natural':
      default:
        // Premium Solid Trail:
        // normDist < 0.55 -> Solid stone / paved core with dark mortar joints
        // 0.55 <= normDist < 0.82 -> Clean crushed gravel aggregate
        // 0.82 <= normDist <= 1.0 -> Natural earth loam transition
        if (normDist < 0.55) {
          wStone = 0.85;
          wGravel = 0.15;
        } else if (normDist < 0.82) {
          const t = (normDist - 0.55) / 0.27;
          wStone = 0.85 * (1 - t);
          wGravel = 0.15 + 0.70 * t;
          wDirt = 0.15 * t;
        } else {
          const t = (normDist - 0.82) / 0.18;
          wGravel = 0.85 * (1 - t);
          wDirt = 0.15 + 0.85 * t;
        }
        break;
    }
  }

  // Apply dark mortar joints and crowned gradients directly to stone & aggregate parts
  const stoneShade = clamp(mortarMultiplier * (1.0 + stoneTone), 0.55, 1.25);
  const gravelShade = normDist < 0.75 ? clamp(0.92 + stoneTone * 0.5, 0.75, 1.15) : 1.0;

  // Blended color calculation
  const r = stoneColor[0] * wStone * stoneShade + gravelColor[0] * wGravel * gravelShade + dirtColor[0] * wDirt;
  const g = stoneColor[1] * wStone * stoneShade + gravelColor[1] * wGravel * gravelShade + dirtColor[1] * wDirt;
  const b = stoneColor[2] * wStone * stoneShade + gravelColor[2] * wGravel * gravelShade + dirtColor[2] * wDirt;

  // Crisp, clean road shoulder definition & curb bevel band
  const isCurbBevel = normDist >= 0.70 && normDist <= 0.88;
  const curbBorder = isCurbBevel ? 0.86 : 1.0;

  return [
    clamp(r * curbBorder, 0, 1),
    clamp(g * curbBorder, 0, 1),
    clamp(b * curbBorder, 0, 1),
  ];
}

export interface PathPresetConfig {
  id: PathMaterial;
  name: string;
  subtitle: string;
  badge: string;
  description: string;
  blendRatios: { stone: number; gravel: number; dirt: number };
  accentColor: string;
}

export const PATH_MATERIAL_PRESETS: PathPresetConfig[] = [
  {
    id: 'asphalt',
    name: 'Jalan Aspal Solid',
    subtitle: 'Modern Pavement',
    badge: '🛣️ Solid Road',
    description: 'Jalan aspal gelap solid dan rapi dengan tepi jalan tegas',
    blendRatios: { stone: 90, gravel: 10, dirt: 0 },
    accentColor: '#38bdf8',
  },
  {
    id: 'blend_natural',
    name: 'Natural Trail',
    subtitle: 'Stone + Gravel + Dirt',
    badge: '🌿 Realistic Blend',
    description: 'Paving batu solid bergradasi tegas dengan nat gelap jelas di tengah & bahu kerikil halus',
    blendRatios: { stone: 40, gravel: 35, dirt: 25 },
    accentColor: '#10b981',
  },
  {
    id: 'blend_stone_gravel',
    name: 'Cobble & Gravel',
    subtitle: 'Town Plaza',
    badge: '🏛️ Paved Plaza',
    description: 'Batu paving interlocking solid bergradasi dengan nat gelap kontras tertata rapi',
    blendRatios: { stone: 75, gravel: 20, dirt: 5 },
    accentColor: '#94a3b8',
  },
  {
    id: 'stone',
    name: 'Pure Stone',
    subtitle: 'Granite Cobblestone',
    badge: '🪨 Solid Masonry',
    description: 'Ubin batu granit solid ber-nat gelap tegas dengan relief cembung 3D',
    blendRatios: { stone: 100, gravel: 0, dirt: 0 },
    accentColor: '#64748b',
  },
  {
    id: 'blend_dirt_gravel',
    name: 'Dirt & Gravel Track',
    subtitle: 'Country Way',
    badge: '🚜 Rustic Rut',
    description: 'Jalan pedesaan tanah padat solid dengan bahu kerikil',
    blendRatios: { stone: 10, gravel: 40, dirt: 50 },
    accentColor: '#f59e0b',
  },
  {
    id: 'gravel',
    name: 'Crushed Gravel',
    subtitle: 'Pebble Aggregate',
    badge: '⚪ Aggregate',
    description: 'Kerikil batu gamping padat solid dan terang',
    blendRatios: { stone: 0, gravel: 100, dirt: 0 },
    accentColor: '#cbd5e1',
  },
  {
    id: 'dirt',
    name: 'Packed Dirt',
    subtitle: 'Warm Country Loam',
    badge: '🌾 Organic Earth',
    description: 'Tanah humus padat solid berwarna cokelat hangat',
    blendRatios: { stone: 0, gravel: 0, dirt: 100 },
    accentColor: '#b45309',
  },
  {
    id: 'custom_blend',
    name: 'Custom Mix',
    subtitle: 'Multi-Material Mixer',
    badge: '🎨 User Recipe',
    description: 'Rasio campuran material kustom pilihan pengguna',
    blendRatios: { stone: 45, gravel: 35, dirt: 20 },
    accentColor: '#06b6d4',
  },
  {
    id: 'cyber',
    name: 'Neon Cyber Grid',
    subtitle: 'Synthetic Path',
    badge: '⚡ Cyberpunk',
    description: 'Jalan obsidian sintetis solid dengan jalur neon bercahaya',
    blendRatios: { stone: 50, gravel: 0, dirt: 0 },
    accentColor: '#06b6d4',
  },
];

/**
 * Apply Path Texture Brush: paints multi-material blended trail textures
 * and subtly grades the terrain height for a smooth walkable surface.
 */
export function applyPathBrush(
  centerWorldX: number,
  centerWorldZ: number,
  heights: Float32Array,
  colors: Float32Array,
  size: number,
  resolution: number,
  pathStyle: PathMaterial = 'blend_natural',
  radius = 2.2,
  intensity = 1.0,
  customBlend?: { stone: number; gravel: number; dirt: number }
): void {
  const halfSize = size / 2;
  const step = size / (resolution - 1);
  const radSq = radius * radius;

  const minU = Math.max(0, Math.floor(((centerWorldX - radius + halfSize) / size) * (resolution - 1)));
  const maxU = Math.min(resolution - 1, Math.ceil(((centerWorldX + radius + halfSize) / size) * (resolution - 1)));
  const minV = Math.max(0, Math.floor(((centerWorldZ - radius + halfSize) / size) * (resolution - 1)));
  const maxV = Math.min(resolution - 1, Math.ceil(((centerWorldZ + radius + halfSize) / size) * (resolution - 1)));

  // Calculate local average height to gently grade/smooth the pathway
  let avgH = 0;
  let count = 0;
  for (let j = minV; j <= maxV; j++) {
    for (let i = minU; i <= maxU; i++) {
      const x = -halfSize + i * step;
      const z = -halfSize + j * step;
      const dSq = (x - centerWorldX) * (x - centerWorldX) + (z - centerWorldZ) * (z - centerWorldZ);
      if (dSq <= radSq) {
        avgH += heights[j * resolution + i];
        count++;
      }
    }
  }
  if (count > 0) avgH /= count;

  for (let j = minV; j <= maxV; j++) {
    const z = -halfSize + j * step;
    for (let i = minU; i <= maxU; i++) {
      const x = -halfSize + i * step;
      const dSq = (x - centerWorldX) * (x - centerWorldX) + (z - centerWorldZ) * (z - centerWorldZ);
      if (dSq <= radSq) {
        const dist = Math.sqrt(dSq);
        const normDist = dist / radius; // 0 at center, 1 at edge

        // SOLID ROAD PROFILE:
        // 0.0 to 0.65 -> 100% Solid uniform road surface!
        // 0.65 to 1.0 -> Smooth cosine anti-aliased edge fading seamlessly into terrain.
        const falloff = normDist < 0.65
          ? 1.0
          : 0.5 * (1 + Math.cos(((normDist - 0.65) / 0.35) * Math.PI));
        const factor = clamp(intensity * falloff, 0, 1);
        const idx = j * resolution + i;

        // Leveled, solid roadbed (smoothes out ground bumps for clean walking/driving)
        heights[idx] = heights[idx] + (avgH - heights[idx]) * factor * 0.45;

        // Evaluate solid material color at this exact vertex
        const [targetR, targetG, targetB] = getPathMaterialColor(
          x,
          z,
          i,
          j,
          normDist,
          pathStyle,
          customBlend
        );

        const cIdx = idx * 3;
        colors[cIdx] = colors[cIdx] * (1 - factor) + targetR * factor;
        colors[cIdx + 1] = colors[cIdx + 1] * (1 - factor) + targetG * factor;
        colors[cIdx + 2] = colors[cIdx + 2] * (1 - factor) + targetB * factor;
      }
    }
  }
}

export interface GeneratedTrailResult {
  propPositions: {
    x: number;
    y: number;
    z: number;
    rotationY: number;
    type:
      | 'stepping_stones'
      | 'street_lamp'
      | 'cobblestone_path'
      | 'wooden_boardwalk'
      | 'trail_signpost'
      | 'wooden_stairs'
      | 'wooden_bridge'
      | 'path_curb_stones'
      | 'path_curb_with_foliage'
      | 'flower_patch'
      | 'meadow_grass'
      | string;
    segmentType?: string;
    scale?: [number, number, number];
  }[];
  segments: {
    name: string;
    description: string;
    blend: { stone: number; gravel: number; dirt: number };
    length: number;
  }[];
  trailPathPoints?: { x: number; z: number }[];
}

/**
 * Finds reliable, picturesque waypoints guaranteed to be on solid land above water level
 */
/**
 * Finds reliable, picturesque waypoints guaranteed to be on solid land above water level,
 * with spacious plaza aprons in front of buildings instead of cutting through structures.
 */
function findScenicLandWaypoints(
  heights: Float32Array,
  size: number,
  resolution: number,
  waterLevel: number,
  heightScale: number,
  prng: () => number,
  keyLocations?: { x: number; z: number }[]
): { x: number; z: number; name: string }[] {
  // If user has key locations (placed buildings), create spacious plaza waypoints outside the buildings
  if (keyLocations && keyLocations.length >= 2) {
    // 1. Calculate centroid of buildings
    const centerX = keyLocations.reduce((sum, loc) => sum + loc.x, 0) / keyLocations.length;
    const centerZ = keyLocations.reduce((sum, loc) => sum + loc.z, 0) / keyLocations.length;

    // 2. For each building, find an open plaza point 4.5 units away on firm dry land
    const plazaWaypoints = keyLocations.slice(0, 8).map((loc, i) => {
      let bestX = loc.x;
      let bestZ = loc.z;
      let bestScore = -Infinity;

      // Test 16 directions around the building at radius 4.6 units
      const radius = 4.6;
      for (let step = 0; step < 16; step++) {
        const angle = (step / 16) * Math.PI * 2;
        const testX = loc.x + Math.cos(angle) * radius;
        const testZ = loc.z + Math.sin(angle) * radius;
        const testH = getSampledHeightAt(testX, testZ, heights, size, resolution);

        // Discard if underwater or coastal mud
        if (testH < waterLevel + 0.45) continue;

        // Check clearance against other buildings
        const otherClose = keyLocations.some((other) => {
          if (other === loc) return false;
          const d = Math.hypot(other.x - testX, other.z - testZ);
          return d < 4.0;
        });
        if (otherClose) continue;

        // Score based on elevation safety and natural orientation facing the island/other buildings
        const distToCenter = Math.hypot(testX - centerX, testZ - centerZ);
        const score = (testH > waterLevel + 1.0 ? 5 : 1) - distToCenter * 0.08;
        if (score > bestScore) {
          bestScore = score;
          bestX = testX;
          bestZ = testZ;
        }
      }

      // If no valid direction found, default offset toward center
      if (bestScore === -Infinity) {
        const toCenterAngle = Math.atan2(centerZ - loc.z, centerX - loc.x);
        bestX = loc.x + Math.cos(toCenterAngle) * radius;
        bestZ = loc.z + Math.sin(toCenterAngle) * radius;
      }

      const polarAngle = Math.atan2(bestZ - centerZ, bestX - centerX);
      return {
        x: bestX,
        z: bestZ,
        name: `Plaza Bangunan ${i + 1}`,
        polarAngle,
      };
    });

    // 3. Sort waypoints by polar angle around centroid to form an elegant circular loop without criss-crosses
    plazaWaypoints.sort((a, b) => a.polarAngle - b.polarAngle);

    const list = plazaWaypoints.map(({ x, z, name }) => ({ x, z, name }));
    // Close the circuit
    list.push({ ...list[0] });
    return list;
  }

  const waypoints: { x: number; z: number; name: string }[] = [];

  // 1. Central Plaza Hub: Search near island center for optimal land elevation
  let bestCenter = { x: 0, z: 0, h: -999 };
  for (let r = 0; r <= size * 0.15; r += size * 0.03) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const ch = getSampledHeightAt(cx, cz, heights, size, resolution);
      if (ch > waterLevel + 0.6) {
        if (bestCenter.h === -999 || Math.abs(ch - (waterLevel + 2.5)) < Math.abs(bestCenter.h - (waterLevel + 2.5))) {
          bestCenter = { x: cx, z: cz, h: ch };
        }
      }
    }
  }
  if (bestCenter.h > waterLevel) {
    waypoints.push({ x: bestCenter.x, z: bestCenter.z, name: 'Village Central Plaza' });
  } else {
    waypoints.push({ x: 0, z: 0, name: 'Village Central Plaza' });
  }

  // 2. Discover scenic destinations distributed around the island in 4 cardinal quadrants
  const quadrantDefs = [
    { baseAngle: Math.PI * 0.20, name: 'Eastern Coastal Shore' },
    { baseAngle: Math.PI * 0.70, name: 'Southern Valley Basin' },
    { baseAngle: Math.PI * 1.25, name: 'Western Harbor Approach' },
    { baseAngle: Math.PI * 1.78, name: 'Northern Mountain Crest' },
  ];

  for (const quad of quadrantDefs) {
    let candidate: { x: number; z: number; name: string } | null = null;
    let bestScore = -Infinity;

    for (let da = -0.32; da <= 0.32; da += 0.11) {
      const a = quad.baseAngle + da + (prng() - 0.5) * 0.08;
      for (let dist = size * 0.12; dist <= size * 0.36; dist += size * 0.03) {
        const testX = Math.cos(a) * dist;
        const testZ = Math.sin(a) * dist;
        const testH = getSampledHeightAt(testX, testZ, heights, size, resolution);

        if (testH >= waterLevel + 0.6) {
          const score = dist * 1.2 + (testH > waterLevel + 1.2 ? 6 : 0) + (testH < heightScale * 0.8 ? 4 : 0);
          if (score > bestScore) {
            bestScore = score;
            candidate = { x: testX, z: testZ, name: quad.name };
          }
        }
      }
    }

    if (candidate) {
      waypoints.push(candidate);
    }
  }

  if (waypoints.length < 3) {
    const r = Math.max(10, size * 0.14);
    waypoints.push({ x: r, z: 0, name: 'East Overlook' });
    waypoints.push({ x: 0, z: r, name: 'South Promenade' });
    waypoints.push({ x: -r, z: 0, name: 'West Lookout' });
  }

  waypoints.push({ x: waypoints[0].x, z: waypoints[0].z, name: waypoints[0].name });
  return waypoints;
}

/**
 * Generates organic winding trails across the terrain with Adaptive Smartpath Artificial intelligence:
 * 1. Building Obstacle Repulsion: paths and props smoothly detour around buildings to prevent clipping.
 * 2. Bank-to-Bank Single Straight River Bridges: water crossings spawn exactly one straight timber bridge
 *    spanning directly across the river channel, eliminating duplicate/intersecting bridge pileups.
 * 3. Evenly Spaced & Aligned Roadside Curb Stones: curb stones and wildflowers are placed at elegant,
 *    consistent intervals along the road curvature with zero clutter at bridge/stair entrances.
 * 4. Steep Slope Wooden Stairs: only placed where slopes truly exceed climbing limits on dry land.
 */
export function generateProceduralTrails(
  heights: Float32Array,
  colors: Float32Array,
  config: TerrainConfig,
  keyLocations?: { x: number; z: number }[]
): GeneratedTrailResult {
  const { size, resolution, seed, pathStyle, waterLevel, heightScale, pathBlendRatios } = config;
  const prng = createPRNG(seed + 101);
  const propPositions: GeneratedTrailResult['propPositions'] = [];
  const segmentsMeta: GeneratedTrailResult['segments'] = [];

  const buildingObstacles = keyLocations || [];

  // 1. Guaranteed Land Waypoints with building plaza offsets
  const waypoints = findScenicLandWaypoints(
    heights,
    size,
    resolution,
    waterLevel,
    heightScale,
    prng,
    buildingObstacles
  );

  const userTrailWidth = Math.max(1.0, Math.min(6.0, config.trailWidth ?? 2.2));

  const SEGMENT_RECIPES = [
    {
      name: 'Village Central Plaza',
      description: 'Heavy cobblestone pavers with fine gravel mortar joints',
      style: 'blend_stone_gravel' as PathMaterial,
      blend: { stone: 78, gravel: 18, dirt: 4 },
      brushRad: userTrailWidth * 1.15,
    },
    {
      name: 'Pastoral Valley Trail',
      description: 'Natural 3-way blend with slate stepping stones, crushed pebble sub-base, and loam edges',
      style: 'blend_natural' as PathMaterial,
      blend: pathBlendRatios || { stone: 42, gravel: 38, dirt: 20 },
      brushRad: userTrailWidth,
    },
    {
      name: 'Mountain Ridge Crest',
      description: 'Solid weathered granite slabs and alpine scree gravel',
      style: 'stone' as PathMaterial,
      blend: { stone: 85, gravel: 15, dirt: 0 },
      brushRad: userTrailWidth * 0.9,
    },
    {
      name: 'Coastal Shoreline Approach',
      description: 'Moist seaside dirt and river gravel transitioning to tidal boardwalks',
      style: 'blend_dirt_gravel' as PathMaterial,
      blend: { stone: 12, gravel: 48, dirt: 40 },
      brushRad: userTrailWidth * 1.05,
    },
  ];

  interface PathVertex {
    x: number;
    z: number;
    y: number;
    segIdx: number;
    t: number;
    isWater: boolean;
    underBridge?: boolean;
    tangentX: number;
    tangentZ: number;
  }

  const rawPathPoints: PathVertex[] = [];

  // 2. Generate smooth Catmull-Rom spline curves with Building Obstacle Repulsion
  for (let w = 0; w < waypoints.length - 1; w++) {
    const p0 = waypoints[Math.max(0, w - 1)];
    const p1 = waypoints[w];
    const p2 = waypoints[w + 1];
    const p3 = waypoints[Math.min(waypoints.length - 1, w + 2)];

    const segmentRecipe = SEGMENT_RECIPES[w % SEGMENT_RECIPES.length];
    segmentsMeta.push({
      name: `${segmentRecipe.name} (${waypoints[w].name} → ${waypoints[w + 1].name})`,
      description: segmentRecipe.description,
      blend: segmentRecipe.blend,
      length: 40,
    });

    const steps = 36;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;

      // Accurate Catmull-Rom spline formulation
      let px = 0.5 * (
        (2 * p1.x) +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
      );
      let pz = 0.5 * (
        (2 * p1.z) +
        (-p0.z + p2.z) * t +
        (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
        (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3
      );

      // Subtle organic meander that smoothly fades to zero at waypoints
      const meanderEnvelope = Math.sin(t * Math.PI) * 0.45;
      px += Math.sin(t * Math.PI * 2 + w) * meanderEnvelope;
      pz += Math.cos(t * Math.PI * 2 + w) * meanderEnvelope;

      // Obstacle Repulsion Field: push spline away from all buildings
      const minSafeDistance = 4.4;
      for (const b of buildingObstacles) {
        const dx = px - b.x;
        const dz = pz - b.z;
        const dist = Math.hypot(dx, dz);
        if (dist < minSafeDistance && dist > 0.001) {
          const pushAngle = Math.atan2(dz, dx);
          px = b.x + Math.cos(pushAngle) * minSafeDistance;
          pz = b.z + Math.sin(pushAngle) * minSafeDistance;
        }
      }

      const py = getSampledHeightAt(px, pz, heights, size, resolution);
      const isWater = py <= waterLevel + 0.32;

      rawPathPoints.push({
        x: px,
        z: pz,
        y: py,
        segIdx: w,
        t,
        isWater,
        tangentX: 0,
        tangentZ: 0,
      });
    }
  }

  // Calculate tangents along spline
  for (let k = 0; k < rawPathPoints.length; k++) {
    const prev = rawPathPoints[Math.max(0, k - 1)];
    const next = rawPathPoints[Math.min(rawPathPoints.length - 1, k + 1)];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const len = Math.hypot(tx, tz);
    if (len > 0.001) {
      tx /= len;
      tz /= len;
    } else {
      tx = 1;
      tz = 0;
    }
    rawPathPoints[k].tangentX = tx;
    rawPathPoints[k].tangentZ = tz;
  }

  // 3. Bank-to-Bank Water Crossing Analyzer (Single Straight Bridge per Crossing)
  interface ExclusionZone {
    x: number;
    z: number;
    radius: number;
  }
  const bridgeExclusionZones: ExclusionZone[] = [];
  const stairsExclusionZones: ExclusionZone[] = [];

  let inWaterSpan = false;
  let spanStartIndex = -1;

  for (let i = 0; i <= rawPathPoints.length; i++) {
    const pt = i < rawPathPoints.length ? rawPathPoints[i] : null;
    const isWater = pt ? pt.isWater : false;

    if (isWater && !inWaterSpan) {
      inWaterSpan = true;
      spanStartIndex = i;
    } else if (!isWater && inWaterSpan) {
      inWaterSpan = false;
      const spanEndIndex = i - 1;

      // Identify dry land entry bank and exit bank
      const entryIdx = Math.max(0, spanStartIndex - 1);
      const exitIdx = Math.min(rawPathPoints.length - 1, spanEndIndex + 1);
      const entryPt = rawPathPoints[entryIdx];
      const exitPt = rawPathPoints[exitIdx];

      const spanDist = Math.hypot(exitPt.x - entryPt.x, exitPt.z - entryPt.z);

      // Only build a bridge for realistic traversable water crossings (between 2.5 and 26 units)
      if (spanDist >= 2.5 && spanDist <= 26.0) {
        const bx = (entryPt.x + exitPt.x) * 0.5;
        const bz = (entryPt.z + exitPt.z) * 0.5;
        const by = waterLevel + 0.38; // Deck elevated comfortably above water
        const bRotY = Math.atan2(exitPt.x - entryPt.x, exitPt.z - entryPt.z);
        // Scale along Z to bridge the exact water gap (bridge model base length ~ 7.2)
        const scaleZ = Math.min(2.8, Math.max(0.75, spanDist / 6.8));

        // Avoid placing bridge too close to any already placed bridge
        const tooClose = bridgeExclusionZones.some(
          (zone) => Math.hypot(zone.x - bx, zone.z - bz) < Math.max(7.0, zone.radius + 3.0)
        );

        if (!tooClose) {
          propPositions.push({
            x: bx,
            y: by,
            z: bz,
            rotationY: bRotY,
            type: 'wooden_bridge',
            segmentType: 'water_crossing',
            scale: [1, 1, scaleZ],
          });

          const exclusionRadius = Math.max(5.0, spanDist * 0.55);
          bridgeExclusionZones.push({ x: bx, z: bz, radius: exclusionRadius });

          // Mark all points inside this water span as underBridge so they are not textured or cluttered
          for (let j = spanStartIndex; j <= spanEndIndex; j++) {
            rawPathPoints[j].underBridge = true;
          }
        }
      }
    }
  }

  // 4. Steep Slope Wooden Stairs Detector (Only on genuine steep cliffs)
  if (config.autoInstallStairsAndBridges !== false) {
    let lastStairsDist = -999;
    for (let k = 3; k < rawPathPoints.length - 3; k += 2) {
      const curr = rawPathPoints[k];
      const prev = rawPathPoints[k - 3];

      if (curr.underBridge || prev.underBridge || curr.isWater || prev.isWater) continue;
      if (curr.y < waterLevel + 0.8 || prev.y < waterLevel + 0.8) continue;

      const dy = curr.y - prev.y;
      const dDist = Math.hypot(curr.x - prev.x, curr.z - prev.z);
      const slope = Math.abs(dy) / Math.max(0.01, dDist);

      // Only place stairs if slope is truly steep (> 0.55) and height rise is substantial (> 1.35)
      if (slope > 0.55 && Math.abs(dy) > 1.35) {
        const sx = (curr.x + prev.x) * 0.5;
        const sz = (curr.z + prev.z) * 0.5;
        const sy = (curr.y + prev.y) * 0.5;

        // Check clearance against bridges, buildings, and other stairs
        const nearBridge = bridgeExclusionZones.some((b) => Math.hypot(b.x - sx, b.z - sz) < b.radius + 2.5);
        const nearBuilding = buildingObstacles.some((b) => Math.hypot(b.x - sx, b.z - sz) < 4.5);
        const nearStairs = stairsExclusionZones.some((s) => Math.hypot(s.x - sx, s.z - sz) < 9.0);

        if (!nearBridge && !nearBuilding && !nearStairs) {
          const sRotY = Math.atan2(curr.x - prev.x, curr.z - prev.z) + (dy < 0 ? Math.PI : 0);
          propPositions.push({
            x: sx,
            y: sy,
            z: sz,
            rotationY: sRotY,
            type: 'wooden_stairs',
            segmentType: 'steep_slope',
          });
          stairsExclusionZones.push({ x: sx, z: sz, radius: 4.5 });
        }
      }
    }
  }

  // 5. Ground Texture Painting along land points
  for (const pt of rawPathPoints) {
    if (pt.underBridge || pt.isWater || pt.y < waterLevel - 0.2) continue;

    const segmentRecipe = SEGMENT_RECIPES[pt.segIdx % SEGMENT_RECIPES.length];
    let segmentBlend = segmentRecipe.blend;
    let segmentStyle = segmentRecipe.style;
    let brushRad = segmentRecipe.brushRad;

    if (pathStyle && pathStyle !== 'stone' && pathStyle !== 'blend_natural') {
      segmentStyle = pathStyle;
      if (pathBlendRatios) segmentBlend = pathBlendRatios;
    }

    if (pt.y <= waterLevel + 1.2) {
      segmentStyle = 'blend_dirt_gravel';
      segmentBlend = { stone: 10, gravel: 45, dirt: 45 };
      brushRad = userTrailWidth * 1.05;
    } else if (pt.y > heightScale * 0.45) {
      segmentStyle = 'stone';
      segmentBlend = { stone: 85, gravel: 15, dirt: 0 };
      brushRad = userTrailWidth * 0.9;
    }

    applyPathBrush(
      pt.x,
      pt.z,
      heights,
      colors,
      size,
      resolution,
      segmentStyle,
      brushRad,
      1.0,
      segmentBlend
    );
  }

  // Paint solid stone plaza aprons in front of buildings & waypoints
  for (const wp of waypoints) {
    const wpH = getSampledHeightAt(wp.x, wp.z, heights, size, resolution);
    if (wpH >= waterLevel + 0.3) {
      applyPathBrush(
        wp.x,
        wp.z,
        heights,
        colors,
        size,
        resolution,
        'blend_stone_gravel',
        userTrailWidth * 1.4,
        1.0,
        { stone: 80, gravel: 16, dirt: 4 }
      );
    }
  }

  // 6. Spaced & Aligned Roadside Edge Decorations (Curb Stones & Natural Wildflowers)
  if (config.trailEdgeDecoration !== false) {
    let accumulatedDist = 0;
    const stride = 4.2; // Clean, elegant spacing interval between curb props
    let nextPlacementDist = 2.0;

    for (let k = 1; k < rawPathPoints.length; k++) {
      const prev = rawPathPoints[k - 1];
      const curr = rawPathPoints[k];
      const stepDist = Math.hypot(curr.x - prev.x, curr.z - prev.z);
      accumulatedDist += stepDist;

      if (accumulatedDist >= nextPlacementDist) {
        nextPlacementDist = accumulatedDist + stride;

        // Skip if under bridge, in water, or too close to bridges/stairs/buildings
        if (curr.underBridge || curr.isWater || curr.y < waterLevel + 0.45) continue;

        const nearBridge = bridgeExclusionZones.some((b) => Math.hypot(b.x - curr.x, b.z - curr.z) < b.radius + 3.0);
        if (nearBridge) continue;

        const nearStairs = stairsExclusionZones.some((s) => Math.hypot(s.x - curr.x, s.z - curr.z) < s.radius + 2.0);
        if (nearStairs) continue;

        const nearBuilding = buildingObstacles.some((b) => Math.hypot(b.x - curr.x, b.z - curr.z) < 4.2);
        if (nearBuilding) continue;

        // Compute normal vector perpendicular to curve tangent
        const nx = -curr.tangentZ;
        const nz = curr.tangentX;
        const curbOffset = userTrailWidth * 0.95;

        // Alternate sides or place on both sides
        const decoPattern = Math.floor(accumulatedDist / stride) % 3;
        let decoType = 'path_curb_with_foliage';
        if (decoPattern === 1) decoType = 'path_curb_stones';
        else if (decoPattern === 2) decoType = (Math.floor(accumulatedDist) % 2 === 0) ? 'flower_patch' : 'meadow_grass';

        const rotTangent = Math.atan2(curr.tangentX, curr.tangentZ);

        // Left curb
        const lx = curr.x + nx * curbOffset;
        const lz = curr.z + nz * curbOffset;
        const ly = getSampledHeightAt(lx, lz, heights, size, resolution);
        if (ly >= waterLevel + 0.38) {
          propPositions.push({
            x: lx,
            y: ly,
            z: lz,
            rotationY: rotTangent,
            type: decoType,
            segmentType: 'trail_curb_edge',
            scale: (decoType === 'flower_patch' || decoType === 'meadow_grass') ? [0.85, 0.85, 0.85] : [1, 1, 1],
          });
        }

        // Right curb (alternate pattern)
        const rx = curr.x - nx * curbOffset;
        const rz = curr.z - nz * curbOffset;
        const ry = getSampledHeightAt(rx, rz, heights, size, resolution);
        if (ry >= waterLevel + 0.38) {
          const rightDecoType = decoType === 'path_curb_stones' ? 'path_curb_with_foliage' : 'path_curb_stones';
          propPositions.push({
            x: rx,
            y: ry,
            z: rz,
            rotationY: rotTangent + Math.PI,
            type: rightDecoType,
            segmentType: 'trail_curb_edge',
            scale: [1, 1, 1],
          });
        }
      }
    }
  }

  // 7. Tasteful Waypoint Lanterns & Signposts beside the trail
  for (let w = 0; w < waypoints.length - 1; w += 2) {
    const wp = waypoints[w];
    const wpH = getSampledHeightAt(wp.x, wp.z, heights, size, resolution);
    if (wpH < waterLevel + 0.45) continue;

    // Check clearance
    const nearBridge = bridgeExclusionZones.some((b) => Math.hypot(b.x - wp.x, b.z - wp.z) < b.radius + 2.5);
    const nearStairs = stairsExclusionZones.some((s) => Math.hypot(s.x - wp.x, s.z - wp.z) < s.radius + 2.0);
    const nearBuilding = buildingObstacles.some((b) => Math.hypot(b.x - wp.x, b.z - wp.z) < 3.0);

    if (!nearBridge && !nearStairs && !nearBuilding) {
      const sideAngle = prng() * Math.PI * 2;
      const lx = wp.x + Math.cos(sideAngle) * (userTrailWidth + 1.2);
      const lz = wp.z + Math.sin(sideAngle) * (userTrailWidth + 1.2);
      const ly = getSampledHeightAt(lx, lz, heights, size, resolution);

      if (ly >= waterLevel + 0.4) {
        propPositions.push({
          x: lx,
          y: ly,
          z: lz,
          rotationY: sideAngle + Math.PI,
          type: w % 4 === 0 ? 'street_lamp' : 'trail_signpost',
          segmentType: 'trail_waypoint',
        });
      }
    }
  }

  return {
    propPositions,
    segments: segmentsMeta,
    trailPathPoints: rawPathPoints.map((p) => ({ x: p.x, z: p.z })),
  };
}

export interface NavigationObstacle {
  x: number;
  z: number;
  radius: number;
  id?: string;
}

export interface AStarOptions {
  gridStep?: number;
  maxSlope?: number;
  allowWater?: boolean;
  bridges?: { x: number; z: number; radius: number }[];
  ignoreObstacleIds?: (string | null | undefined)[];
}

/**
 * A* search-based Pin-to-Pin navigation logic for procedural diorama terrain.
 * Calculates optimal paths between buildings, avoids solid obstacles with clearance buffers,
 * penalizes steep cliffs and deep water, prunes redundant nodes, and generates
 * a smooth sequence of 3D navigation nodes adhering closely to the terrain contour.
 */
export function findAStarPath(
  startPos: [number, number, number],
  endPos: [number, number, number],
  heights: Float32Array,
  terrainSize: number,
  resolution: number,
  waterLevel: number,
  obstacles: NavigationObstacle[] = [],
  options?: AStarOptions
): AStarNavigationResult {
  const gridStep = Math.max(1.0, options?.gridStep ?? 1.8);
  const maxSlope = options?.maxSlope ?? 0.65;
  const ignoreIds = new Set(options?.ignoreObstacleIds?.filter(Boolean) || []);
  const bridges = options?.bridges || [];

  // Filter out any explicitly ignored obstacles (e.g. current snapped building)
  const activeObstacles = obstacles.filter((obs) => !obs.id || !ignoreIds.has(obs.id));

  // Determine search bounding area around start and end
  const padding = Math.max(16, Math.hypot(endPos[0] - startPos[0], endPos[2] - startPos[2]) * 0.35);
  const minX = Math.max(-terrainSize * 0.46, Math.min(startPos[0], endPos[0]) - padding);
  const maxX = Math.min(terrainSize * 0.46, Math.max(startPos[0], endPos[0]) + padding);
  const minZ = Math.max(-terrainSize * 0.46, Math.min(startPos[2], endPos[2]) - padding);
  const maxZ = Math.min(terrainSize * 0.46, Math.max(startPos[2], endPos[2]) + padding);

  const cols = Math.max(5, Math.ceil((maxX - minX) / gridStep));
  const rows = Math.max(5, Math.ceil((maxZ - minZ) / gridStep));

  const worldToGrid = (x: number, z: number): [number, number] => {
    const gx = Math.max(0, Math.min(cols - 1, Math.round((x - minX) / gridStep)));
    const gz = Math.max(0, Math.min(rows - 1, Math.round((z - minZ) / gridStep)));
    return [gx, gz];
  };

  const gridToWorld = (gx: number, gz: number): [number, number] => {
    return [minX + gx * gridStep, minZ + gz * gridStep];
  };

  const [startGx, startGz] = worldToGrid(startPos[0], startPos[2]);
  const [endGx, endGz] = worldToGrid(endPos[0], endPos[2]);

  // Node key generator
  const toKey = (gx: number, gz: number) => gz * cols + gx;

  // Min-Heap Priority Queue for optimal A* performance
  interface PriorityQueueNode {
    gx: number;
    gz: number;
    f: number;
  }

  class MinHeap {
    heap: PriorityQueueNode[] = [];

    push(item: PriorityQueueNode) {
      this.heap.push(item);
      this.bubbleUp(this.heap.length - 1);
    }

    pop(): PriorityQueueNode | undefined {
      if (this.heap.length === 0) return undefined;
      const top = this.heap[0];
      const bottom = this.heap.pop()!;
      if (this.heap.length > 0) {
        this.heap[0] = bottom;
        this.sinkDown(0);
      }
      return top;
    }

    bubbleUp(idx: number) {
      while (idx > 0) {
        const parentIdx = (idx - 1) >> 1;
        if (this.heap[idx].f < this.heap[parentIdx].f) {
          const temp = this.heap[idx];
          this.heap[idx] = this.heap[parentIdx];
          this.heap[parentIdx] = temp;
          idx = parentIdx;
        } else {
          break;
        }
      }
    }

    sinkDown(idx: number) {
      const length = this.heap.length;
      while (true) {
        const leftIdx = (idx << 1) + 1;
        const rightIdx = leftIdx + 1;
        let smallest = idx;

        if (leftIdx < length && this.heap[leftIdx].f < this.heap[smallest].f) {
          smallest = leftIdx;
        }
        if (rightIdx < length && this.heap[rightIdx].f < this.heap[smallest].f) {
          smallest = rightIdx;
        }
        if (smallest !== idx) {
          const temp = this.heap[idx];
          this.heap[idx] = this.heap[smallest];
          this.heap[smallest] = temp;
          idx = smallest;
        } else {
          break;
        }
      }
    }

    get size() {
      return this.heap.length;
    }
  }

  const openSet = new MinHeap();
  const gScores = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const closedSet = new Set<number>();
  const exploredNodes: [number, number, number][] = [];

  const startKey = toKey(startGx, startGz);
  const endKey = toKey(endGx, endGz);

  gScores.set(startKey, 0);
  const startH = Math.hypot((endGx - startGx) * gridStep, (endGz - startGz) * gridStep);
  openSet.push({ gx: startGx, gz: startGz, f: startH });

  // 8-directional neighbor connectivity
  const neighbors = [
    { dx: 1, dz: 0, costMult: 1.0 },
    { dx: -1, dz: 0, costMult: 1.0 },
    { dx: 0, dz: 1, costMult: 1.0 },
    { dx: 0, dz: -1, costMult: 1.0 },
    { dx: 1, dz: 1, costMult: 1.414 },
    { dx: -1, dz: 1, costMult: 1.414 },
    { dx: 1, dz: -1, costMult: 1.414 },
    { dx: -1, dz: -1, costMult: 1.414 },
  ];

  let foundEnd = false;
  const maxIterations = 3500;
  let iterations = 0;
  let closestKey = startKey;
  let closestDist = Infinity;
  const avoidedObstacleIds = new Set<string>();

  while (openSet.size > 0 && iterations++ < maxIterations) {
    const current = openSet.pop()!;
    const curKey = toKey(current.gx, current.gz);

    if (closedSet.has(curKey)) continue;
    closedSet.add(curKey);

    const [curWx, curWz] = gridToWorld(current.gx, current.gz);
    const curDist = Math.hypot(curWx - endPos[0], curWz - endPos[2]);
    if (curDist < closestDist) {
      closestDist = curDist;
      closestKey = curKey;
    }

    // Collect debug explored nodes sample for UI visualization
    if (iterations % 6 === 0 && exploredNodes.length < 96) {
      const curH = getSampledHeightAt(curWx, curWz, heights, terrainSize, resolution);
      exploredNodes.push([curWx, curH + 0.12, curWz]);
    }

    if (current.gx === endGx && current.gz === endGz) {
      foundEnd = true;
      break;
    }

    const curG = gScores.get(curKey) ?? Infinity;
    const curHeight = getSampledHeightAt(curWx, curWz, heights, terrainSize, resolution);

    for (const offset of neighbors) {
      const nextGx = current.gx + offset.dx;
      const nextGz = current.gz + offset.dz;

      if (nextGx < 0 || nextGx >= cols || nextGz < 0 || nextGz >= rows) continue;

      const nextKey = toKey(nextGx, nextGz);
      if (closedSet.has(nextKey)) continue;

      const [nextWx, nextWz] = gridToWorld(nextGx, nextGz);

      // Check distance from destination/start: allow connecting right to doors
      const distToEnd = Math.hypot(nextWx - endPos[0], nextWz - endPos[2]);
      const distToStart = Math.hypot(nextWx - startPos[0], nextWz - startPos[2]);

      let isBlocked = false;
      let wallPenalty = 0;

      for (const obs of activeObstacles) {
        const d = Math.hypot(nextWx - obs.x, nextWz - obs.z);
        const isDoorwayAllowed = obs.id && ignoreIds.has(obs.id);
        const minClearance = isDoorwayAllowed ? obs.radius * 0.75 : obs.radius + 1.2;

        if (d < minClearance) {
          isBlocked = true;
          avoidedObstacleIds.add(obs.id || `${obs.x}_${obs.z}`);
          break;
        } else if (d < obs.radius + 3.2) {
          wallPenalty += (obs.radius + 3.2 - d) * 4.5;
        }
      }

      if (isBlocked) continue;

      const nextHeight = getSampledHeightAt(nextWx, nextWz, heights, terrainSize, resolution);
      const stepDist = gridStep * offset.costMult;
      const slope = Math.abs(nextHeight - curHeight) / stepDist;

      let slopePenalty = 0;
      if (slope > maxSlope) {
        slopePenalty = (slope - maxSlope) * 35.0;
      }

      let waterPenalty = 0;
      if (nextHeight <= waterLevel + 0.25) {
        const isNearBridge = bridges.some((b) => Math.hypot(b.x - nextWx, b.z - nextWz) < b.radius + 2.0);
        if (!isNearBridge) {
          waterPenalty = 45.0;
        }
      }

      const moveCost = stepDist + slopePenalty + waterPenalty + wallPenalty;
      const tentativeG = curG + moveCost;

      if (tentativeG < (gScores.get(nextKey) ?? Infinity)) {
        cameFrom.set(nextKey, curKey);
        gScores.set(nextKey, tentativeG);
        const h = Math.hypot(nextWx - endPos[0], nextWz - endPos[2]);
        openSet.push({ gx: nextGx, gz: nextGz, f: tentativeG + h });
      }
    }
  }

  // Reconstruct path from goal (or closest reached node) back to start
  const rawPathKeys: number[] = [];
  let currKey: number | undefined = foundEnd ? endKey : closestKey;

  while (currKey !== undefined) {
    rawPathKeys.push(currKey);
    if (currKey === startKey) break;
    currKey = cameFrom.get(currKey);
  }

  rawPathKeys.reverse();

  // Convert grid keys to 3D world coordinates
  const rawNodes: [number, number, number][] = [];
  rawNodes.push([...startPos]);

  for (let i = 0; i < rawPathKeys.length; i++) {
    const k = rawPathKeys[i];
    const gx = k % cols;
    const gz = Math.floor(k / cols);
    const [wx, wz] = gridToWorld(gx, gz);
    const wy = getSampledHeightAt(wx, wz, heights, terrainSize, resolution);
    if (Math.hypot(wx - startPos[0], wz - startPos[2]) > 0.8 && Math.hypot(wx - endPos[0], wz - endPos[2]) > 0.8) {
      rawNodes.push([wx, wy, wz]);
    }
  }

  rawNodes.push([...endPos]);

  // String pulling / node pruning: skip redundant intermediate nodes if line-of-sight is unobstructed
  const prunedNodes: [number, number, number][] = [];
  prunedNodes.push(rawNodes[0]);

  let currentIdx = 0;
  while (currentIdx < rawNodes.length - 1) {
    let furthestVisible = currentIdx + 1;
    for (let testIdx = currentIdx + 2; testIdx < Math.min(rawNodes.length, currentIdx + 12); testIdx++) {
      const p1 = rawNodes[currentIdx];
      const p2 = rawNodes[testIdx];
      let hasCollision = false;

      const dist = Math.hypot(p2[0] - p1[0], p2[2] - p1[2]);
      const checkSteps = Math.ceil(dist / 1.5);
      for (let s = 1; s < checkSteps; s++) {
        const alpha = s / checkSteps;
        const sx = p1[0] + (p2[0] - p1[0]) * alpha;
        const sz = p1[2] + (p2[2] - p1[2]) * alpha;
        for (const obs of activeObstacles) {
          if (Math.hypot(sx - obs.x, sz - obs.z) < obs.radius + 1.2) {
            hasCollision = true;
            break;
          }
        }
        if (hasCollision) break;
      }

      if (!hasCollision) {
        furthestVisible = testIdx;
      }
    }

    prunedNodes.push(rawNodes[furthestVisible]);
    currentIdx = furthestVisible;
  }

  // Smooth Catmull-Rom Spline Interpolation
  const smoothPoints: [number, number, number][] = [];
  const totalSegments = prunedNodes.length - 1;
  const stepsPerSegment = Math.max(8, Math.min(24, Math.floor(64 / Math.max(1, totalSegments))));

  const catmullRom = (p0: number, p1: number, p2: number, p3: number, t: number) => {
    const v0 = (p2 - p0) * 0.5;
    const v1 = (p3 - p1) * 0.5;
    const t2 = t * t;
    const t3 = t * t2;
    return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1;
  };

  let hasSteepSlope = false;
  let crossesWater = false;
  let totalLength = 0;

  for (let i = 0; i < prunedNodes.length - 1; i++) {
    const p0 = prunedNodes[Math.max(0, i - 1)];
    const p1 = prunedNodes[i];
    const p2 = prunedNodes[i + 1];
    const p3 = prunedNodes[Math.min(prunedNodes.length - 1, i + 2)];

    for (let s = 0; s < stepsPerSegment; s++) {
      const t = s / stepsPerSegment;
      const x = catmullRom(p0[0], p1[0], p2[0], p3[0], t);
      const z = catmullRom(p0[2], p1[2], p2[2], p3[2], t);
      const groundY = getSampledHeightAt(x, z, heights, terrainSize, resolution);

      if (groundY <= waterLevel + 0.3) crossesWater = true;

      const y = Math.max(groundY + 0.08, waterLevel + 0.28);
      smoothPoints.push([x, y, z]);
    }
  }

  // Append exact destination point
  const lastNode = prunedNodes[prunedNodes.length - 1];
  const lastGround = getSampledHeightAt(lastNode[0], lastNode[2], heights, terrainSize, resolution);
  smoothPoints.push([lastNode[0], Math.max(lastGround + 0.08, waterLevel + 0.28), lastNode[2]]);

  // Calculate length and slope
  for (let i = 1; i < smoothPoints.length; i++) {
    const pPrev = smoothPoints[i - 1];
    const pCurr = smoothPoints[i];
    const segDist = Math.hypot(pCurr[0] - pPrev[0], pCurr[1] - pPrev[1], pCurr[2] - pPrev[2]);
    totalLength += segDist;

    const horizDist = Math.hypot(pCurr[0] - pPrev[0], pCurr[2] - pPrev[2]);
    if (horizDist > 0.001) {
      const slope = Math.abs(pCurr[1] - pPrev[1]) / horizDist;
      if (slope > 0.45) hasSteepSlope = true;
    }
  }

  return {
    path: smoothPoints,
    nodes: prunedNodes,
    exploredNodes,
    totalCost: gScores.get(foundEnd ? endKey : closestKey) ?? totalLength,
    lengthMeters: Math.round(totalLength),
    hasSteepSlope,
    crossesWater,
    isDetoured: avoidedObstacleIds.size > 0,
    avoidedCount: avoidedObstacleIds.size,
  };
}

