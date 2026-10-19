export type BiomeType =
  | 'archipelago'
  | 'cyberpunk'
  | 'alpine'
  | 'canyon'
  | 'oasis'
  | 'lowpoly';

export type PathMaterial =
  | 'stone'
  | 'asphalt'
  | 'gravel'
  | 'dirt'
  | 'blend_stone_gravel'
  | 'blend_dirt_gravel'
  | 'blend_natural'
  | 'custom_blend'
  | 'cyber';

export interface TerrainConfig {
  seed: number;
  size: number;          // e.g. 140 world units (expanded)
  resolution: number;    // e.g. 48-128 vertices
  heightScale: number;   // max vertical displacement
  roughness: number;     // noise frequency / detail
  waterLevel: number;    // water plane Y position
  islandFalloff: boolean;// radial edge falloff mask
  terraceSteps: number;  // 0 = continuous, 4-12 = stylized stepped plateaus
  biome: BiomeType;
  smoothShading: boolean;// true = smooth organic shading (no triangles), false = low-poly faceted
  pathStyle: PathMaterial;
  pathBlendRatios?: {
    stone: number;
    gravel: number;
    dirt: number;
  };
  islandCoverage?: number; // 0.6 = small atoll, 1.4 = wide island, 2.0 = sprawling continent
  oceanScale?: number;     // ocean framing scale relative to island
  trailWidth?: number;    // trail width radius (e.g. 1.0 to 5.5, default 2.2)
  trailEdgeDecoration?: boolean; // Dekorasi tepian: batu pembatas paving + rumput bunga
  autoInstallStairsAndBridges?: boolean; // Smart path builder: auto-place stairs on steep slopes & bridges over water
}

export type ObjectCategory = 'building' | 'foliage' | 'prop' | 'cyber' | 'fantasy' | 'custom' | 'path';

export interface PlacedObject {
  id: string;
  name: string;
  type: string;
  category: ObjectCategory;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  customModelKey?: string;
  tint?: string;
}

export interface PaletteItem {
  id: string;
  name: string;
  category: ObjectCategory;
  icon: string;
  description: string;
  defaultScale: [number, number, number];
  badge?: string;
  isCustom?: boolean;
}

export type BrushMode =
  | 'select'
  | 'place'
  | 'scatter-brush'
  | 'sculpt-raise'
  | 'sculpt-lower'
  | 'sculpt-flatten'
  | 'sculpt-smooth'
  | 'sculpt-path';

export interface BrushSettings {
  mode: BrushMode;
  radius: number;
  intensity: number;
  flattenHeight: number;
  pathStyle: PathMaterial;
  pathBlendRatios?: {
    stone: number;
    gravel: number;
    dirt: number;
  };
  placementScale?: number; // Scaling factor for placing objects (e.g. 0.5x .. 3.0x)
  autoInstallStairsAndBridges?: boolean; // Smart path builder: auto-place wooden stairs on steep slopes & bridges over water
  trailWidth?: number; // Trail width radius in world units (e.g. 1.0 to 5.5, default 2.2)
  trailEdgeDecoration?: boolean; // Dekorasi tepian: batu pembatas paving + rumput bunga
}

export type TimeOfDay = 'day' | 'golden' | 'cyberpunk' | 'sunset' | 'night' | 'dawn';

export interface LampSettings {
  mode: 'auto' | 'always-on' | 'always-off';
  intensity: number; // 0.2 to 2.5
  radius: number;    // 0.5 to 2.5
  pulsing: boolean;  // subtle dynamic breathing
  ambientBrightness?: number; // 0.6 to 2.5 (kecerahan bayangan objek / shadow fill)
}

export interface TimeSettings {
  timeHour: number;  // 0.0 to 24.0 (e.g. 17.5 = 17:30)
  isPlaying: boolean;
  speed: number;     // 1, 2, 5, 10, 30
}

export type GraphicsPreset = 'LOW' | 'MEDIUM' | 'HIGH' | 'CUSTOM';

export type PerformanceMode = GraphicsPreset | 'mobile' | 'balanced' | 'ultra';

export interface CustomAssetRecord {
  id: string;
  name: string;
  format: 'glb' | 'gltf' | 'obj';
  fileSize: number;
  dataBuffer: ArrayBuffer;
  previewUrl?: string;
  vertexCount: number;
}

export interface NavigationPin {
  id: 'A' | 'B' | 'C';
  position: [number, number, number];
  boundBuildingId?: string | null;
  isSnappedToDoor?: boolean;
}

export interface AStarNavigationResult {
  path: [number, number, number][];
  nodes: [number, number, number][];
  exploredNodes?: [number, number, number][];
  totalCost: number;
  lengthMeters: number;
  hasSteepSlope: boolean;
  crossesWater: boolean;
  isDetoured: boolean;
  avoidedCount: number;
}

export interface NavigationRouteState {
  enabled: boolean;
  activePinId: 'A' | 'B' | 'C';
  pinA: NavigationPin;
  pinB: NavigationPin;
  pinC?: NavigationPin | null;
  hasWaypointC: boolean;
  waypoints: [number, number, number][];
  aStarNodes: [number, number, number][];
  showAStarNodes: boolean;
  isDetoured: boolean;
  nearbyBuilding: PlacedObject | null;
  cameraFollowActive: boolean;
  statusText?: string;
}
