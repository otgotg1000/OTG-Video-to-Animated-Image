export type OutputFormat = 'webp' | 'apng' | 'gif';

export type StageViewMode = 'source' | 'frames' | 'output' | 'split';

export type PreviewBackdrop = 'dark' | 'checkerboard' | 'light';

export type CropAspectPreset = 'free' | '16:9' | '1:1' | '4:3' | '9:16';

export type PlayMode = 'forward' | 'reverse' | 'pingpong';

export type RotationDegrees = 0 | 90 | 180 | 270;

export type CaptionPosition = 'top' | 'bottom' | 'bottom-right';

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SourceMedia {
  file: File;
  objectUrl: string;
  name: string;
  size: number;
  width: number;
  height: number;
  duration: number;
  thumbnails: string[];
}

export interface ConversionSettings {
  format: OutputFormat;
  trimStart: number;
  trimEnd: number;
  fps: number;
  width: number;
  height: number;
  lockAspect: boolean;
  quality: number; // 1-100
  loopCount: number; // 0 = infinite, 1..100 = finite plays
  crop: CropRegion;
  speed: number; // 0.5 - 4.0
  playMode: PlayMode;
  loopCrossfadeFrames: number; // 0, 4, 8, 12
  cornerRadius: number; // 0 - 50 (% of shortest side)
  borderWidth: number; // 0 - 16 px
  borderColor: string;
  rotation: RotationDegrees;
  flipH: boolean;
  flipV: boolean;
  brightness: number; // 50 - 150 (%)
  contrast: number; // 50 - 150 (%)
  saturation: number; // 0 - 200 (%)
  chromaKeyEnabled: boolean;
  chromaKeyColor: string;
  chromaKeyTolerance: number; // 5 - 100
  captionText: string;
  captionPosition: CaptionPosition;
  captionColor: string;
  captionSize: number; // 12 - 48 px
  captionOpacity: number; // 20 - 100 %
  holdLastFrameMs: number; // extra ms added to final frame
  targetMaxSizeKb: number | null; // null = no limit
}

export interface CustomPreset {
  id: string;
  name: string;
  format: OutputFormat;
  fps: number;
  maxWidth: number;
  quality: number;
  loopCount: number;
  speed: number;
  playMode: PlayMode;
  loopCrossfadeFrames?: number;
  cornerRadius: number;
  borderWidth: number;
  borderColor: string;
  holdLastFrameMs: number;
  targetMaxSizeKb: number | null;
  brightness: number;
  contrast: number;
  saturation: number;
}

export interface CapturedFrame {
  id: string;
  index: number;
  timestamp: number;
  durationMs: number;
  previewUrl: string;
  rgbaBuffer: ArrayBuffer;
  width: number;
  height: number;
}

export type ConversionPhase =
  | 'idle'
  | 'extracting'
  | 'encoding'
  | 'done'
  | 'error'
  | 'cancelled';

export interface ConversionJob {
  phase: ConversionPhase;
  progress: number; // 0-100
  currentFrame: number;
  totalFrames: number;
  statusText: string;
  errorMessage: string | null;
}

export interface EncodedOutput {
  id: string;
  blob: Blob;
  objectUrl: string;
  format: OutputFormat;
  size: number;
  frameCount: number;
  width: number;
  height: number;
  duration: number;
  fps: number;
  quality: number;
  loopCount: number;
  speed: number;
  playMode: PlayMode;
  cornerRadius: number;
  elapsedMs: number;
  filename: string;
  optimizedToTarget: boolean;
}
