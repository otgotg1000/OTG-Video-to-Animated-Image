import type { OutputFormat } from '../types/studio';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exp = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, exp);
  return `${value >= 100 || exp === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exp]}`;
}

export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.00';
  const totalCs = Math.round(seconds * 100);
  const mins = Math.floor(totalCs / 6000);
  const secs = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  const cc = String(cs).padStart(2, '0');
  return `${mm}:${ss}.${cc}`;
}

export function parseTimecode(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Support plain seconds like "4.5"
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const val = Number(trimmed);
    return Number.isFinite(val) ? val : null;
  }

  // Support MM:SS or MM:SS.ms
  const match = trimmed.match(/^(\d{1,3}):(\d{1,2}(?:\.\d+)?)$/);
  if (!match) return null;

  const mins = Number(match[1]);
  const secs = Number(match[2]);
  if (!Number.isFinite(mins) || !Number.isFinite(secs) || secs >= 60) return null;
  return mins * 60 + secs;
}

export function estimateFrameCount(
  trimStart: number,
  trimEnd: number,
  fps: number,
  speed = 1,
  playMode: 'forward' | 'reverse' | 'pingpong' = 'forward',
  loopCrossfadeFrames = 0
): number {
  const rawDuration = Math.max(0.05, trimEnd - trimStart);
  const effectiveDuration = rawDuration / Math.max(0.25, speed);
  const baseCount = Math.max(1, Math.round(effectiveDuration * fps));
  if (playMode === 'pingpong' && baseCount >= 3) {
    return baseCount * 2 - 2;
  }
  if (loopCrossfadeFrames > 0 && baseCount > 4) {
    const blendCount = Math.min(loopCrossfadeFrames, Math.floor(baseCount / 3));
    return Math.max(1, baseCount - blendCount);
  }
  return baseCount;
}

export function buildOutputFilename(sourceName: string, format: OutputFormat): string {
  const base = sourceName.replace(/\.[^/.]+$/, '').trim() || 'animation';
  const ext = format === 'webp' ? 'webp' : format === 'gif' ? 'gif' : 'png';
  return `${base}.${ext}`;
}
