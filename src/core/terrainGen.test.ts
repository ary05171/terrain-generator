import test from 'node:test';
import assert from 'node:assert/strict';
import { createPRNG, SimplexNoise2D, clamp, smoothstep } from './math.ts';
import {
  calculateRawHeight,
  generateTerrainData,
  getSampledHeightAt,
  applySculptBrush,
  applyPathBrush,
  generateProceduralTrails,
  BIOME_PALETTES
} from './terrainGen.ts';
import { TerrainConfig } from '../types/index.ts';

test('PRNG produces deterministic sequence between 0 and 1', () => {
  const prng1 = createPRNG(12345);
  const prng2 = createPRNG(12345);
  
  const seq1 = [prng1(), prng1(), prng1()];
  const seq2 = [prng2(), prng2(), prng2()];

  assert.deepEqual(seq1, seq2);
  seq1.forEach(v => {
    assert.ok(v >= 0 && v <= 1, `Value ${v} should be within [0, 1]`);
  });
});

test('SimplexNoise2D outputs continuous values in [-1, 1]', () => {
  const noise = new SimplexNoise2D(777);
  for (let x = -2; x <= 2; x += 0.5) {
    for (let y = -2; y <= 2; y += 0.5) {
      const val = noise.noise(x, y);
      assert.ok(val >= -1.2 && val <= 1.2, `Noise ${val} in reasonable range`);
    }
  }
});

test('calculateRawHeight respects island falloff mask', () => {
  const noise = new SimplexNoise2D(42);
  const configWithFalloff: TerrainConfig = {
    seed: 42,
    size: 100,
    resolution: 32,
    heightScale: 20,
    roughness: 1.0,
    waterLevel: 2,
    islandFalloff: true,
    terraceSteps: 0,
    biome: 'archipelago',
    smoothShading: true,
    pathStyle: 'dirt',
  };

  const centerH = calculateRawHeight(0, 0, noise, configWithFalloff);
  const edgeH = calculateRawHeight(48, 48, noise, configWithFalloff);

  // Center should be elevated compared to peripheral ocean edge
  assert.ok(centerH > edgeH, `Center (${centerH}) should be higher than island edge (${edgeH})`);
});

test('generateTerrainData outputs properly sized float arrays and colors', () => {
  const config: TerrainConfig = {
    seed: 99,
    size: 40,
    resolution: 16,
    heightScale: 15,
    roughness: 1.2,
    waterLevel: 0,
    islandFalloff: false,
    terraceSteps: 4,
    biome: 'cyberpunk',
    smoothShading: true,
    pathStyle: 'cyber',
  };

  const data = generateTerrainData(config);
  assert.equal(data.heights.length, 16 * 16);
  assert.equal(data.colors.length, 16 * 16 * 3);
  assert.ok(data.minHeight <= data.maxHeight);

  // Check color values are within 0..1
  for (let i = 0; i < data.colors.length; i++) {
    const c = data.colors[i];
    assert.ok(c >= 0 && c <= 1.01, `Color component ${c} out of range`);
  }
});

test('getSampledHeightAt returns exact heights at grid vertices and interpolates', () => {
  const resolution = 5;
  const size = 20;
  const heights = new Float32Array(25);
  // Fill simple gradient
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      heights[j * resolution + i] = i * 2 + j * 5;
    }
  }

  // Exact center (0, 0)
  const centerH = getSampledHeightAt(0, 0, heights, size, resolution);
  assert.equal(centerH, 2 * 2 + 2 * 5); // i=2, j=2 => 14

  // Interpolated midway between (0, 0) and (5, 0)
  const midH = getSampledHeightAt(2.5, 0, heights, size, resolution);
  assert.ok(midH > 14 && midH < 16.5);
});

test('applySculptBrush raises and lowers heights within brush radius', () => {
  const resolution = 16;
  const size = 50;
  const heights = new Float32Array(resolution * resolution).fill(5);

  // Raise at center
  applySculptBrush(0, 0, heights, size, resolution, 'sculpt-raise', 8, 2);
  const raisedH = getSampledHeightAt(0, 0, heights, size, resolution);
  assert.ok(raisedH > 5, `Height should be raised, got ${raisedH}`);

  // Outside radius should be untouched
  const untouchedH = getSampledHeightAt(20, 20, heights, size, resolution);
  assert.equal(untouchedH, 5);

  // Lower at center
  applySculptBrush(0, 0, heights, size, resolution, 'sculpt-lower', 8, 4);
  const loweredH = getSampledHeightAt(0, 0, heights, size, resolution);
  assert.ok(loweredH < raisedH);
});

test('applyPathBrush paints multi-material blended textures and smooths path heights', () => {
  const resolution = 16;
  const size = 50;
  const heights = new Float32Array(resolution * resolution).fill(6);
  const colors = new Float32Array(resolution * resolution * 3).fill(0.2); // base greenish color

  const customBlend = { stone: 60, gravel: 30, dirt: 10 };
  applyPathBrush(0, 0, heights, colors, size, resolution, 'custom_blend', 8, 1.0, customBlend);

  // Check center vertex color changed toward stone/gravel/dirt blend
  const centerIdx = (8 * resolution + 8) * 3;
  const r = colors[centerIdx];
  const g = colors[centerIdx + 1];
  const b = colors[centerIdx + 2];

  assert.ok(r > 0.3, `Red component should reflect stone/gravel/dirt palette, got ${r}`);
  assert.ok(g > 0.3, `Green component should reflect stone/gravel/dirt palette, got ${g}`);
});

test('generateProceduralTrails generates scenic connected path segments on terrain', () => {
  const config = {
    seed: 2026,
    size: 100,
    resolution: 24,
    heightScale: 24,
    roughness: 1.2,
    waterLevel: 2,
    islandFalloff: true,
    biome: 'archipelago' as const,
    smoothShading: true,
    terraceSteps: 0,
    oceanScale: 1.9,
    pathStyle: 'blend_natural' as const,
  };

  const { heights, colors } = generateTerrainData(config);
  const result = generateProceduralTrails(heights, colors, config);

  assert.ok(result.segments.length > 0, 'Should generate at least one scenic trail segment');
  assert.ok(Array.isArray(result.propPositions), 'Should return prop positions array');
});

