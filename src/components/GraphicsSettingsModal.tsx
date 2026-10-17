import React from 'react';
import { X, Sparkles, Zap, ShieldCheck, Check, Sliders, Monitor, Info } from 'lucide-react';
import { GraphicsPreset } from '../types';

interface GraphicsSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPreset: GraphicsPreset;
  onSelectPreset: (preset: GraphicsPreset) => void;
  renderScale: number;
  onScaleChange: (scale: number) => void;
  currentFps?: number;
}

export const GraphicsSettingsModal: React.FC<GraphicsSettingsModalProps> = ({
  isOpen,
  onClose,
  currentPreset,
  onSelectPreset,
  renderScale,
  onScaleChange,
  currentFps = 60,
}) => {
  if (!isOpen) return null;

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const effectiveDpr = (dpr * renderScale).toFixed(2);

  const presets: {
    id: GraphicsPreset;
    name: string;
    badge: string;
    badgeColor: string;
    description: string;
    specs: { label: string; value: string; isPro?: boolean }[];
    recommended?: boolean;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'LOW',
      name: 'LOW',
      badge: 'Hemat Baterai & Max FPS',
      badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
      description: 'Menonaktifkan efek berat untuk frame rate paling stabil pada perangkat ringan.',
      icon: <Zap className="w-5 h-5 text-emerald-400" />,
      specs: [
        { label: 'Bayangan (Shadows)', value: 'Mati (Disabled)' },
        { label: 'Skala Resolusi', value: '0.75x Pixel Ratio' },
        { label: 'Kabut Atmosfir (Fog)', value: 'Mati (Disabled)' },
        { label: 'Animasi Air', value: 'Statis (Hemat GPU)' },
      ],
    },
    {
      id: 'MEDIUM',
      name: 'MEDIUM',
      badge: 'Default & Direkomendasikan',
      badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      description: 'Pengaturan standar optimal. Grafis indah berdimensi dengan performa stabil 40-60 FPS.',
      recommended: true,
      icon: <ShieldCheck className="w-5 h-5 text-amber-400" />,
      specs: [
        { label: 'Bayangan (Shadows)', value: '512×512 Soft Shadows' },
        { label: 'Skala Resolusi', value: '1.0x Pixel Ratio' },
        { label: 'Kabut Atmosfir (Fog)', value: 'FogExp2 Halus Aktif' },
        { label: 'Animasi Air', value: 'Zero-CPU Bobbing' },
      ],
    },
    {
      id: 'HIGH',
      name: 'HIGH',
      badge: 'Visual Sinematik',
      badgeColor: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
      description: 'Kualitas grafis maksimal dengan ombak air low-poly dan bayangan tajam beresolusi tinggi.',
      icon: <Sparkles className="w-5 h-5 text-purple-400" />,
      specs: [
        { label: 'Bayangan (Shadows)', value: '1024×1024 High-Res' },
        { label: 'Skala Resolusi', value: '1.25x Pixel Ratio' },
        { label: 'Kabut Atmosfir (Fog)', value: 'FogExp2 Penuh Berwarna' },
        { label: 'Animasi Air', value: 'Ombak Sinusoide Low-Poly' },
      ],
    },
  ];

  const quickScales: { label: string; scale: number; presetMatch?: GraphicsPreset }[] = [
    { label: '0.50x', scale: 0.5 },
    { label: '0.75x (Low)', scale: 0.75, presetMatch: 'LOW' },
    { label: '1.00x (Med)', scale: 1.0, presetMatch: 'MEDIUM' },
    { label: '1.25x (High)', scale: 1.25, presetMatch: 'HIGH' },
    { label: '1.50x', scale: 1.5 },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="graphics-settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 id="graphics-settings-title" className="text-sm sm:text-base font-bold text-white tracking-wide">
                Pengatur Grafis & Resolusi Render
              </h2>
              <p className="text-[11px] text-slate-400">
                Pilih profil visual yang sesuai dengan kenyamanan dan performa perangkat Anda
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs font-mono text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{currentFps > 0 ? `${currentFps} FPS` : '60 FPS'}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup modal pengatur grafis"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Custom Preset Notice Banner if Active */}
          {currentPreset === 'CUSTOM' && (
            <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-700/50 flex items-center justify-between gap-3 text-xs text-cyan-200">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                <span>
                  <strong>Profil Kustom Aktif:</strong> Skala resolusi disesuaikan manual menjadi{' '}
                  <span className="font-mono font-bold text-cyan-300">{renderScale.toFixed(2)}x</span>.
                </span>
              </div>
              <button
                type="button"
                onClick={() => onSelectPreset('MEDIUM')}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors shrink-0"
              >
                Reset ke Standar (Medium)
              </button>
            </div>
          )}

          {/* Section: Render Resolution Scale Slider */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-cyan-400" />
                <span className="text-xs sm:text-sm font-bold text-white">
                  Skala Resolusi Render (Resolution Scale)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-cyan-300 px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-800/80">
                  {renderScale.toFixed(2)}x
                </span>
                <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
                  (DPR: {effectiveDpr})
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Mengubah kerapatan piksel buffer canvas 3D langsung via{' '}
              <code className="text-cyan-300 font-mono text-[10px]">renderer.setPixelRatio</code>. UI dan teks tetap 100% tajam tanpa merusak tata letak.
            </p>

            <div className="space-y-1.5 pt-1">
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.05"
                value={renderScale}
                onChange={(e) => onScaleChange(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 hover:accent-cyan-300 transition-all"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-400 px-0.5">
                <span>0.5x (Ringan)</span>
                <span className="text-emerald-400">0.75x (Low)</span>
                <span className="text-amber-400">1.0x (Med)</span>
                <span className="text-purple-400">1.25x (High)</span>
                <span>1.5x</span>
              </div>
            </div>

            {/* Quick buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              {quickScales.map((item) => {
                const isSelected = Math.abs(renderScale - item.scale) < 0.02;
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
                    className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400 shadow-sm shadow-cyan-500/20'
                        : 'bg-slate-800/70 text-slate-400 border-slate-700 hover:border-slate-600 hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Presets List */}
          <div>
            <span className="text-xs font-bold text-slate-300 block mb-2.5">
              Profil Preset Lengkap (Shadows, Fog & Water)
            </span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {presets.map((p) => {
                const isSelected = currentPreset === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => onSelectPreset(p.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectPreset(p.id);
                      }
                    }}
                    className={`relative flex flex-col justify-between p-4 rounded-xl border text-left cursor-pointer transition-all duration-200 select-none ${
                      isSelected
                        ? 'bg-slate-800/90 border-emerald-500 ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-500/10'
                        : 'bg-slate-800/40 border-slate-700/70 hover:border-slate-600 hover:bg-slate-800/60'
                    }`}
                  >
                    {/* Top Row: Icon + Preset Name + Recommended Tag */}
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-700/60">
                            {p.icon}
                          </div>
                          <span className="font-bold text-base text-white">{p.name}</span>
                        </div>
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        ) : p.recommended ? (
                          <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Default
                          </span>
                        ) : null}
                      </div>

                      <div className="mb-2">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border inline-block ${p.badgeColor}`}>
                          {p.badge}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-300 leading-relaxed mb-3">
                        {p.description}
                      </p>
                    </div>

                    {/* Specs Breakdown */}
                    <div className="pt-3 border-t border-slate-700/60 space-y-1.5 text-[10px] sm:text-[11px]">
                      {p.specs.map((spec, i) => (
                        <div key={i} className="flex items-center justify-between text-slate-300">
                          <span className="text-slate-400">{spec.label}:</span>
                          <span className="font-semibold text-slate-200 text-right">{spec.value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Select button action */}
                    <div className="mt-4 pt-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPreset(p.id);
                        }}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition-colors ${
                          isSelected
                            ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                            : 'bg-slate-700/60 text-slate-200 hover:bg-slate-700'
                        }`}
                      >
                        {isSelected ? '✓ Aktif' : `Pilih ${p.name}`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Visual Details Infobox */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-emerald-400 text-xs">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Detail Optimasi & Pengaturan Grafis</span>
            </div>
            <ul className="text-[11px] text-slate-400 space-y-1 list-disc list-inside">
              <li>
                <strong className="text-slate-200">Koneksi Skala Resolusi:</strong> Low menggunakan 0.75x, Medium menggunakan 1.0x, dan High menggunakan 1.25x. Menggeser slider secara manual akan mengaktifkan status <em>Kustom</em>.
              </li>
              <li>
                <strong className="text-slate-200">Isolasi Layout HTML:</strong> Perubahan resolusi hanya memengaruhi canvas WebGL Three.js dan tidak memengaruhi ukuran tombol atau tata letak navigasi.
              </li>
            </ul>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-slate-900/90 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">
              Preset aktif:{' '}
              <strong className="text-emerald-400 font-bold">
                {currentPreset === 'CUSTOM' ? 'Kustom' : currentPreset}
              </strong>
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400 font-mono">
              Skala: <strong className="text-cyan-300 font-bold">{renderScale.toFixed(2)}x</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors shadow-lg shadow-emerald-600/20"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
