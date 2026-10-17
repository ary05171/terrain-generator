import * as THREE from 'three';
import { BiomeType, LampSettings } from '../types';
import { BIOME_PALETTES } from './terrainGen';

export interface DynamicAtmosphere {
  timeHour: number;
  timeString: string;
  phaseLabel: string;
  isNight: boolean;
  sunPos: [number, number, number];
  sunColor: number;
  sunIntensity: number;
  moonPos: [number, number, number];
  moonColor: number;
  moonIntensity: number;
  skyTopColor: string;
  skyBottomColor: string;
  fogColor: string;
  fogDensity: number;
  hemiSkyColor: number;
  hemiGroundColor: number;
  hemiIntensity: number;
  ambientColor: number;
  ambientIntensity: number;
  lampGlowFactor: number;
}

export function formatTimeHour(timeHour: number): { timeString: string; phaseLabel: string } {
  const normalized = ((timeHour % 24) + 24) % 24;
  const hours = Math.floor(normalized);
  const minutes = Math.floor((normalized - hours) * 60);
  const hh = hours.toString().padStart(2, '0');
  const mm = minutes.toString().padStart(2, '0');
  const timeString = `${hh}:${mm}`;

  let phaseLabel = 'Siang';
  if (normalized >= 4.5 && normalized < 6.5) {
    phaseLabel = 'Fajar (Dawn)';
  } else if (normalized >= 6.5 && normalized < 11.0) {
    phaseLabel = 'Pagi (Morning)';
  } else if (normalized >= 11.0 && normalized < 15.5) {
    phaseLabel = 'Siang (Noon)';
  } else if (normalized >= 15.5 && normalized < 18.0) {
    phaseLabel = 'Sore (Golden Hour)';
  } else if (normalized >= 18.0 && normalized < 19.5) {
    phaseLabel = 'Senja (Sunset)';
  } else if (normalized >= 19.5 && normalized < 23.5) {
    phaseLabel = 'Malam (Night)';
  } else {
    phaseLabel = 'Tengah Malam (Midnight)';
  }

  return { timeString, phaseLabel };
}

// Keyframes around 24 hours for seamless interpolation
interface AtmosphereKeyframe {
  hour: number;
  skyTop: string;
  skyBottom: string;
  fog: string;
  fogDensity: number;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  ambientColor: number;
  ambientIntensity: number;
  lampFactor: number;
}

