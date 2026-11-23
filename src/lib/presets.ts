import type {
  ConversionSettings,
  CropRegion,
  CustomPreset,
  OutputFormat,
  RotationDegrees,
} from '../types/studio';

export interface ExportPreset {
  id: string;
  label: string;
  summary: string;
  format: OutputFormat;
  fps: number;
  maxWidth: number;
  quality: number;
  loopCount: number;
}

export const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: 'webp-demo',
    label: 'Web Demo',
    summary: '15 fps · 720w · 82%',
    format: 'webp',
    fps: 15,
    maxWidth: 720,
    quality: 82,
    loopCount: 0,
  },
  {
    id: 'webp-smooth',
    label: 'Smooth 30fps',
    summary: '30 fps · 960w · 88%',
    format: 'webp',
    fps: 30,
    maxWidth: 960,
    quality: 88,
    loopCount: 0,
  },
  {
    id: 'webp-compact',
    label: 'Compact Clip',
    summary: '12 fps · 480w · 70%',
    format: 'webp',
    fps: 12,
    maxWidth: 480,
    quality: 70,
    loopCount: 0,
  },
  {
    id: 'apng-lossless',
    label: 'Lossless UI',
    summary: '15 fps · 720w · 100%',
    format: 'apng',
    fps: 15,
    maxWidth: 720,
    quality: 100,
    loopCount: 0,
  },
  {
    id: 'apng-sticker',
    label: 'Chat Sticker',
    summary: '20 fps · 320w · 80%',
    format: 'apng',
    fps: 20,
    maxWidth: 320,
    quality: 80,
    loopCount: 0,
  },
  {
    id: 'apng-compact',
    label: 'Compact APNG',
    summary: '12 fps · 480w · 68%',
    format: 'apng',
    fps: 12,
    maxWidth: 480,
    quality: 68,
    loopCount: 0,
  },
  {
    id: 'gif-standard',
    label: 'Web GIF',
    summary: '15 fps · 480w · 80%',
    format: 'gif',
    fps: 15,
    maxWidth: 480,
    quality: 80,
    loopCount: 0,
  },
  {
    id: 'gif-compact',
    label: 'Micro GIF',
    summary: '12 fps · 256w · 65%',
    format: 'gif',
    fps: 12,
    maxWidth: 256,
    quality: 65,
    loopCount: 0,
  },
  {
    id: 'gif-smooth',
    label: 'Crisp GIF',
    summary: '24 fps · 512w · 95%',
    format: 'gif',
    fps: 24,
    maxWidth: 512,
    quality: 95,
    loopCount: 0,
  },
];

export function computePresetDimensions(
  crop: CropRegion,
  maxWidth: number,
  rotation: RotationDegrees = 0
): { width: number; height: number } {
  const isQuarterTurn = rotation === 90 || rotation === 270;
  const orientedW = isQuarterTurn ? crop.height : crop.width;
  const orientedH = isQuarterTurn ? crop.width : crop.height;
  const aspect = orientedW / Math.max(1, orientedH);
  const width = Math.max(16, Math.min(orientedW, maxWidth));
  const height = Math.max(16, Math.round(width / aspect));
  return { width, height };
}

const CUSTOM_PRESETS_KEY = 'frameforge.customPresets.v1';

export function loadCustomPresets(): CustomPreset[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistCustomPresets(presets: CustomPreset[]): void {
  try {
    window.localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // Ignore storage quota / private mode failures gracefully
  }
}

export function buildCustomPresetFromSettings(
  name: string,
  settings: ConversionSettings
): CustomPreset {
  return {
    id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim(),
    format: settings.format,
    fps: settings.fps,
    maxWidth: settings.width,
    quality: settings.quality,
    loopCount: settings.loopCount,
    speed: settings.speed,
    playMode: settings.playMode,
    loopCrossfadeFrames: settings.loopCrossfadeFrames,
    cornerRadius: settings.cornerRadius,
    borderWidth: settings.borderWidth,
    borderColor: settings.borderColor,
    holdLastFrameMs: settings.holdLastFrameMs,
    targetMaxSizeKb: settings.targetMaxSizeKb,
    brightness: settings.brightness,
    contrast: settings.contrast,
    saturation: settings.saturation,
  };
}
