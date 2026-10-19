import React, { useState } from 'react';
import {
  Globe,
  Mountain,
  PackagePlus,
  Box,
  Download,
  Dices,
  ChevronDown,
  ChevronUp,
  Trash2,
  Copy,
  RotateCw,
  Sparkles,
  Maximize2,
  Minimize2,
  Upload,
  Layers,
  Check,
  Trees,
  TreePine,
  Sprout,
  Flower2,
  Wheat,
  Shuffle,
  Building2,
  Building,
  Wind,
  Flame,
  Home,
  Gem,
  Compass,
  Landmark,
  Zap,
  Lightbulb,
  Route,
  Footprints,
  MapPin,
  SlidersHorizontal,
  Palette,
  Sliders,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  Clock,
  Play,
  Pause,
} from 'lucide-react';
import {
  BiomeType,
  BrushMode,
  BrushSettings,
  CustomAssetRecord,
  GraphicsPreset,
  ObjectCategory,
  PaletteItem,
  PerformanceMode,
  PlacedObject,
  TerrainConfig,
  LampSettings,
  TimeSettings,
} from '../types';
import { STANDARD_PALETTE } from '../core/modelFactory';
import { PATH_MATERIAL_PRESETS } from '../core/terrainGen';
import { formatTimeHour } from '../core/timeLighting';

interface ControlDockProps {
  terrainConfig: TerrainConfig;
  onUpdateTerrainConfig: (updates: Partial<TerrainConfig>) => void;
  onRegenerateTerrain: () => void;
  brushSettings: BrushSettings;
  onUpdateBrushSettings: (updates: Partial<BrushSettings>) => void;
  activePaletteItem: PaletteItem | null;
  onSelectPaletteItem: (item: PaletteItem | null) => void;
  customAssets: CustomAssetRecord[];
  onUploadFile: (file: File) => Promise<void>;
  onAutoPopulateBiome: (density: number) => void;
  onScatterSpecificObject?: (item: PaletteItem, count: number, replaceExisting?: boolean) => void;
  onScatterBuildings?: (count: number, replaceExisting?: boolean) => void;
  onScatterVegetation?: (count: number, replaceExisting?: boolean) => void;
  onScatterMeadowGrass?: (count: number, replaceExisting?: boolean) => void;
  onScatterMeadowAndFlowers?: (count: number, replaceExisting?: boolean) => void;
  onBuildTrail?: () => void;
  onClearAllObjects: () => void;
  placedObjects: PlacedObject[];
  selectedObject: PlacedObject | null;
  onSelectObject: (obj: PlacedObject | null) => void;
  onUpdateSelectedObject: (updates: Partial<PlacedObject>) => void;
  onDuplicateSelectedObject: () => void;
  onDeleteSelectedObject: () => void;
  onExportOBJ: () => void;
  onExportGLB: () => void;
  onExportThreeJSON: () => void;
  onExportHeightmap: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  graphicsPreset?: GraphicsPreset;
  onUpdateGraphicsPreset?: (preset: GraphicsPreset) => void;
  onOpenGraphicsSettings?: () => void;
  performanceMode?: PerformanceMode;
  onUpdatePerformanceMode?: (mode: PerformanceMode) => void;
  timeSettings?: TimeSettings;
  onTimeChange?: (hour: number) => void;
  onTogglePlay?: () => void;
  onSpeedChange?: (speed: number) => void;
  lampSettings?: LampSettings;
  onLampSettingsChange?: (updates: Partial<LampSettings>) => void;
  activeTab?: TabType;
  onTabChange?: (tab: TabType) => void;
  onTidyUpScene?: () => void;
  onResetTrailColors?: () => void;
  isRoadBuilderActive?: boolean;
  onToggleRoadBuilder?: () => void;
}

type TabType = 'terrain' | 'sculpt' | 'place' | 'lighting' | 'assets' | 'export';

// Map icon strings to Lucide components
const ICON_MAP: Record<string, React.ElementType> = {
  Trees,
  TreePine,
  Sprout,
  Flower2,
  Wheat,
  Building2,
  Building,
  Wind,
  Flame,
  Home,
  Gem,
  Compass,
  Landmark,
  Zap,
  Lightbulb,
  Route,
  Footprints,
  MapPin,
};