const KEYFRAMES: AtmosphereKeyframe[] = [
  {
    hour: 0, // Midnight
    skyTop: '#020617',
    skyBottom: '#0b1329',
    fog: '#0b1329',
    fogDensity: 0.0013,
    sunColor: 0x93c5fd,
    sunIntensity: 0.65,
    hemiSky: 0x60a5fa,
    hemiGround: 0x475569,
    hemiIntensity: 0.76,
    ambientColor: 0x64748b,
    ambientIntensity: 0.62,
    lampFactor: 1.0,
  },
  {
    hour: 5.0, // Pre-dawn
    skyTop: '#0f172a',
    skyBottom: '#312e81',
    fog: '#1e1b4b',
    fogDensity: 0.0014,
    sunColor: 0xa5b4fc,
    sunIntensity: 0.60,
    hemiSky: 0x818cf8,
    hemiGround: 0x475569,
    hemiIntensity: 0.78,
    ambientColor: 0x71717a,
    ambientIntensity: 0.65,
    lampFactor: 1.0,
  },
  {
    hour: 6.0, // Dawn
    skyTop: '#3b82f6',
    skyBottom: '#fed7aa',
    fog: '#fed7aa',
    fogDensity: 0.0012,
    sunColor: 0xffedd5,
    sunIntensity: 0.85,
    hemiSky: 0xbae6fd,
    hemiGround: 0x64748b,
    hemiIntensity: 0.84,
    ambientColor: 0xffedd5,
    ambientIntensity: 0.72,
    lampFactor: 0.3,
  },
  {
    hour: 7.5, // Early morning
    skyTop: '#38bdf8',
    skyBottom: '#bae6fd',
    fog: '#c7d2fe',
    fogDensity: 0.0010,
    sunColor: 0xfff7ed,
    sunIntensity: 0.95,
    hemiSky: 0xdbeafe,
    hemiGround: 0x64748b,
    hemiIntensity: 0.88,
    ambientColor: 0xfff7ed,
    ambientIntensity: 0.76,
    lampFactor: 0.0,
  },
  {
    hour: 12.0, // High noon
    skyTop: '#0284c7',
    skyBottom: '#bae6fd',
    fog: '#bae6fd',
    fogDensity: 0.0009,
    sunColor: 0xffffff,
    sunIntensity: 1.05,
    hemiSky: 0xf0fdf4,
    hemiGround: 0x64748b,
    hemiIntensity: 0.94,
    ambientColor: 0xffffff,
    ambientIntensity: 0.82,
    lampFactor: 0.0,
  },
  {
    hour: 16.5, // Late afternoon
    skyTop: '#2563eb',
    skyBottom: '#fed7aa',
    fog: '#fde68a',
    fogDensity: 0.0010,
    sunColor: 0xffedd5,
    sunIntensity: 0.98,
    hemiSky: 0xbae6fd,
    hemiGround: 0x64748b,
    hemiIntensity: 0.88,
    ambientColor: 0xffedd5,
    ambientIntensity: 0.78,
    lampFactor: 0.05,
  },
  {
    hour: 17.5, // Golden hour
    skyTop: '#1d4ed8',
    skyBottom: '#fb923c',
    fog: '#fed7aa',
    fogDensity: 0.0011,
    sunColor: 0xffb74d,
    sunIntensity: 0.92,
    hemiSky: 0xa5b4fc,
    hemiGround: 0x64748b,
    hemiIntensity: 0.86,
    ambientColor: 0xfed7aa,
    ambientIntensity: 0.75,
    lampFactor: 0.65,
  },
  {
    hour: 18.7, // Sunset dusk
    skyTop: '#4338ca',
    skyBottom: '#ea580c',
    fog: '#fdba74',
    fogDensity: 0.0012,
    sunColor: 0xf97316,
    sunIntensity: 0.82,
    hemiSky: 0xc7d2fe,
    hemiGround: 0x52525b,
    hemiIntensity: 0.82,
    ambientColor: 0xfdba74,
    ambientIntensity: 0.72,
    lampFactor: 0.95,
  },
  {
    hour: 20.0, // Twilight into night
    skyTop: '#1e1b4b',
    skyBottom: '#1e293b',
    fog: '#0f172a',
    fogDensity: 0.0013,
    sunColor: 0x60a5fa,
    sunIntensity: 0.70,
    hemiSky: 0x6366f1,
    hemiGround: 0x475569,
    hemiIntensity: 0.78,
    ambientColor: 0x64748b,
    ambientIntensity: 0.65,
    lampFactor: 1.0,
  },
  {
    hour: 24.0, // Loop point
    skyTop: '#020617',
    skyBottom: '#0b1329',
    fog: '#0b1329',
    fogDensity: 0.0013,
    sunColor: 0x93c5fd,
    sunIntensity: 0.65,
    hemiSky: 0x60a5fa,
    hemiGround: 0x475569,
    hemiIntensity: 0.76,
    ambientColor: 0x64748b,
    ambientIntensity: 0.62,
    lampFactor: 1.0,
  },
];

// Helper to interpolate between two hex colors
function lerpHex(hexA: number | string, hexB: number | string, t: number): THREE.Color {
  const colA = new THREE.Color(hexA);
  const colB = new THREE.Color(hexB);
  return colA.lerp(colB, t);
}

