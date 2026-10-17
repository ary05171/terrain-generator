import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Minimize2 } from 'lucide-react';
import {
  BiomeType,
  BrushSettings,
  CustomAssetRecord,
  GraphicsPreset,
  PaletteItem,
  PerformanceMode,
  PlacedObject,
  TerrainConfig,
  TimeOfDay,
  LampSettings,
  TimeSettings,
} from './types';
import {
  generateTerrainData,
  getSampledHeightAt,
  generateProceduralTrails,
  generateBiomeColors,
  isPointOnRoad,
} from './core/terrainGen';
import { STANDARD_PALETTE } from './core/modelFactory';
import {
  exportHeightmapPNG,
  exportSceneAsGLTF,
  exportSceneAsOBJ,
  exportSceneAsThreeJSON,
  parseUploaded3DFile,
} from './core/assetIO';
import { createPRNG } from './core/math';
import { Viewport3D } from './components/Viewport3D';
import { TopBar } from './components/TopBar';
import { ControlDock } from './components/ControlDock';
import { GraphicsSettingsModal } from './components/GraphicsSettingsModal';
import { ResolutionScaleMenu } from './components/ResolutionScaleMenu';

const isMobileInitial = typeof window !== 'undefined' && (
  /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
  window.innerWidth < 768
);

const DEFAULT_TERRAIN_CONFIG: TerrainConfig = {
  seed: 2026,
  size: 110,
  resolution: isMobileInitial ? 48 : 64, // Silky smooth high-density mesh without jagged triangles
  heightScale: 28,
  roughness: 1.2,
  waterLevel: 2,
  islandFalloff: true,
  islandCoverage: 1.45, // broad, expansive island covering generous map area
  oceanScale: 1.9,      // balanced ocean framing without vast empty void
  terraceSteps: 0,
  biome: 'archipelago',
  smoothShading: true,  // Smooth solid organic surface without visible triangles
  pathStyle: 'blend_natural',
  pathBlendRatios: {
    stone: 40,
    gravel: 35,
    dirt: 25,
  },
  trailWidth: 2.2, // Natural slim walking trail proportion (diameter ~4.4 units)
  trailEdgeDecoration: true, // Dekorasi tepian: batu pembatas paving + rumput bunga
};

