import React from 'react';
import {
  Compass,
  RotateCcw,
  Undo2,
  Redo2,
  Eye,
  Camera,
  Sliders,
  Clock,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { BiomeType, GraphicsPreset, PerformanceMode, TimeOfDay } from '../types';
import { formatTimeHour } from '../core/timeLighting';

interface TopBarProps {
  seed: number;
  biome: BiomeType;
  objectCount: number;
  timeOfDay: TimeOfDay;
  timeHour?: number;
  onOpenLightingTab?: () => void;
  onTimeOfDayChange: (t: TimeOfDay) => void;
  onCameraPreset: (preset: 'iso' | 'top' | 'cinematic' | 'reset') => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isDockCollapsed: boolean;
  onToggleDock: () => void;
  fps: number;
  graphicsPreset: GraphicsPreset;
  onOpenGraphicsSettings: () => void;
  renderScale: number;
  onOpenResolutionMenu: () => void;
  onCycleGraphicsPreset?: () => void;
  performanceMode?: PerformanceMode;
  onCyclePerformanceMode?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  seed,
  biome,
  objectCount,
  timeHour = 17.5,
  onOpenLightingTab,
  onCameraPreset,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isDockCollapsed,
  onToggleDock,
  fps,
  graphicsPreset,
  onOpenGraphicsSettings,
  renderScale,
  performanceMode,
  isFullscreen = false,
  onToggleFullscreen,
}) => {
  const effectivePreset =
    graphicsPreset ||
    (performanceMode === 'ultra' ? 'HIGH' : performanceMode === 'mobile' ? 'LOW' : 'MEDIUM');
  const { timeString } = formatTimeHour(timeHour);

  return (
    <header className="absolute top-2.5 sm:top-3 left-2.5 sm:left-3 right-2.5 sm:right-3 flex items-center justify-between pointer-events-none z-20 gap-2">
      {/* Cluster Kiri: Brand & Island Specs */}
      <div className="flex items-center gap-2 sm:gap-2.5 bg-slate-950/85 border border-slate-800/80 text-slate-100 rounded-2xl px-2.5 sm:px-3.5 py-1.5 pointer-events-auto shadow-2xl">
        <div className="w-7 h-7 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
          <Compass className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-xs sm:text-sm tracking-wide text-white whitespace-nowrap">
              TerraForge 3D
            </span>
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              {biome}
            </span>
          </div>
          <div className="hidden xs:flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
            <span>#{seed}</span>
            <span>•</span>
            <span>{objectCount} objs</span>
            <span>•</span>
            <span className="text-emerald-400 font-semibold">{fps > 0 ? `${fps} FPS` : '60 FPS'}</span>
          </div>
        </div>
      </div>

      {/* Cluster Tengah: Preset Kamera & Undo/Redo */}
      <div className="hidden md:flex items-center gap-1 bg-slate-950/85 border border-slate-800/80 rounded-2xl p-1 pointer-events-auto shadow-2xl">
        <div className="flex items-center border-r border-slate-800/80 pr-1 mr-1">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-0.5">
          <span className="text-[10px] text-slate-500 font-medium px-1 flex items-center gap-1">
            <Camera className="w-3 h-3 text-slate-400" />
          </span>
          {(['iso', 'top', 'cinematic'] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onCameraPreset(preset)}
              className="px-2 py-1 text-[11px] font-medium rounded-lg text-slate-300 hover:text-white hover:bg-slate-900 transition-colors"
              title={`Kamera ${preset === 'iso' ? 'Isometrik 45°' : preset === 'top' ? 'Peta Atas' : 'Sinematik Horison'}`}
            >
              {preset === 'iso' ? 'Iso' : preset === 'top' ? 'Top' : 'Cine'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onCameraPreset('reset')}
            title="Reset Posisi Kamera"
            aria-label="Reset Kamera"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Cluster Kanan: Jam & Waktu, Grafis/Resolusi, Fullscreen, Zen View */}
      <div className="flex items-center gap-1.5 bg-slate-950/85 border border-slate-800/80 rounded-2xl p-1 pointer-events-auto shadow-2xl">
        {/* Tombol Pintas Jam -> Buka Tab Waktu & Cahaya */}
        <button
          type="button"
          onClick={onOpenLightingTab}
          className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-850 text-slate-200 hover:text-white border border-amber-500/30 hover:border-amber-400/60 transition-all shadow-sm"
          title="Buka Tab Waktu & Cahaya (Siklus 24 Jam & Lampu)"
        >
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-mono text-amber-300 font-bold">{timeString}</span>
        </button>

        {/* Pengatur Grafis Lengkap & Resolusi */}
        <button
          type="button"
          onClick={onOpenGraphicsSettings}
          className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-850 text-slate-200 hover:text-white border border-slate-700/60 hover:border-emerald-500/50 transition-all shadow-sm"
          title={`Pengatur Grafis: ${effectivePreset} (${renderScale.toFixed(2)}x). Klik untuk ubah resolusi dan preset.`}
        >
          <Sliders className="w-3.5 h-3.5 text-emerald-400" />
          <span>{effectivePreset}</span>
          <span className="font-mono text-[10px] text-slate-400">({renderScale.toFixed(2)}x)</span>
        </button>

        {/* Tombol Fullscreen Baru */}
        {onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-emerald-950/40 text-slate-200 hover:text-white border border-slate-700/60 hover:border-emerald-500/60 transition-all shadow-sm"
            title={isFullscreen ? 'Keluar Mode Layar Penuh (Esc atau F)' : 'Mode Layar Penuh Fullscreen (F)'}
            aria-label="Toggle Fullscreen"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span className="hidden md:inline">{isFullscreen ? 'Keluar' : 'Fullscreen'}</span>
          </button>
        )}

        {/* Zen View / Toggle Dock */}
        <button
          type="button"
          onClick={onToggleDock}
          className="flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 transition-colors"
          title={isDockCollapsed ? 'Buka Menu Dock Bawah (H)' : 'Sembunyikan Menu Dock Bawah (H)'}
          aria-label="Toggle Dock UI"
        >
          <Eye className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden lg:inline">{isDockCollapsed ? 'Tampil' : 'Zen'}</span>
        </button>
      </div>
    </header>
  );
};