function lerpHexString(hexA: string, hexB: string, t: number): string {
  const col = lerpHex(hexA, hexB, t);
  return '#' + col.getHexString();
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Calculates continuous, high-fidelity dynamic atmosphere and sun/moon lighting
 * based on 24-hour timeHour.
 */
export function calculateDynamicAtmosphere(
  timeHour: number,
  biome: BiomeType,
  lampSettings: LampSettings
): DynamicAtmosphere {
  const normalizedHour = ((timeHour % 24) + 24) % 24;
  const { timeString, phaseLabel } = formatTimeHour(normalizedHour);

  // Find bounding keyframes
  let prevKey = KEYFRAMES[0];
  let nextKey = KEYFRAMES[1];

  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    if (normalizedHour >= KEYFRAMES[i].hour && normalizedHour <= KEYFRAMES[i + 1].hour) {
      prevKey = KEYFRAMES[i];
      nextKey = KEYFRAMES[i + 1];
      break;
    }
  }

  const range = nextKey.hour - prevKey.hour || 1;
  const rawT = (normalizedHour - prevKey.hour) / range;
  // Smoothstep interpolation for soft non-linear natural lighting changes
  const t = rawT * rawT * (3 - 2 * rawT);

  // Interpolate atmosphere parameters
  let skyTopColor = lerpHexString(prevKey.skyTop, nextKey.skyTop, t);
  let skyBottomColor = lerpHexString(prevKey.skyBottom, nextKey.skyBottom, t);
  let fogColor = lerpHexString(prevKey.fog, nextKey.fog, t);
  const fogDensity = lerp(prevKey.fogDensity, nextKey.fogDensity, t);

  const sunColor = lerpHex(prevKey.sunColor, nextKey.sunColor, t).getHex();
  const sunIntensity = lerp(prevKey.sunIntensity, nextKey.sunIntensity, t);

  const hemiSkyColor = lerpHex(prevKey.hemiSky, nextKey.hemiSky, t).getHex();
  const hemiGroundColor = lerpHex(prevKey.hemiGround, nextKey.hemiGround, t).getHex();
  const hemiIntensity = lerp(prevKey.hemiIntensity, nextKey.hemiIntensity, t);

  const ambientColor = lerpHex(prevKey.ambientColor, nextKey.ambientColor, t).getHex();
  const ambientIntensity = lerp(prevKey.ambientIntensity, nextKey.ambientIntensity, t);

  // Sun and Moon Celestial Trajectory
  // Day runs roughly 6.0 -> 18.0; Night runs 18.0 -> 6.0
  const isNight = normalizedHour < 5.8 || normalizedHour > 18.5;

  // Solar angle: 0 at 6am (east), pi/2 at 12pm (zenith), pi at 6pm (west)
  const sunAngle = ((normalizedHour - 6) / 12) * Math.PI;
  const sunDist = 95;
  const sunHeight = Math.sin(sunAngle) * 65;
  const sunX = Math.cos(sunAngle) * sunDist * 0.8;
  const sunZ = Math.sin(sunAngle) * 35 + 20;

  const sunPos: [number, number, number] = [
    sunX,
    Math.max(sunHeight, -20),
    sunZ,
  ];

  // Moon travels opposite to the sun
  const moonAngle = sunAngle + Math.PI;
  const moonHeight = Math.sin(moonAngle) * 60;
  const moonX = Math.cos(moonAngle) * sunDist * 0.75;
  const moonZ = Math.sin(moonAngle) * 35 - 20;

  const moonPos: [number, number, number] = [
    moonX,
    Math.max(moonHeight, -20),
    moonZ,
  ];

  // Biome color tint adaptations (e.g. cyberpunk gives neon dusk tint)
  if (biome === 'cyberpunk') {
    skyTopColor = lerpHexString(skyTopColor, '#0a0a1a', 0.5);
    skyBottomColor = lerpHexString(skyBottomColor, '#1e1b4b', 0.4);
    fogColor = lerpHexString(fogColor, '#0f172a', 0.5);
  }

  // Calculate Lamp Light Factor
  let baseLampFactor = lerp(prevKey.lampFactor, nextKey.lampFactor, t);
  if (lampSettings.mode === 'always-on') {
    baseLampFactor = 1.0;
  } else if (lampSettings.mode === 'always-off') {
    baseLampFactor = 0.0;
  }
  const lampGlowFactor = Math.min(2.5, Math.max(0, baseLampFactor * lampSettings.intensity));

  // User-controllable shadow fill / ambient brightness multiplier (0.6x to 2.5x)
  const ambMultiplier = lampSettings.ambientBrightness ?? 1.25;
  const finalAmbientIntensity = ambientIntensity * ambMultiplier;
  const finalHemiIntensity = hemiIntensity * Math.sqrt(ambMultiplier);

  return {
    timeHour: normalizedHour,
    timeString,
    phaseLabel,
    isNight,
    sunPos,
    sunColor,
    sunIntensity: Math.max(0.1, isNight ? sunIntensity * 0.4 : sunIntensity),
    moonPos,
    moonColor: 0x93c5fd,
    moonIntensity: isNight ? 0.75 : 0.0,
    skyTopColor,
    skyBottomColor,
    fogColor,
    fogDensity,
    hemiSkyColor,
    hemiGroundColor,
    hemiIntensity: finalHemiIntensity,
    ambientColor,
    ambientIntensity: finalAmbientIntensity,
    lampGlowFactor,
  };
}
