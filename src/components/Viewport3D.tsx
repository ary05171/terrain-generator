import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Route,
  Footprints,
  Target,
  RotateCcw,
  Link2,
  Unlink,
  Sparkles,
  Check,
  Navigation,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  BiomeType,
  BrushSettings,
  PaletteItem,
  PlacedObject,
  TerrainConfig,
  TimeOfDay,
  LampSettings,
  NavigationPin,
  NavigationRouteState,
} from '../types';
import {
  BIOME_PALETTES,
  applySculptBrush,
  applyPathBrush,
  getSampledHeightAt,
  isPointOnRoad,
} from '../core/terrainGen';
import { instantiateModel } from '../core/modelFactory';
import { getCustomModelClone } from '../core/assetIO';
import { GraphicsPreset, PerformanceMode } from '../types';
import { calculateDynamicAtmosphere } from '../core/timeLighting';
import {
  calculateSmartDetourPath,
  findNearbyBuilding,
  getBuildingDoorwayInfo,
  bakeNavigationRouteToTerrain,
} from '../core/navigationRoute';

/**
 * Creates stylish low-poly 3D Pin Beacon Marker (Pin A in warm orange, Pin B in cyan)
 */
export function createPinMarkerMesh(type: 'A' | 'B' | 'C'): THREE.Group {
  const group = new THREE.Group();
  group.name = `pin_marker_${type}`;

  const primaryColor =
    type === 'A' ? 0xf97316 : type === 'B' ? 0x06b6d4 : 0xa855f7; // A: Orange, B: Cyan, C: Purple

  // 1. Ground beacon disc
  const discGeo = new THREE.RingGeometry(0.7, 1.4, 24);
  discGeo.rotateX(-Math.PI / 2);
  const discMat = new THREE.MeshBasicMaterial({
    color: primaryColor,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.position.y = 0.05;
  disc.name = 'beacon_ring';
  group.add(disc);

  // 2. Inner solid dot
  const innerDotGeo = new THREE.CircleGeometry(0.35, 16);
  innerDotGeo.rotateX(-Math.PI / 2);
  const innerDotMat = new THREE.MeshBasicMaterial({
    color: primaryColor,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const innerDot = new THREE.Mesh(innerDotGeo, innerDotMat);
  innerDot.position.y = 0.06;
  group.add(innerDot);

  // 3. Slender metal mast
  const mastGeo = new THREE.CylinderGeometry(0.08, 0.12, 3.2, 8);
  const mastMat = new THREE.MeshLambertMaterial({
    color: 0x94a3b8,
    flatShading: true,
  });
  const mast = new THREE.Mesh(mastGeo, mastMat);
  mast.position.y = 1.6;
  group.add(mast);

  // 4. Glowing beacon sphere / head
  const headGeo = new THREE.SphereGeometry(0.55, 12, 10);
  const headMat = new THREE.MeshLambertMaterial({
    color: primaryColor,
    emissive: primaryColor,
    emissiveIntensity: 0.8,
    flatShading: true,
  });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 3.3;
  group.add(head);

  // 5. Stylized flag pennant
  const flagGeo = new THREE.BufferGeometry();
  const flagVerts = new Float32Array([
    0, 3.2, 0,
    1.3, 2.9, 0,
    0, 2.6, 0,
  ]);
  flagGeo.setAttribute('position', new THREE.BufferAttribute(flagVerts, 3));
  flagGeo.computeVertexNormals();
  const flagMat = new THREE.MeshLambertMaterial({
    color: primaryColor,
    side: THREE.DoubleSide,
    flatShading: true,
  });
  const flag = new THREE.Mesh(flagGeo, flagMat);
  group.add(flag);

  // 6. Raycast hit target (invisible larger sphere for easy touch/mouse picking)
  const hitTargetGeo = new THREE.SphereGeometry(2.4, 8, 6);
  const hitTargetMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitTarget = new THREE.Mesh(hitTargetGeo, hitTargetMat);
  hitTarget.position.y = 2.0;
  hitTarget.name = `pin_hit_${type}`;
  (hitTarget as any).userData = { pinId: type };
  group.add(hitTarget);

  return group;
}

/**
 * Creates 3D Route Ribbon mesh linking Pin A to Pin B
 */
export function createRouteRibbonMesh(): THREE.Mesh {
  const geom = new THREE.BufferGeometry();
  const mat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'NavigationRouteRibbon';
  mesh.renderOrder = 997;
  return mesh;
}

/**
 * Updates 3D ribbon geometry to conform to spline waypoints with smooth gradient
 */
export function updateRouteRibbonGeometry(
  mesh: THREE.Mesh,
  points: [number, number, number][],
  halfWidth = 0.45,
  hasWaypointC = false
) {
  if (points.length < 2) {
    mesh.visible = false;
    return;
  }

  mesh.visible = true;
  const count = points.length;
  const verts = new Float32Array(count * 2 * 3);
  const colors = new Float32Array(count * 2 * 3);
  const indices: number[] = [];

  const colorA = new THREE.Color(0xf97316); // Pin A: Orange
  const colorB = new THREE.Color(0x06b6d4); // Pin B: Cyan
  const colorC = new THREE.Color(0xa855f7); // Pin C: Purple
  const curColor = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const pt = points[i];
    const alpha = i / (count - 1);
    if (hasWaypointC) {
      if (alpha < 0.5) {
        curColor.lerpColors(colorA, colorC, alpha * 2);
      } else {
        curColor.lerpColors(colorC, colorB, (alpha - 0.5) * 2);
      }
    } else {
      curColor.lerpColors(colorA, colorB, alpha);
    }

    let tanX = 0;
    let tanZ = 0;
    if (i < count - 1) {
      tanX += points[i + 1][0] - pt[0];
      tanZ += points[i + 1][2] - pt[2];
    }
    if (i > 0) {
      tanX += pt[0] - points[i - 1][0];
      tanZ += pt[2] - points[i - 1][2];
    }
    const len = Math.hypot(tanX, tanZ) || 1;
    const perpX = (-tanZ / len) * halfWidth;
    const perpZ = (tanX / len) * halfWidth;

    const idxL = i * 2;
    verts[idxL * 3] = pt[0] + perpX;
    verts[idxL * 3 + 1] = pt[1] + 0.08;
    verts[idxL * 3 + 2] = pt[2] + perpZ;
    colors[idxL * 3] = curColor.r;
    colors[idxL * 3 + 1] = curColor.g;
    colors[idxL * 3 + 2] = curColor.b;

    const idxR = i * 2 + 1;
    verts[idxR * 3] = pt[0] - perpX;
    verts[idxR * 3 + 1] = pt[1] + 0.08;
    verts[idxR * 3 + 2] = pt[2] - perpZ;
    colors[idxR * 3] = curColor.r;
    colors[idxR * 3 + 1] = curColor.g;
    colors[idxR * 3 + 2] = curColor.b;

    if (i < count - 1) {
      indices.push(idxL, idxR, idxL + 2);
      indices.push(idxR, idxR + 2, idxL + 2);
    }
  }

  const oldGeo = mesh.geometry;
  const newGeo = new THREE.BufferGeometry();
  newGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  newGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  newGeo.setIndex(indices);
  newGeo.computeVertexNormals();
  mesh.geometry = newGeo;
  oldGeo.dispose();

  if (mesh.material instanceof THREE.MeshBasicMaterial) {
    mesh.material.vertexColors = true;
    mesh.material.needsUpdate = true;
  }
}

/**
 * Creates group for 3D A* exploration nodes and key navigation nodes
 */
export function createAStarNodeVisualizationGroup(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'AStarVisualizationGroup';
  return group;
}

/**
 * Updates 3D visual markers representing A* grid search nodes
 */
export function updateAStarNodeVisualization(
  group: THREE.Group,
  exploredNodes: [number, number, number][],
  keyNodes: [number, number, number][],
  visible: boolean
) {
  group.visible = visible;
  while (group.children.length > 0) {
    const c = group.children[0];
    group.remove(c);
    if ((c as any).geometry) (c as any).geometry.dispose();
  }

  if (!visible) return;

  // 1. Explored Grid Nodes (subtle emerald exploration field)
  if (exploredNodes.length > 0) {
    const exploredGeo = new THREE.BufferGeometry();
    const posArr = new Float32Array(exploredNodes.length * 3);
    for (let i = 0; i < exploredNodes.length; i++) {
      posArr[i * 3] = exploredNodes[i][0];
      posArr[i * 3 + 1] = exploredNodes[i][1] + 0.16;
      posArr[i * 3 + 2] = exploredNodes[i][2];
    }
    exploredGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const exploredMat = new THREE.PointsMaterial({
      color: 0x10b981,
      size: 0.75,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const exploredPoints = new THREE.Points(exploredGeo, exploredMat);
    group.add(exploredPoints);
  }

  // 2. Key A* Decision Nodes along the path (brighter cyan/gold nodes)
  if (keyNodes.length > 0) {
    const keyGeo = new THREE.BufferGeometry();
    const keyPos = new Float32Array(keyNodes.length * 3);
    for (let i = 0; i < keyNodes.length; i++) {
      keyPos[i * 3] = keyNodes[i][0];
      keyPos[i * 3 + 1] = keyNodes[i][1] + 0.24;
      keyPos[i * 3 + 2] = keyNodes[i][2];
    }
    keyGeo.setAttribute('position', new THREE.BufferAttribute(keyPos, 3));
    const keyMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 1.4,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const keyPoints = new THREE.Points(keyGeo, keyMat);
    group.add(keyPoints);
  }
}


export function normalizePreset(graphicsPreset?: GraphicsPreset, performanceMode?: PerformanceMode): GraphicsPreset {
  if (graphicsPreset === 'LOW' || performanceMode === 'LOW' || performanceMode === 'mobile') return 'LOW';
  if (graphicsPreset === 'HIGH' || performanceMode === 'HIGH' || performanceMode === 'ultra') return 'HIGH';
  if (graphicsPreset === 'CUSTOM') return 'CUSTOM';
  return 'MEDIUM';
}

export function createSkyGradientTexture(topColor: string, bottomColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, topColor);
  gradient.addColorStop(0.6, bottomColor);
  gradient.addColorStop(1, bottomColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 16, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

export function getAtmosphereSettings(biome: BiomeType, timeOfDay: TimeOfDay) {
  const palette = BIOME_PALETTES[biome] || BIOME_PALETTES.archipelago;

  switch (timeOfDay) {
    case 'golden':
      return {
        skyTopColor: '#2563eb', // Rich twilight sky blue transitioning down
        skyBottomColor: '#fed7aa', // Warm golden sunset peach horizon
        skyColor: '#fb923c',
        fogColor: '#fed7aa', // Soft pastel peach-amber mist matching horizon
        fogDensity: 0.0010,
        sunColor: 0xffb74d, // Warm Sunset/Golden Hour key light (#ffb74d)
        sunIntensity: 0.95,
        sunPos: [65, 52, 50] as [number, number, number],
        hemiSkyColor: 0x93c5fd, // Sky: soft twilight blue
        hemiGroundColor: 0x4a3c2c, // Warm soft earth fill
        hemiIntensity: 0.44,
        ambientColor: 0xffedd5,
        ambientIntensity: 0.16,
      };
    case 'sunset':
      return {
        skyTopColor: '#4f46e5', // Deep twilight indigo
        skyBottomColor: '#fdba74', // Warm orange/coral sunset horizon
        skyColor: '#f43f5e',
        fogColor: '#fdba74', // Soft warm pastel sunset mist
        fogDensity: 0.0011,
        sunColor: 0xffb74d, // Sunset/Golden Hour (#ffb74d)
        sunIntensity: 0.90,
        sunPos: [68, 46, 42] as [number, number, number],
        hemiSkyColor: 0xa5b4fc, // Sky
        hemiGroundColor: 0x4e382d, // Soft warm ground fill
        hemiIntensity: 0.42,
        ambientColor: 0xfed7aa,
        ambientIntensity: 0.15,
      };
    case 'cyberpunk':
      return {
        skyTopColor: '#030712',
        skyBottomColor: '#0f172a',
        skyColor: '#090d16',
        fogColor: '#0f172a',
        fogDensity: 0.0014,
        sunColor: 0x06b6d4, // Neon cyan keylight
        sunIntensity: 0.85,
        sunPos: [-48, 48, -36] as [number, number, number],
        hemiSkyColor: 0x38bdf8,
        hemiGroundColor: 0x2e1d48,
        hemiIntensity: 0.38,
        ambientColor: 0x1e293b,
        ambientIntensity: 0.14,
      };
    case 'night':
      return {
        skyTopColor: '#020617',
        skyBottomColor: '#0b1329',
        skyColor: '#030712',
        fogColor: '#0b1329',
        fogDensity: 0.0012,
        sunColor: 0x93c5fd, // Silver-blue moonbeam
        sunIntensity: 0.65,
        sunPos: [-36, 48, 32] as [number, number, number],
        hemiSkyColor: 0x60a5fa,
        hemiGroundColor: 0x1e293b,
        hemiIntensity: 0.30,
        ambientColor: 0x1e293b,
        ambientIntensity: 0.12,
      };
    case 'day':
    default:
      return {
        skyTopColor: '#38bdf8', // Vibrant azure sky
        skyBottomColor: '#bae6fd', // Soft pastel kebiruan halus
        skyColor: palette.skyColor || '#38bdf8',
        fogColor: palette.fogColor || '#bae6fd', // Soft pastel kebiruan halus mist matching sea horizon
        fogDensity: 0.0010,
        sunColor: 0xfff3e0, // Crisp warm golden sunlight
        sunIntensity: 0.95,
        sunPos: [58, 58, 48] as [number, number, number],
        hemiSkyColor: 0xbae6fd, // Sky fill
        hemiGroundColor: 0x3d4a3e, // Natural rich earth & grass ambient ground fill
        hemiIntensity: 0.44,
        ambientColor: 0xe2e8f0,
        ambientIntensity: 0.16,
      };
  }
}

interface Viewport3DProps {
  terrainConfig: TerrainConfig;
  heights: Float32Array;
  colors: Float32Array;
  onHeightmapChange: (newHeights: Float32Array) => void;
  onTerrainBuffersChange?: (newHeights: Float32Array, newColors: Float32Array) => void;
  placedObjects: PlacedObject[];
  onObjectPlaced: (obj: PlacedObject) => void;
  onObjectSelected: (obj: PlacedObject | null) => void;
  onObjectUpdate: (id: string, updates: Partial<PlacedObject>) => void;
  selectedObjectId: string | null;
  activePaletteItem: PaletteItem | null;
  brushSettings: BrushSettings;
  timeOfDay: TimeOfDay;
  timeHour?: number;
  lampSettings?: LampSettings;
  performanceMode?: PerformanceMode;
  graphicsPreset?: GraphicsPreset;
  renderScale?: number;
  trailPathPoints?: { x: number; z: number }[];
  onRoadCollision?: () => void;
  onAddTrailPoint?: (pt: { x: number; z: number }) => void;
  onFpsUpdate?: (fps: number) => void;
  onSceneReady?: (scene: THREE.Scene, exportGroup: THREE.Group) => void;
  onBakeNavigationRoute?: (newHeights: Float32Array, newColors: Float32Array, newProps: PlacedObject[]) => void;
  onToast?: (msg: string) => void;
}

// Module-level pre-allocated scratch objects to prevent GC in animation loop
const _vec3 = new THREE.Vector3();
const _mouse = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _dummyObj = new THREE.Object3D();
const _combinedMat = new THREE.Matrix4();
const _selectionDummy = new THREE.Mesh(
  new THREE.BoxGeometry(2, 2, 2),
  new THREE.MeshBasicMaterial({ visible: false })
);

/**
 * Builds BufferGeometry for terrain.
 * When smoothShading is false: builds an authentic non-indexed faceted low-poly ("patah-patah") geometry
 * where every triangle face has its own 3 dedicated vertices with crisp perpendicular face normals.
 */
function buildTerrainBufferGeometry(
  size: number,
  resolution: number,
  heights: Float32Array,
  colors: Float32Array,
  smoothShading: boolean
): THREE.BufferGeometry {
  if (smoothShading) {
    const geo = new THREE.PlaneGeometry(size, size, resolution - 1, resolution - 1);
    geo.rotateX(-Math.PI / 2);
    const posArr = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < heights.length; i++) {
      posArr[i * 3 + 1] = heights[i];
    }
    geo.attributes.position.needsUpdate = true;
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    geo.computeVertexNormals();
    return geo;
  }

  // Authentic non-indexed polygonal faceted geometry ("patah-patah")
  const quadsX = resolution - 1;
  const quadsZ = resolution - 1;
  const totalTriangles = quadsX * quadsZ * 2;
  const totalVerts = totalTriangles * 3;

  const positions = new Float32Array(totalVerts * 3);
  const colorBuffer = new Float32Array(totalVerts * 3);

  const halfSize = size / 2;
  const step = size / (resolution - 1);

  let vIdx = 0;
  for (let j = 0; j < quadsZ; j++) {
    for (let i = 0; i < quadsX; i++) {
      const idxA = j * resolution + i;
      const idxB = j * resolution + (i + 1);
      const idxC = (j + 1) * resolution + i;
      const idxD = (j + 1) * resolution + (i + 1);

      const xA = -halfSize + i * step;
      const zA = -halfSize + j * step;
      const xB = -halfSize + (i + 1) * step;
      const zB = -halfSize + j * step;
      const xC = -halfSize + i * step;
      const zC = -halfSize + (j + 1) * step;
      const xD = -halfSize + (i + 1) * step;
      const zD = -halfSize + (j + 1) * step;

      // Tri 1: A, C, B
      const tri1 = [
        { x: xA, y: heights[idxA], z: zA, ci: idxA },
        { x: xC, y: heights[idxC], z: zC, ci: idxC },
        { x: xB, y: heights[idxB], z: zB, ci: idxB },
      ];
      // Tri 2: B, C, D
      const tri2 = [
        { x: xB, y: heights[idxB], z: zB, ci: idxB },
        { x: xC, y: heights[idxC], z: zC, ci: idxC },
        { x: xD, y: heights[idxD], z: zD, ci: idxD },
      ];

      for (const pt of [...tri1, ...tri2]) {
        positions[vIdx * 3] = pt.x;
        positions[vIdx * 3 + 1] = pt.y;
        positions[vIdx * 3 + 2] = pt.z;

        colorBuffer[vIdx * 3] = colors[pt.ci * 3];
        colorBuffer[vIdx * 3 + 1] = colors[pt.ci * 3 + 1];
        colorBuffer[vIdx * 3 + 2] = colors[pt.ci * 3 + 2];

        vIdx++;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colorBuffer, 3));
  geo.computeVertexNormals();
  return geo;
}

export const Viewport3D: React.FC<Viewport3DProps> = ({
  terrainConfig,
  heights,
  colors,
  onHeightmapChange,
  onTerrainBuffersChange,
  placedObjects,
  onObjectPlaced,
  onObjectSelected,
  onObjectUpdate,
  selectedObjectId,
  activePaletteItem,
  brushSettings,
  timeOfDay,
  timeHour = 17.5,
  lampSettings = { mode: 'auto', intensity: 1.0, radius: 1.0, pulsing: true },
  performanceMode,
  graphicsPreset = 'MEDIUM',
  renderScale = 1.0,
  trailPathPoints,
  onRoadCollision,
  onAddTrailPoint,
  onFpsUpdate,
  onSceneReady,
  onBakeNavigationRoute,
  onToast,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  // Mutable refs to keep stable render loop without re-creating scene
  const propsRef = useRef({
    terrainConfig,
    heights,
    colors,
    onHeightmapChange,
    onTerrainBuffersChange,
    placedObjects,
    onObjectPlaced,
    onObjectSelected,
    onObjectUpdate,
    selectedObjectId,
    activePaletteItem,
    brushSettings,
    timeOfDay,
    timeHour,
    lampSettings,
    performanceMode,
    graphicsPreset,
    renderScale,
    trailPathPoints,
    onRoadCollision,
    onAddTrailPoint,
    onBakeNavigationRoute,
    onToast,
  });
  propsRef.current = {
    terrainConfig,
    heights,
    colors,
    onHeightmapChange,
    onTerrainBuffersChange,
    placedObjects,
    onObjectPlaced,
    onObjectSelected,
    onObjectUpdate,
    selectedObjectId,
    activePaletteItem,
    brushSettings,
    timeOfDay,
    timeHour,
    lampSettings,
    performanceMode,
    graphicsPreset,
    renderScale,
    trailPathPoints,
    onRoadCollision,
    onAddTrailPoint,
    onBakeNavigationRoute,
    onToast,
  };

  // Pin Navigation State & Interactive Touch Refs
  const [activePinId, setActivePinId] = useState<'A' | 'B' | 'C'>('A');
  const [pinAPos, setPinAPos] = useState<[number, number, number]>(() => [-18, 5, -12]);
  const [pinBPos, setPinBPos] = useState<[number, number, number]>(() => [18, 5, 16]);
  const [pinCPos, setPinCPos] = useState<[number, number, number]>(() => [0, 5, 2]);
  const [hasWaypointC, setHasWaypointC] = useState<boolean>(false);
  const [showAStarNodes, setShowAStarNodes] = useState<boolean>(true);
  const [pinABoundId, setPinABoundId] = useState<string | null>(null);
  const [pinBBoundId, setPinBBoundId] = useState<string | null>(null);
  const [cameraFollowActive, setCameraFollowActive] = useState<boolean>(true);
  const [isPinNavVisible, setIsPinNavVisible] = useState<boolean>(true);
  const [nearbyBuilding, setNearbyBuilding] = useState<PlacedObject | null>(null);
  const [routeDetails, setRouteDetails] = useState<{
    isDetoured: boolean;
    avoidedCount: number;
    lengthMeters: number;
    hasSteepSlope: boolean;
    crossesWater: boolean;
    nodeCount: number;
  }>({
    isDetoured: false,
    avoidedCount: 0,
    lengthMeters: 0,
    hasSteepSlope: false,
    crossesWater: false,
    nodeCount: 2,
  });
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  const activePinIdRef = useRef<'A' | 'B' | 'C'>('A');
  const pinAPosRef = useRef<[number, number, number]>([-18, 5, -12]);
  const pinBPosRef = useRef<[number, number, number]>([18, 5, 16]);
  const pinCPosRef = useRef<[number, number, number]>([0, 5, 2]);
  const hasWaypointCRef = useRef<boolean>(false);
  const showAStarNodesRef = useRef<boolean>(true);
  const pinABoundIdRef = useRef<string | null>(null);
  const pinBBoundIdRef = useRef<string | null>(null);
  const cameraFollowActiveRef = useRef<boolean>(true);
  const draggingPinRef = useRef<'A' | 'B' | 'C' | null>(null);
  const navGroupRef = useRef<THREE.Group | null>(null);
  const pinAGroupRef = useRef<THREE.Group | null>(null);
  const pinBGroupRef = useRef<THREE.Group | null>(null);
  const pinCGroupRef = useRef<THREE.Group | null>(null);
  const aStarGroupRef = useRef<THREE.Group | null>(null);
  const routeRibbonRef = useRef<THREE.Mesh | null>(null);
  const currentRoutePointsRef = useRef<[number, number, number][]>([]);

  // Scene object refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const waterMeshRef = useRef<THREE.Mesh | null>(null);
  const objectsGroupRef = useRef<THREE.Group | null>(null);
  const exportGroupRef = useRef<THREE.Group | null>(null);
  const brushRingRef = useRef<THREE.LineLoop | null>(null);
  const ghostPreviewRef = useRef<THREE.Group | null>(null);
  const selectionBoxRef = useRef<THREE.BoxHelper | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const moonLightRef = useRef<THREE.DirectionalLight | null>(null);
  const fillLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const bgTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const skyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const skyCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastSkyTopRef = useRef<string>('');
  const lastSkyBottomRef = useRef<string>('');
  const starPointsRef = useRef<THREE.Points | null>(null);
  const budgetedPointLightsRef = useRef<THREE.PointLight[]>([]);
  const groundLightMeshesRef = useRef<THREE.Mesh[]>([]);
  const lampBulbsRef = useRef<THREE.Material[]>([]);
  const animatedRotorsRef = useRef<{ obj: THREE.Object3D; speed: number }[]>([]);
  const wasHighPresetRef = useRef(false);

  // Interaction tracking
  const isMouseDownRef = useRef(false);
  const didDragRef = useRef(false);
  const mouseDownPosRef = useRef({ x: 0, y: 0 });
  const lastRaycastTimeRef = useRef(0);

  // Redundant terrain geometry re-render guard (Rule 3)
  const lastAppliedHeightsRef = useRef<Float32Array | null>(null);
  const lastAppliedColorsRef = useRef<Float32Array | null>(null);
  const lastResRef = useRef<number>(-1);
  const lastSizeRef = useRef<number>(-1);
  const lastSmoothRef = useRef<boolean | undefined>(undefined);

  // Initialize Three.js scene once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const isHeadless =
      navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent);
    const isMobileDevice =
      /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (typeof window !== 'undefined' && window.innerWidth < 768);

    // 1. Scene & Atmosphere setup with gradient skybox and preset-aware soft horizon fog
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const initialPreset = normalizePreset(graphicsPreset, performanceMode);
    const palette = BIOME_PALETTES[terrainConfig.biome] || BIOME_PALETTES.archipelago;
    const atm = calculateDynamicAtmosphere(timeHour, terrainConfig.biome, lampSettings);

    // Canvas-backed dynamic sky gradient (reusable without texture churn)
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 16;
    skyCanvas.height = 256;
    skyCanvasRef.current = skyCanvas;
    const skyCtx = skyCanvas.getContext('2d')!;
    skyCtxRef.current = skyCtx;
    const grad = skyCtx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, atm.skyTopColor);
    grad.addColorStop(0.65, atm.skyBottomColor);
    grad.addColorStop(1.0, atm.skyBottomColor);
    skyCtx.fillStyle = grad;
    skyCtx.fillRect(0, 0, 16, 256);
    lastSkyTopRef.current = atm.skyTopColor;
    lastSkyBottomRef.current = atm.skyBottomColor;

    const bgTex = new THREE.CanvasTexture(skyCanvas);
    bgTex.colorSpace = THREE.SRGBColorSpace;
    bgTex.minFilter = THREE.LinearFilter;
    bgTex.magFilter = THREE.LinearFilter;
    scene.background = bgTex;
    bgTextureRef.current = bgTex;

    if (initialPreset === 'LOW') {
      scene.fog = null;
    } else {
      scene.fog = new THREE.FogExp2(atm.fogColor, initialPreset === 'HIGH' ? atm.fogDensity * 1.05 : atm.fogDensity);
    }

    // Stylized stars field in the upper sky dome
    const starGeo = new THREE.BufferGeometry();
    const starCount = 300;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.75 + 0.25);
      const rad = 200 + Math.random() * 80;
      starPos[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = rad * Math.cos(phi);
      starPos[i * 3 + 2] = rad * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2.2,
      transparent: true,
      opacity: atm.lampGlowFactor > 0.4 ? 0.9 : 0.0,
      depthWrite: false,
    });
    const starPoints = new THREE.Points(starGeo, starMat);
    starPoints.name = 'night_sky_stars';
    scene.add(starPoints);
    starPointsRef.current = starPoints;

    // 2. Camera setup - near plane 0.25 prevents close-up geometric clipping when zooming into village details
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.25, 1400);
    camera.position.set(75, 55, 85);
    cameraRef.current = camera;

    // 3. Renderer setup:
    // - precision: 'highp' eliminates float rounding errors and shadow acne breakdown when camera zooms in close
    // - powerPreference: 'high-performance' to ensure maximum GPU clock profile
    // - antialias: enabled on HIGH for desktop/powerful devices
    const isHeadlessOrBot =
      Boolean(navigator.webdriver) ||
      /HeadlessChrome|Headless/i.test(navigator.userAgent);

    const renderer = new THREE.WebGLRenderer({
      antialias: initialPreset === 'HIGH' && !isHeadlessOrBot,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
      precision: 'highp',
    });
    renderer.setSize(width, height);

    // Detect software rendering
    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const unmaskedRenderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
    const isSoftwareOrHeadless =
      isHeadlessOrBot ||
      /llvmpipe|swiftshader|mesa|software|cpu/i.test(unmaskedRenderer);

    // Render resolution scale: renderer.setPixelRatio(window.devicePixelRatio * scale)
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const initialScale = propsRef.current.renderScale || 1.0;
    renderer.setPixelRatio(dpr * initialScale);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    // PCFSoftShadowMap enabled with high-definition resolution on HIGH (2048x2048)
    renderer.shadowMap.enabled = initialPreset !== 'LOW';
    if (renderer.shadowMap.enabled) {
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    // 4. OrbitControls with smooth exponential damping and expansive zoom range
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = 1.5;
    controls.maxDistance = 450;
    controls.target.set(0, 4, 0);
    controlsRef.current = controls;

    // 5. Lighting: Warm dimensional DirectionalLight + HemisphereLight + AmbientLight fill
    const ambientLight = new THREE.AmbientLight(atm.ambientColor, atm.ambientIntensity);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    // Rich two-tone HemisphereLight (Sky + Ground fill so shadows remain readable and never pitch black)
    const hemiLight = new THREE.HemisphereLight(
      atm.hemiSkyColor ?? 0x87ceeb,
      atm.hemiGroundColor ?? 0x3d4a3e,
      atm.hemiIntensity ?? 0.72
    );
    scene.add(hemiLight);
    hemiLightRef.current = hemiLight;

    // Angled DirectionalLight for elongated cinematic shadows (with positive normalBias to eliminate shadow acne)
    const keyLight = new THREE.DirectionalLight(atm.sunColor, atm.sunIntensity);
    keyLight.position.set(...atm.sunPos);
    keyLight.castShadow = renderer.shadowMap.enabled;
    if (keyLight.shadow) {
      const shadowRes = initialPreset === 'HIGH' ? 2048 : 1024;
      keyLight.shadow.mapSize.width = shadowRes;
      keyLight.shadow.mapSize.height = shadowRes;
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 320;
      keyLight.shadow.bias = -0.00002;
      keyLight.shadow.normalBias = 0.05; // Eliminates black shadow acne when zooming in close
      const d = 95;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
    }
    scene.add(keyLight);
    keyLightRef.current = keyLight;

    // Soft celestial moon light (cool silver-blue rim fill at night)
    const moonLight = new THREE.DirectionalLight(atm.moonColor, atm.moonIntensity);
    moonLight.position.set(...atm.moonPos);
    moonLight.castShadow = false;
    scene.add(moonLight);
    moonLightRef.current = moonLight;

    // Soft secondary fill light (brightens dark sides and shadows of objects so they are never pitch black)
    const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.42);
    fillLight.position.set(-atm.sunPos[0], Math.max(15, atm.sunPos[1] * 0.4 + 18), -atm.sunPos[2]);
    fillLight.castShadow = false;
    scene.add(fillLight);
    fillLightRef.current = fillLight;

    // Budgeted PointLights pool for nearby illuminated street lamps & lanterns
    const pointLights: THREE.PointLight[] = [];
    for (let i = 0; i < 6; i++) {
      const pl = new THREE.PointLight(0xfbbf24, 0, 22, 1.5);
      pl.castShadow = false;
      scene.add(pl);
      pointLights.push(pl);
    }
    budgetedPointLightsRef.current = pointLights;

    // 6. Combined Export Group (Terrain + Placed Objects) - Freeze static matrix
    const exportGroup = new THREE.Group();
    exportGroup.name = 'TerraForge_ExportGroup';
    exportGroup.matrixAutoUpdate = false;
    exportGroup.updateMatrix();
    scene.add(exportGroup);
    exportGroupRef.current = exportGroup;

    // 7. Terrain Mesh - Low-poly faceted MeshLambertMaterial ("patah-patah")
    const terrainGeo = buildTerrainBufferGeometry(
      terrainConfig.size,
      terrainConfig.resolution,
      heights,
      colors,
      terrainConfig.smoothShading
    );

    const terrainMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: !terrainConfig.smoothShading,
      side: THREE.DoubleSide,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.name = 'TerrainMesh';
    terrainMesh.receiveShadow = initialPreset !== 'LOW'; // Shadows active on MEDIUM & HIGH
    terrainMesh.castShadow = false;
    terrainMesh.frustumCulled = true;
    terrainMesh.matrixAutoUpdate = false;
    terrainMesh.updateMatrix();
    exportGroup.add(terrainMesh);
    terrainMeshRef.current = terrainMesh;

    // 8. Water Plane - MeshPhongMaterial Low-Poly (36x36 segments for faceted wave vertices)
    const oceanMult = terrainConfig.oceanScale ?? 1.9;
    const waterSize = Math.max(terrainConfig.size * oceanMult, 240);
    const waterSegments = 36;
    const waterGeo = new THREE.PlaneGeometry(waterSize, waterSize, waterSegments, waterSegments);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(palette.waterColor),
      transparent: true,
      opacity: 0.85,
      flatShading: true,
      shininess: 95,
      specular: new THREE.Color(0xdcfce7),
      depthWrite: false,
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.y = terrainConfig.waterLevel;
    waterMesh.name = 'WaterPlane';
    waterMesh.receiveShadow = false;
    waterMesh.castShadow = false;
    waterMesh.frustumCulled = true;
    waterMesh.matrixAutoUpdate = false;
    waterMesh.updateMatrix();
    scene.add(waterMesh);
    waterMeshRef.current = waterMesh;

    // 8b. Surrounding archipelago atolls - MeshLambertMaterial (flatShading for low-poly)
    const horizonGroup = new THREE.Group();
    horizonGroup.name = 'HorizonDistantIslands';
    const sandStop = palette.stops[1] || [0.15, 0.88, 0.78, 0.55];
    const rockStop = palette.stops[4] || [0.75, 0.45, 0.42, 0.38];
    const atollMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(sandStop[1], sandStop[2], sandStop[3]),
      flatShading: true,
    });
    const reefMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(rockStop[1], rockStop[2], rockStop[3]),
      flatShading: true,
    });

    const atollCount = 8;
    const baseRad = terrainConfig.size * 0.62;
    for (let p = 0; p < atollCount; p++) {
      const angle = (p / atollCount) * Math.PI * 2 + 0.35;
      const dist = baseRad * (1.1 + (p % 3) * 0.22);
      const px = Math.cos(angle) * dist;
      const pz = Math.sin(angle) * dist;

      // Stylized sandy atoll ring
      const atollGeo = new THREE.CylinderGeometry(5.0, 7.0, 1.4, 7);
      const atollMesh = new THREE.Mesh(atollGeo, atollMat);
      atollMesh.position.set(px, terrainConfig.waterLevel - 0.2, pz);
      const s = 0.8 + (p % 4) * 0.35;
      atollMesh.scale.set(s, s * 0.8, s);
      atollMesh.frustumCulled = true;
      atollMesh.matrixAutoUpdate = false;
      atollMesh.updateMatrix();
      horizonGroup.add(atollMesh);

      // Low rock spine on top
      const reefGeo = new THREE.ConeGeometry(2.0, 3.2, 5);
      const reefMesh = new THREE.Mesh(reefGeo, reefMat);
      reefMesh.position.set(px + 1.2, terrainConfig.waterLevel + 0.7, pz - 0.8);
      reefMesh.frustumCulled = true;
      reefMesh.matrixAutoUpdate = false;
      reefMesh.updateMatrix();
      horizonGroup.add(reefMesh);
    }
    horizonGroup.matrixAutoUpdate = false;
    horizonGroup.updateMatrix();
    scene.add(horizonGroup);

    // 10. Objects Group - Freeze static matrix
    const objectsGroup = new THREE.Group();
    objectsGroup.name = 'PlacedObjectsGroup';
    objectsGroup.matrixAutoUpdate = false;
    objectsGroup.updateMatrix();
    exportGroup.add(objectsGroup);
    objectsGroupRef.current = objectsGroup;

    // 11. Brush Ring Indicator
    const ringSegments = 48;
    const ringPoints: THREE.Vector3[] = [];
    for (let i = 0; i < ringSegments; i++) {
      const angle = (i / ringSegments) * Math.PI * 2;
      ringPoints.push(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPoints);
    const ringMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 2,
      depthTest: false,
      transparent: true,
      opacity: 0.8,
    });
    const brushRing = new THREE.LineLoop(ringGeo, ringMat);
    brushRing.visible = false;
    brushRing.renderOrder = 999;
    scene.add(brushRing);
    brushRingRef.current = brushRing;

    // 12. Ghost Placement Preview Group
    const ghostGroup = new THREE.Group();
    ghostGroup.name = 'GhostPlacementPreview';
    ghostGroup.visible = false;
    scene.add(ghostGroup);
    ghostPreviewRef.current = ghostGroup;

    // 13. Selection Box Helper
    const selectionBox = new THREE.BoxHelper(new THREE.Mesh(), 0xfacc15);
    selectionBox.visible = false;
    selectionBox.renderOrder = 998;
    (selectionBox.material as THREE.LineBasicMaterial).depthTest = false;
    scene.add(selectionBox);
    selectionBoxRef.current = selectionBox;

    // 14. Navigation Route Group (Interactive 3D Pins A & B + Route Ribbon)
    const navGroup = new THREE.Group();
    navGroup.name = 'NavigationRouteGroup';
    scene.add(navGroup);
    navGroupRef.current = navGroup;

    const pinAMesh = createPinMarkerMesh('A');
    pinAMesh.position.set(...pinAPosRef.current);
    navGroup.add(pinAMesh);
    pinAGroupRef.current = pinAMesh;

    const pinBMesh = createPinMarkerMesh('B');
    pinBMesh.position.set(...pinBPosRef.current);
    navGroup.add(pinBMesh);
    pinBGroupRef.current = pinBMesh;

    const pinCMesh = createPinMarkerMesh('C');
    pinCMesh.position.set(...pinCPosRef.current);
    pinCMesh.visible = hasWaypointCRef.current;
    navGroup.add(pinCMesh);
    pinCGroupRef.current = pinCMesh;

    const aStarGroup = createAStarNodeVisualizationGroup();
    navGroup.add(aStarGroup);
    aStarGroupRef.current = aStarGroup;

    const routeRibbon = createRouteRibbonMesh();
    navGroup.add(routeRibbon);
    routeRibbonRef.current = routeRibbon;

    // Notify parent
    if (onSceneReady) {
      onSceneReady(scene, exportGroup);
    }

    // 14. Render Animation Loop with FPS tracking & Mobile Performance
    let animationFrameId: number;
    let clock = new THREE.Clock();
    let lastRenderTime = 0;
    let frameCount = 0;
    let lastFpsTime = performance.now();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const now = performance.now();

      // FPS tracking
      frameCount++;
      if (now - lastFpsTime >= 500) {
        const currentFps = Math.round((frameCount * 1000) / (now - lastFpsTime));
        if (onFpsUpdate) onFpsUpdate(currentFps);
        frameCount = 0;
        lastFpsTime = now;
      }

      if (isSoftwareOrHeadless) {
        if (now - lastRenderTime < 75) return; // ~13 fps for headless CPU test
        lastRenderTime = now;
      }

      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      controls.update();

      // Water wave dynamics per graphics preset:
      // LOW: Static water plane (0 buffer uploads, 0 matrix updates)
      // MEDIUM: Smooth zero-CPU bobbing (position transform only)
      // HIGH: Dynamic low-poly sinusoidal vertex displacement + normal recalculation
      const currentPreset = normalizePreset(propsRef.current.graphicsPreset, propsRef.current.performanceMode);
      if (waterMeshRef.current) {
        if (currentPreset === 'HIGH') {
          wasHighPresetRef.current = true;
          const geo = waterMeshRef.current.geometry as THREE.BufferGeometry;
          const pos = geo.attributes.position.array as Float32Array;
          const count = geo.attributes.position.count;
          for (let i = 0; i < count; i++) {
            const px = pos[i * 3];
            const pz = pos[i * 3 + 2];
            // Complex multi-frequency sinusoidal vertex wave dynamics
            const w1 = Math.sin(px * 0.07 + pz * 0.05 + elapsed * 1.5) * 0.38;
            const w2 = Math.cos(px * 0.04 - pz * 0.06 + elapsed * 1.2) * 0.28;
            const w3 = Math.sin(Math.sqrt(px * px + pz * pz) * 0.05 - elapsed * 1.8) * 0.16;
            pos[i * 3 + 1] = w1 + w2 + w3;
          }
          geo.attributes.position.needsUpdate = true;
          geo.computeVertexNormals();
          waterMeshRef.current.position.y = propsRef.current.terrainConfig.waterLevel;
          waterMeshRef.current.updateMatrix();
        } else {
          // Reset vertex displacements cleanly if user just switched away from HIGH
          if (wasHighPresetRef.current) {
            wasHighPresetRef.current = false;
            const geo = waterMeshRef.current.geometry as THREE.BufferGeometry;
            const pos = geo.attributes.position.array as Float32Array;
            for (let i = 0; i < geo.attributes.position.count; i++) {
              pos[i * 3 + 1] = 0;
            }
            geo.attributes.position.needsUpdate = true;
            geo.computeVertexNormals();
          }
          if (currentPreset === 'MEDIUM' || currentPreset === 'CUSTOM') {
            // Smooth zero-CPU bobbing so water feels alive without vertex buffer uploads on mobile
            waterMeshRef.current.position.y =
              propsRef.current.terrainConfig.waterLevel + Math.sin(elapsed * 1.2) * 0.12;
            waterMeshRef.current.updateMatrix();
          } else {
            waterMeshRef.current.position.y = propsRef.current.terrainConfig.waterLevel;
          }
        }
      }

      // Dynamic 24-hour Sun/Moon Orbit, Atmosphere, Sky Dome, & Lamp Light Illumination
      const hour = propsRef.current.timeHour ?? 17.5;
      const biome = propsRef.current.terrainConfig.biome;
      const lampCfg = propsRef.current.lampSettings ?? { mode: 'auto', intensity: 1, radius: 1, pulsing: true };
      const dynAtm = calculateDynamicAtmosphere(hour, biome, lampCfg);

      if (keyLightRef.current) {
        keyLightRef.current.position.set(...dynAtm.sunPos);
        keyLightRef.current.color.setHex(dynAtm.sunColor);
        keyLightRef.current.intensity = dynAtm.sunIntensity;
      }
      if (moonLightRef.current) {
        moonLightRef.current.position.set(...dynAtm.moonPos);
        moonLightRef.current.color.setHex(dynAtm.moonColor);
        moonLightRef.current.intensity = dynAtm.moonIntensity;
      }
      if (hemiLightRef.current) {
        hemiLightRef.current.color.setHex(dynAtm.hemiSkyColor);
        hemiLightRef.current.groundColor.setHex(dynAtm.hemiGroundColor);
        hemiLightRef.current.intensity = dynAtm.hemiIntensity;
      }
      if (ambientLightRef.current) {
        ambientLightRef.current.color.setHex(dynAtm.ambientColor);
        ambientLightRef.current.intensity = dynAtm.ambientIntensity;
      }
      if (fillLightRef.current) {
        fillLightRef.current.position.set(-dynAtm.sunPos[0], Math.max(15, dynAtm.sunPos[1] * 0.4 + 18), -dynAtm.sunPos[2]);
        const ambMult = lampCfg.ambientBrightness ?? 1.25;
        fillLightRef.current.intensity = (dynAtm.isNight ? 0.32 : 0.45) * ambMult;
        fillLightRef.current.color.setHex(dynAtm.isNight ? 0x818cf8 : 0xdbeafe);
      }

      // Redraw sky canvas gradient in real-time without allocating textures
      if (
        skyCtxRef.current &&
        bgTextureRef.current &&
        (lastSkyTopRef.current !== dynAtm.skyTopColor || lastSkyBottomRef.current !== dynAtm.skyBottomColor)
      ) {
        lastSkyTopRef.current = dynAtm.skyTopColor;
        lastSkyBottomRef.current = dynAtm.skyBottomColor;
        const ctx = skyCtxRef.current;
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, dynAtm.skyTopColor);
        grad.addColorStop(0.65, dynAtm.skyBottomColor);
        grad.addColorStop(1.0, dynAtm.skyBottomColor);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 16, 256);
        bgTextureRef.current.needsUpdate = true;
      }

      // Dynamic fog color & density sync
      if (scene.fog && currentPreset !== 'LOW') {
        (scene.fog as THREE.FogExp2).color.set(dynAtm.fogColor);
        (scene.fog as THREE.FogExp2).density =
          currentPreset === 'HIGH' ? dynAtm.fogDensity * 1.05 : dynAtm.fogDensity;
      }

      // Night sky starfield visibility
      if (starPointsRef.current) {
        const starMat = starPointsRef.current.material as THREE.PointsMaterial;
        const starOp = Math.max(0, Math.min(0.9, (dynAtm.lampGlowFactor - 0.2) * 1.3));
        starMat.opacity = starOp;
        starPointsRef.current.visible = starOp > 0.01;
      }

      // Dynamic Ground Light Illumination Discs (Warm ground pool with gentle pulsing)
      const pulsing = lampCfg.pulsing ?? true;
      const pulseFactor = pulsing ? 1.0 + Math.sin(elapsed * 2.8) * 0.12 : 1.0;
      const targetGlowOpacity = Math.max(0, Math.min(1.0, 0.88 * dynAtm.lampGlowFactor * pulseFactor));
      const targetRadiusScale = (lampCfg.radius ?? 1.0) * (pulsing ? 1.0 + Math.sin(elapsed * 2.8) * 0.03 : 1.0);

      const lightMeshes = groundLightMeshesRef.current;
      for (let i = 0; i < lightMeshes.length; i++) {
        const m = lightMeshes[i];
        if (m && (m as any).material) {
          const mat = (m as any).material as THREE.MeshBasicMaterial;
          mat.opacity = targetGlowOpacity;
          mat.visible = targetGlowOpacity > 0.01;
        }
      }

      // Dynamic bulb emissive intensity (glowing lantern heads)
      const bulbGlow = 3.5 * Math.max(0.12, dynAtm.lampGlowFactor);
      const bulbMats = lampBulbsRef.current;
      for (let i = 0; i < bulbMats.length; i++) {
        if ('emissiveIntensity' in bulbMats[i]) {
          (bulbMats[i] as any).emissiveIntensity = bulbGlow;
        }
      }

      // Budgeted point lights allocation to closest active lamps
      const pointLights = budgetedPointLightsRef.current;
      if (pointLights.length > 0) {
        if (dynAtm.lampGlowFactor > 0.02) {
          const placed = propsRef.current.placedObjects;
          const camPos = camera.position;
          const lightSources = placed.filter(
            (o) =>
              o.type === 'street_lamp' ||
              o.type === 'island_lighthouse' ||
              o.type === 'fantasy_crystal' ||
              o.type === 'desert_monolith' ||
              o.type === 'alpine_cottage'
          );

          lightSources.sort((a, b) => {
            const d1 =
              (a.position[0] - camPos.x) ** 2 +
              (a.position[1] - camPos.y) ** 2 +
              (a.position[2] - camPos.z) ** 2;
            const d2 =
              (b.position[0] - camPos.x) ** 2 +
              (b.position[1] - camPos.y) ** 2 +
              (b.position[2] - camPos.z) ** 2;
            return d1 - d2;
          });

          for (let i = 0; i < pointLights.length; i++) {
            if (i < lightSources.length) {
              const src = lightSources[i];
              const pl = pointLights[i];
              const yOff =
                src.type === 'street_lamp'
                  ? 3.6
                  : src.type === 'island_lighthouse'
                  ? 12.0
                  : src.type === 'alpine_cottage'
                  ? 2.2
                  : 3.2;
              const xOff = src.type === 'street_lamp' ? 0.9 : 0;
              pl.position.set(src.position[0] + xOff, src.position[1] + yOff, src.position[2]);
              pl.color.setHex(src.type === 'fantasy_crystal' ? 0x38bdf8 : 0xfbbf24);
              pl.intensity = 2.4 * dynAtm.lampGlowFactor * pulseFactor * (lampCfg.intensity ?? 1.0);
            } else {
              pointLights[i].intensity = 0;
            }
          }
        } else {
          for (let i = 0; i < pointLights.length; i++) {
            pointLights[i].intensity = 0;
          }
        }
      }

      // Rotate windmill blades and turbines via direct array (0 tree traversal!)
      const rotors = animatedRotorsRef.current;
      for (let i = 0; i < rotors.length; i++) {
        rotors[i].obj.rotation.z += delta * rotors[i].speed;
      }

      // Pulse navigation pin beacon rings
      const beaconPulse = 1.0 + Math.sin(elapsed * 4.2) * 0.12;
      if (pinAGroupRef.current) {
        const ringA = pinAGroupRef.current.getObjectByName('beacon_ring');
        if (ringA) ringA.scale.set(beaconPulse, beaconPulse, beaconPulse);
      }
      if (pinBGroupRef.current) {
        const ringB = pinBGroupRef.current.getObjectByName('beacon_ring');
        if (ringB) ringB.scale.set(beaconPulse, beaconPulse, beaconPulse);
      }
      if (pinCGroupRef.current && hasWaypointCRef.current) {
        const ringC = pinCGroupRef.current.getObjectByName('beacon_ring');
        if (ringC) ringC.scale.set(beaconPulse, beaconPulse, beaconPulse);
      }

      // Smooth Camera Follow Pin when enabled or being dragged
      if (
        cameraFollowActiveRef.current &&
        (draggingPinRef.current || isMouseDownRef.current) &&
        controlsRef.current &&
        cameraRef.current
      ) {
        const activePos =
          activePinIdRef.current === 'A'
            ? pinAPosRef.current
            : activePinIdRef.current === 'B'
            ? pinBPosRef.current
            : pinCPosRef.current;
        const targetPos = new THREE.Vector3(activePos[0], activePos[1] + 1.2, activePos[2]);
        controlsRef.current.target.lerp(targetPos, 0.06);

        const camDist = cameraRef.current.position.distanceTo(controlsRef.current.target);
        if (camDist > 85) {
          cameraRef.current.position.lerp(
            targetPos.clone().add(cameraRef.current.position.clone().sub(targetPos).normalize().multiplyScalar(60)),
            0.04
          );
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // 15. Resize handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      const scale = propsRef.current.renderScale || 1.0;
      renderer.setPixelRatio(dpr * scale);
    };

    window.addEventListener('resize', handleResize);

    // Listen for camera preset changes from TopBar
    const handlePreset = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || !cameraRef.current || !controlsRef.current) return;
      const { preset } = detail;
      const cam = cameraRef.current;
      const ctrl = controlsRef.current;
      ctrl.target.set(0, 4, 0);
      if (preset === 'iso') {
        cam.position.set(65, 50, 65);
      } else if (preset === 'top') {
        cam.position.set(0, 110, 0.1);
      } else if (preset === 'cinematic') {
        cam.position.set(35, 12, 35);
      } else if (preset === 'reset') {
        cam.position.set(65, 50, 75);
      }
    };
    window.addEventListener('terraforge-camera-preset', handlePreset);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('terraforge-camera-preset', handlePreset);
      cancelAnimationFrame(animationFrameId);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []); // Run once on mount

  // Dynamically apply render resolution scale directly to WebGL renderer without affecting DOM UI layout or aspect ratio
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    renderer.setPixelRatio(dpr * renderScale);
  }, [renderScale]);

  // Sync terrain geometry positions and colors when heights/colors change (Rule 3)
  useEffect(() => {
    const terrain = terrainMeshRef.current;
    if (!terrain) return;

    // Redundant execution guard: prevent any re-render or buffer upload of island geometry unless genuinely changed
    const isSameHeights = lastAppliedHeightsRef.current === heights;
    const isSameColors = lastAppliedColorsRef.current === colors;
    const isSameRes = lastResRef.current === terrainConfig.resolution;
    const isSameSize = lastSizeRef.current === terrainConfig.size;
    const isSameSmooth = lastSmoothRef.current === terrainConfig.smoothShading;

    if (isSameHeights && isSameColors && isSameRes && isSameSize && isSameSmooth) {
      return;
    }

    lastAppliedHeightsRef.current = heights;
    lastAppliedColorsRef.current = colors;
    lastResRef.current = terrainConfig.resolution;
    lastSizeRef.current = terrainConfig.size;
    lastSmoothRef.current = terrainConfig.smoothShading;

    const oldGeo = terrain.geometry;
    const newGeo = buildTerrainBufferGeometry(
      terrainConfig.size,
      terrainConfig.resolution,
      heights,
      colors,
      terrainConfig.smoothShading
    );
    terrain.geometry = newGeo;
    oldGeo.dispose();

    if (terrain.material instanceof THREE.MeshLambertMaterial) {
      const targetFlat = !terrainConfig.smoothShading;
      if (terrain.material.flatShading !== targetFlat) {
        terrain.material.flatShading = targetFlat;
        terrain.material.needsUpdate = true;
      }
    }

    // Ensure terrain matrix remains strictly static
    terrain.matrixAutoUpdate = false;
    terrain.updateMatrix();
  }, [heights, colors, terrainConfig.resolution, terrainConfig.size, terrainConfig.smoothShading]);

  // Sync atmosphere, sky, fog, lighting, and water visuals based on Biome, TimeOfDay, TimeHour, and LampSettings
  useEffect(() => {
    if (!sceneRef.current || !keyLightRef.current || !ambientLightRef.current) return;
    const currentPreset = normalizePreset(graphicsPreset, performanceMode);
    const atm = calculateDynamicAtmosphere(timeHour, terrainConfig.biome, lampSettings);

    // 1. Sky Gradient & Horizon Fog
    if (skyCtxRef.current && bgTextureRef.current) {
      lastSkyTopRef.current = atm.skyTopColor;
      lastSkyBottomRef.current = atm.skyBottomColor;
      const ctx = skyCtxRef.current;
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, atm.skyTopColor);
      grad.addColorStop(0.65, atm.skyBottomColor);
      grad.addColorStop(1.0, atm.skyBottomColor);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 16, 256);
      bgTextureRef.current.needsUpdate = true;
    }

    if (currentPreset === 'LOW') {
      sceneRef.current.fog = null;
    } else {
      sceneRef.current.fog = new THREE.FogExp2(
        atm.fogColor,
        currentPreset === 'HIGH' ? atm.fogDensity * 1.05 : atm.fogDensity
      );
    }

    // 2. Warm dimensional directional light & ambient fill
    const key = keyLightRef.current;
    const amb = ambientLightRef.current;
    key.color.setHex(atm.sunColor);
    key.intensity = atm.sunIntensity;
    key.position.set(...atm.sunPos);

    if (moonLightRef.current) {
      moonLightRef.current.color.setHex(atm.moonColor);
      moonLightRef.current.intensity = atm.moonIntensity;
      moonLightRef.current.position.set(...atm.moonPos);
    }

    amb.color.setHex(atm.ambientColor);
    amb.intensity = atm.ambientIntensity;

    if (hemiLightRef.current) {
      hemiLightRef.current.color.setHex(atm.hemiSkyColor ?? 0x87ceeb);
      hemiLightRef.current.groundColor.setHex(atm.hemiGroundColor ?? 0x3d2b1f);
      hemiLightRef.current.intensity = atm.hemiIntensity ?? 0.75;
    }

    // 3. Water mesh color, transparency & specular highlight
    if (waterMeshRef.current) {
      waterMeshRef.current.position.y = terrainConfig.waterLevel;
      const palette = BIOME_PALETTES[terrainConfig.biome] || BIOME_PALETTES.archipelago;
      const wMat = waterMeshRef.current.material as THREE.MeshPhongMaterial;
      wMat.color.set(palette.waterColor);
      wMat.opacity = 0.85;
      wMat.shininess = 95;
      wMat.specular.set(0xdcfce7);
      wMat.flatShading = true;
      wMat.needsUpdate = true;
    }
  }, [terrainConfig.biome, terrainConfig.waterLevel, timeOfDay, timeHour, lampSettings, graphicsPreset, performanceMode]);

  // Dynamic Graphics Preset Adjustments: Shadows, Pixel Ratio, and Water Flatness
  useEffect(() => {
    if (!rendererRef.current) return;
    const currentPreset = normalizePreset(graphicsPreset, performanceMode);
    const isHeadlessOrBot =
      Boolean(navigator.webdriver) ||
      /HeadlessChrome|Headless/i.test(navigator.userAgent);

    // Resolution scaling per renderScale directly via renderer.setPixelRatio(window.devicePixelRatio * scale)
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const currentScale = propsRef.current.renderScale || 1.0;
    rendererRef.current.setPixelRatio(dpr * currentScale);

    // Shadow Map configuration (2048x2048 on HIGH with PCFSoftShadowMap)
    const enableShadows = currentPreset !== 'LOW';
    if (rendererRef.current.shadowMap) {
      rendererRef.current.shadowMap.enabled = enableShadows;
      if (enableShadows) {
        rendererRef.current.shadowMap.type = THREE.PCFSoftShadowMap;
        rendererRef.current.shadowMap.needsUpdate = true;
      }
    }
    if (keyLightRef.current) {
      keyLightRef.current.castShadow = enableShadows;
      if (keyLightRef.current.shadow) {
        const res = currentPreset === 'HIGH' ? 2048 : 1024;
        keyLightRef.current.shadow.mapSize.set(res, res);
        keyLightRef.current.shadow.bias = currentPreset === 'HIGH' ? -0.00002 : -0.00004;
        keyLightRef.current.shadow.normalBias = 0.05; // Smooth normal offset prevents shadow acne
        if (keyLightRef.current.shadow.map) {
          keyLightRef.current.shadow.map.dispose();
          (keyLightRef.current.shadow.map as any) = null;
        }
      }
    }

    if (terrainMeshRef.current) {
      terrainMeshRef.current.receiveShadow = enableShadows;
    }

    // Reset water wave displacement if leaving HIGH mode
    if (currentPreset !== 'HIGH' && waterMeshRef.current) {
      const geo = waterMeshRef.current.geometry as THREE.BufferGeometry;
      const pos = geo.attributes.position.array as Float32Array;
      const count = geo.attributes.position.count;
      let changed = false;
      for (let i = 0; i < count; i++) {
        if (pos[i * 3 + 1] !== 0) {
          pos[i * 3 + 1] = 0;
          changed = true;
        }
      }
      if (changed) {
        geo.attributes.position.needsUpdate = true;
        geo.computeVertexNormals();
      }
    }
  }, [graphicsPreset, performanceMode]);

  // Sync 3D placed objects whenever placedObjects changes with GPU Instancing (drops draw calls by ~98%!)
  useEffect(() => {
    const group = objectsGroupRef.current;
    if (!group) return;

    // Clear existing objects and dispose old instanced geometry/matrix buffers
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if ((child as THREE.InstancedMesh).isInstancedMesh) {
        (child as THREE.InstancedMesh).dispose?.();
      }
    }

    if (placedObjects.length === 0) {
      if (selectionBoxRef.current) selectionBoxRef.current.visible = false;
      animatedRotorsRef.current = [];
      groundLightMeshesRef.current = [];
      lampBulbsRef.current = [];
      return;
    }

    groundLightMeshesRef.current = [];
    lampBulbsRef.current = [];

    const isMobileDevice =
      typeof navigator !== 'undefined' &&
      (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        (typeof window !== 'undefined' && window.innerWidth < 768));

    // Models with animated sub-components (windmills, turbines) remain as separate groups so blades can spin
    const animatedTypes = new Set(['stone_windmill', 'wind_turbine']);
    const animatedObjects: PlacedObject[] = [];
    const instancedGroups = new Map<string, PlacedObject[]>();

    placedObjects.forEach((obj) => {
      if (animatedTypes.has(obj.type)) {
        animatedObjects.push(obj);
      } else {
        const key = obj.category === 'custom' && obj.customModelKey ? `custom_${obj.customModelKey}` : obj.type;
        const list = instancedGroups.get(key);
        if (list) {
          list.push(obj);
        } else {
          instancedGroups.set(key, [obj]);
        }
      }
    });

    const currentPreset = normalizePreset(graphicsPreset, performanceMode);

    // 1. Render all repeated static models as InstancedMesh (merges 100+ items into 1-2 draw calls per part)
    instancedGroups.forEach((instances, modelKey) => {
      if (instances.length === 0) return;
      const firstObj = instances[0];
      let template: THREE.Group | null = null;
      if (firstObj.category === 'custom' && firstObj.customModelKey) {
        template = getCustomModelClone(firstObj.customModelKey);
      }
      if (!template) {
        template = instantiateModel(firstObj.type);
      }
      if (!template) return;

      template.updateMatrixWorld(true);

      interface PartInfo {
        geometry: THREE.BufferGeometry;
        material: THREE.Material | THREE.Material[];
        localMatrix: THREE.Matrix4;
        castShadow: boolean;
        receiveShadow: boolean;
        name: string;
      }
      const parts: PartInfo[] = [];

      template.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          const m = c as THREE.Mesh;
          if (m.material) {
            if (Array.isArray(m.material)) {
              m.material.forEach((mat) => {
                if ('flatShading' in mat) (mat as any).flatShading = true;
              });
            } else {
              if ('flatShading' in m.material) (m.material as any).flatShading = true;
            }
          }
          parts.push({
            geometry: m.geometry,
            material: m.material,
            localMatrix: m.matrixWorld.clone(),
            castShadow: m.castShadow,
            receiveShadow: m.receiveShadow,
            name: m.name,
          });
        }
      });

      const count = instances.length;
      const isFoliageOrGrass =
        firstObj.type.includes('grass') ||
        firstObj.type.includes('flower') ||
        firstObj.category === 'foliage' ||
        firstObj.category === 'path';

      parts.forEach((part, partIdx) => {
        const instMesh = new THREE.InstancedMesh(part.geometry, part.material, count);
        instMesh.name = `${modelKey}_part_${partIdx}`;
        instMesh.frustumCulled = true;

        if (part.name === 'ground_light_disc' || (part as any).geometry?.name === 'ground_light_disc') {
          (instMesh as any).userData.isGroundLight = true;
          groundLightMeshesRef.current.push(instMesh as any);
        }
        if (part.name === 'lamp_bulb_emitter') {
          if (Array.isArray(part.material)) {
            lampBulbsRef.current.push(...part.material);
          } else {
            lampBulbsRef.current.push(part.material);
          }
        }

        // Shadow configuration: disabled completely in LOW, active for solid structures in MEDIUM & HIGH
        const enableShadow = currentPreset !== 'LOW' && !isFoliageOrGrass;
        instMesh.castShadow = enableShadow && part.castShadow;
        instMesh.receiveShadow = enableShadow && part.receiveShadow;

        (instMesh as any).userData = {
          isInstanced: true,
          modelKey,
          objectIds: instances.map((o) => o.id),
        };

        for (let i = 0; i < count; i++) {
          const obj = instances[i];
          _dummyObj.position.set(...obj.position);
          _dummyObj.rotation.set(...obj.rotation);
          _dummyObj.scale.set(...obj.scale);
          _dummyObj.updateMatrix();

          _combinedMat.multiplyMatrices(_dummyObj.matrix, part.localMatrix);
          instMesh.setMatrixAt(i, _combinedMat);
        }

        // Apply natural per-instance color variation to foliage / grass for rich lush scenery
        if (isFoliageOrGrass) {
          const baseColor = new THREE.Color();
          if ((part.material as any)?.color) {
            baseColor.copy((part.material as any).color);
          } else {
            baseColor.setHex(0x22c55e);
          }
          const instColor = new THREE.Color();
          for (let i = 0; i < count; i++) {
            const hsl = { h: 0, s: 0, l: 0 };
            baseColor.getHSL(hsl);
            const seed = Math.abs((Math.sin(instances[i].position[0] * 12.9898 + instances[i].position[2] * 78.233) * 43758.5453) % 1);
            hsl.h += (seed - 0.5) * 0.04;
            hsl.l += ((seed * 7.1) % 1 - 0.5) * 0.06;
            instColor.setHSL(hsl.h, hsl.s, hsl.l);
            instMesh.setColorAt(i, instColor);
          }
          if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;
        }

        instMesh.instanceMatrix.needsUpdate = true;
        instMesh.computeBoundingSphere();

        // Rule 1: Nonaktifkan matrixAutoUpdate untuk semua mesh lingkungan statis (pohon, bangunan, mercusuar, rumput)
        instMesh.matrixAutoUpdate = false;
        instMesh.updateMatrix();
        instMesh.updateMatrixWorld(true);

        group.add(instMesh);
      });
    });

    // 2. Render animated objects as standard Groups (with animated rotors)
    animatedObjects.forEach((obj) => {
      let modelMesh: THREE.Group | null = instantiateModel(obj.type);
      modelMesh.name = obj.id;
      modelMesh.position.set(...obj.position);
      modelMesh.rotation.set(...obj.rotation);
      modelMesh.scale.set(...obj.scale);
      (modelMesh as any).userData = { objectId: obj.id };
      modelMesh.updateMatrix();
      modelMesh.matrixAutoUpdate = false;

      modelMesh.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          if (m.material) {
            if (Array.isArray(m.material)) {
              m.material.forEach((mat) => {
                if ('flatShading' in mat) (mat as any).flatShading = true;
              });
            } else {
              if ('flatShading' in m.material) (m.material as any).flatShading = true;
            }
          }
          child.frustumCulled = true;
          if (currentPreset === 'LOW') {
            child.castShadow = false;
            child.receiveShadow = false;
          } else {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        }
        // Rule 1: Nonaktifkan matrixAutoUpdate untuk sub-mesh statis (hanya rotor yang berputar di animate)
        if (child.name !== 'windmill_rotor' && child.name !== 'turbine_rotor') {
          child.updateMatrix();
          child.matrixAutoUpdate = false;
        }

        if (child.name === 'ground_light_disc' || child.userData?.isGroundLight) {
          groundLightMeshesRef.current.push(child as THREE.Mesh);
        }
        if (child.name === 'lamp_bulb_emitter' && (child as THREE.Mesh).material) {
          const m = (child as THREE.Mesh).material;
          if (Array.isArray(m)) lampBulbsRef.current.push(...m);
          else lampBulbsRef.current.push(m);
        }
      });
      group.add(modelMesh);
    });

    group.matrixAutoUpdate = false;
    group.updateMatrix();

    // Cache animated rotors once here to avoid per-frame scene graph traversal
    const rotors: { obj: THREE.Object3D; speed: number }[] = [];
    group.traverse((child) => {
      if (child.name === 'windmill_rotor') {
        rotors.push({ obj: child, speed: 1.5 });
      } else if (child.name === 'turbine_rotor') {
        rotors.push({ obj: child, speed: 2.2 });
      }
    });
    animatedRotorsRef.current = rotors;

    // 3. Selection Box Helper update
    if (selectionBoxRef.current) {
      if (selectedObjectId) {
        const selectedObj = placedObjects.find((o) => o.id === selectedObjectId);
        if (selectedObj) {
          const directChild = group.children.find((c) => (c as any).userData?.objectId === selectedObjectId);
          if (directChild) {
            selectionBoxRef.current.setFromObject(directChild);
          } else {
            const isGrass = selectedObj.type.includes('grass') || selectedObj.type.includes('flower');
            const isTree = selectedObj.type.includes('tree');
            const isBuilding = selectedObj.category === 'building' || selectedObj.category === 'cyber';
            const boxW = isGrass ? 1.8 : isTree ? 3.0 : isBuilding ? 5.2 : 3.2;
            const boxH = isGrass ? 1.4 : isTree ? 5.5 : isBuilding ? 7.0 : 4.0;

            _selectionDummy.geometry.dispose();
            _selectionDummy.geometry = new THREE.BoxGeometry(
              boxW * selectedObj.scale[0],
              boxH * selectedObj.scale[1],
              boxW * selectedObj.scale[2]
            );
            _selectionDummy.position.set(
              selectedObj.position[0],
              selectedObj.position[1] + (boxH * selectedObj.scale[1]) / 2,
              selectedObj.position[2]
            );
            _selectionDummy.rotation.set(...selectedObj.rotation);
            _selectionDummy.updateMatrixWorld(true);
            selectionBoxRef.current.setFromObject(_selectionDummy);
          }
          selectionBoxRef.current.visible = true;
        } else {
          selectionBoxRef.current.visible = false;
        }
      } else {
        selectionBoxRef.current.visible = false;
      }
    }
  }, [placedObjects, selectedObjectId, graphicsPreset, performanceMode]);

  // Update ghost preview when activePaletteItem or brushSettings change
  useEffect(() => {
    const ghost = ghostPreviewRef.current;
    if (!ghost) return;

    while (ghost.children.length > 0) {
      ghost.remove(ghost.children[0]);
    }

    if (brushSettings.mode === 'place' && activePaletteItem) {
      let preview: THREE.Group | null = null;
      if (activePaletteItem.isCustom) {
        preview = getCustomModelClone(activePaletteItem.id);
      } else {
        preview = instantiateModel(activePaletteItem.id);
      }

      if (preview) {
        // Apply semi-transparent ghost look
        preview.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const m = child as THREE.Mesh;
            m.castShadow = false;
            m.receiveShadow = false;
            if (m.material) {
              const mat = (Array.isArray(m.material) ? m.material[0] : m.material).clone();
              mat.transparent = true;
              mat.opacity = 0.6;
              m.material = mat;
            }
          }
        });
        ghost.add(preview);
      }
    }
  }, [activePaletteItem, brushSettings.mode]);

  // Pointer event handlers for sculpting and object interaction
  const getTerrainIntersection = (clientX: number, clientY: number): THREE.Vector3 | null => {
    const container = mountRef.current;
    const camera = cameraRef.current;
    const terrain = terrainMeshRef.current;
    if (!container || !camera || !terrain) return null;

    const rect = container.getBoundingClientRect();
    _mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    _raycaster.setFromCamera(_mouse, camera);
    const intersects = _raycaster.intersectObject(terrain, false);

    if (intersects.length > 0) {
      return intersects[0].point;
    }
    return null;
  };

  const getObjectIntersection = (clientX: number, clientY: number): string | null => {
    const container = mountRef.current;
    const camera = cameraRef.current;
    const group = objectsGroupRef.current;
    if (!container || !camera || !group) return null;

    const rect = container.getBoundingClientRect();
    _mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    _raycaster.setFromCamera(_mouse, camera);
    const intersects = _raycaster.intersectObjects(group.children, true);

    if (intersects.length > 0) {
      for (let i = 0; i < intersects.length; i++) {
        const hit = intersects[i];
        const instMesh = hit.object as THREE.InstancedMesh;
        if (instMesh.isInstancedMesh && hit.instanceId !== undefined) {
          const ids = (instMesh as any).userData?.objectIds;
          if (ids && ids[hit.instanceId]) {
            return ids[hit.instanceId];
          }
        }

        // Find top group child with userData.objectId (e.g. animated windmills)
        let curr: THREE.Object3D | null = hit.object;
        while (curr && curr.parent !== group) {
          curr = curr.parent;
        }
        if (curr && (curr as any).userData?.objectId) {
          return (curr as any).userData.objectId;
        }
      }
    }
    return null;
  };

  // Check if touch/click intersected Pin A, Pin B, or Pin C
  const checkPinIntersection = (clientX: number, clientY: number): 'A' | 'B' | 'C' | null => {
    const container = mountRef.current;
    const camera = cameraRef.current;
    if (!container || !camera) return null;

    const rect = container.getBoundingClientRect();
    _mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    _raycaster.setFromCamera(_mouse, camera);

    const hitTargets: THREE.Object3D[] = [];
    if (pinAGroupRef.current) {
      const hA = pinAGroupRef.current.getObjectByName('pin_hit_A');
      if (hA) hitTargets.push(hA);
    }
    if (pinBGroupRef.current) {
      const hB = pinBGroupRef.current.getObjectByName('pin_hit_B');
      if (hB) hitTargets.push(hB);
    }
    if (hasWaypointCRef.current && pinCGroupRef.current) {
      const hC = pinCGroupRef.current.getObjectByName('pin_hit_C');
      if (hC) hitTargets.push(hC);
    }

    const hits = _raycaster.intersectObjects(hitTargets, false);
    if (hits.length > 0) {
      const id = (hits[0].object as any).userData?.pinId;
      if (id === 'A' || id === 'B' || id === 'C') return id;
    }

    // 3D proximity fallback
    const pt = getTerrainIntersection(clientX, clientY);
    if (pt) {
      const dA = Math.hypot(pt.x - pinAPosRef.current[0], pt.z - pinAPosRef.current[2]);
      const dB = Math.hypot(pt.x - pinBPosRef.current[0], pt.z - pinBPosRef.current[2]);
      const dC = hasWaypointCRef.current
        ? Math.hypot(pt.x - pinCPosRef.current[0], pt.z - pinCPosRef.current[2])
        : Infinity;

      if (dC < 4.8 && dC <= dA && dC <= dB) return 'C';
      if (dA < 4.8 && dA <= dB) return 'A';
      if (dB < 4.8 && dB < dA) return 'B';
    }

    return null;
  };

  const recalculateRoute = useCallback(() => {
    const { heights, terrainConfig, placedObjects } = propsRef.current;
    const start = pinAPosRef.current;
    const end = pinBPosRef.current;
    const startBound = pinABoundIdRef.current;
    const endBound = pinBBoundIdRef.current;
    const waypointC = hasWaypointCRef.current ? pinCPosRef.current : null;

    const result = calculateSmartDetourPath(
      start,
      end,
      placedObjects,
      heights,
      terrainConfig.size,
      terrainConfig.resolution,
      terrainConfig.waterLevel,
      startBound,
      endBound,
      waypointC
    );

    currentRoutePointsRef.current = result.points;

    if (routeRibbonRef.current) {
      updateRouteRibbonGeometry(
        routeRibbonRef.current,
        result.points,
        0.44,
        hasWaypointCRef.current
      );
    }

    if (aStarGroupRef.current) {
      updateAStarNodeVisualization(
        aStarGroupRef.current,
        result.exploredNodes,
        result.nodes,
        showAStarNodesRef.current
      );
    }

    const activePos =
      activePinIdRef.current === 'A'
        ? start
        : activePinIdRef.current === 'B'
        ? end
        : pinCPosRef.current;
    const nearby = findNearbyBuilding(activePos, placedObjects, 7.5);
    setNearbyBuilding(nearby);

    setRouteDetails({
      isDetoured: result.isDetoured,
      avoidedCount: result.avoidedCount,
      lengthMeters: result.lengthMeters,
      hasSteepSlope: result.hasSteepSlope,
      crossesWater: result.crossesWater,
      nodeCount: result.nodes.length,
    });
  }, []);

  const updatePinPosition = (pinId: 'A' | 'B' | 'C', x: number, z: number) => {
    const { heights, terrainConfig } = propsRef.current;
    const maxRange = terrainConfig.size * 0.46;
    const clampedX = Math.max(-maxRange, Math.min(maxRange, x));
    const clampedZ = Math.max(-maxRange, Math.min(maxRange, z));
    const groundY = getSampledHeightAt(clampedX, clampedZ, heights, terrainConfig.size, terrainConfig.resolution);

    const newPos: [number, number, number] = [clampedX, groundY, clampedZ];

    if (pinId === 'A') {
      pinAPosRef.current = newPos;
      pinABoundIdRef.current = null;
      setPinAPos(newPos);
      setPinABoundId(null);
      if (pinAGroupRef.current) pinAGroupRef.current.position.set(...newPos);
    } else if (pinId === 'B') {
      pinBPosRef.current = newPos;
      pinBBoundIdRef.current = null;
      setPinBPos(newPos);
      setPinBBoundId(null);
      if (pinBGroupRef.current) pinBGroupRef.current.position.set(...newPos);
    } else {
      pinCPosRef.current = newPos;
      setPinCPos(newPos);
      if (pinCGroupRef.current) pinCGroupRef.current.position.set(...newPos);
    }

    recalculateRoute();
  };

  // Synchronize pin ground elevations & re-route on terrain or object changes
  useEffect(() => {
    const { heights, terrainConfig } = propsRef.current;
    const yA = getSampledHeightAt(pinAPosRef.current[0], pinAPosRef.current[2], heights, terrainConfig.size, terrainConfig.resolution);
    pinAPosRef.current = [pinAPosRef.current[0], yA, pinAPosRef.current[2]];
    setPinAPos([...pinAPosRef.current]);
    if (pinAGroupRef.current) pinAGroupRef.current.position.set(...pinAPosRef.current);

    const yB = getSampledHeightAt(pinBPosRef.current[0], pinBPosRef.current[2], heights, terrainConfig.size, terrainConfig.resolution);
    pinBPosRef.current = [pinBPosRef.current[0], yB, pinBPosRef.current[2]];
    setPinBPos([...pinBPosRef.current]);
    if (pinBGroupRef.current) pinBGroupRef.current.position.set(...pinBPosRef.current);

    if (hasWaypointCRef.current) {
      const yC = getSampledHeightAt(pinCPosRef.current[0], pinCPosRef.current[2], heights, terrainConfig.size, terrainConfig.resolution);
      pinCPosRef.current = [pinCPosRef.current[0], yC, pinCPosRef.current[2]];
      setPinCPos([...pinCPosRef.current]);
      if (pinCGroupRef.current) pinCGroupRef.current.position.set(...pinCPosRef.current);
    }

    recalculateRoute();
  }, [heights, placedObjects, terrainConfig.size, terrainConfig.resolution, terrainConfig.waterLevel, recalculateRoute]);

  const handleBindDoorway = () => {
    const activePos =
      activePinIdRef.current === 'A'
        ? pinAPosRef.current
        : activePinIdRef.current === 'B'
        ? pinBPosRef.current
        : pinCPosRef.current;
    const building = findNearbyBuilding(activePos, propsRef.current.placedObjects, 7.5);
    if (!building) return;

    const doorInfo = getBuildingDoorwayInfo(building);
    if (!doorInfo) return;

    const { heights, terrainConfig } = propsRef.current;
    const targetY = getSampledHeightAt(
      doorInfo.entrancePos[0],
      doorInfo.entrancePos[2],
      heights,
      terrainConfig.size,
      terrainConfig.resolution
    );

    const finalPos: [number, number, number] = [doorInfo.entrancePos[0], targetY, doorInfo.entrancePos[2]];

    if (activePinIdRef.current === 'A') {
      pinAPosRef.current = finalPos;
      pinABoundIdRef.current = building.id;
      setPinAPos(finalPos);
      setPinABoundId(building.id);
      if (pinAGroupRef.current) pinAGroupRef.current.position.set(...finalPos);
    } else if (activePinIdRef.current === 'B') {
      pinBPosRef.current = finalPos;
      pinBBoundIdRef.current = building.id;
      setPinBPos(finalPos);
      setPinBBoundId(building.id);
      if (pinBGroupRef.current) pinBGroupRef.current.position.set(...finalPos);
    } else {
      pinCPosRef.current = finalPos;
      setPinCPos(finalPos);
      if (pinCGroupRef.current) pinCGroupRef.current.position.set(...finalPos);
    }

    if (controlsRef.current) {
      controlsRef.current.target.set(finalPos[0], finalPos[1] + 1.2, finalPos[2]);
    }

    recalculateRoute();

    if (propsRef.current.onToast) {
      propsRef.current.onToast(`🚪 Pin ${activePinIdRef.current} berhasil disambungkan tepat ke pintu depan ${building.name}!`);
    }
  };

  const handleUnbindDoorway = () => {
    if (activePinIdRef.current === 'A') {
      pinABoundIdRef.current = null;
      setPinABoundId(null);
    } else if (activePinIdRef.current === 'B') {
      pinBBoundIdRef.current = null;
      setPinBBoundId(null);
    }
    recalculateRoute();
    if (propsRef.current.onToast) {
      propsRef.current.onToast(`🔓 Pin ${activePinIdRef.current} dilepas dari kaitan pintu.`);
    }
  };

  const handleSwapPins = () => {
    if (hasWaypointC) {
      const nextPin: 'A' | 'B' | 'C' = activePinId === 'A' ? 'C' : activePinId === 'C' ? 'B' : 'A';
      handleSelectPin(nextPin);
    } else {
      const nextPin: 'A' | 'B' | 'C' = activePinId === 'A' ? 'B' : 'A';
      handleSelectPin(nextPin);
    }
  };

  const handleSelectPin = (pinId: 'A' | 'B' | 'C') => {
    setActivePinId(pinId);
    activePinIdRef.current = pinId;
    const targetPos =
      pinId === 'A'
        ? pinAPosRef.current
        : pinId === 'B'
        ? pinBPosRef.current
        : pinCPosRef.current;
    if (controlsRef.current) {
      controlsRef.current.target.set(targetPos[0], targetPos[1] + 1.2, targetPos[2]);
    }
    const nearby = findNearbyBuilding(targetPos, propsRef.current.placedObjects, 7.5);
    setNearbyBuilding(nearby);
  };

  const focusCameraOnPin = useCallback((pinId: 'A' | 'B' | 'C', zoomCloser: boolean = false) => {
    const pos =
      pinId === 'A'
        ? pinAPosRef.current
        : pinId === 'B'
        ? pinBPosRef.current
        : pinCPosRef.current;
    if (!controlsRef.current || !cameraRef.current) return;

    const targetPos = new THREE.Vector3(pos[0], pos[1] + 1.2, pos[2]);
    controlsRef.current.target.copy(targetPos);

    if (zoomCloser) {
      const cam = cameraRef.current;
      const forward = new THREE.Vector3().subVectors(cam.position, targetPos).normalize();
      cam.position.copy(targetPos).add(forward.multiplyScalar(32));
    }
    controlsRef.current.update();
  }, []);

  const handleToggleWaypointC = () => {
    setHasWaypointC((prev) => {
      const next = !prev;
      hasWaypointCRef.current = next;
      if (pinCGroupRef.current) {
        pinCGroupRef.current.visible = next;
      }
      if (next) {
        const midX = (pinAPosRef.current[0] + pinBPosRef.current[0]) * 0.5 + 4;
        const midZ = (pinAPosRef.current[2] + pinBPosRef.current[2]) * 0.5 - 4;
        const midY = getSampledHeightAt(
          midX,
          midZ,
          propsRef.current.heights,
          propsRef.current.terrainConfig.size,
          propsRef.current.terrainConfig.resolution
        );
        const newCPos: [number, number, number] = [midX, midY, midZ];
        pinCPosRef.current = newCPos;
        setPinCPos(newCPos);
        if (pinCGroupRef.current) {
          pinCGroupRef.current.position.set(...newCPos);
        }
        setActivePinId('C');
        activePinIdRef.current = 'C';
        propsRef.current.onToast?.('📍 Titik Singgah Pin C ditambahkan! Rute A* menghubungkan A → C → B.');
      } else {
        if (activePinIdRef.current === 'C') {
          setActivePinId('A');
          activePinIdRef.current = 'A';
        }
        propsRef.current.onToast?.('✕ Titik Singgah Pin C dihapus. Rute A* kembali langsung A → B.');
      }
      setTimeout(recalculateRoute, 10);
      return next;
    });
  };

  const handleToggleAStarNodes = () => {
    setShowAStarNodes((prev) => {
      const next = !prev;
      showAStarNodesRef.current = next;
      if (aStarGroupRef.current) {
        aStarGroupRef.current.visible = next;
      }
      recalculateRoute();
      return next;
    });
  };

  const toggleCameraFollow = () => {
    setCameraFollowActive((prev) => {
      const next = !prev;
      cameraFollowActiveRef.current = next;
      if (next) {
        focusCameraOnPin(activePinIdRef.current, false);
      }
      return next;
    });
  };

  // Synchronize 3D pin group visibility
  useEffect(() => {
    if (navGroupRef.current) {
      navGroupRef.current.visible = isPinNavVisible;
    }
  }, [isPinNavVisible]);

  const handleResetPins = () => {
    const { heights, terrainConfig } = propsRef.current;
    const half = terrainConfig.size * 0.28;
    const yA = getSampledHeightAt(-half, -half, heights, terrainConfig.size, terrainConfig.resolution);
    const yB = getSampledHeightAt(half, half, heights, terrainConfig.size, terrainConfig.resolution);
    const yC = getSampledHeightAt(0, 0, heights, terrainConfig.size, terrainConfig.resolution);

    pinAPosRef.current = [-half, yA, -half];
    pinBPosRef.current = [half, yB, half];
    pinCPosRef.current = [0, yC, 0];
    pinABoundIdRef.current = null;
    pinBBoundIdRef.current = null;

    setPinAPos([-half, yA, -half]);
    setPinBPos([half, yB, half]);
    setPinCPos([0, yC, 0]);
    setPinABoundId(null);
    setPinBBoundId(null);

    if (pinAGroupRef.current) pinAGroupRef.current.position.set(-half, yA, -half);
    if (pinBGroupRef.current) pinBGroupRef.current.position.set(half, yB, half);
    if (pinCGroupRef.current) pinCGroupRef.current.position.set(0, yC, 0);

    if (controlsRef.current) {
      controlsRef.current.target.set(0, 4, 0);
    }

    recalculateRoute();

    if (propsRef.current.onToast) {
      propsRef.current.onToast('↺ Posisi Pin A, B, dan C berhasil dikembalikan ke posisi awal.');
    }
  };

    if (controlsRef.current) {
      controlsRef.current.target.set(0, 4, 0);
    }

    recalculateRoute();

    if (propsRef.current.onToast) {
      propsRef.current.onToast('↺ Posisi Pin A dan B berhasil dikembalikan ke posisi awal.');
    }
  };

  const handleBakeRoute = () => {
    if (currentRoutePointsRef.current.length < 2) return;
    const {
      heights,
      colors,
      terrainConfig,
      placedObjects,
      onBakeNavigationRoute,
      onTerrainBuffersChange,
      onObjectPlaced,
      onToast,
    } = propsRef.current;

    const result = bakeNavigationRouteToTerrain(
      currentRoutePointsRef.current,
      heights,
      colors,
      terrainConfig,
      placedObjects
    );

    if (onBakeNavigationRoute) {
      onBakeNavigationRoute(result.newHeights, result.newColors, result.newProps);
    } else {
      if (onTerrainBuffersChange) {
        onTerrainBuffersChange(result.newHeights, result.newColors);
      }
      result.newProps.forEach((p) => onObjectPlaced?.(p));
    }

    if (onToast) {
      onToast('🚶‍♂️ Jalur Pin A ⇄ B berhasil diterapkan menjadi jalan setapak permanen!');
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // only left click / primary touch
    isMouseDownRef.current = true;
    didDragRef.current = false;
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };

    // Check if user touched or clicked near Pin A or Pin B
    const touchedPin = checkPinIntersection(e.clientX, e.clientY);
    if (touchedPin) {
      try {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch (_) {}
      draggingPinRef.current = touchedPin;
      setActivePinId(touchedPin);
      activePinIdRef.current = touchedPin;
      if (controlsRef.current) controlsRef.current.enabled = false;
      return;
    }

    const { brushSettings } = propsRef.current;
    if (brushSettings.mode.startsWith('sculpt')) {
      if (controlsRef.current) controlsRef.current.enabled = false;
      applySculptAtPointer(e.clientX, e.clientY);
    }
  };

  const applySculptAtPointer = (clientX: number, clientY: number) => {
    const { brushSettings, heights, colors, terrainConfig, onHeightmapChange, onTerrainBuffersChange } = propsRef.current;
    const pt = getTerrainIntersection(clientX, clientY);
    if (!pt) return;

    if (brushSettings.mode === 'sculpt-path') {
      const newHeights = new Float32Array(heights);
      const newColors = new Float32Array(colors);
      applyPathBrush(
        pt.x,
        pt.z,
        newHeights,
        newColors,
        terrainConfig.size,
        terrainConfig.resolution,
        brushSettings.pathStyle || terrainConfig.pathStyle || 'blend_natural',
        brushSettings.radius,
        brushSettings.intensity,
        brushSettings.pathBlendRatios
      );

      // Smart path structure installation (tangga kayu di lereng curam & jembatan penyeberangan air)
      if (brushSettings.autoInstallStairsAndBridges !== false && propsRef.current.onObjectPlaced) {
        const { placedObjects } = propsRef.current;
        // 1. Water check: is the point in water or coastal shallows?
        if (pt.y <= terrainConfig.waterLevel + 0.35) {
          const nearBridge = placedObjects.some(
            (o) => o.type === 'wooden_bridge' && Math.hypot(o.position[0] - pt.x, o.position[2] - pt.z) < 6.5
          );
          if (!nearBridge) {
            propsRef.current.onObjectPlaced({
              id: `path_bridge_${Date.now()}`,
              name: 'Jembatan Kayu Air',
              type: 'wooden_bridge',
              category: 'path',
              position: [pt.x, terrainConfig.waterLevel + 0.40, pt.z],
              rotation: [0, 0, 0],
              scale: [1, 1, 1],
            });
          }
        } else {
          // 2. Steep slope check:
          const stepSize = terrainConfig.size / (terrainConfig.resolution - 1);
          const hL = getSampledHeightAt(pt.x - stepSize, pt.z, heights, terrainConfig.size, terrainConfig.resolution);
          const hR = getSampledHeightAt(pt.x + stepSize, pt.z, heights, terrainConfig.size, terrainConfig.resolution);
          const hT = getSampledHeightAt(pt.x, pt.z - stepSize, heights, terrainConfig.size, terrainConfig.resolution);
          const hB = getSampledHeightAt(pt.x, pt.z + stepSize, heights, terrainConfig.size, terrainConfig.resolution);
          const dxH = (hR - hL) / (2 * stepSize);
          const dzH = (hB - hT) / (2 * stepSize);
          const localSlope = Math.sqrt(dxH * dxH + dzH * dzH);

          if (localSlope > 0.40) {
            const nearStairs = placedObjects.some(
              (o) => o.type === 'wooden_stairs' && Math.hypot(o.position[0] - pt.x, o.position[2] - pt.z) < 4.8
            );
            if (!nearStairs) {
              const climbAngle = Math.atan2(dxH, dzH);
              propsRef.current.onObjectPlaced({
                id: `path_stairs_${Date.now()}`,
                name: 'Tangga Kayu Lereng',
                type: 'wooden_stairs',
                category: 'path',
                position: [pt.x, pt.y, pt.z],
                rotation: [0, climbAngle, 0],
                scale: [1, 1, 1],
              });
            }
          }
        }
      }

      // Fast geometry update
      const terrain = terrainMeshRef.current;
      if (terrain) {
        const oldGeo = terrain.geometry;
        const newGeo = buildTerrainBufferGeometry(
          terrainConfig.size,
          terrainConfig.resolution,
          newHeights,
          newColors,
          terrainConfig.smoothShading
        );
        terrain.geometry = newGeo;
        oldGeo.dispose();
      }

      lastAppliedHeightsRef.current = newHeights;
      lastAppliedColorsRef.current = newColors;

      if (onTerrainBuffersChange) {
        onTerrainBuffersChange(newHeights, newColors);
      } else {
        onHeightmapChange(newHeights);
      }

      propsRef.current.onAddTrailPoint?.({ x: pt.x, z: pt.z });
    } else {
      const newHeights = new Float32Array(heights);
      applySculptBrush(
        pt.x,
        pt.z,
        newHeights,
        terrainConfig.size,
        terrainConfig.resolution,
        brushSettings.mode as any,
        brushSettings.radius,
        brushSettings.intensity,
        brushSettings.flattenHeight
      );

      const terrain = terrainMeshRef.current;
      if (terrain) {
        const oldGeo = terrain.geometry;
        const newGeo = buildTerrainBufferGeometry(
          terrainConfig.size,
          terrainConfig.resolution,
          newHeights,
          colors,
          terrainConfig.smoothShading
        );
        terrain.geometry = newGeo;
        oldGeo.dispose();
      }

      lastAppliedHeightsRef.current = newHeights;
      onHeightmapChange(newHeights);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const dx = Math.abs(e.clientX - mouseDownPosRef.current.x);
    const dy = Math.abs(e.clientY - mouseDownPosRef.current.y);
    if (dx > 4 || dy > 4) {
      didDragRef.current = true;
    }

    // Direct touch-drag for Navigation Pins A and B
    if (draggingPinRef.current) {
      const pinId = draggingPinRef.current;
      const pt = getTerrainIntersection(e.clientX, e.clientY);
      if (pt) {
        updatePinPosition(pinId, pt.x, pt.z);

        // Dynamic Camera Follow & Auto-Zoom if Pin is moving or far away
        if (cameraFollowActiveRef.current && controlsRef.current && cameraRef.current) {
          const target = controlsRef.current.target;
          target.lerp(new THREE.Vector3(pt.x, pt.y + 1.2, pt.z), 0.20);
          controlsRef.current.update();

          const cam = cameraRef.current;
          const dist = cam.position.distanceTo(target);
          if (dist > 52) {
            const forward = new THREE.Vector3().subVectors(cam.position, target).normalize();
            cam.position.lerp(target.clone().add(forward.multiplyScalar(36)), 0.14);
          }
        }
      }
      return;
    }

    const { brushSettings, activePaletteItem } = propsRef.current;

    // Skip raycast when just navigating in select mode
    if (brushSettings.mode === 'select' && !isMouseDownRef.current) {
      return;
    }

    // Throttle raycasting on touch/mobile to prevent stutter
    const now = performance.now();
    if (now - lastRaycastTimeRef.current < 25) {
      return;
    }
    lastRaycastTimeRef.current = now;

    const pt = getTerrainIntersection(e.clientX, e.clientY);

    // Update brush ring indicator position and radius
    if (brushRingRef.current) {
      if (pt && (brushSettings.mode.startsWith('sculpt') || brushSettings.mode === 'scatter-brush')) {
        brushRingRef.current.visible = true;
        brushRingRef.current.position.set(pt.x, pt.y + 0.12, pt.z);
        const ringRad = brushSettings.mode === 'scatter-brush' ? Math.max(brushSettings.radius * 0.45, 3.5) : brushSettings.radius;
        brushRingRef.current.scale.set(ringRad, 1, ringRad);
        if (brushRingRef.current.material) {
          (brushRingRef.current.material as THREE.LineBasicMaterial).color.setHex(
            brushSettings.mode === 'scatter-brush' ? 0xf59e0b : 0x38bdf8
          );
        }
      } else {
        brushRingRef.current.visible = false;
      }
    }

    // Update ghost placement preview with active placementScale
    if (ghostPreviewRef.current) {
      if (pt && (brushSettings.mode === 'place' || brushSettings.mode === 'scatter-brush') && activePaletteItem) {
        ghostPreviewRef.current.visible = true;
        ghostPreviewRef.current.position.set(pt.x, pt.y, pt.z);
        const pScale = brushSettings.placementScale ?? 1.0;
        const bs = activePaletteItem.defaultScale || [1, 1, 1];
        ghostPreviewRef.current.scale.set(bs[0] * pScale, bs[1] * pScale, bs[2] * pScale);
      } else {
        ghostPreviewRef.current.visible = false;
      }
    }

    // Drag-sculpting continuous update
    if (isMouseDownRef.current && brushSettings.mode.startsWith('sculpt')) {
      applySculptAtPointer(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isMouseDownRef.current = false;

    try {
      if ((e.target as HTMLElement).hasPointerCapture?.(e.pointerId)) {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      }
    } catch (_) {}

    if (draggingPinRef.current) {
      draggingPinRef.current = null;
      if (controlsRef.current) controlsRef.current.enabled = true;
      return;
    }

    if (controlsRef.current) controlsRef.current.enabled = true;

    // Only trigger placement or selection if user simply clicked (didn't drag camera)
    if (!didDragRef.current) {
      const {
        brushSettings,
        activePaletteItem,
        onObjectPlaced,
        onObjectSelected,
        placedObjects,
        heights,
        terrainConfig,
      } = propsRef.current;

      const pScale = brushSettings.placementScale ?? 1.0;

      if ((brushSettings.mode === 'place' || brushSettings.mode === 'scatter-brush') && activePaletteItem) {
        const pt = getTerrainIntersection(e.clientX, e.clientY);
        if (pt) {
          if (brushSettings.mode === 'scatter-brush') {
            // Kuas Sebar (Scatter Spray Brush) - Spawns 4 to 6 randomized instances around brush center
            const sprayCount = 5;
            const sprayRad = Math.max(brushSettings.radius * 0.42, 3.0);
            const isFoliage =
              activePaletteItem.category === 'foliage' ||
              activePaletteItem.id.includes('grass') ||
              activePaletteItem.id.includes('flower') ||
              activePaletteItem.id.includes('tree');

            for (let k = 0; k < sprayCount; k++) {
              const angle = Math.random() * Math.PI * 2;
              const dist = Math.sqrt(Math.random()) * sprayRad;
              const sx = pt.x + Math.cos(angle) * dist;
              const sz = pt.z + Math.sin(angle) * dist;
              const sy = getSampledHeightAt(sx, sz, heights, terrainConfig.size, terrainConfig.resolution);

              if (sy < terrainConfig.waterLevel + 0.15) continue;

              // Cegah penyebaran objek kuas sebar menimpa jalan setapak
              if (
                activePaletteItem.category !== 'path' &&
                isPointOnRoad(
                  sx,
                  sz,
                  colors,
                  heights,
                  terrainConfig.size,
                  terrainConfig.resolution,
                  terrainConfig,
                  placedObjects,
                  propsRef.current.trailPathPoints,
                  isFoliage ? 1.6 : 3.2
                )
              ) {
                continue;
              }

              const rotY = Math.random() * Math.PI * 2;
              const tiltX = isFoliage ? (Math.random() * 2 - 1) * 0.08 : 0;
              const tiltZ = isFoliage ? (Math.random() * 2 - 1) * 0.08 : 0;
              const scaleVar = isFoliage ? 0.76 + Math.random() * 0.46 : 1.0;
              const scaleY = isFoliage ? scaleVar * (0.88 + Math.random() * 0.26) : 1.0;
              const baseScale = activePaletteItem.defaultScale || [1, 1, 1];

              onObjectPlaced({
                id: 'obj_' + Date.now() + '_' + k + '_' + Math.floor(Math.random() * 1000),
                name: activePaletteItem.name,
                type: activePaletteItem.id,
                category: activePaletteItem.category,
                position: [sx, sy, sz],
                rotation: [tiltX, rotY, tiltZ],
                scale: [
                  baseScale[0] * scaleVar * pScale,
                  baseScale[1] * scaleY * pScale,
                  baseScale[2] * scaleVar * pScale,
                ],
                customModelKey: activePaletteItem.isCustom ? activePaletteItem.id : undefined,
              });

              // Intertwine wildflowers with companion meadow grass tufts
              if (activePaletteItem.id === 'flower_patch' && Math.random() < 0.75) {
                const gx = sx + (Math.random() * 2 - 1) * 0.65;
                const gz = sz + (Math.random() * 2 - 1) * 0.65;
                const gy = getSampledHeightAt(gx, gz, heights, terrainConfig.size, terrainConfig.resolution);
                if (gy >= terrainConfig.waterLevel + 0.15) {
                  // Cegah rumput pendamping menimpa jalan
                  if (
                    isPointOnRoad(
                      gx,
                      gz,
                      colors,
                      heights,
                      terrainConfig.size,
                      terrainConfig.resolution,
                      terrainConfig,
                      placedObjects,
                      propsRef.current.trailPathPoints,
                      1.4
                    )
                  ) {
                    continue;
                  }

                  onObjectPlaced({
                    id: 'obj_' + Date.now() + '_companion_' + k + '_' + Math.floor(Math.random() * 1000),
                    name: 'Rumput Padang',
                    type: 'meadow_grass',
                    category: 'foliage',
                    position: [gx, gy, gz],
                    rotation: [(Math.random() * 2 - 1) * 0.08, Math.random() * Math.PI * 2, (Math.random() * 2 - 1) * 0.08],
                    scale: [
                      scaleVar * 0.9 * pScale,
                      scaleY * 0.9 * pScale,
                      scaleVar * 0.9 * pScale,
                    ],
                  });
                }
              }
            }
          } else {
            // Single object placement
            // Cegah objek menimpa jalan
            const isPathItem = activePaletteItem.category === 'path';
            const isFoliage =
              activePaletteItem.category === 'foliage' ||
              activePaletteItem.id.includes('tree') ||
              activePaletteItem.id.includes('grass') ||
              activePaletteItem.id.includes('flower');

            if (
              !isPathItem &&
              isPointOnRoad(
                pt.x,
                pt.z,
                colors,
                heights,
                terrainConfig.size,
                terrainConfig.resolution,
                terrainConfig,
                placedObjects,
                propsRef.current.trailPathPoints,
                isFoliage ? 1.5 : 3.6
              )
            ) {
              if (propsRef.current.onRoadCollision) {
                propsRef.current.onRoadCollision();
              }
              return;
            }

            const rotY = isFoliage ? Math.random() * Math.PI * 2 : (Math.random() * Math.PI) / 4;
            const tiltX = isFoliage ? (Math.random() * 2 - 1) * 0.08 : 0;
            const tiltZ = isFoliage ? (Math.random() * 2 - 1) * 0.08 : 0;
            const scaleVar = isFoliage ? 0.82 + Math.random() * 0.38 : 1.0;
            const scaleY = isFoliage ? scaleVar * (0.88 + Math.random() * 0.26) : 1.0;
            const baseScale = activePaletteItem.defaultScale || [1, 1, 1];

            const newObj: PlacedObject = {
              id: 'obj_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
              name: activePaletteItem.name,
              type: activePaletteItem.id,
              category: activePaletteItem.category,
              position: [pt.x, pt.y, pt.z],
              rotation: [tiltX, rotY, tiltZ],
              scale: [
                baseScale[0] * scaleVar * pScale,
                baseScale[1] * scaleY * pScale,
                baseScale[2] * scaleVar * pScale,
              ],
              customModelKey: activePaletteItem.isCustom ? activePaletteItem.id : undefined,
            };
            onObjectPlaced(newObj);

            // "dan bila tambah objek bunga perolehan tumpang tindih dengan rumput acak":
            // When placing flower_patch, also spawn 1-2 companion meadow grass clumps tightly surrounding the flower
            // so they organically overlap and intertwine across the terrain!
            if (activePaletteItem.id === 'flower_patch') {
              const companionCount = 1 + Math.floor(Math.random() * 2);
              for (let c = 0; c < companionCount; c++) {
                const offsetAngle = Math.random() * Math.PI * 2;
                const offsetDist = 0.4 + Math.random() * 0.65;
                const cx = pt.x + Math.cos(offsetAngle) * offsetDist;
                const cz = pt.z + Math.sin(offsetAngle) * offsetDist;
                const cy = getSampledHeightAt(cx, cz, heights, terrainConfig.size, terrainConfig.resolution);
                if (cy >= terrainConfig.waterLevel + 0.1) {
                  const grassScale = (0.78 + Math.random() * 0.32) * scaleVar * pScale;
                  onObjectPlaced({
                    id: 'obj_' + Date.now() + '_cgrass_' + c + '_' + Math.floor(Math.random() * 1000),
                    name: 'Rumput Padang',
                    type: 'meadow_grass',
                    category: 'foliage',
                    position: [cx, cy, cz],
                    rotation: [(Math.random() * 2 - 1) * 0.08, Math.random() * Math.PI * 2, (Math.random() * 2 - 1) * 0.08],
                    scale: [grassScale, grassScale * (0.9 + Math.random() * 0.2), grassScale],
                  });
                }
              }
            }
          }
        }
      } else if (brushSettings.mode === 'select') {
        const hitId = getObjectIntersection(e.clientX, e.clientY);
        if (hitId) {
          const selected = placedObjects.find((o) => o.id === hitId) || null;
          onObjectSelected(selected);
        } else {
          onObjectSelected(null);
        }
      }
    }
  };

  const isBoundToCurrent =
    nearbyBuilding &&
    (activePinId === 'A' ? pinABoundId === nearbyBuilding.id : pinBBoundId === nearbyBuilding.id);

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden select-none pointer-events-none">
      {/* 3D WebGL Canvas Layer */}
      <div
        ref={mountRef}
        role="region"
        aria-label="3D Terrain and World Viewport"
        className="absolute inset-0 w-full h-full overflow-hidden select-none cursor-grab active:cursor-grabbing pointer-events-auto"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />

      {/* Floating Smart Pin Navigation HUD */}
      {!isPinNavVisible ? (
        <div className="absolute left-3 sm:left-4 top-16 sm:top-20 z-40 pointer-events-auto">
          <button
            onClick={() => setIsPinNavVisible(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-slate-950/85 backdrop-blur-md border border-slate-700/80 text-emerald-400 hover:text-emerald-300 text-xs font-semibold shadow-2xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="Tampilkan kembali Pin Navigasi 3D"
          >
            <Route className="w-4 h-4 text-emerald-400" />
            <span>Tampilkan Pin Jalur</span>
          </button>
        </div>
      ) : isMinimized ? (
        <div className="absolute left-3 sm:left-4 top-16 sm:top-20 z-40 pointer-events-auto">
          <div className="flex items-center gap-2 bg-slate-950/90 backdrop-blur-md border border-slate-700/80 rounded-2xl px-3.5 py-2 shadow-2xl text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-slate-200">Pin A ⇄ B</span>
            </div>
            <span className="text-slate-400 font-mono">~{routeDetails.lengthMeters}m</span>
            {routeDetails.isDetoured ? (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/40">
                Memutar ({routeDetails.avoidedCount})
              </span>
            ) : (
              <span className="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded border border-sky-500/40">
                Lurus
              </span>
            )}
            <button
              onClick={() => setIsMinimized(false)}
              className="text-emerald-400 hover:text-emerald-300 ml-1 font-medium underline cursor-pointer"
            >
              Buka
            </button>
          </div>
        </div>
      ) : (
        <div className="absolute left-3 sm:left-4 top-16 sm:top-20 z-40 w-[calc(100vw-24px)] max-w-[340px] sm:max-w-[365px] pointer-events-auto">
          <div className="bg-slate-950/90 backdrop-blur-xl border border-slate-800/90 rounded-2xl p-3 sm:p-3.5 shadow-2xl shadow-slate-950/80 flex flex-col gap-2.5 text-slate-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Route className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white tracking-wide">Navigasi Cerdas Pin A ⇄ B</h3>
                  <p className="text-[10px] text-slate-400 leading-tight">Penghindaran Rintangan & Bind Pintu</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsPinNavVisible(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors cursor-pointer"
                  title="Sembunyikan Pin 3D"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setIsMinimized(true)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors cursor-pointer"
                  title="Kecilkan panel"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Pin Selector Tabs */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleSelectPin('A')}
                className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                  activePinId === 'A'
                    ? 'bg-amber-500/15 border-amber-500/70 shadow-sm'
                    : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />
                    <span className="text-xs font-bold text-white">Pin A (Mulai)</span>
                  </div>
                  {pinABoundId && (
                    <span className="text-[9px] bg-emerald-500/25 text-emerald-300 px-1 py-0.2 rounded border border-emerald-500/40">
                      Pintu
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  [{pinAPos[0].toFixed(0)}, {pinAPos[2].toFixed(0)}]
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectPin('B')}
                className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                  activePinId === 'B'
                    ? 'bg-cyan-500/15 border-cyan-500/70 shadow-sm'
                    : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
                    <span className="text-xs font-bold text-white">Pin B (Tujuan)</span>
                  </div>
                  {pinBBoundId && (
                    <span className="text-[9px] bg-emerald-500/25 text-emerald-300 px-1 py-0.2 rounded border border-emerald-500/40">
                      Pintu
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  [{pinBPos[0].toFixed(0)}, {pinBPos[2].toFixed(0)}]
                </div>
              </button>
            </div>

            {/* Quick Switch Pin Button */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSwapPins}
                className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 hover:underline cursor-pointer transition-colors"
              >
                <span>⇄ Ganti Pin Aktif ({activePinId === 'A' ? 'Pilih B' : 'Pilih A'})</span>
              </button>
            </div>

            {/* Interactive Door Binding Section (Active when near building) */}
            {nearbyBuilding && (
              <div
                className={`p-2.5 rounded-xl border transition-all ${
                  isBoundToCurrent
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{isBoundToCurrent ? '🚪' : '📍'}</span>
                    <span className="text-xs font-bold text-white truncate max-w-[170px]">
                      {nearbyBuilding.name}
                    </span>
                  </div>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-900/70 text-slate-300">
                    Pin {activePinId}
                  </span>
                </div>

                <p className="text-[10.5px] text-slate-300 leading-tight mb-2">
                  {isBoundToCurrent
                    ? `Pin ${activePinId} terkunci di ambang pintu depan. Rute akan otomatis memutar bila datang dari sisi belakang.`
                    : `Pin ${activePinId} dekat bangunan! Sambungkan ke pintu depan agar rute otomatis menuju pintu.`}
                </p>

                {isBoundToCurrent ? (
                  <button
                    type="button"
                    onClick={handleUnbindDoorway}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 border border-slate-700 hover:border-rose-700/60 text-rose-300 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-95"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Lepas Kaitan Pintu</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleBindDoorway}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 active:scale-95 text-slate-950 text-xs font-bold transition-all cursor-pointer shadow-lg shadow-amber-500/25"
                  >
                    <Link2 className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                    <span>🚪 Sambung ke Pintu Depan</span>
                  </button>
                )}
              </div>
            )}

            {/* Smart Detour Status Box */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Panjang Rute</span>
                <span className="font-mono text-slate-200 font-bold">~{routeDetails.lengthMeters} m</span>
              </div>
              {routeDetails.isDetoured ? (
                <div className="flex items-start gap-1.5 text-emerald-400 text-[11px] leading-tight mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-400" />
                  <span>
                    <strong>Penghindaran Otomatis Aktif:</strong> Jalur melengkung mengitari{' '}
                    {routeDetails.avoidedCount} rintangan secara mulus.
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-1.5 text-sky-400 text-[11px] leading-tight mt-0.5">
                  <Check className="w-3.5 h-3.5 shrink-0 mt-0.5 text-sky-400" />
                  <span>
                    <strong>Jalur Bersih:</strong> Lurus bebas hambatan tanpa menabrak bangunan.
                  </span>
                </div>
              )}
            </div>

            {/* Camera Tracking & Touch Controls */}
            <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <button
                type="button"
                onClick={toggleCameraFollow}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  cameraFollowActive
                    ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
                }`}
                title="Kamera otomatis mengikuti posisi Pin aktif saat digeser"
              >
                <Target className="w-3.5 h-3.5" />
                <span>Kamera Ikuti Pin: {cameraFollowActive ? 'ON' : 'OFF'}</span>
              </button>

              <button
                type="button"
                onClick={() => focusCameraOnPin(activePinId, true)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                title="Pusatkan dan dekatkan kamera ke Pin aktif"
              >
                <span>Dekatkan</span>
              </button>
            </div>

            <div className="text-[10px] text-slate-400 leading-snug px-0.5">
              💡 <em>Sentuh & seret Pin A atau B langsung di layar 3D tanpa tombol analog. Kamera otomatis mengikuti & mendekat jika area menjauh.</em>
            </div>

            {/* Action Buttons Row */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
              <button
                type="button"
                onClick={handleResetPins}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                title="Kembalikan Pin A dan B ke posisi default di kedua ujung pulau"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Pin</span>
              </button>

              <button
                type="button"
                onClick={handleBakeRoute}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-lg shadow-emerald-950/40 text-xs font-bold transition-all active:scale-95 cursor-pointer"
                title="Cetak rute ini menjadi jalan setapak paving permanen dan pasang jembatan kayu jika melintasi air"
              >
                <Footprints className="w-3.5 h-3.5" />
                <span>Terapkan Jalan</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
