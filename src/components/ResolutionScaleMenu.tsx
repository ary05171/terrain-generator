import React from 'react';
import { Monitor, X, Sparkles, Zap, ShieldCheck, Sliders, Info, Check } from 'lucide-react';
import { GraphicsPreset } from '../types';

interface ResolutionScaleMenuProps {
  isOpen: boolean;
  onClose: () => void;
  renderScale: number;
  onScaleChange: (scale: number) => void;
  currentPreset: GraphicsPreset;
  onSelectPreset: (preset: GraphicsPreset) => void;
}

export const ResolutionScaleMenu: React.FC<ResolutionScaleMenuProps> = ({
  isOpen,
  onClose,
  renderScale,
  onScaleChange,
  currentPreset,
  onSelectPreset,
}) => {
  if (!isOpen) return null;

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const effectiveDpr = (dpr * renderScale).toFixed(2);
  const estWidth = typeof window !== 'undefined' ? Math.round(window.innerWidth * dpr * renderScale) : 1920;
  const estHeight = typeof window !== 'undefined' ? Math.round(window.innerHeight * dpr * renderScale) : 1080;

  const quickScales: { label: string; scale: number; presetMatch?: GraphicsPreset; desc: string }[] = [
    { label: '0.50x', scale: 0.5, desc: 'Ultra Ringan (Max FPS)' },
    { label: '0.75x', scale: 0.75, presetMatch: 'LOW', desc: 'Low (Hemat GPU)' },
    { label: '1.00x', scale: 1.0, presetMatch: 'MEDIUM', desc: 'Medium (Standar 1:1)' },
    { label: '1.25x', scale: 1.25, presetMatch: 'HIGH', desc: 'High (Tajam & Halus)' },
    { label: '1.50x', scale: 1.5, desc: 'Ultra Crisp (Kualitas Maks)' },
  ];

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onScaleChange(val);
  };

  const presetBadgeColor =
    currentPreset === 'LOW'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
      : currentPreset === 'MEDIUM'
      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
      : currentPreset === 'HIGH'
      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
      : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';

  const presetBadgeText =
    currentPreset === 'LOW'
      ? 'Preset: LOW (0.75x)'
      : currentPreset === 'MEDIUM'
      ? 'Preset: MEDIUM (1.0x)'
      : currentPreset === 'HIGH'
      ? 'Preset: HIGH (1.25x)'
      : 'Preset: Kustom';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="resolution-menu-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/95">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <h2 id="resolution-menu-title" className="text-sm sm:text-base font-bold text-white tracking-wide">
                Skala Resolusi Render
              </h2>
              <p className="text-[11px] text-slate-400">
                Atur resolusi internal canvas 3D secara independen tanpa memengaruhi tata letak UI
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup menu skala resolusi render"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Status Display Card */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block font-medium">Skala Saat Ini</span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl sm:text-3xl font-black font-mono text-cyan-300">
                  {renderScale.toFixed(2)}x
                </span>
                <span className="text-xs font-mono text-slate-400">
                  (DPR: {effectiveDpr})
                </span>
              </div>
            </div>

            <div className="text-right flex flex-col items-end gap-1.5">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${presetBadgeColor}`}>
                {presetBadgeText}
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                ~{estWidth} × {estHeight} px
              </span>
            </div>
          </div>

          {/* Slider Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="render-scale-slider" className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span>Slider Skala Render</span>
              </label>
              <span className="text-[11px] font-mono text-cyan-300 font-bold bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded-md">
                {renderScale.toFixed(2)}x
              </span>
            </div>

            <input
              id="render-scale-slider"
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              value={renderScale}
              onChange={handleSliderChange}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 hover:accent-cyan-300 transition-all"
            />

            <div className="flex justify-between text-[10px] font-mono text-slate-400 px-1 pt-1">
              <span>0.5x (Hemat)</span>
              <span className="text-emerald-400 font-semibold">0.75x (Low)</span>
              <span className="text-amber-400 font-semibold">1.0x (Med)</span>
              <span className="text-purple-400 font-semibold">1.25x (High)</span>
              <span>1.5x</span>
            </div>
          </div>

          {/* Quick Selection Buttons */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-300 block">
              Pilihan Cepat (Quick Presets)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {quickScales.map((item) => {
                const isActive = Math.abs(renderScale - item.scale) < 0.02;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      if (item.presetMatch) {
                        onSelectPreset(item.presetMatch);
                      } else {
                        onScaleChange(item.scale);
                      }
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                      isActive
                        ? 'bg-cyan-500/15 border-cyan-400 text-white shadow-md shadow-cyan-500/10 ring-1 ring-cyan-400/40'
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm font-mono text-white">
                        {item.label}
                      </span>
                      {isActive && <Check className="w-3.5 h-3.5 text-cyan-400 stroke-[3]" />}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                      {item.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Explanation Info */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400 space-y-1.5">
            <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>Cara Kerja Skala Resolusi Render</span>
            </div>
            <p className="leading-relaxed">
              Skala Resolusi menerapkan{' '}
              <code className="text-cyan-300 bg-cyan-950/60 px-1 py-0.5 rounded font-mono text-[10px]">
                renderer.setPixelRatio(window.devicePixelRatio * scale)
              </code>{' '}
              langsung ke canvas WebGL. Elemen HTML antarmuka (dock, tombol, teks) tetap berukuran 100% tajam dan responsif tanpa distorsi aspek rasio.
            </p>
            <p className="text-slate-500 text-[10px]">
              • Geser slider manual akan mengubah status profil menjadi <strong className="text-cyan-300">Kustom</strong>.
              <br />
              • Memilih profil Low, Medium, atau High akan mengembalikan skala standar (0.75x, 1.0x, atau 1.25x).
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-slate-900/95 text-xs">
          <span className="text-slate-400 text-[11px]">
            Resolusi WebGL Terkini:{' '}
            <strong className="text-cyan-300 font-mono font-bold">{renderScale.toFixed(2)}x</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-colors shadow-lg shadow-cyan-600/20"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