export default function App() {
  const [terrainConfig, setTerrainConfig] = useState<TerrainConfig>(DEFAULT_TERRAIN_CONFIG);
  const [terrainData, setTerrainData] = useState(() => generateTerrainData(DEFAULT_TERRAIN_CONFIG));
  const [placedObjects, setPlacedObjects] = useState<PlacedObject[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [activePaletteItem, setActivePaletteItem] = useState<PaletteItem | null>(STANDARD_PALETTE[0]);
  const [customAssets, setCustomAssets] = useState<CustomAssetRecord[]>([]);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('golden');
  const [trailPoints, setTrailPoints] = useState<{ x: number; z: number }[]>([]);

  // 24-Hour Day-Night Cycle & Interactive Time Controller
  const [timeSettings, setTimeSettings] = useState<TimeSettings>({
    timeHour: 17.5, // 17:30 (Golden Hour dusk transition)
    isPlaying: false,
    speed: 2,
  });
  const [dockTab, setDockTab] = useState<'terrain' | 'sculpt' | 'place' | 'lighting' | 'assets' | 'export'>('terrain');

  // Lamp Ground Light & Shadow Fill Settings
  const [lampSettings, setLampSettings] = useState<LampSettings>({
    mode: 'auto',
    intensity: 1.0,
    radius: 1.0,
    pulsing: true,
    ambientBrightness: 1.25, // Boosted shadow fill brightness
  });

  const [isDockCollapsed, setIsDockCollapsed] = useState(false);
  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>(isMobileInitial ? 'mobile' : 'balanced');
  const [graphicsPreset, setGraphicsPreset] = useState<GraphicsPreset>(isMobileInitial ? 'LOW' : 'MEDIUM');
  const [renderScale, setRenderScale] = useState<number>(isMobileInitial ? 0.75 : 1.0);
  const [isGraphicsModalOpen, setIsGraphicsModalOpen] = useState(false);
  const [isResolutionMenuOpen, setIsResolutionMenuOpen] = useState(false);
  const [fps, setFps] = useState<number>(60);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Fullscreen Mode State & Browser API Sync
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Day-Night continuous animation loop when isPlaying is active
  useEffect(() => {
    if (!timeSettings.isPlaying) return;

    let lastTime = performance.now();
    let frameId: number;

    const loop = (now: number) => {
      const deltaSec = (now - lastTime) / 1000;
      lastTime = now;

      // 1 real second = 0.25 hour at 1x speed (full 24h cycle in ~96 seconds at 1x, or ~19 seconds at 5x)
      const hoursAdvance = deltaSec * 0.25 * timeSettings.speed;

      setTimeSettings((prev) => {
        if (!prev.isPlaying) return prev;
        const nextHour = (prev.timeHour + hoursAdvance) % 24;
        return { ...prev, timeHour: nextHour };
      });

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [timeSettings.isPlaying, timeSettings.speed]);

  const handleTimeHourChange = useCallback((newHour: number) => {
    setTimeSettings((prev) => ({ ...prev, timeHour: newHour }));
    if (newHour >= 5.5 && newHour < 8.0) setTimeOfDay('golden');
    else if (newHour >= 8.0 && newHour < 16.5) setTimeOfDay('day');
    else if (newHour >= 16.5 && newHour < 18.2) setTimeOfDay('golden');
    else if (newHour >= 18.2 && newHour < 19.5) setTimeOfDay('sunset');
    else if (newHour >= 19.5 && newHour < 22.0) setTimeOfDay('cyberpunk');
    else setTimeOfDay('night');
  }, []);

  const handleTimeOfDayChange = useCallback((t: TimeOfDay) => {
    setTimeOfDay(t);
    let targetHour = 12.0;
    if (t === 'day') targetHour = 12.0;
    else if (t === 'golden') targetHour = 17.5;
    else if (t === 'sunset') targetHour = 18.7;
    else if (t === 'cyberpunk') targetHour = 21.0;
    else if (t === 'night') targetHour = 0.0;
    setTimeSettings((prev) => ({ ...prev, timeHour: targetHour }));
  }, []);

  const handleOpenLightingTab = useCallback(() => {
    setIsDockCollapsed(false);
    setDockTab('lighting');
  }, []);

  const [brushSettings, setBrushSettings] = useState<BrushSettings>({
    mode: 'select',
    radius: 12,
    intensity: 1.2,
    flattenHeight: 5,
    pathStyle: 'blend_natural',
    pathBlendRatios: {
      stone: 40,
      gravel: 35,
      dirt: 25,
    },
    placementScale: 1.0,
    autoInstallStairsAndBridges: true,
    trailWidth: 2.2,
    trailEdgeDecoration: true,
  });

  // Undo / Redo history stacks (tracking heightmaps + placedObjects + trailPoints)
  interface HistorySnapshot {
    heights: Float32Array;
    colors: Float32Array;
    objects: PlacedObject[];
    trailPoints?: { x: number; z: number }[];
  }
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // References to Three.js scene & export group
  const sceneRef = useRef<THREE.Scene | null>(null);
  const exportGroupRef = useRef<THREE.Group | null>(null);

  // Push new state to history
  const pushHistory = useCallback((snapshot: HistorySnapshot) => {
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIndex + 1);
      return [...sliced, snapshot].slice(-20); // keep last 20 steps
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 19));
  }, [historyIndex]);

  // Regenerate terrain based on current config
  const handleRegenerateTerrain = useCallback((config = terrainConfig) => {
    const data = generateTerrainData(config);
    setTerrainData(data);
    pushHistory({
      heights: new Float32Array(data.heights),
      colors: new Float32Array(data.colors),
      objects: placedObjects,
    });
  }, [terrainConfig, placedObjects, pushHistory]);

  // Initial population of biome with stylized layout
  const populateBiome = useCallback(
    (biome: BiomeType, count = 28, heights = terrainData.heights, seed = terrainConfig.seed) => {
      const prng = createPRNG(seed + 42);
      const objects: PlacedObject[] = [];
      const size = terrainConfig.size;
      const res = terrainConfig.resolution;
      const waterLvl = terrainConfig.waterLevel;

      // Select candidate items per biome with natural distribution (including lush meadow grass)
      let candidateTypes: { type: string; category: any; name: string }[] = [];
      if (biome === 'archipelago') {
        candidateTypes = [
          { type: 'meadow_grass', category: 'foliage', name: 'Rumput Padang' },
          { type: 'meadow_grass', category: 'foliage', name: 'Rumput Padang' },
          { type: 'flower_patch', category: 'foliage', name: 'Bunga Padang' },
          { type: 'broadleaf_tree', category: 'foliage', name: 'Canopy Oak' },
          { type: 'broadleaf_tree', category: 'foliage', name: 'Canopy Oak' },
          { type: 'pine_tree', category: 'foliage', name: 'Alpine Pine' },
          { type: 'alpine_cottage', category: 'building', name: 'Alpine Chalet' },
          { type: 'stone_windmill', category: 'building', name: 'Stone Windmill' },
          { type: 'street_lamp', category: 'prop', name: 'Street Lantern' },
          { type: 'island_lighthouse', category: 'building', name: 'Coastal Lighthouse' },
        ];
      } else if (biome === 'cyberpunk') {
        candidateTypes = [
          { type: 'cyber_skyscraper', category: 'cyber', name: 'Neo Cyber Tower' },
          { type: 'cyber_apartment', category: 'cyber', name: 'Modular Highrise' },
          { type: 'cyber_apartment', category: 'cyber', name: 'Modular Highrise' },
          { type: 'wind_turbine', category: 'prop', name: 'Clean Wind Turbine' },
          { type: 'street_lamp', category: 'prop', name: 'Street Lantern' },
          { type: 'street_lamp', category: 'prop', name: 'Street Lantern' },
        ];
      } else if (biome === 'alpine') {
        candidateTypes = [
          { type: 'meadow_grass', category: 'foliage', name: 'Rumput Padang' },
          { type: 'meadow_grass', category: 'foliage', name: 'Rumput Padang' },
          { type: 'pine_tree', category: 'foliage', name: 'Alpine Pine' },
          { type: 'pine_tree', category: 'foliage', name: 'Alpine Pine' },
          { type: 'alpine_cottage', category: 'building', name: 'Alpine Chalet' },
          { type: 'stone_windmill', category: 'building', name: 'Stone Windmill' },
          { type: 'wind_turbine', category: 'prop', name: 'Clean Wind Turbine' },
        ];
      } else if (biome === 'canyon') {
        candidateTypes = [
          { type: 'desert_monolith', category: 'prop', name: 'Mesa Ruin Arch' },
          { type: 'desert_monolith', category: 'prop', name: 'Mesa Ruin Arch' },
          { type: 'wind_turbine', category: 'prop', name: 'Clean Wind Turbine' },
          { type: 'street_lamp', category: 'prop', name: 'Street Lantern' },
        ];
      } else if (biome === 'oasis') {
        candidateTypes = [
          { type: 'fantasy_crystal', category: 'fantasy', name: 'Resonant Crystal' },
          { type: 'fantasy_crystal', category: 'fantasy', name: 'Resonant Crystal' },
          { type: 'scifi_dome', category: 'building', name: 'Biosphere Dome' },
          { type: 'meadow_grass', category: 'foliage', name: 'Rumput Padang' },
          { type: 'flower_patch', category: 'foliage', name: 'Bunga Padang' },
          { type: 'broadleaf_tree', category: 'foliage', name: 'Canopy Oak' },
        ];
      } else {
        candidateTypes = [
          { type: 'meadow_grass', category: 'foliage', name: 'Rumput Padang' },
          { type: 'flower_patch', category: 'foliage', name: 'Bunga Padang' },
          { type: 'pine_tree', category: 'foliage', name: 'Alpine Pine' },
          { type: 'broadleaf_tree', category: 'foliage', name: 'Canopy Oak' },
          { type: 'alpine_cottage', category: 'building', name: 'Alpine Chalet' },
          { type: 'stone_windmill', category: 'building', name: 'Stone Windmill' },
          { type: 'street_lamp', category: 'prop', name: 'Street Lantern' },
        ];
      }

      const half = size * 0.4;
      let attempts = 0;

      while (objects.length < count && attempts < count * 8) {
        attempts++;
        const x = (prng() * 2 - 1) * half;
        const z = (prng() * 2 - 1) * half;
        const y = getSampledHeightAt(x, z, heights, size, res);

        // Avoid placement underwater
        if (y < waterLvl + 0.3) continue;

        // Pick item first to determine optimal clearances
        const item = candidateTypes[Math.floor(prng() * candidateTypes.length)];
        const isGrass = item.type === 'meadow_grass' || item.type === 'flower_patch';
        const isBuilding = item.category === 'building' || item.category === 'cyber';
        const isTree = item.type.includes('tree');
        const minClearance = isGrass ? 2.2 : isBuilding ? 6.5 : 4.5;
        const roadClearance = isBuilding ? 4.5 : isTree ? 3.0 : isGrass ? 1.5 : 2.4;

        // Cegah penyebaran objek menimpa jalan
        if (
          isPointOnRoad(
            x,
            z,
            terrainData.colors,
            heights,
            size,
            res,
            terrainConfig,
            [...placedObjects, ...objects],
            trailPoints,
            roadClearance
          )
        ) {
          continue;
        }

        // Check distance to existing placed objects to prevent unnatural overlap
        const tooClose = [...placedObjects, ...objects].some((o) => {
          const dx = o.position[0] - x;
          const dz = o.position[2] - z;
          return Math.sqrt(dx * dx + dz * dz) < minClearance;
        });
        if (tooClose) continue;

        const rotY = prng() * Math.PI * 2;
        const isFoliage = item.category === 'foliage';
        const tiltX = isFoliage ? (prng() * 2 - 1) * 0.08 : 0;
        const tiltZ = isFoliage ? (prng() * 2 - 1) * 0.08 : 0;
        const scaleVariation = 0.78 + prng() * 0.44;
        const scaleY = isFoliage ? scaleVariation * (0.88 + prng() * 0.26) : scaleVariation;

        objects.push({
          id: `obj_${Date.now()}_${objects.length}`,
          name: item.name,
          type: item.type,
          category: item.category,
          position: [x, y, z],
          rotation: [tiltX, rotY, tiltZ],
          scale: [scaleVariation, scaleY, scaleVariation],
        });
      }

      setPlacedObjects(objects);
      pushHistory({
        heights: new Float32Array(heights),
        colors: new Float32Array(terrainData.colors),
        objects,
        trailPoints,
      });
    },
    [terrainConfig, terrainData, pushHistory, trailPoints, placedObjects]
  );

  // 1. Scatter specific selected object (Sebar per Objek)
  const handleScatterSpecificObject = useCallback(
    (paletteItem: PaletteItem, count = 30, replaceExisting = false) => {
      const prng = createPRNG(Date.now() + Math.floor(Math.random() * 1000));
      const size = terrainConfig.size;
      const res = terrainConfig.resolution;
      const waterLvl = terrainConfig.waterLevel;
      const isFoliage = paletteItem.category === 'foliage';
      const isGrass = paletteItem.id === 'meadow_grass' || paletteItem.id === 'flower_patch';
      const isBuilding = paletteItem.category === 'building' || paletteItem.category === 'cyber';
      const isTree = paletteItem.id.includes('tree');
      const minDistance = isGrass ? 1.5 : isFoliage ? 2.8 : 6.8;
      const roadBuffer = isBuilding ? 4.8 : isTree ? 3.2 : isGrass ? 1.5 : 2.5;

      const baseList = replaceExisting
        ? placedObjects.filter((o) => o.type !== paletteItem.id)
        : [...placedObjects];

      const newObjects: PlacedObject[] = [];
      const half = size * 0.42;
      let attempts = 0;

      while (newObjects.length < count && attempts < count * 10) {
        attempts++;
        const x = (prng() * 2 - 1) * half;
        const z = (prng() * 2 - 1) * half;
        const y = getSampledHeightAt(x, z, terrainData.heights, size, res);

        if (y < waterLvl + 0.25) continue;

        // Cegah penyebaran objek menimpa jalan
        if (
          paletteItem.category !== 'path' &&
          isPointOnRoad(
            x,
            z,
            terrainData.colors,
            terrainData.heights,
            size,
            res,
            terrainConfig,
            [...baseList, ...newObjects],
            trailPoints,
            roadBuffer
          )
        ) {
          continue;
        }

        const tooClose = [...baseList, ...newObjects].some((o) => {
          const dx = o.position[0] - x;
          const dz = o.position[2] - z;
          return Math.sqrt(dx * dx + dz * dz) < minDistance;
        });
        if (tooClose) continue;

        const rotY = prng() * Math.PI * 2;
        const tiltX = isFoliage ? (prng() * 2 - 1) * 0.08 : 0;
        const tiltZ = isFoliage ? (prng() * 2 - 1) * 0.08 : 0;
        const scaleVariation = 0.78 + prng() * 0.44;
        const scaleY = isFoliage ? scaleVariation * (0.88 + prng() * 0.26) : scaleVariation;
        const baseScale = paletteItem.defaultScale || [1, 1, 1];

        newObjects.push({
          id: `obj_${Date.now()}_${newObjects.length}_${Math.floor(prng() * 1000)}`,
          name: paletteItem.name,
          type: paletteItem.id,
          category: paletteItem.category,
          position: [x, y, z],
          rotation: [tiltX, rotY, tiltZ],
          scale: [
            baseScale[0] * scaleVariation,
            baseScale[1] * scaleY,
            baseScale[2] * scaleVariation,
          ],
          customModelKey: paletteItem.isCustom ? paletteItem.id : undefined,
        });

        // "dan bila tambah objek bunga perolehan tumpang tindih dengan rumput acak":
        // For each flower patch, co-scatter companion meadow grass clumps around it so they intertwine naturally!
        if (paletteItem.id === 'flower_patch') {
          const companionCount = 1 + Math.floor(prng() * 2);
          for (let c = 0; c < companionCount; c++) {
            const offsetAngle = prng() * Math.PI * 2;
            const offsetDist = 0.45 + prng() * 0.70;
            const cx = x + Math.cos(offsetAngle) * offsetDist;
            const cz = z + Math.sin(offsetAngle) * offsetDist;
            const cy = getSampledHeightAt(cx, cz, terrainData.heights, size, res);
            if (cy >= waterLvl + 0.15) {
              // Cegah rumput pendamping menimpa jalan
              if (
                isPointOnRoad(
                  cx,
                  cz,
                  terrainData.colors,
                  terrainData.heights,
                  size,
                  res,
                  terrainConfig,
                  [...baseList, ...newObjects],
                  trailPoints,
                  1.4
                )
              ) {
                continue;
              }

              const grassScale = (0.75 + prng() * 0.38) * scaleVariation;
              newObjects.push({
                id: `obj_cgrass_${Date.now()}_${newObjects.length}_${c}`,
                name: 'Rumput Padang',
                type: 'meadow_grass',
                category: 'foliage',
                position: [cx, cy, cz],
                rotation: [(prng() * 2 - 1) * 0.08, prng() * Math.PI * 2, (prng() * 2 - 1) * 0.08],
                scale: [grassScale, grassScale * (0.88 + prng() * 0.28), grassScale],
              });
            }
          }
        }
      }

      const combined = [...baseList, ...newObjects];
      setPlacedObjects(combined);
      pushHistory({
        heights: new Float32Array(terrainData.heights),
        colors: new Float32Array(terrainData.colors),
        objects: combined,
      });

      setToastMessage(
        paletteItem.id === 'flower_patch'
          ? `${newObjects.length} bunga & rumput liar berhasil disebar bebas dari jalan!`
          : `${newObjects.length}x ${paletteItem.name} berhasil disebar bebas dari jalan!`
      );
      setTimeout(() => setToastMessage(null), 3500);
    },
    [terrainConfig, terrainData, placedObjects, pushHistory, trailPoints]
  );

  // 2. Scatter buildings only (Acak Bangunan)
  const handleScatterBuildings = useCallback(
    (count = 12, replaceExisting = false) => {
      const prng = createPRNG(Date.now() + 101);
      const size = terrainConfig.size;
      const res = terrainConfig.resolution;
      const waterLvl = terrainConfig.waterLevel;

      // Select candidate buildings based on biome or general architectural pool
      let buildingTypes: { type: string; category: any; name: string }[] = [];
      if (terrainConfig.biome === 'cyberpunk') {
        buildingTypes = [
          { type: 'cyber_skyscraper', category: 'cyber', name: 'Neo Cyber Tower' },
          { type: 'cyber_apartment', category: 'cyber', name: 'Modular Highrise' },
          { type: 'cyber_apartment', category: 'cyber', name: 'Modular Highrise' },
          { type: 'wind_turbine', category: 'prop', name: 'Clean Wind Turbine' },
        ];
      } else if (terrainConfig.biome === 'oasis') {
        buildingTypes = [
          { type: 'scifi_dome', category: 'building', name: 'Biosphere Dome' },
          { type: 'alpine_cottage', category: 'building', name: 'Alpine Chalet' },
          { type: 'stone_windmill', category: 'building', name: 'Stone Windmill' },
        ];
      } else {
        buildingTypes = [
          { type: 'alpine_cottage', category: 'building', name: 'Alpine Chalet' },
          { type: 'alpine_cottage', category: 'building', name: 'Alpine Chalet' },
          { type: 'stone_windmill', category: 'building', name: 'Stone Windmill' },
          { type: 'island_lighthouse', category: 'building', name: 'Coastal Lighthouse' },
        ];
      }

      const baseList = replaceExisting
        ? placedObjects.filter((o) => o.category !== 'building' && o.category !== 'cyber')
        : [...placedObjects];

      const newObjects: PlacedObject[] = [];
      const half = size * 0.38;
      let attempts = 0;

      while (newObjects.length < count && attempts < count * 10) {
        attempts++;
        const x = (prng() * 2 - 1) * half;
        const z = (prng() * 2 - 1) * half;
        const y = getSampledHeightAt(x, z, terrainData.heights, size, res);

        // Avoid water
        if (y < waterLvl + 0.4) continue;

        // Cegah bangunan menimpa jalan (buffer luas 4.8 unit)
        if (
          isPointOnRoad(
            x,
            z,
            terrainData.colors,
            terrainData.heights,
            size,
            res,
            terrainConfig,
            [...baseList, ...newObjects],
            trailPoints,
            4.8
          )
        ) {
          continue;
        }

        // Buildings need good distance so they don't overlap awkwardly
        const tooClose = [...baseList, ...newObjects].some((o) => {
          const dx = o.position[0] - x;
          const dz = o.position[2] - z;
          const distReq = o.category === 'building' || o.category === 'cyber' ? 7.5 : 4.0;
          return Math.sqrt(dx * dx + dz * dz) < distReq;
        });
        if (tooClose) continue;

        const candidate = buildingTypes[Math.floor(prng() * buildingTypes.length)];
        const rotY = (Math.floor(prng() * 8) * Math.PI) / 4; // natural 45° snapped angles for buildings
        const scaleVariation = 0.9 + prng() * 0.25;

        newObjects.push({
          id: `bld_${Date.now()}_${newObjects.length}`,
          name: candidate.name,
          type: candidate.type,
          category: candidate.category,
          position: [x, y, z],
          rotation: [0, rotY, 0],
          scale: [scaleVariation, scaleVariation, scaleVariation],
        });
      }

      const combined = [...baseList, ...newObjects];
      setPlacedObjects(combined);
      pushHistory({
        heights: new Float32Array(terrainData.heights),
        colors: new Float32Array(terrainData.colors),
        objects: combined,
        trailPoints,
      });

      setToastMessage(
        `${newObjects.length} bangunan pemukiman berhasil diacak bebas dari jalan!`
      );
      setTimeout(() => setToastMessage(null), 3500);
    },
    [terrainConfig, terrainData, placedObjects, pushHistory, trailPoints]
  );

  // 3. Scatter vegetation only (Acak Tumbuhan & Rumput)
  const handleScatterVegetation = useCallback(
    (count = 35, replaceExisting = false) => {
      const prng = createPRNG(Date.now() + 202);
      const size = terrainConfig.size;
      const res = terrainConfig.resolution;
      const waterLvl = terrainConfig.waterLevel;

      const vegCandidates: { type: string; category: any; name: string; weight: number }[] = [
        { type: 'meadow_grass', category: 'foliage', name: 'Rumput Padang', weight: 4 },
        { type: 'flower_patch', category: 'foliage', name: 'Bunga Padang', weight: 2 },
        { type: 'broadleaf_tree', category: 'foliage', name: 'Canopy Oak', weight: 2 },
        { type: 'pine_tree', category: 'foliage', name: 'Alpine Pine', weight: 2 },
      ];

      // Flatten weighted pool
      const pool: { type: string; category: any; name: string }[] = [];
      vegCandidates.forEach((c) => {
        for (let i = 0; i < c.weight; i++) {
          pool.push({ type: c.type, category: c.category, name: c.name });
        }
      });

      const baseList = replaceExisting
        ? placedObjects.filter((o) => o.category !== 'foliage')
        : [...placedObjects];

      const newObjects: PlacedObject[] = [];
      const half = size * 0.44;
      let attempts = 0;

      while (newObjects.length < count && attempts < count * 8) {
        attempts++;
        const x = (prng() * 2 - 1) * half;
        const z = (prng() * 2 - 1) * half;
        const y = getSampledHeightAt(x, z, terrainData.heights, size, res);

        if (y < waterLvl + 0.2) continue;

        const candidate = pool[Math.floor(prng() * pool.length)];
        const isGrass = candidate.type === 'meadow_grass' || candidate.type === 'flower_patch';
        const isTree = candidate.type.includes('tree');
        const minDist = isGrass ? 1.6 : 3.5;
        const roadBuffer = isTree ? 3.2 : isGrass ? 1.5 : 2.5;

        // Cegah tumbuhan menimpa jalan
        if (
          isPointOnRoad(
            x,
            z,
            terrainData.colors,
            terrainData.heights,
            size,
            res,
            terrainConfig,
            [...baseList, ...newObjects],
            trailPoints,
            roadBuffer
          )
        ) {
          continue;
        }

        const tooClose = [...baseList, ...newObjects].some((o) => {
          const dx = o.position[0] - x;
          const dz = o.position[2] - z;
          return Math.sqrt(dx * dx + dz * dz) < minDist;
        });
        if (tooClose) continue;

        const rotY = prng() * Math.PI * 2;
        const tiltX = (prng() * 2 - 1) * 0.08;
        const tiltZ = (prng() * 2 - 1) * 0.08;
        const scaleVariation = 0.78 + prng() * 0.44;
        const scaleY = scaleVariation * (0.88 + prng() * 0.28);

        newObjects.push({
          id: `veg_${Date.now()}_${newObjects.length}`,
          name: candidate.name,
          type: candidate.type,
          category: candidate.category,
          position: [x, y, z],
          rotation: [tiltX, rotY, tiltZ],
          scale: [scaleVariation, scaleY, scaleVariation],
        });
      }

      const combined = [...baseList, ...newObjects];
      setPlacedObjects(combined);
      pushHistory({
        heights: new Float32Array(terrainData.heights),
        colors: new Float32Array(terrainData.colors),
        objects: combined,
      });

      setToastMessage(
        `${newObjects.length} tumbuhan & rumput padang berhasil diacak bebas dari jalan!`
      );
      setTimeout(() => setToastMessage(null), 3500);
    },
    [terrainConfig, terrainData, placedObjects, pushHistory, trailPoints]
  );

  // 4. Quick Meadow Grass Fill (Hamparan Rumput Padang)
  const handleScatterMeadowGrass = useCallback(
    (count = 50, replaceExisting = false) => {
      const prng = createPRNG(Date.now() + 303);
      const size = terrainConfig.size;
      const res = terrainConfig.resolution;
      const waterLvl = terrainConfig.waterLevel;

      const baseList = replaceExisting
        ? placedObjects.filter((o) => o.type !== 'meadow_grass' && o.type !== 'flower_patch')
        : [...placedObjects];

      const newObjects: PlacedObject[] = [];
      const half = size * 0.44;
      let attempts = 0;

      while (newObjects.length < count && attempts < count * 8) {
        attempts++;
        const x = (prng() * 2 - 1) * half;
        const z = (prng() * 2 - 1) * half;
        const y = getSampledHeightAt(x, z, terrainData.heights, size, res);

        // Only on elevations above water level
        if (y < waterLvl + 0.25) continue;

        // Cegah rumput menimpa jalan
        if (
          isPointOnRoad(
            x,
            z,
            terrainData.colors,
            terrainData.heights,
            size,
            res,
            terrainConfig,
            [...baseList, ...newObjects],
            trailPoints,
            1.6
          )
        ) {
          continue;
        }

        const tooClose = [...baseList, ...newObjects].some((o) => {
          const dx = o.position[0] - x;
          const dz = o.position[2] - z;
          return Math.sqrt(dx * dx + dz * dz) < 1.4;
        });
        if (tooClose) continue;

        // 80% rumput padang, 20% bunga padang
        const isFlower = prng() < 0.22;
        const itemType = isFlower ? 'flower_patch' : 'meadow_grass';
        const itemName = isFlower ? 'Bunga Padang' : 'Rumput Padang';
        const rotY = prng() * Math.PI * 2;
        const tiltX = (prng() * 2 - 1) * 0.07;
        const tiltZ = (prng() * 2 - 1) * 0.07;
        const scaleVar = 0.75 + prng() * 0.50;
        const scaleY = scaleVar * (0.85 + prng() * 0.30);

        newObjects.push({
          id: `grass_${Date.now()}_${newObjects.length}`,
          name: itemName,
          type: itemType,
          category: 'foliage',
          position: [x, y, z],
          rotation: [tiltX, rotY, tiltZ],
          scale: [scaleVar, scaleY, scaleVar],
        });
      }

      const combined = [...baseList, ...newObjects];
      setPlacedObjects(combined);
      pushHistory({
        heights: new Float32Array(terrainData.heights),
        colors: new Float32Array(terrainData.colors),
        objects: combined,
      });

      setToastMessage(
        `Hamparan padang rumput hijau (${newObjects.length} rumpun) berhasil disebar bebas dari jalan!`
      );
      setTimeout(() => setToastMessage(null), 3500);
    },
    [terrainConfig, terrainData, placedObjects, pushHistory, trailPoints]
  );

  // 5. Natural Wildflower & Meadow Grass Field (Padang Bunga & Rumput Alami)
  // Guarantees organic overlapping & intertwining of wildflowers among wild grass blades
  const handleScatterMeadowAndFlowers = useCallback(
    (count = 55, replaceExisting = false) => {
      const prng = createPRNG(Date.now() + 404);
      const size = terrainConfig.size;
      const res = terrainConfig.resolution;
      const waterLvl = terrainConfig.waterLevel;

      const baseList = replaceExisting
        ? placedObjects.filter((o) => o.type !== 'meadow_grass' && o.type !== 'flower_patch')
        : [...placedObjects];

      const newObjects: PlacedObject[] = [];
      const half = size * 0.44;
      let attempts = 0;

      while (newObjects.length < count && attempts < count * 9) {
        attempts++;
        const x = (prng() * 2 - 1) * half;
        const z = (prng() * 2 - 1) * half;
        const y = getSampledHeightAt(x, z, terrainData.heights, size, res);
        if (y < waterLvl + 0.2) continue;

        // Cegah bunga & rumput menimpa jalan
        if (
          isPointOnRoad(
            x,
            z,
            terrainData.colors,
            terrainData.heights,
            size,
            res,
            terrainConfig,
            [...baseList, ...newObjects],
            trailPoints,
            1.6
          )
        ) {
          continue;
        }

        const tooClose = [...baseList, ...newObjects].some((o) => {
          const dx = o.position[0] - x;
          const dz = o.position[2] - z;
          return Math.sqrt(dx * dx + dz * dz) < 1.35;
        });
        if (tooClose) continue;

        const isFlower = prng() < 0.42;
        const rotY = prng() * Math.PI * 2;
        const tiltX = (prng() * 2 - 1) * 0.08;
        const tiltZ = (prng() * 2 - 1) * 0.08;
        const scaleVar = 0.76 + prng() * 0.48;

        newObjects.push({
          id: `mf_${Date.now()}_${newObjects.length}`,
          name: isFlower ? 'Bunga Padang' : 'Rumput Padang',
          type: isFlower ? 'flower_patch' : 'meadow_grass',
          category: 'foliage',
          position: [x, y, z],
          rotation: [tiltX, rotY, tiltZ],
          scale: [scaleVar, scaleVar * (0.88 + prng() * 0.26), scaleVar],
        });

        // Whenever a flower patch is spawned, add 1-2 companion meadow grass clumps around it so they intertwine naturally!
        if (isFlower) {
          const cCount = 1 + Math.floor(prng() * 2);
          for (let c = 0; c < cCount; c++) {
            const companionAngle = prng() * Math.PI * 2;
            const companionDist = 0.42 + prng() * 0.65;
            const cx = x + Math.cos(companionAngle) * companionDist;
            const cz = z + Math.sin(companionAngle) * companionDist;
            const cy = getSampledHeightAt(cx, cz, terrainData.heights, size, res);
            if (cy >= waterLvl + 0.15) {
              // Cegah rumput pendamping menimpa jalan
              if (
                isPointOnRoad(
                  cx,
                  cz,
                  terrainData.colors,
                  terrainData.heights,
                  size,
                  res,
                  terrainConfig,
                  [...baseList, ...newObjects],
                  trailPoints,
                  1.4
                )
              ) {
                continue;
              }

              newObjects.push({
                id: `mf_c_${Date.now()}_${newObjects.length}_${c}`,
                name: 'Rumput Padang',
                type: 'meadow_grass',
                category: 'foliage',
                position: [cx, cy, cz],
                rotation: [(prng() * 2 - 1) * 0.08, prng() * Math.PI * 2, (prng() * 2 - 1) * 0.08],
                scale: [scaleVar * 0.9, scaleVar * (0.85 + prng() * 0.3), scaleVar * 0.9],
              });
            }
          }
        }
      }

      const combined = [...baseList, ...newObjects];
      setPlacedObjects(combined);
      pushHistory({
        heights: new Float32Array(terrainData.heights),
        colors: new Float32Array(terrainData.colors),
        objects: combined,
      });

      setToastMessage(
        `Padang bunga & rumput liar (${newObjects.length} rumpun) berhasil disebar bebas dari jalan!`
      );
      setTimeout(() => setToastMessage(null), 3500);
    },
    [terrainConfig, terrainData, placedObjects, pushHistory, trailPoints]
  );

  // Initialize initial settlement on load
  useEffect(() => {
    populateBiome(terrainConfig.biome, 24, terrainData.heights, terrainConfig.seed);
  }, []);

  // Update terrain config and regenerate
  const handleUpdateTerrainConfig = (updates: Partial<TerrainConfig>) => {
    const nextConfig = { ...terrainConfig, ...updates };
    setTerrainConfig(nextConfig);

    // If biome changed, adapt timeOfDay atmosphere
    if (updates.biome && updates.biome !== terrainConfig.biome) {
      if (updates.biome === 'cyberpunk') setTimeOfDay('cyberpunk');
      else if (updates.biome === 'archipelago') setTimeOfDay('golden');
      else if (updates.biome === 'alpine') setTimeOfDay('day');
      else if (updates.biome === 'canyon') setTimeOfDay('sunset');
    }

    const nextData = generateTerrainData(nextConfig);
    setTerrainData(nextData);

    // If seed or biome changed, repopulate
    if (updates.seed !== undefined || updates.biome !== undefined) {
      populateBiome(nextConfig.biome, 24, nextData.heights, nextConfig.seed);
    } else {
      // Re-ground existing objects to new terrain heights
      setPlacedObjects((prev) =>
        prev.map((obj) => {
          const newY = getSampledHeightAt(
            obj.position[0],
            obj.position[2],
            nextData.heights,
            nextConfig.size,
            nextConfig.resolution
          );
          return {
            ...obj,
            position: [obj.position[0], newY, obj.position[2]],
          };
        })
      );
    }
  };

  // Sculpting brush heightmap change
  const handleHeightmapChange = (newHeights: Float32Array) => {
    // Copy heights & update
    setTerrainData((prev) => ({
      ...prev,
      heights: newHeights,
    }));

    // Re-ground placed objects in real-time
    setPlacedObjects((prev) =>
      prev.map((obj) => {
        const newY = getSampledHeightAt(
          obj.position[0],
          obj.position[2],
          newHeights,
          terrainConfig.size,
          terrainConfig.resolution
        );
        return {
          ...obj,
          position: [obj.position[0], newY, obj.position[2]],
        };
      })
    );
  };

  // Both heights & colors changed (e.g., path carving brush)
  const handleTerrainBuffersChange = (newHeights: Float32Array, newColors: Float32Array) => {
    setTerrainData((prev) => ({
      ...prev,
      heights: newHeights,
      colors: newColors,
    }));

    // Re-ground placed objects in real-time
    setPlacedObjects((prev) =>
      prev.map((obj) => {
        const newY = getSampledHeightAt(
          obj.position[0],
          obj.position[2],
          newHeights,
          terrainConfig.size,
          terrainConfig.resolution
        );
        return {
          ...obj,
          position: [obj.position[0], newY, obj.position[2]],
        };
      })
    );
  };

  // Auto-generate scenic organic trail with multi-material cobblestone, gravel, and dirt blends
  const handleBuildProceduralTrail = () => {
    const newHeights = new Float32Array(terrainData.heights);
    const newColors = new Float32Array(terrainData.colors);

    // Prioritize existing user-placed buildings and landmarks as primary trail anchors
    const buildingKeyLocations = placedObjects
      .filter((o) =>
        o.category === 'building' ||
        o.type.includes('cottage') ||
        o.type.includes('windmill') ||
        o.type.includes('lighthouse') ||
        o.type.includes('skyscraper') ||
        o.type.includes('dome')
      )
      .map((o) => ({ x: o.position[0], z: o.position[2] }));

    const result = generateProceduralTrails(
      newHeights,
      newColors,
      {
        ...terrainConfig,
        trailWidth: brushSettings.trailWidth ?? terrainConfig.trailWidth ?? 2.2,
        trailEdgeDecoration: brushSettings.trailEdgeDecoration ?? terrainConfig.trailEdgeDecoration ?? true,
      },
      buildingKeyLocations.length > 0 ? buildingKeyLocations : undefined
    );

    const newPlaced: PlacedObject[] = result.propPositions.map((p, idx) => ({
      id: `trail_prop_${Date.now()}_${idx}`,
      name:
        p.type === 'wooden_stairs'
          ? 'Tangga Kayu Lereng'
          : p.type === 'wooden_bridge'
          ? 'Jembatan Kayu Air'
          : p.type === 'path_curb_stones'
          ? 'Batu Pembatas Paving'
          : p.type === 'path_curb_with_foliage'
          ? 'Pembatas & Rumput Bunga'
          : p.type === 'flower_patch'
          ? 'Bunga Padang'
          : p.type === 'meadow_grass'
          ? 'Rumput Padang'
          : p.type === 'street_lamp'
          ? 'Trail Lantern'
          : p.type === 'wooden_boardwalk'
          ? 'Boardwalk Walkway'
          : p.type === 'trail_signpost'
          ? 'Trail Signpost'
          : 'Batu Pembatas Paving',
      type: p.type,
      category:
        p.type === 'street_lamp'
          ? 'prop'
          : p.type === 'flower_patch' || p.type === 'meadow_grass'
          ? 'foliage'
          : 'path',
      position: [p.x, p.y, p.z],
      rotation: [0, p.rotationY, 0],
      scale: p.scale || [1, 1, 1],
    }));

    const newTrailPoints = result.trailPathPoints || [];
    setTrailPoints(newTrailPoints);

    // Cleanly replace previous auto-generated trail props AND remove foliage that overlaps the newly built road!
    const nonTrailObjects = placedObjects.filter((o) => !o.id.startsWith('trail_prop_'));
    const safeNonTrailObjects = nonTrailObjects.filter((o) => {
      // Clear foliage/grass that falls onto the new road corridor
      if (o.category === 'foliage' || o.type.includes('grass') || o.type.includes('flower') || o.type.includes('tree')) {
        const onRoad = isPointOnRoad(
          o.position[0],
          o.position[2],
          newColors,
          newHeights,
          terrainConfig.size,
          terrainConfig.resolution,
          terrainConfig,
          newPlaced,
          newTrailPoints,
          1.2
        );
        return !onRoad;
      }
      return true;
    });

    const combinedObjects = [...safeNonTrailObjects, ...newPlaced];

    setPlacedObjects(combinedObjects);
    setTerrainData((prev) => ({
      ...prev,
      heights: newHeights,
      colors: newColors,
    }));
    pushHistory({
      heights: newHeights,
      colors: newColors,
      objects: combinedObjects,
      trailPoints: newTrailPoints,
    });

    const currentWidth = (brushSettings.trailWidth ?? terrainConfig.trailWidth ?? 2.2).toFixed(1);
    const hasDecor = brushSettings.trailEdgeDecoration ?? terrainConfig.trailEdgeDecoration ?? true;
    setToastMessage(
      `Jalan cerdas adaptive smartpath (${currentWidth} unit) berhasil dibangun dengan jembatan tunggal lurus & batu pembatas rapi!`
    );
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Tidy up messy/scattered objects, de-duplicate overlapping bridges/curbs, and remove/displace objects on roads
  const handleTidyUpScene = () => {
    // 1. Filter out duplicates and clipping elements
    const keptBridges: PlacedObject[] = [];
    const keptCurbs: PlacedObject[] = [];
    const otherObjects: PlacedObject[] = [];

    placedObjects.forEach((o) => {
      // De-duplicate bridges within 6.0 units of each other
      if (o.type === 'wooden_bridge') {
        const isDuplicate = keptBridges.some((b) => {
          const d = Math.hypot(b.position[0] - o.position[0], b.position[2] - o.position[2]);
          return d < 6.0;
        });
        if (!isDuplicate) keptBridges.push(o);
      }
      // De-duplicate curbs within 2.8 units of each other or too close to bridges
      else if (o.type === 'path_curb_stones' || o.type === 'path_curb_with_foliage') {
        const nearBridge = keptBridges.some((b) => {
          const d = Math.hypot(b.position[0] - o.position[0], b.position[2] - o.position[2]);
          return d < 4.5;
        });
        const isDuplicate = keptCurbs.some((c) => {
          const d = Math.hypot(c.position[0] - o.position[0], c.position[2] - o.position[2]);
          return d < 2.8;
        });
        if (!nearBridge && !isDuplicate) keptCurbs.push(o);
      } else {
        otherObjects.push(o);
      }
    });

    const pathStructures = [...keptBridges, ...keptCurbs];
    let cleanedOffRoadCount = 0;
    const safeOtherObjects: PlacedObject[] = [];

    // 2. Prevent/remove any non-road objects that overlap or sit in the road corridor
    otherObjects.forEach((o) => {
      const isOnRoad = isPointOnRoad(
        o.position[0],
        o.position[2],
        terrainData.colors,
        terrainData.heights,
        terrainConfig.size,
        terrainConfig.resolution,
        terrainConfig,
        pathStructures,
        trailPoints,
        o.category === 'building' ? 3.8 : 1.2
      );

      if (isOnRoad) {
        cleanedOffRoadCount++;
        // If foliage, remove it so the road remains clean and unobstructed
        if (o.category === 'foliage' || o.type.includes('grass') || o.type.includes('flower')) {
          return;
        }
        // If building or tree, push it off the road corridor to nearest clear ground
        let targetX = o.position[0];
        let targetZ = o.position[2];
        for (let rad = 3.5; rad <= 9.0; rad += 1.5) {
          let found = false;
          for (let ang = 0; ang < Math.PI * 2; ang += Math.PI / 4) {
            const tx = o.position[0] + Math.cos(ang) * rad;
            const tz = o.position[2] + Math.sin(ang) * rad;
            const ty = getSampledHeightAt(tx, tz, terrainData.heights, terrainConfig.size, terrainConfig.resolution);
            if (ty > terrainConfig.waterLevel + 0.3) {
              const stillOnRoad = isPointOnRoad(
                tx,
                tz,
                terrainData.colors,
                terrainData.heights,
                terrainConfig.size,
                terrainConfig.resolution,
                terrainConfig,
                pathStructures,
                trailPoints,
                1.8
              );
              if (!stillOnRoad) {
                targetX = tx;
                targetZ = tz;
                found = true;
                break;
              }
            }
          }
          if (found) break;
        }
        safeOtherObjects.push({
          ...o,
          position: [targetX, o.position[1], targetZ],
        });
      } else {
        safeOtherObjects.push(o);
      }
    });

    const cleaned = [...pathStructures, ...safeOtherObjects].map((o) => {
      const groundY = getSampledHeightAt(
        o.position[0],
        o.position[2],
        terrainData.heights,
        terrainConfig.size,
        terrainConfig.resolution
      );
      const targetY = o.type === 'wooden_bridge'
        ? Math.max(groundY, terrainConfig.waterLevel + 0.38)
        : groundY;
      return {
        ...o,
        position: [o.position[0], targetY, o.position[2]] as [number, number, number],
      };
    });

    setPlacedObjects(cleaned);
    setTerrainConfig((prev) => ({ ...prev, smoothShading: true }));

    pushHistory({
      heights: new Float32Array(terrainData.heights),
      colors: new Float32Array(terrainData.colors),
      objects: cleaned,
      trailPoints,
    });

    setToastMessage(
      cleanedOffRoadCount > 0
        ? `✨ ${cleanedOffRoadCount} objek di atas jalan berhasil disingkirkan & jembatan dirapikan!`
        : '✨ Seluruh jembatan & batu pembatas telah dirapikan, bebas tumpang-tindih!'
    );
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Reset road vertex colors back to natural biome colors (cleans away old wide paths)
  const handleResetTrailColors = useCallback(() => {
    const cleanColors = generateBiomeColors(terrainData.heights, terrainConfig);
    const nonTrailObjects = placedObjects.filter((o) => !o.id.startsWith('trail_prop_'));
    setTerrainData((prev) => ({
      ...prev,
      colors: cleanColors,
    }));
    setPlacedObjects(nonTrailObjects);
    setTrailPoints([]);
    pushHistory({
      heights: new Float32Array(terrainData.heights),
      colors: new Float32Array(cleanColors),
      objects: nonTrailObjects,
      trailPoints: [],
    });
    setToastMessage('🌿 Bekas cat jalan lama berhasil dibersihkan! Daratan kembali alami.');
    setTimeout(() => setToastMessage(null), 3500);
  }, [terrainData.heights, terrainConfig, placedObjects, pushHistory]);

  // Object placed via click
  const handleObjectPlaced = (newObj: PlacedObject) => {
    const updated = [...placedObjects, newObj];
    setPlacedObjects(updated);
    setSelectedObjectId(newObj.id);
    pushHistory({
      heights: new Float32Array(terrainData.heights),
      colors: new Float32Array(terrainData.colors),
      objects: updated,
    });
  };

  // Object update
  const handleUpdateSelectedObject = (updates: Partial<PlacedObject>) => {
    if (!selectedObjectId) return;
    setPlacedObjects((prev) =>
      prev.map((o) => (o.id === selectedObjectId ? { ...o, ...updates } : o))
    );
  };

  // Duplicate selected object
  const handleDuplicateSelectedObject = () => {
    const selected = placedObjects.find((o) => o.id === selectedObjectId);
    if (!selected) return;

    const offset = 3.5;
    const newX = selected.position[0] + offset;
    const newZ = selected.position[2] + offset;
    const newY = getSampledHeightAt(
      newX,
      newZ,
      terrainData.heights,
      terrainConfig.size,
      terrainConfig.resolution
    );

    const dup: PlacedObject = {
      ...selected,
      id: `obj_${Date.now()}_dup`,
      name: `${selected.name} (Copy)`,
      position: [newX, newY, newZ],
    };

    const updated = [...placedObjects, dup];
    setPlacedObjects(updated);
    setSelectedObjectId(dup.id);
  };

  // Delete selected object
  const handleDeleteSelectedObject = () => {
    if (!selectedObjectId) return;
    const updated = placedObjects.filter((o) => o.id !== selectedObjectId);
    setPlacedObjects(updated);
    setSelectedObjectId(null);
  };

  // Undo / Redo
  const handleUndo = () => {
    if (historyIndex > 0) {
      const targetIndex = historyIndex - 1;
      const snapshot = history[targetIndex];
      setTerrainData((prev) => ({
        ...prev,
        heights: new Float32Array(snapshot.heights),
        colors: new Float32Array(snapshot.colors),
      }));
      setPlacedObjects(snapshot.objects);
      if (snapshot.trailPoints) {
        setTrailPoints(snapshot.trailPoints);
      }
      setHistoryIndex(targetIndex);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const targetIndex = historyIndex + 1;
      const snapshot = history[targetIndex];
      setTerrainData((prev) => ({
        ...prev,
        heights: new Float32Array(snapshot.heights),
        colors: new Float32Array(snapshot.colors),
      }));
      setPlacedObjects(snapshot.objects);
      if (snapshot.trailPoints) {
        setTrailPoints(snapshot.trailPoints);
      }
      setHistoryIndex(targetIndex);
    }
  };

  // Camera presets
  const handleCameraPreset = (preset: 'iso' | 'top' | 'cinematic' | 'reset') => {
    const scene = sceneRef.current;
    if (!scene) return;
    // Camera is attached to scene in Viewport3D
    const camera = scene.parent?.children?.find((c) => (c as THREE.Camera).isCamera) as THREE.PerspectiveCamera | null;
    // If not found directly, emit custom event or access window camera
    window.dispatchEvent(new CustomEvent('terraforge-camera-preset', { detail: { preset } }));
  };

  // Custom 3D file upload
  const handleUploadCustom3D = async (file: File) => {
    const record = await parseUploaded3DFile(file);
    setCustomAssets((prev) => [...prev, record]);
    // Automatically select for placement
    const newPaletteItem: PaletteItem = {
      id: record.id,
      name: record.name,
      category: 'custom',
      icon: 'Box',
      description: `Custom ${record.format.toUpperCase()} (${(record.fileSize / 1024).toFixed(1)} KB)`,
      defaultScale: [1, 1, 1],
      badge: 'Custom',
      isCustom: true,
    };
    setActivePaletteItem(newPaletteItem);
    setBrushSettings((prev) => ({ ...prev, mode: 'place' }));
  };

  // Exports
  const handleExportOBJ = () => {
    if (exportGroupRef.current) {
      exportSceneAsOBJ(exportGroupRef.current, `terraforge_${terrainConfig.biome}_world.obj`);
    }
  };

  const handleExportGLB = () => {
    if (exportGroupRef.current) {
      exportSceneAsGLTF(exportGroupRef.current, true, `terraforge_${terrainConfig.biome}_world.glb`);
    }
  };

  const handleExportThreeJSON = () => {
    if (exportGroupRef.current) {
      exportSceneAsThreeJSON(exportGroupRef.current, `terraforge_${terrainConfig.biome}_scene.json`);
    }
  };

  const handleExportHeightmap = () => {
    exportHeightmapPNG(
      terrainData.heights,
      terrainConfig.resolution,
      terrainData.minHeight,
      terrainData.maxHeight,
      `terraforge_${terrainConfig.biome}_heightmap.png`
    );
  };

  // Global hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'h' || e.key === 'H') {
        setIsDockCollapsed((prev) => !prev);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleToggleFullscreen();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedObjectId) {
          handleDeleteSelectedObject();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedObjectId, historyIndex, history]);

  const selectedObject = placedObjects.find((o) => o.id === selectedObjectId) || null;

  const handleSelectGraphicsPreset = (preset: GraphicsPreset) => {
    setGraphicsPreset(preset);
    if (preset === 'LOW') {
      setRenderScale(0.75);
      handleUpdatePerformanceMode('LOW');
    } else if (preset === 'MEDIUM') {
      setRenderScale(1.0);
      handleUpdatePerformanceMode('MEDIUM');
    } else if (preset === 'HIGH') {
      setRenderScale(1.25);
      handleUpdatePerformanceMode('HIGH');
    }
  };

  const handleManualRenderScaleChange = (scale: number) => {
    setRenderScale(scale);
    // Ubah status preset menjadi 'Kustom' jika slider digeser manual
    setGraphicsPreset('CUSTOM');
  };

  const handleUpdatePerformanceMode = (mode: PerformanceMode) => {
    setPerformanceMode(mode);
    if (mode === 'LOW' || mode === 'mobile') {
      setGraphicsPreset('LOW');
      setRenderScale(0.75);
    } else if (mode === 'HIGH' || mode === 'ultra') {
      setGraphicsPreset('HIGH');
      setRenderScale(1.25);
    } else if (mode === 'CUSTOM') {
      setGraphicsPreset('CUSTOM');
    } else {
      setGraphicsPreset('MEDIUM');
      setRenderScale(1.0);
    }
    const newRes = mode === 'mobile' || mode === 'LOW' ? 32 : mode === 'balanced' || mode === 'MEDIUM' ? 44 : 56;
    handleUpdateTerrainConfig({ resolution: newRes });
  };

  const handleCyclePerformanceMode = () => {
    const next = performanceMode === 'mobile' ? 'balanced' : performanceMode === 'balanced' ? 'ultra' : 'mobile';
    handleUpdatePerformanceMode(next);
  };

  return (
    <main
      data-testid="terraforge-root"
      className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans"
    >
      {/* 3D WebGL Canvas Layer */}
      <Viewport3D
        terrainConfig={terrainConfig}
        heights={terrainData.heights}
        colors={terrainData.colors}
        onHeightmapChange={handleHeightmapChange}
        onTerrainBuffersChange={handleTerrainBuffersChange}
        placedObjects={placedObjects}
        onObjectPlaced={handleObjectPlaced}
        onObjectSelected={(obj) => setSelectedObjectId(obj?.id || null)}
        onObjectUpdate={(id, updates) =>
          setPlacedObjects((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)))
        }
        selectedObjectId={selectedObjectId}
        activePaletteItem={activePaletteItem}
        brushSettings={brushSettings}
        timeOfDay={timeOfDay}
        timeHour={timeSettings.timeHour}
        lampSettings={lampSettings}
        performanceMode={performanceMode}
        graphicsPreset={graphicsPreset}
        renderScale={renderScale}
        trailPathPoints={trailPoints}
        onRoadCollision={() => {
          setToastMessage('🚫 Area ini adalah jalan setapak! Penempatan objek dicegah agar jalan tetap bersih.');
          setTimeout(() => setToastMessage(null), 3500);
        }}
        onAddTrailPoint={(pt) => {
          setTrailPoints((prev) => {
            if (prev.length > 0) {
              const last = prev[prev.length - 1];
              if (Math.hypot(last.x - pt.x, last.z - pt.z) < 1.0) return prev;
            }
            return [...prev, pt];
          });
        }}
        onFpsUpdate={setFps}
        onSceneReady={(scene, exportGroup) => {
          sceneRef.current = scene;
          exportGroupRef.current = exportGroup;
        }}
      />

      {/* Top Navigation & Status Bar - Hidden during Fullscreen */}
      {!isFullscreen && (
        <TopBar
          seed={terrainConfig.seed}
          biome={terrainConfig.biome}
          objectCount={placedObjects.length}
          timeOfDay={timeOfDay}
          timeHour={timeSettings.timeHour}
          onOpenLightingTab={handleOpenLightingTab}
          onTimeOfDayChange={handleTimeOfDayChange}
          onCameraPreset={handleCameraPreset}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          onUndo={handleUndo}
          onRedo={handleRedo}
          isDockCollapsed={isDockCollapsed}
          onToggleDock={() => setIsDockCollapsed((prev) => !prev)}
          fps={fps}
          graphicsPreset={graphicsPreset}
          onOpenGraphicsSettings={() => setIsGraphicsModalOpen(true)}
          renderScale={renderScale}
          onOpenResolutionMenu={() => setIsResolutionMenuOpen(true)}
          performanceMode={performanceMode}
          onCyclePerformanceMode={handleCyclePerformanceMode}
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
        />
      )}

      {/* Floating Exit Fullscreen Button when Fullscreen is Active */}
      {isFullscreen && (
        <button
          type="button"
          onClick={handleToggleFullscreen}
          className="fixed top-3 sm:top-4 right-3 sm:right-4 z-50 flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-slate-950/85 border border-slate-700/80 hover:border-emerald-500/60 text-slate-200 hover:text-white text-xs font-semibold shadow-2xl transition-all hover:scale-105 active:scale-95 group pointer-events-auto"
          title="Keluar dari Fullscreen (Esc atau F)"
        >
          <Minimize2 className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
          <span>Keluar Fullscreen</span>
          <kbd className="text-[10px] bg-slate-900 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700 font-mono">
            Esc
          </kbd>
        </button>
      )}

      {/* Sleek Ergonomic Collapsible Bottom Control Dock with Integrated Time & Lighting Tab */}
      {!isFullscreen && (
        <ControlDock
          terrainConfig={terrainConfig}
          onUpdateTerrainConfig={handleUpdateTerrainConfig}
          onRegenerateTerrain={() => handleRegenerateTerrain()}
          brushSettings={brushSettings}
          onUpdateBrushSettings={(updates) => setBrushSettings((prev) => ({ ...prev, ...updates }))}
          activePaletteItem={activePaletteItem}
          onSelectPaletteItem={setActivePaletteItem}
          customAssets={customAssets}
          onUploadFile={handleUploadCustom3D}
          onAutoPopulateBiome={(count) =>
            populateBiome(terrainConfig.biome, count, terrainData.heights, terrainConfig.seed)
          }
          onScatterSpecificObject={handleScatterSpecificObject}
          onScatterBuildings={handleScatterBuildings}
          onScatterVegetation={handleScatterVegetation}
          onScatterMeadowGrass={handleScatterMeadowGrass}
          onScatterMeadowAndFlowers={handleScatterMeadowAndFlowers}
          onBuildTrail={handleBuildProceduralTrail}
          onClearAllObjects={() => {
            setPlacedObjects([]);
            setSelectedObjectId(null);
            setTrailPoints([]);
          }}
          placedObjects={placedObjects}
          selectedObject={selectedObject}
          onSelectObject={(obj) => setSelectedObjectId(obj?.id || null)}
          onUpdateSelectedObject={handleUpdateSelectedObject}
          onDuplicateSelectedObject={handleDuplicateSelectedObject}
          onDeleteSelectedObject={handleDeleteSelectedObject}
          onExportOBJ={handleExportOBJ}
          onExportGLB={handleExportGLB}
          onExportThreeJSON={handleExportThreeJSON}
          onExportHeightmap={handleExportHeightmap}
          isCollapsed={isDockCollapsed}
          onToggleCollapse={() => setIsDockCollapsed((prev) => !prev)}
          performanceMode={performanceMode}
          onUpdatePerformanceMode={handleUpdatePerformanceMode}
          timeSettings={timeSettings}
          onTimeChange={handleTimeHourChange}
          onTogglePlay={() => setTimeSettings((prev) => ({ ...prev, isPlaying: !prev.isPlaying }))}
          onSpeedChange={(spd) => setTimeSettings((prev) => ({ ...prev, speed: spd }))}
          lampSettings={lampSettings}
          onLampSettingsChange={(updates) => setLampSettings((prev) => ({ ...prev, ...updates }))}
          activeTab={dockTab}
          onTabChange={setDockTab}
          onTidyUpScene={handleTidyUpScene}
          onResetTrailColors={handleResetTrailColors}
        />
      )}

      {/* Graphics Settings Modal */}
      <GraphicsSettingsModal
        isOpen={isGraphicsModalOpen}
        onClose={() => setIsGraphicsModalOpen(false)}
        currentPreset={graphicsPreset}
        onSelectPreset={handleSelectGraphicsPreset}
        renderScale={renderScale}
        onScaleChange={handleManualRenderScaleChange}
        currentFps={fps}
      />

      {/* Separate Render Resolution Scale Modal / Menu */}
      <ResolutionScaleMenu
        isOpen={isResolutionMenuOpen}
        onClose={() => setIsResolutionMenuOpen(false)}
        renderScale={renderScale}
        onScaleChange={handleManualRenderScaleChange}
        currentPreset={graphicsPreset}
        onSelectPreset={handleSelectGraphicsPreset}
      />

      {/* Floating Status Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-300">
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900/95 border border-emerald-500/70 text-slate-100 text-xs font-semibold shadow-2xl">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </main>
  );
}
