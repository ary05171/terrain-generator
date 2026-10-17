import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BiomeType,
  BrushSettings,
  PaletteItem,
  PlacedObject,
  TerrainConfig,
  TimeOfDay,
  LampSettings,
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
  };

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

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // only left click
    isMouseDownRef.current = true;
    didDragRef.current = false;
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };

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

  return (
    <div
      ref={mountRef}
      role="region"
      aria-label="3D Terrain and World Viewport"
      className="absolute inset-0 w-full h-full overflow-hidden select-none cursor-grab active:cursor-grabbing"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
};