export const ControlDock: React.FC<ControlDockProps> = ({
  terrainConfig,
  onUpdateTerrainConfig,
  onRegenerateTerrain,
  brushSettings,
  onUpdateBrushSettings,
  activePaletteItem,
  onSelectPaletteItem,
  customAssets,
  onUploadFile,
  onAutoPopulateBiome,
  onScatterSpecificObject,
  onScatterBuildings,
  onScatterVegetation,
  onScatterMeadowGrass,
  onScatterMeadowAndFlowers,
  onBuildTrail,
  onClearAllObjects,
  placedObjects,
  selectedObject,
  onSelectObject,
  onUpdateSelectedObject,
  onDuplicateSelectedObject,
  onDeleteSelectedObject,
  onExportOBJ,
  onExportGLB,
  onExportThreeJSON,
  onExportHeightmap,
  isCollapsed,
  onToggleCollapse,
  graphicsPreset = 'MEDIUM',
  onUpdateGraphicsPreset,
  onOpenGraphicsSettings,
  performanceMode,
  onUpdatePerformanceMode,
  timeSettings,
  onTimeChange,
  onTogglePlay,
  onSpeedChange,
  lampSettings,
  onLampSettingsChange,
  activeTab: propsActiveTab,
  onTabChange,
  onTidyUpScene,
  onResetTrailColors,
  isRoadBuilderActive = false,
  onToggleRoadBuilder,
}) => {
  const [internalTab, setInternalTab] = useState<TabType>('terrain');
  const activeTab = propsActiveTab ?? internalTab;
  const setActiveTab = (tab: TabType) => {
    setInternalTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  const [paletteCategory, setPaletteCategory] = useState<string>('all');
  const [autoScatterCount, setAutoScatterCount] = useState<number>(30);
  const [replaceMode, setReplaceMode] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const timeHour = timeSettings?.timeHour ?? 17.5;
  const { timeString, phaseLabel } = formatTimeHour(timeHour);

  const biomes: { id: BiomeType; name: string; color: string; desc: string }[] = [
    { id: 'archipelago', name: 'Island Bay', color: '#0ea5e9', desc: 'Tropical atolls & sandy beaches' },
    { id: 'cyberpunk', name: 'Cyber City', color: '#06b6d4', desc: 'Dark neon grid plateaus' },
    { id: 'alpine', name: 'High Alpine', color: '#10b981', desc: 'Snow peaks & emerald valleys' },
    { id: 'canyon', name: 'Red Canyon', color: '#f97316', desc: 'Terracotta stepped mesas' },
    { id: 'oasis', name: 'Crystal Oasis', color: '#a855f7', desc: 'Mystic pearlescent mineral basins' },
    { id: 'lowpoly', name: 'Poly Meadow', color: '#84cc16', desc: 'Stylized colorful low-poly terrain' },
  ];

  const handleRandomSeed = () => {
    const nextSeed = Math.floor(Math.random() * 900000) + 100000;
    onUpdateTerrainConfig({ seed: nextSeed });
  };

  const handleFileUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      await onUploadFile(file);
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to load model file');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  // Combine standard palette + custom uploaded models
  const allPaletteItems: PaletteItem[] = [
    ...STANDARD_PALETTE,
    ...customAssets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      category: 'custom' as ObjectCategory,
      icon: 'Box',
      description: `Custom ${asset.format.toUpperCase()} model (${(asset.fileSize / 1024).toFixed(1)} KB)`,
      defaultScale: [1, 1, 1] as [number, number, number],
      badge: 'Custom',
      isCustom: true,
    })),
  ];

  const filteredPaletteItems =
    paletteCategory === 'all'
      ? allPaletteItems
      : allPaletteItems.filter((i) => i.category === paletteCategory);

  return (
    <section
      aria-label="Terrain and Object Controls"
      className={`fixed bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 w-full max-w-4xl px-2 sm:px-4 z-30 transition-transform duration-200 select-none ${
        isCollapsed ? 'translate-y-[calc(100%-48px)]' : 'translate-y-0'
      }`}
    >
      {/* Collapse / Expand Header Bar */}
      <div className="bg-slate-950/90 backdrop-blur-xl border-t border-x border-slate-800/80 rounded-t-2xl px-2.5 sm:px-3.5 pt-1.5 pb-1 shadow-2xl">
        {/* Subtle Mobile Drag Pill Indicator */}
        <div 
          onClick={onToggleCollapse} 
          className="w-10 h-1 bg-slate-700/80 hover:bg-slate-500 rounded-full mx-auto mb-1.5 sm:hidden cursor-pointer" 
          title={isCollapsed ? 'Buka Menu Dock' : 'Tutup Menu Dock'}
        />

        <div className="flex justify-between items-center gap-1">
          {/* Navigation Tabs with 44px touch targets */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5 touch-pan-x">
            <button
              type="button"
              onClick={() => {
                setActiveTab('terrain');
                if (brushSettings.mode.startsWith('sculpt') || brushSettings.mode === 'place') {
                  onUpdateBrushSettings({ mode: 'select' });
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all active:scale-95 ${
                activeTab === 'terrain'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/70 border border-transparent'
              }`}
            >
              <Globe className="w-4 h-4" />
              <span>Terrain</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('sculpt');
                if (!brushSettings.mode.startsWith('sculpt')) {
                  onUpdateBrushSettings({ mode: 'sculpt-raise' });
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all active:scale-95 ${
                activeTab === 'sculpt'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/70 border border-transparent'
              }`}
            >
              <Mountain className="w-4 h-4" />
              <span>Sculpt</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('place');
                if (brushSettings.mode !== 'place') {
                  onUpdateBrushSettings({ mode: 'place' });
                  if (!activePaletteItem && STANDARD_PALETTE.length > 0) {
                    onSelectPaletteItem(STANDARD_PALETTE[0]);
                  }
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all active:scale-95 ${
                activeTab === 'place'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/70 border border-transparent'
              }`}
            >
              <PackagePlus className="w-4 h-4" />
              <span>Place</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('lighting');
                if (brushSettings.mode.startsWith('sculpt') || brushSettings.mode === 'place') {
                  onUpdateBrushSettings({ mode: 'select' });
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all active:scale-95 ${
                activeTab === 'lighting'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/70 border border-transparent'
              }`}
            >
              <Sun className="w-4 h-4 text-amber-400" />
              <span>Cahaya</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('assets')}
              className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all active:scale-95 ${
                activeTab === 'assets'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/70 border border-transparent'
              }`}
            >
              <Box className="w-4 h-4" />
              <span>GLB</span>
              {customAssets.length > 0 && (
                <span className="text-[10px] bg-emerald-700/60 text-emerald-200 px-1.5 py-0.2 rounded-full font-bold">
                  {customAssets.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('export')}
              className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all active:scale-95 ${
                activeTab === 'export'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/70 border border-transparent'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
          </div>

          {/* Toggle Collapse Button with 44px min touch target */}
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Expand Dock Controls' : 'Collapse Dock Controls'}
            className="flex items-center justify-center gap-1 text-slate-300 hover:text-white text-xs px-2.5 py-2 min-h-[44px] min-w-[44px] rounded-xl hover:bg-slate-900/90 transition-all ml-1 shrink-0 active:scale-95"
          >
            {isCollapsed ? (
              <>
                <ChevronUp className="w-5 h-5 text-emerald-400" />
                <span className="hidden sm:inline font-medium">Buka</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-5 h-5 text-slate-400" />
                <span className="hidden sm:inline font-medium">Tutup</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Dock Content Body */}
      <div className="bg-slate-950/90 backdrop-blur-xl border-b border-x border-slate-800/80 rounded-b-2xl p-3 sm:p-4 shadow-2xl max-h-[44vh] sm:max-h-[38vh] overflow-y-auto overscroll-contain touch-pan-y">
        {/* Selected Object Floating Inspector Bar */}
        {selectedObject && (
          <div className="mb-3 p-2.5 rounded-xl bg-slate-800/90 border border-amber-500/50 flex flex-wrap items-center justify-between gap-2 shadow-inner">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="text-xs font-bold text-amber-200">{selectedObject.name}</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400">
                {selectedObject.category}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const currentRot = selectedObject.rotation[1];
                  onUpdateSelectedObject({
                    rotation: [selectedObject.rotation[0], currentRot + Math.PI / 4, selectedObject.rotation[2]],
                  });
                }}
                className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium"
                title="Rotate 45°"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Rot +45°</span>
              </button>

              {/* Direct Scale Slider & Presets for Selected Object */}
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700">
                <span className="text-[10px] text-slate-400 font-semibold">Ukuran:</span>
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.1"
                  value={selectedObject.scale[0]}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    onUpdateSelectedObject({ scale: [val, val, val] });
                  }}
                  className="w-16 accent-emerald-500 cursor-pointer"
                  title="Atur ukuran objek terpilih"
                />
                <span className="text-[10px] font-mono font-bold text-emerald-400 w-7 text-right">
                  {selectedObject.scale[0].toFixed(1)}x
                </span>
                <div className="hidden sm:flex items-center gap-0.5">
                  {[0.5, 1.0, 1.5, 2.0].map((sVal) => (
                    <button
                      key={sVal}
                      type="button"
                      onClick={() => onUpdateSelectedObject({ scale: [sVal, sVal, sVal] })}
                      className={`px-1 py-0.5 rounded text-[9px] font-mono ${
                        Math.abs(selectedObject.scale[0] - sVal) < 0.08
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:text-white'
                      }`}
                    >
                      {sVal}x
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const s = selectedObject.scale;
                  onUpdateSelectedObject({ scale: [s[0] * 1.15, s[1] * 1.15, s[2] * 1.15] });
                }}
                className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs"
                title="Scale Up (+15%)"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const s = selectedObject.scale;
                  onUpdateSelectedObject({ scale: [s[0] * 0.85, s[1] * 0.85, s[2] * 0.85] });
                }}
                className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs"
                title="Scale Down (-15%)"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={onDuplicateSelectedObject}
                className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium"
                title="Duplicate Object"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Clone</span>
              </button>

              <button
                type="button"
                onClick={onDeleteSelectedObject}
                aria-label="Delete selected object"
                className="p-1 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500 hover:text-white transition-colors"
                title="Delete Object"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => onSelectObject(null)}
                className="text-[11px] text-slate-400 hover:text-white px-1.5"
              >
                Deselect
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: Biomes & Terrain */}
        {activeTab === 'terrain' && (
          <div className="space-y-4">
            {/* Biomes Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Biome Preset
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                {biomes.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      onUpdateTerrainConfig({ biome: b.id });
                    }}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      terrainConfig.biome === b.id
                        ? 'bg-slate-800 border-emerald-400 ring-2 ring-emerald-500/30'
                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                      <span className="text-xs font-bold text-slate-200 truncate">{b.name}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 line-clamp-1">{b.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Graphics Settings & Mobile Tuning Selector */}
            {(() => {
              const currentP: GraphicsPreset = graphicsPreset || (performanceMode === 'ultra' ? 'HIGH' : performanceMode === 'mobile' ? 'LOW' : 'MEDIUM');
              return (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700/80 gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                      <Sliders className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-200">Pengatur Grafis (Graphics Settings)</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-700 text-emerald-400">
                          {currentP}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {currentP === 'LOW'
                          ? '⚡ LOW: Matikan shadow, pixel ratio 1.0, fog off, hemat baterai maksimal'
                          : currentP === 'MEDIUM'
                          ? '⚖️ MEDIUM (Default): Shadow 512×512, pixel ratio 1.25, kabut halus, 40-60 FPS stabil'
                          : '✨ HIGH: Shadow 1024×1024, pixel ratio 1.5, kabut penuh + ombak air sinusoide dinamis'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                    {(['LOW', 'MEDIUM', 'HIGH'] as GraphicsPreset[]).map((p) => {
                      const isSel = currentP === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => {
                            if (onUpdateGraphicsPreset) {
                              onUpdateGraphicsPreset(p);
                            } else if (onUpdatePerformanceMode) {
                              onUpdatePerformanceMode(p === 'LOW' ? 'mobile' : p === 'MEDIUM' ? 'balanced' : 'ultra');
                            }
                            const res = p === 'LOW' ? 28 : p === 'MEDIUM' ? 40 : 52;
                            onUpdateTerrainConfig({ resolution: res });
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            isSel
                              ? p === 'LOW'
                                ? 'bg-emerald-600 text-white shadow-md'
                                : p === 'MEDIUM'
                                ? 'bg-amber-600 text-white shadow-md'
                                : 'bg-purple-600 text-white shadow-md'
                              : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-750'
                          }`}
                        >
                          {p === 'LOW' ? '⚡ LOW' : p === 'MEDIUM' ? '⚖️ MEDIUM' : '✨ HIGH'}
                        </button>
                      );
                    })}

                    {onOpenGraphicsSettings && (
                      <button
                        type="button"
                        onClick={onOpenGraphicsSettings}
                        title="Buka Menu Pengatur Grafis Lengkap"
                        className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors ml-1"
                      >
                        <Sliders className="w-4 h-4 text-emerald-400" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Terrain Procedural Parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 bg-slate-800/40 p-3 rounded-xl border border-slate-700/60">
              {/* Seed Control */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">World Seed</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    value={terrainConfig.seed}
                    onChange={(e) => onUpdateTerrainConfig({ seed: parseInt(e.target.value) || 1 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleRandomSeed}
                    title="Generate Random Seed"
                    className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                  >
                    <Dices className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Land Coverage / Luas Pulau */}
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                  <span>Luas Daratan</span>
                  <span className="text-emerald-400 font-mono font-bold">
                    {Math.round((terrainConfig.islandCoverage ?? 1.45) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="2.2"
                  step="0.1"
                  value={terrainConfig.islandCoverage ?? 1.45}
                  onChange={(e) => onUpdateTerrainConfig({ islandCoverage: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-500 cursor-pointer"
                  title="Luas jangkauan daratan pulau"
                />
              </div>

              {/* World Size (Ukuran Dunia) */}
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                  <span>Ukuran Dunia</span>
                  <span className="text-slate-400 font-mono">{terrainConfig.size}m</span>
                </div>
                <input
                  type="range"
                  min="80"
                  max="180"
                  step="10"
                  value={terrainConfig.size}
                  onChange={(e) => onUpdateTerrainConfig({ size: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              {/* Elevation / Height Scale */}
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                  <span>Height Scale</span>
                  <span className="text-slate-400 font-mono">{terrainConfig.heightScale}m</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="60"
                  step="2"
                  value={terrainConfig.heightScale}
                  onChange={(e) => onUpdateTerrainConfig({ heightScale: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              {/* Roughness / Noise Frequency */}
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                  <span>Roughness</span>
                  <span className="text-slate-400 font-mono">{terrainConfig.roughness.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.1"
                  value={terrainConfig.roughness}
                  onChange={(e) => onUpdateTerrainConfig({ roughness: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              {/* Water Level */}
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                  <span>Water Elevation</span>
                  <span className="text-slate-400 font-mono">{terrainConfig.waterLevel}m</span>
                </div>
                <input
                  type="range"
                  min="-8"
                  max="14"
                  step="1"
                  value={terrainConfig.waterLevel}
                  onChange={(e) => onUpdateTerrainConfig({ waterLevel: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              {/* Segmen Poligon (Rule 4: Turunkan segmen/poligon pada terrain) */}
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                  <span>Segmen Poligon</span>
                  <span className="text-emerald-400 font-mono font-bold">
                    {terrainConfig.resolution}x{terrainConfig.resolution}
                  </span>
                </div>
                <input
                  type="range"
                  min="24"
                  max="64"
                  step="4"
                  value={terrainConfig.resolution}
                  onChange={(e) => onUpdateTerrainConfig({ resolution: parseInt(e.target.value) || 28 })}
                  className="w-full accent-emerald-500 cursor-pointer"
                  title="Turunkan segmen poligon mesh untuk vertex lebih sedikit dan rendering lebih ringan di mobile"
                />
              </div>
            </div>

            {/* Quick Land Size Presets & Falloff Switches */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-400 font-medium">Preset Daratan:</span>
                <button
                  type="button"
                  onClick={() => onUpdateTerrainConfig({ islandCoverage: 0.85, waterLevel: 3 })}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
                >
                  🏝️ Atol Kecil
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateTerrainConfig({ islandCoverage: 1.45, waterLevel: 2 })}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 text-xs transition-colors"
                >
                  🌲 Pulau Luas
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateTerrainConfig({ islandCoverage: 2.1, islandFalloff: true, waterLevel: 1 })}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
                >
                  🗺️ Benua Besar
                </button>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={terrainConfig.islandFalloff}
                    onChange={(e) => onUpdateTerrainConfig({ islandFalloff: e.target.checked })}
                    className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                  />
                  <span className="text-xs text-slate-300 font-medium">Island Edge Falloff</span>
                </label>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-300 font-medium">Terrace Steps:</span>
                  <select
                    value={terrainConfig.terraceSteps}
                    onChange={(e) => onUpdateTerrainConfig({ terraceSteps: parseInt(e.target.value) })}
                    className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-2 py-1 focus:outline-none"
                  >
                    <option value="0">Continuous (Smooth)</option>
                    <option value="4">4 Steps (Stylized)</option>
                    <option value="7">7 Steps (Mesa Plateaus)</option>
                    <option value="12">12 Steps (Fine Terraces)</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={onRegenerateTerrain}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-md"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Re-Synthesize World</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Sculpt Brush & Trails */}
        {activeTab === 'sculpt' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { mode: 'sculpt-path', label: 'Jalan Setapak 🪨', badge: 'Path' },
                  { mode: 'sculpt-raise', label: 'Raise ⛰️' },
                  { mode: 'sculpt-lower', label: 'Lower 🕳️' },
                  { mode: 'sculpt-flatten', label: 'Flatten 📐' },
                  { mode: 'sculpt-smooth', label: 'Smooth 🌊' },
                ].map((b) => (
                  <button
                    key={b.mode}
                    type="button"
                    onClick={() => onUpdateBrushSettings({ mode: b.mode as BrushMode })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                      brushSettings.mode === b.mode
                        ? 'bg-emerald-500 text-white shadow-md'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    <span>{b.label}</span>
                  </button>
                ))}
              </div>

              {/* Trail Width Slider & Quick Presets (Pengatur Lebar Jalan Ramping Natural) */}
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700/80 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Footprints className="w-4 h-4 text-emerald-400" />
                    <div>
                      <span className="text-xs font-bold text-slate-200">
                        Lebar Jalan Setapak (Trail Width):
                      </span>
                      <span className="text-[10px] text-slate-400 ml-1.5 hidden sm:inline">
                        (Proporsi ramping diorama alami 2.0 - 2.5 unit)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-emerald-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                      {(brushSettings.trailWidth ?? 2.2).toFixed(1)} unit
                    </span>
                    {(brushSettings.trailWidth ?? 2.2) <= 2.5 && (
                      <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                        Ramping Natural ✨
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <input
                    type="range"
                    min="1.0"
                    max="5.5"
                    step="0.1"
                    value={brushSettings.trailWidth ?? 2.2}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      onUpdateBrushSettings({ trailWidth: val });
                      onUpdateTerrainConfig({ trailWidth: val });
                    }}
                    className="flex-1 accent-emerald-500 cursor-pointer h-2 bg-slate-800 rounded-lg appearance-none"
                    title={`Atur lebar jalan (Sekarang: ${(brushSettings.trailWidth ?? 2.2).toFixed(1)} unit)`}
                  />

                  {/* Quick Preset Buttons */}
                  <div className="flex items-center gap-1 shrink-0 flex-wrap">
                    {[
                      { val: 1.5, label: 'Mini 1.5' },
                      { val: 2.2, label: '★ Natural 2.2', isRec: true },
                      { val: 3.2, label: 'Sedang 3.2' },
                      { val: 4.5, label: 'Lebar 4.5' },
                    ].map((p) => {
                      const isSel = Math.abs((brushSettings.trailWidth ?? 2.2) - p.val) < 0.15;
                      return (
                        <button
                          key={p.val}
                          type="button"
                          onClick={() => {
                            onUpdateBrushSettings({ trailWidth: p.val });
                            onUpdateTerrainConfig({ trailWidth: p.val });
                          }}
                          className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                            isSel
                              ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400/50'
                              : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Action Buttons: Auto Build Scenic Trail & Tidy Up Scene */}
              <div className="flex items-center gap-2 flex-wrap">
                {onToggleRoadBuilder && (
                  <button
                    type="button"
                    onClick={onToggleRoadBuilder}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 min-h-[36px] rounded-lg text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer ${
                      isRoadBuilderActive
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white ring-2 ring-emerald-400/50 shadow-emerald-950/40'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    }`}
                    title="Aktifkan atau matikan alat pembangun jalan dua titik Pin A ⇄ B"
                  >
                    <Route className="w-4 h-4 text-emerald-400" />
                    <span>Pembangun Jalan 2 Titik: {isRoadBuilderActive ? 'AKTIF' : 'OFF'}</span>
                  </button>
                )}
                {onBuildTrail && (
                  <button
                    type="button"
                    onClick={onBuildTrail}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md active:scale-95"
                    title="Bangun jalan setapak berpaving batu, jembatan kayu & lentera secara otomatis melintasi pulau"
                  >
                    <Route className="w-4 h-4 text-emerald-200" />
                    <span>Bangun Jalan Setapak Otomatis 🚶‍♂️</span>
                  </button>
                )}
                {onTidyUpScene && (
                  <button
                    type="button"
                    onClick={onTidyUpScene}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-bold transition-all shadow-md active:scale-95"
                    title="Rapikan posisi seluruh objek dan jalan agar menempel solid pada permukaan pulau"
                  >
                    <Sparkles className="w-4 h-4 text-cyan-200" />
                    <span>Rapikan & Solidkan ✨</span>
                  </button>
                )}
                {onResetTrailColors && (
                  <button
                    type="button"
                    onClick={onResetTrailColors}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-all border border-slate-700"
                    title="Bersihkan bekas cat jalan lama dan kembalikan warna rumput/bioma alami"
                  >
                    <Sprout className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Bersihkan Jalan Lama 🌿</span>
                  </button>
                )}
              </div>
            </div>

            {/* If in Path Mode: Show Pathway Texture Brush with Multi-Material Blend controls */}
            {brushSettings.mode === 'sculpt-path' && (
              <div className="p-3 rounded-xl bg-slate-800/90 border border-emerald-500/50 shadow-lg space-y-3">
                {/* Header info */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/70 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                      <Footprints className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5 flex-wrap">
                        <span>Path Texture Brush</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Multi-Material Blending
                        </span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Paving Bergradasi & Nat Gelap ✨
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Oleskan kuas di pulau untuk mengukir jalan setapak bertekstur paving interlocking 3D dengan alur nat gelap jelas, material tanah, batu, & kerikil.
                      </p>
                    </div>
                  </div>

                  {/* Active Blend Badge */}
                  <div className="flex items-center gap-1.5 text-xs bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-700">
                    <span className="text-slate-400 text-[10px] uppercase font-semibold">Active:</span>
                    <span className="font-bold text-emerald-400">
                      {PATH_MATERIAL_PRESETS.find((p) => p.id === (brushSettings.pathStyle || terrainConfig.pathStyle))?.name || 'Custom Mix'}
                    </span>
                  </div>
                </div>

                {/* Smart Path Auto-Install Toggle (Tangga Lereng & Jembatan Air) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={brushSettings.autoInstallStairsAndBridges ?? true}
                        onChange={(e) =>
                          onUpdateBrushSettings({ autoInstallStairsAndBridges: e.target.checked })
                        }
                        className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-emerald-300">
                          🧠 Smart Structure:
                        </span>{' '}
                        <span className="text-slate-300">
                          <strong className="text-amber-300">Tangga</strong> di lereng & <strong className="text-cyan-300">Jembatan</strong> di air
                        </span>
                      </div>
                    </label>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                      {brushSettings.autoInstallStairsAndBridges ?? true ? 'Aktif' : 'Off'}
                    </span>
                  </div>

                  {/* Road Edge Decorations Toggle (Batu Pembatas Paving & Rumput Bunga Alami) */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900/80 border border-emerald-500/30">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={brushSettings.trailEdgeDecoration ?? terrainConfig.trailEdgeDecoration ?? true}
                        onChange={(e) => {
                          onUpdateBrushSettings({ trailEdgeDecoration: e.target.checked });
                          onUpdateTerrainConfig({ trailEdgeDecoration: e.target.checked });
                        }}
                        className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-emerald-300">
                          🪨🌸 Dekorasi Tepian Jalan:
                        </span>{' '}
                        <span className="text-slate-300">
                          <strong className="text-slate-200">Batu Pembatas</strong> paving & <strong className="text-emerald-300">Rumput Bunga</strong> di sisi jalur
                        </span>
                      </div>
                    </label>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                      {(brushSettings.trailEdgeDecoration ?? terrainConfig.trailEdgeDecoration ?? true) ? 'Batu & Bunga' : 'Polos'}
                    </span>
                  </div>
                </div>

                {/* Preset Material Blends */}
                <div>
                  <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Preset Material Blend:</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
                    {PATH_MATERIAL_PRESETS.map((style) => {
                      const isCurrent = (brushSettings.pathStyle || terrainConfig.pathStyle) === style.id;
                      return (
                        <button
                          key={style.id}
                          type="button"
                          onClick={() => {
                            onUpdateBrushSettings({
                              pathStyle: style.id,
                              pathBlendRatios: { ...style.blendRatios },
                            });
                            onUpdateTerrainConfig({
                              pathStyle: style.id,
                              pathBlendRatios: { ...style.blendRatios },
                            });
                          }}
                          className={`p-2 rounded-lg border text-left transition-all ${
                            isCurrent
                              ? 'bg-slate-700/90 border-emerald-400 ring-2 ring-emerald-500/30 shadow'
                              : 'bg-slate-800/60 border-slate-700/80 hover:bg-slate-700 hover:border-slate-600'
                          }`}
                          title={`${style.name}: ${style.description}`}
                        >
                          <div className="text-[11px] font-bold text-slate-200 truncate">{style.name}</div>
                          <div className="text-[9px] text-slate-400 truncate">{style.subtitle}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Interactive Multi-Material Blend Mixer */}
                <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-700/80 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-xs font-bold text-slate-200">Material Blend Mixer (Dirt · Stone · Gravel)</span>
                    </div>

                    {/* Quick Mix Presets */}
                    <div className="flex items-center gap-1 text-[10px]">
                      <span className="text-slate-400">Quick Mix:</span>
                      <button
                        type="button"
                        onClick={() => {
                          const r = { stone: 75, gravel: 20, dirt: 5 };
                          onUpdateBrushSettings({ pathStyle: 'custom_blend', pathBlendRatios: r });
                          onUpdateTerrainConfig({ pathStyle: 'custom_blend', pathBlendRatios: r });
                        }}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                      >
                        Plaza Cobble
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const r = { stone: 35, gravel: 40, dirt: 25 };
                          onUpdateBrushSettings({ pathStyle: 'custom_blend', pathBlendRatios: r });
                          onUpdateTerrainConfig({ pathStyle: 'custom_blend', pathBlendRatios: r });
                        }}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                      >
                        Natural Trail
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const r = { stone: 10, gravel: 40, dirt: 50 };
                          onUpdateBrushSettings({ pathStyle: 'custom_blend', pathBlendRatios: r });
                          onUpdateTerrainConfig({ pathStyle: 'custom_blend', pathBlendRatios: r });
                        }}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                      >
                        Country Dirt
                      </button>
                    </div>
                  </div>

                  {/* 3 Material Sliders */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Stone Slider */}
                    <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/60">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="flex items-center gap-1.5 font-semibold text-slate-200">
                          <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block shadow-sm" />
                          Stone (Batu)
                        </span>
                        <span className="font-mono text-emerald-400 font-bold">
                          {brushSettings.pathBlendRatios?.stone ?? 40}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={brushSettings.pathBlendRatios?.stone ?? 40}
                        onChange={(e) => {
                          const nextStone = parseInt(e.target.value);
                          const nextBlend = {
                            stone: nextStone,
                            gravel: brushSettings.pathBlendRatios?.gravel ?? 35,
                            dirt: brushSettings.pathBlendRatios?.dirt ?? 25,
                          };
                          onUpdateBrushSettings({ pathStyle: 'custom_blend', pathBlendRatios: nextBlend });
                          onUpdateTerrainConfig({ pathStyle: 'custom_blend', pathBlendRatios: nextBlend });
                        }}
                        className="w-full accent-slate-400 cursor-pointer"
                        title="Rasio material batu granit/slate"
                      />
                    </div>

                    {/* Gravel Slider */}
                    <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/60">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="flex items-center gap-1.5 font-semibold text-slate-200">
                          <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block shadow-sm" />
                          Gravel (Kerikil)
                        </span>
                        <span className="font-mono text-cyan-400 font-bold">
                          {brushSettings.pathBlendRatios?.gravel ?? 35}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={brushSettings.pathBlendRatios?.gravel ?? 35}
                        onChange={(e) => {
                          const nextGravel = parseInt(e.target.value);
                          const nextBlend = {
                            stone: brushSettings.pathBlendRatios?.stone ?? 40,
                            gravel: nextGravel,
                            dirt: brushSettings.pathBlendRatios?.dirt ?? 25,
                          };
                          onUpdateBrushSettings({ pathStyle: 'custom_blend', pathBlendRatios: nextBlend });
                          onUpdateTerrainConfig({ pathStyle: 'custom_blend', pathBlendRatios: nextBlend });
                        }}
                        className="w-full accent-cyan-400 cursor-pointer"
                        title="Rasio agregat kerikil sungai"
                      />
                    </div>

                    {/* Dirt Slider */}
                    <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/60">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="flex items-center gap-1.5 font-semibold text-slate-200">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block shadow-sm" />
                          Dirt (Tanah)
                        </span>
                        <span className="font-mono text-amber-400 font-bold">
                          {brushSettings.pathBlendRatios?.dirt ?? 25}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={brushSettings.pathBlendRatios?.dirt ?? 25}
                        onChange={(e) => {
                          const nextDirt = parseInt(e.target.value);
                          const nextBlend = {
                            stone: brushSettings.pathBlendRatios?.stone ?? 40,
                            gravel: brushSettings.pathBlendRatios?.gravel ?? 35,
                            dirt: nextDirt,
                          };
                          onUpdateBrushSettings({ pathStyle: 'custom_blend', pathBlendRatios: nextBlend });
                          onUpdateTerrainConfig({ pathStyle: 'custom_blend', pathBlendRatios: nextBlend });
                        }}
                        className="w-full accent-amber-500 cursor-pointer"
                        title="Rasio tanah loam pedesaan"
                      />
                    </div>
                  </div>

                  {/* Real-time Cross-Section Texture Blend Strip */}
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-[10px] text-slate-400 font-semibold shrink-0">Profil Penampang:</span>
                    <div
                      className="h-4 flex-1 rounded-md shadow-inner border border-slate-700/80 flex overflow-hidden"
                      title="Simulasi penampang melintang jalan dari pinggir ke tengah lalu ke pinggir"
                    >
                      <div
                        style={{
                          width: '100%',
                          background: `linear-gradient(to right, #78350f, #94a3b8, #64748b, #94a3b8, #78350f)`,
                          opacity: 0.9,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-emerald-400 italic shrink-0">
                      Pinggir (Tanah) ↔ Tengah (Batu & Kerikil)
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-800/40 p-3 rounded-xl border border-slate-700/60">
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                  <span>Brush Radius</span>
                  <span className="text-slate-400">{brushSettings.radius} units</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="30"
                  step="1"
                  value={brushSettings.radius}
                  onChange={(e) => onUpdateBrushSettings({ radius: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                  <span>Sculpt Intensity</span>
                  <span className="text-slate-400">{brushSettings.intensity.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.1"
                  value={brushSettings.intensity}
                  onChange={(e) => onUpdateBrushSettings({ intensity: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              {brushSettings.mode === 'sculpt-flatten' && (
                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                    <span>Target Flatten Height</span>
                    <span className="text-slate-400">{brushSettings.flattenHeight}m</span>
                  </div>
                  <input
                    type="range"
                    min="-10"
                    max="40"
                    step="1"
                    value={brushSettings.flattenHeight}
                    onChange={(e) => onUpdateBrushSettings({ flattenHeight: parseFloat(e.target.value) })}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: Place Objects */}
        {activeTab === 'place' && (
          <div className="space-y-3">
            {/* Tombol Pembangun Jalan Dua Titik (Pin A ⇄ B) */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-3 rounded-xl bg-slate-900/90 border border-emerald-500/40 gap-3 shadow-lg">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                    isRoadBuilderActive
                      ? 'bg-emerald-500/25 border-emerald-500 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  <Route className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">Pembangun Jalan 2 Titik (Pin A ⇄ B)</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        isRoadBuilderActive
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {isRoadBuilderActive ? 'AKTIF' : 'OFF'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    Tentukan titik awal (Pin A) & titik tujuan (Pin B) di pulau, rute otomatis dibuat rapi menghindari rintangan.
                  </p>
                </div>
              </div>

              {onToggleRoadBuilder && (
                <button
                  type="button"
                  onClick={onToggleRoadBuilder}
                  className={`flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0 shadow-md ${
                    isRoadBuilderActive
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white ring-2 ring-emerald-400/50 shadow-emerald-950/40'
                      : 'bg-emerald-600/90 hover:bg-emerald-500 text-white'
                  }`}
                  title="Aktifkan atau matikan alat pembangun jalan dua titik Pin A-B"
                >
                  <Footprints className="w-4 h-4" />
                  <span>{isRoadBuilderActive ? 'Tutup Pembangun Jalan' : 'Buka Pembangun Jalan (A ⇄ B)'}</span>
                </button>
              )}
            </div>

            {/* Category Filter Chips */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {[
                  { id: 'all', label: 'All Items' },
                  { id: 'foliage', label: 'Rumput & Pohon 🌱' },
                  { id: 'building', label: 'Bangunan 🏡' },
                  { id: 'path', label: 'Jalan & Jembatan 🪨' },
                  { id: 'cyber', label: 'Cyberpunk ⚡' },
                  { id: 'fantasy', label: 'Magic & Sci-Fi ✨' },
                  { id: 'prop', label: 'Props 🏮' },
                  { id: 'custom', label: 'Custom 📦' },
                ].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setPaletteCategory(c.id);
                      if (c.id === 'path') {
                        // Switch activePaletteItem to a path item to automatically activate Road Mode
                        const firstPath = STANDARD_PALETTE.find((i) => i.category === 'path');
                        if (firstPath) onSelectPaletteItem(firstPath);
                      } else if (c.id !== 'all' && activePaletteItem?.category === 'path') {
                        // Switch activePaletteItem away from path to cleanly deactivate Road Mode
                        const firstItem = STANDARD_PALETTE.find((i) => i.category === c.id);
                        if (firstItem) onSelectPaletteItem(firstItem);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      paletteCategory === c.id
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {placedObjects.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAllObjects}
                  className="text-xs text-rose-400 hover:text-rose-300 px-2 py-1 flex items-center gap-1"
                  title="Remove all placed objects from island"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Semua ({placedObjects.length})</span>
                </button>
              )}
            </div>

            {/* Contextual Road Build Guidance Banner */}
            {paletteCategory === 'path' && (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
                <div className="flex items-center gap-2">
                  <Route className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong>Mode Bangun Jalan Aktif:</strong> Pin A & B serta garis rute tampil di layar 3D. Seret pin di atas tanah untuk menentukan rute jalan, lalu klik tombol "Jalan" atau "Terapkan Jalan".
                  </span>
                </div>
              </div>
            )}

            {/* Procedural Scatter & Distribution Suite */}
            <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-slate-100">Alat Sebar Objek Prosedural:</span>
                  <span className="text-[10px] text-slate-400 hidden md:inline">
                    (Sebar objek terpilih, padang rumput & bunga bertumpang tindih, atau kuas semprot sebar)
                  </span>
                </div>

                {/* Placement Mode: Single Click vs Spray Scatter Brush */}
                <div className="flex items-center gap-1 bg-slate-900/80 p-0.5 rounded-lg border border-slate-700">
                  <button
                    type="button"
                    onClick={() => onUpdateBrushSettings({ mode: 'place' })}
                    className={`px-2 py-1 rounded text-[11px] font-bold transition-all ${
                      brushSettings.mode === 'place'
                        ? 'bg-emerald-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Tempatkan 1 objek per klik"
                  >
                    🖱️ Tempatkan
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateBrushSettings({ mode: 'scatter-brush' })}
                    className={`px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 ${
                      brushSettings.mode === 'scatter-brush'
                        ? 'bg-amber-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Kuas Semprot Sebar: Semprot rumpun objek di area kursor"
                  >
                    <Wheat className="w-3 h-3 text-amber-300" />
                    <span>Kuas Sebar</span>
                  </button>
                </div>

                {/* Density Slider & Quick Counts */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-semibold">Jumlah:</span>
                  <input
                    type="range"
                    min="10"
                    max="120"
                    step="5"
                    value={autoScatterCount}
                    onChange={(e) => setAutoScatterCount(parseInt(e.target.value))}
                    className="w-20 accent-emerald-500 cursor-pointer"
                    title={`Sebar ${autoScatterCount} unit objek`}
                  />
                  <span className="text-xs font-mono font-bold text-emerald-400 w-8 text-right">
                    {autoScatterCount}x
                  </span>
                  <div className="hidden xs:flex items-center gap-1">
                    {[15, 30, 60, 100].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setAutoScatterCount(cnt)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                          autoScatterCount === cnt
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-700/80 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {cnt}
                      </button>
                    ))}
                  </div>

                  {/* Toggle Replace vs Append */}
                  <label className="flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer pl-1 border-l border-slate-700">
                    <input
                      type="checkbox"
                      checked={replaceMode}
                      onChange={(e) => setReplaceMode(e.target.checked)}
                      className="w-3.5 h-3.5 accent-emerald-500 rounded cursor-pointer"
                    />
                    <span title="Ganti objek sejenis yang sudah ada daripada menumpuk">Ganti lama</span>
                  </label>
                </div>
              </div>

              {/* Object Placement Scale Control (Ukuran Objek Saat Ditempatkan) */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-700/60">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-200">Ukuran Objek Saat Ditempatkan:</span>
                  <input
                    type="range"
                    min="0.2"
                    max="3.0"
                    step="0.1"
                    value={brushSettings.placementScale ?? 1.0}
                    onChange={(e) =>
                      onUpdateBrushSettings({ placementScale: parseFloat(e.target.value) })
                    }
                    className="w-24 accent-emerald-500 cursor-pointer"
                    title="Atur ukuran/skala objek sebelum ditempatkan atau disemprot"
                  />
                  <span className="text-xs font-mono font-bold text-emerald-400 w-10 text-right">
                    {((brushSettings.placementScale ?? 1.0)).toFixed(1)}x
                  </span>
                </div>

                <div className="flex items-center gap-1 flex-wrap">
                  {[
                    { s: 0.5, l: '0.5x Mini' },
                    { s: 0.8, l: '0.8x' },
                    { s: 1.0, l: '1.0x Normal' },
                    { s: 1.5, l: '1.5x Besar' },
                    { s: 2.0, l: '2.0x Jumbo' },
                    { s: 2.5, l: '2.5x' },
                  ].map((pre) => (
                    <button
                      key={pre.s}
                      type="button"
                      onClick={() => onUpdateBrushSettings({ placementScale: pre.s })}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                        Math.abs((brushSettings.placementScale ?? 1.0) - pre.s) < 0.05
                          ? 'bg-emerald-600 text-white shadow'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      {pre.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 pt-1">
                {/* 1. Sebar Objek Terpilih */}
                <button
                  type="button"
                  onClick={() => {
                    if (activePaletteItem && onScatterSpecificObject) {
                      onScatterSpecificObject(activePaletteItem, autoScatterCount, replaceMode);
                    }
                  }}
                  disabled={!activePaletteItem}
                  className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                    activePaletteItem
                      ? 'bg-amber-600 hover:bg-amber-500 text-white active:scale-95'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                  }`}
                  title={
                    activePaletteItem
                      ? `Sebar ${autoScatterCount}x ${activePaletteItem.name} di seluruh pulau`
                      : 'Pilih salah satu objek di palet bawah untuk disebar'
                  }
                >
                  <Wheat className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {activePaletteItem ? `Sebar: ${activePaletteItem.name}` : 'Sebar Objek Terpilih'}
                  </span>
                </button>

                {/* 2. Padang Bunga & Rumput Tumpang Tindih */}
                <button
                  type="button"
                  onClick={() => {
                    if (onScatterMeadowAndFlowers) {
                      onScatterMeadowAndFlowers(Math.max(autoScatterCount, 40), replaceMode);
                    } else if (onScatterMeadowGrass) {
                      onScatterMeadowGrass(Math.max(autoScatterCount, 40), replaceMode);
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold transition-all shadow-sm active:scale-95 border border-pink-400/30"
                  title="Penuhi daratan dengan hamparan bunga liar yang saling bertumpang tindih alami dengan rumput acak"
                >
                  <Flower2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Bunga & Rumput 🌸</span>
                </button>

                {/* 3. Hamparan Rumput Padang Liar */}
                <button
                  type="button"
                  onClick={() => {
                    if (onScatterMeadowGrass) {
                      onScatterMeadowGrass(Math.max(autoScatterCount, 45), replaceMode);
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-lime-600 hover:bg-lime-500 text-white text-xs font-bold transition-all shadow-sm active:scale-95 border border-lime-400/30"
                  title="Penuhi seluruh area hijau pulau dengan hamparan padang rumput subur berhelai tegak & serong acak"
                >
                  <Sprout className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Rumput Padang 🌱</span>
                </button>

                {/* 4. Acak Bangunan */}
                <button
                  type="button"
                  onClick={() => {
                    if (onScatterBuildings) {
                      onScatterBuildings(Math.min(autoScatterCount, 24), replaceMode);
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-sm active:scale-95"
                  title="Sebar acak rumah chalet, kincir angin, mercusuar & bangunan pemukiman di daratan"
                >
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Acak Bangunan 🏡</span>
                </button>

                {/* 5. Acak Tumbuhan */}
                <button
                  type="button"
                  onClick={() => {
                    if (onScatterVegetation) {
                      onScatterVegetation(autoScatterCount, replaceMode);
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-sm active:scale-95"
                  title="Sebar acak pepohonan oak, pinus, semak, dan rumput padang di daratan"
                >
                  <Trees className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Acak Tumbuhan 🌲</span>
                </button>

                {/* 6. Acak Bioma Mix */}
                <button
                  type="button"
                  onClick={() => onAutoPopulateBiome(autoScatterCount)}
                  className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold transition-all shadow-sm active:scale-95"
                  title="Acak semua elemen bioma alami (bangunan + tumbuhan + lampu)"
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-300" />
                  <span className="truncate">Acak Bioma ✨</span>
                </button>
              </div>
            </div>

            {/* Models Grid with Quick Scatter button on every item */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-52 overflow-y-auto pr-1">
              {filteredPaletteItems.map((item) => {
                const IconComponent = ICON_MAP[item.icon] || Box;
                const isSelected =
                  (brushSettings.mode === 'place' || brushSettings.mode === 'scatter-brush') &&
                  activePaletteItem?.id === item.id;

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (brushSettings.mode !== 'scatter-brush') {
                        onUpdateBrushSettings({ mode: 'place' });
                      }
                      onSelectPaletteItem(item);
                    }}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer group relative ${
                      isSelected
                        ? 'bg-slate-800 border-emerald-400 ring-2 ring-emerald-500/30 shadow'
                        : 'bg-slate-800/40 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="w-6 h-6 rounded bg-slate-700 flex items-center justify-center text-emerald-400 group-hover:bg-slate-600 transition-colors">
                        <IconComponent className="w-3.5 h-3.5" />
                      </div>
                      
                      {/* Quick Scatter Button per Object */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPaletteItem(item);
                          if (onScatterSpecificObject) {
                            onScatterSpecificObject(item, autoScatterCount, replaceMode);
                          }
                        }}
                        className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-white border border-amber-500/40 text-[9px] font-bold transition-all flex items-center gap-1 shadow-sm active:scale-95"
                        title={`Sebar ${autoScatterCount}x ${item.name} langsung ke seluruh daratan`}
                      >
                        <Wheat className="w-2.5 h-2.5" />
                        <span>Sebar</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-1">
                      <div className="font-semibold text-xs text-slate-100 truncate">{item.name}</div>
                      {item.badge && (
                        <span className="text-[8px] font-bold uppercase px-1 py-0.2 rounded bg-slate-900/80 text-slate-400 shrink-0">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 line-clamp-1">{item.description}</div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 italic">
              Objek aktif: <strong className="text-emerald-300">{activePaletteItem?.name || 'Belum dipilih'}</strong>. Mode: <strong>{brushSettings.mode === 'scatter-brush' ? '🌾 Kuas Semprot Sebar (Spray)' : '🖱️ Tempatkan Tunggal'}</strong>. Klik tombol "Sebar" di kartu untuk sebar massal instan.
            </p>
          </div>
        )}

        {/* TAB 4: Custom Assets (GLB / GLTF / OBJ) */}
        {activeTab === 'assets' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-slate-700 rounded-xl p-5 text-center bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
              <Upload className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-200 mb-1">
                Drop your 3D models here or browse files
              </p>
              <p className="text-[11px] text-slate-400 mb-3">
                Supports <strong className="text-slate-300">.GLB</strong>,{' '}
                <strong className="text-slate-300">.GLTF</strong>, and{' '}
                <strong className="text-slate-300">.OBJ</strong> formats. Automatically normalized & grounded at base.
              </p>

              <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer transition-colors shadow-md">
                <PackagePlus className="w-4 h-4" />
                <span>{isUploading ? 'Parsing 3D Asset...' : 'Upload 3D Model'}</span>
                <input
                  type="file"
                  accept=".glb,.gltf,.obj"
                  onChange={handleFileUploadChange}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>

              {uploadError && (
                <p className="text-xs text-rose-400 mt-2 font-medium">{uploadError}</p>
              )}
            </div>

            {/* Uploaded Models List */}
            {customAssets.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Imported Custom Models ({customAssets.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {customAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-bold text-white truncate max-w-[140px]">
                          {asset.name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {asset.format.toUpperCase()} • {(asset.fileSize / 1024).toFixed(1)} KB • {asset.vertexCount} verts
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const paletteItem: PaletteItem = {
                            id: asset.id,
                            name: asset.name,
                            category: 'custom',
                            icon: 'Box',
                            description: `Custom model`,
                            defaultScale: [1, 1, 1],
                            badge: 'Custom',
                            isCustom: true,
                          };
                          onUpdateBrushSettings({ mode: 'place' });
                          onSelectPaletteItem(paletteItem);
                          setActiveTab('place');
                        }}
                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
                      >
                        Place
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: Waktu & Cahaya (24-Hour Time & Area Lamp Lighting) */}
        {activeTab === 'lighting' && (
          <div className="space-y-4">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div>
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span>Siklus Waktu 24 Jam & Efek Area Cahaya Lampu</span>
                </h4>
                <p className="text-xs text-slate-400">
                  Kontrol pergerakan matahari, bulan, kubah langit dinamis, serta efek pendaran cahaya tanah untuk tiang lampu dan bangunan.
                </p>
              </div>

              {/* Digital Clock & Phase Badge */}
              <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-1.5 shrink-0 self-start sm:self-auto">
                <Clock className={`w-4 h-4 ${timeHour < 6.0 || timeHour >= 18.0 ? 'text-indigo-400' : 'text-amber-400'} animate-pulse`} />
                <div className="flex flex-col">
                  <span className="font-mono text-sm font-bold tracking-wider text-white">
                    {timeString}
                  </span>
                  <span className="text-[10px] text-amber-300 font-medium leading-none">
                    {phaseLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* Grid 2 Kolom: Siklus Waktu & Efek Cahaya Lampu */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Kolom Kiri: Slider 24 Jam & Siklus Otomatis */}
              <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/70 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>Pengatur Jam (00:00 - 24:00)</span>
                    </span>
                  </div>

                  {/* Play / Pause button & Speeds */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={onTogglePlay}
                      className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                        timeSettings?.isPlaying
                          ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 ring-2 ring-amber-400/40'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      }`}
                      title={timeSettings?.isPlaying ? 'Jeda Siklus Waktu' : 'Putar Siklus Siang-Malam'}
                    >
                      {timeSettings?.isPlaying ? (
                        <>
                          <Pause className="w-3.5 h-3.5 fill-current" />
                          <span>Pause</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Play</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg p-0.5">
                      {[1, 2, 5, 10, 30].map((spd) => (
                        <button
                          key={spd}
                          type="button"
                          onClick={() => onSpeedChange && onSpeedChange(spd)}
                          className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors ${
                            timeSettings?.speed === spd
                              ? 'bg-amber-400 text-slate-950'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {spd}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 24h Interactive Slider */}
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-1">
                    <span className="flex items-center gap-1"><Moon className="w-3 h-3 text-indigo-400" /> 00:00</span>
                    <span className="flex items-center gap-1"><Sunrise className="w-3 h-3 text-amber-300" /> 06:00</span>
                    <span className="flex items-center gap-1"><Sun className="w-3 h-3 text-amber-400" /> 12:00</span>
                    <span className="flex items-center gap-1"><Sunset className="w-3 h-3 text-orange-400" /> 18:00</span>
                    <span className="flex items-center gap-1"><Moon className="w-3 h-3 text-indigo-400" /> 24:00</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={24}
                    step={0.05}
                    value={timeHour}
                    onChange={(e) => onTimeChange && onTimeChange(parseFloat(e.target.value))}
                    aria-label="Pengatur Jam 24 Jam"
                    className="w-full h-2.5 bg-gradient-to-r from-slate-900 via-amber-400 to-indigo-950 rounded-lg appearance-none cursor-pointer accent-amber-400 focus:outline-none"
                  />
                </div>

                {/* Quick Presets Buttons */}
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block mb-1.5">
                    Lompat Cepat ke Jam:
                  </span>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {[
                      { label: 'Fajar', hour: 6.0, icon: Sunrise },
                      { label: 'Siang', hour: 12.0, icon: Sun },
                      { label: 'Golden', hour: 17.5, icon: Sun },
                      { label: 'Senja', hour: 18.7, icon: Sunset },
                      { label: 'Malam', hour: 21.5, icon: Moon },
                      { label: 'Midnight', hour: 0.0, icon: Moon },
                    ].map((p) => {
                      const Icon = p.icon;
                      const isSel = Math.abs(timeHour - p.hour) < 0.6;
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => onTimeChange && onTimeChange(p.hour)}
                          className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                            isSel
                              ? 'bg-amber-500/25 border border-amber-400/80 text-amber-300 font-bold'
                              : 'bg-slate-900/80 border border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          <Icon className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>{p.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Kolom Kanan: Pengaturan Efek Area Cahaya Lampu */}
              <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/70 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Efek Area Cahaya Lampu (Ground Light Pool)</span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {timeHour < 6.0 || timeHour >= 18.0 ? '🌙 Mode Malam (Menyala)' : '☀️ Mode Siang'}
                  </span>
                </div>

                {/* Mode Aktivasi */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>Aktivasi Lampu Jalan & Lentera:</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-700">
                    <button
                      type="button"
                      onClick={() => onLampSettingsChange && onLampSettingsChange({ mode: 'auto' })}
                      className={`py-1.5 px-2 text-xs font-semibold rounded-lg transition-all ${
                        lampSettings?.mode === 'auto'
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Otomatis 🌙
                    </button>
                    <button
                      type="button"
                      onClick={() => onLampSettingsChange && onLampSettingsChange({ mode: 'always-on' })}
                      className={`py-1.5 px-2 text-xs font-semibold rounded-lg transition-all ${
                        lampSettings?.mode === 'always-on'
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Selalu On 💡
                    </button>
                    <button
                      type="button"
                      onClick={() => onLampSettingsChange && onLampSettingsChange({ mode: 'always-off' })}
                      className={`py-1.5 px-2 text-xs font-semibold rounded-lg transition-all ${
                        lampSettings?.mode === 'always-off'
                          ? 'bg-slate-700 text-white font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Mati ✕
                    </button>
                  </div>
                </div>

                {/* Sliders: Intensitas & Radius Cahaya */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                      <span>Intensitas Pendaran:</span>
                      <span className="font-mono text-amber-300 font-bold">
                        {(lampSettings?.intensity ?? 1.0).toFixed(1)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={2.5}
                      step={0.1}
                      value={lampSettings?.intensity ?? 1.0}
                      onChange={(e) =>
                        onLampSettingsChange &&
                        onLampSettingsChange({ intensity: parseFloat(e.target.value) })
                      }
                      className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-amber-400"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                      <span>Radius Area Tanah:</span>
                      <span className="font-mono text-amber-300 font-bold">
                        {(lampSettings?.radius ?? 1.0).toFixed(1)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={2.2}
                      step={0.1}
                      value={lampSettings?.radius ?? 1.0}
                      onChange={(e) =>
                        onLampSettingsChange &&
                        onLampSettingsChange({ radius: parseFloat(e.target.value) })
                      }
                      className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-amber-400"
                    />
                  </div>
                </div>

                {/* Pulsing Toggle */}
                <div className="pt-1 border-t border-slate-700/60">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white select-none text-xs">
                    <input
                      type="checkbox"
                      checked={lampSettings?.pulsing ?? true}
                      onChange={(e) =>
                        onLampSettingsChange && onLampSettingsChange({ pulsing: e.target.checked })
                      }
                      className="rounded text-amber-400 focus:ring-0 accent-amber-400 bg-slate-900 border-slate-700 w-4 h-4"
                    />
                    <span>Pendaran Dinamis Bernapas (*Subtle breathing pulse*)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Section 3: Kecerahan Bayangan & Objek 3D (Ambient Lighting Fill) */}
            <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/70 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5 text-amber-300" />
                    <span>Kecerahan Bayangan & Sisi Gelap Objek (Ambient Fill)</span>
                  </h5>
                  <p className="text-[11px] text-slate-400">
                    Menerangi sisi gelap pohon, rumah, dan perbukitan agar tidak hitam pekat dan tampak jelas.
                  </p>
                </div>
                <div className="font-mono text-xs font-bold text-emerald-400 bg-slate-900 px-2 py-1 rounded-lg border border-slate-700">
                  {((lampSettings?.ambientBrightness ?? 1.25)).toFixed(2)}x
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0.6}
                  max={2.5}
                  step={0.05}
                  value={lampSettings?.ambientBrightness ?? 1.25}
                  onChange={(e) =>
                    onLampSettingsChange &&
                    onLampSettingsChange({ ambientBrightness: parseFloat(e.target.value) })
                  }
                  className="flex-1 h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                />

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onLampSettingsChange && onLampSettingsChange({ ambientBrightness: 1.0 })}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors"
                  >
                    Standar
                  </button>
                  <button
                    type="button"
                    onClick={() => onLampSettingsChange && onLampSettingsChange({ ambientBrightness: 1.35 })}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-700 text-emerald-300 text-xs font-bold border border-slate-700 transition-colors"
                  >
                    Cerah ✨
                  </button>
                  <button
                    type="button"
                    onClick={() => onLampSettingsChange && onLampSettingsChange({ ambientBrightness: 1.85 })}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-700 text-amber-300 text-xs font-bold border border-slate-700 transition-colors"
                  >
                    Sangat Cerah ☀️
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: Export 3D */}
        {activeTab === 'export' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                Export to Standard 3D Formats
              </h4>
              <p className="text-xs text-slate-400">
                Download your complete sculpted world with all placed architecture, trees, and terrain meshes for external rendering or game engines.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* OBJ Export */}
              <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-1 text-slate-200 font-bold text-xs">
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Wavefront OBJ (.obj)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-3">
                    Universal geometry format. Best for Blender, Maya, 3ds Max, ZBrush.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onExportOBJ}
                  className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors"
                >
                  Download OBJ
                </button>
              </div>

              {/* GLTF / GLB Export */}
              <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-1 text-slate-200 font-bold text-xs">
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    <span>GLTF / GLB (.glb)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-3">
                    Modern PBR binary format. Best for Godot, Unity, Unreal, and WebGL.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onExportGLB}
                  className="w-full py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-colors"
                >
                  Download GLB
                </button>
              </div>

              {/* Three.js JSON Export */}
              <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-1 text-slate-200 font-bold text-xs">
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>Three.js JSON (.json)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-3">
                    Native Three.js Object3D hierarchy JSON for web apps.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onExportThreeJSON}
                  className="w-full py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors"
                >
                  Download JSON
                </button>
              </div>

              {/* Heightmap PNG Export */}
              <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-1 text-slate-200 font-bold text-xs">
                    <Download className="w-3.5 h-3.5 text-purple-400" />
                    <span>Heightmap PNG (.png)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-3">
                    Grayscale displacement heightmap image for terrain shaders.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onExportHeightmap}
                  className="w-full py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors"
                >
                  Download PNG
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
