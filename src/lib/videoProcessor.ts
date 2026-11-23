import type {
  CapturedFrame,
  ConversionJob,
  ConversionSettings,
  EncodedOutput,
  SourceMedia,
} from '../types/studio';
import { encodeApng } from './apngEncoder';
import { buildOutputFilename } from './formatters';
import { encodeGif } from './gifEncoder';
import { muxAnimatedWebp, type WebpFrameInput } from './webpMuxer';

async function waitForSeek(video: HTMLVideoElement, targetTime: number): Promise<void> {
  if (Math.abs(video.currentTime - targetTime) < 0.0005 && video.readyState >= 2) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve();
      }
    }, 1500);

    const onSeeked = () => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve();
      }
    };

    const onError = () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error('Video frame seek failed while reading source stream.'));
      }
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };

    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = targetTime;
  });
}

function buildRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function buildCssFilterString(settings: {
  brightness: number;
  contrast: number;
  saturation: number;
}): string {
  const parts: string[] = [];
  if (settings.brightness !== 100) parts.push(`brightness(${settings.brightness}%)`);
  if (settings.contrast !== 100) parts.push(`contrast(${settings.contrast}%)`);
  if (settings.saturation !== 100) parts.push(`saturate(${settings.saturation}%)`);
  return parts.length > 0 ? parts.join(' ') : 'none';
}

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16) || 0,
      parseInt(clean[1] + clean[1], 16) || 0,
      parseInt(clean[2] + clean[2], 16) || 0,
    ];
  }
  if (clean.length >= 6) {
    return [
      parseInt(clean.slice(0, 2), 16) || 0,
      parseInt(clean.slice(2, 4), 16) || 0,
      parseInt(clean.slice(4, 6), 16) || 0,
    ];
  }
  return [0, 255, 0];
}

function applyChromaKey(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hexColor: string,
  tolerance: number
): void {
  const [kr, kg, kb] = parseHexRgb(hexColor);
  const maxDist = Math.max(8, tolerance * 2.4);
  const innerDist = maxDist * 0.65;
  const outerSq = maxDist * maxDist;
  const innerSq = innerDist * innerDist;
  const band = Math.max(1, maxDist - innerDist);

  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;

    const dr = data[i] - kr;
    const dg = data[i + 1] - kg;
    const db = data[i + 2] - kb;
    const distSq = dr * dr + dg * dg + db * db;

    if (distSq <= innerSq) {
      data[i + 3] = 0;
    } else if (distSq < outerSq) {
      const dist = Math.sqrt(distSq);
      const ratio = (dist - innerDist) / band;
      data[i + 3] = Math.min(a, Math.round(ratio * 255));
    }
  }

  ctx.putImageData(img, 0, 0);
}

function drawCaptionOverlay(
  ctx: CanvasRenderingContext2D,
  targetWidth: number,
  targetHeight: number,
  settings: ConversionSettings
): void {
  const text = settings.captionText.trim();
  if (!text) return;

  const fontSize = Math.max(10, Math.min(96, Math.round((settings.captionSize / 480) * targetWidth)));
  const padX = Math.max(10, Math.round(targetWidth * 0.035));
  const padY = Math.max(10, Math.round(targetHeight * 0.045));

  ctx.save();
  ctx.filter = 'none';
  ctx.globalAlpha = Math.max(0.1, Math.min(1, settings.captionOpacity / 100));
  ctx.font = `700 ${fontSize}px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = settings.captionColor || '#FFFFFF';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.16));

  let x = targetWidth / 2;
  let y = targetHeight - padY;

  if (settings.captionPosition === 'top') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    x = targetWidth / 2;
    y = padY;
  } else if (settings.captionPosition === 'bottom-right') {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    x = targetWidth - padX;
    y = targetHeight - padY;
  } else {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    x = targetWidth / 2;
    y = targetHeight - padY;
  }

  ctx.strokeText(text, x, y, targetWidth - padX * 2);
  ctx.fillText(text, x, y, targetWidth - padX * 2);
  ctx.restore();
}

/**
 * Renders a single video frame onto target canvas with crop, rotation, flip,
 * color adjustments, optional chroma key alpha, rounded-corner alpha clipping,
 * sticker border stroke, and optional caption/watermark overlay.
 */
export function drawStyledVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  settings: ConversionSettings
): void {
  const sx = Math.max(0, Math.min(sourceWidth - 16, Math.round(settings.crop.x)));
  const sy = Math.max(0, Math.min(sourceHeight - 16, Math.round(settings.crop.y)));
  const sw = Math.max(16, Math.min(sourceWidth - sx, Math.round(settings.crop.width)));
  const sh = Math.max(16, Math.min(sourceHeight - sy, Math.round(settings.crop.height)));

  const radiusPx =
    settings.cornerRadius > 0
      ? Math.min(targetWidth, targetHeight) * (settings.cornerRadius / 100)
      : 0;

  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.save();

  if (radiusPx > 0) {
    buildRoundedRectPath(ctx, 0, 0, targetWidth, targetHeight, radiusPx);
    ctx.clip();
  }

  ctx.filter = buildCssFilterString(settings);

  const isQuarterTurn = settings.rotation === 90 || settings.rotation === 270;
  const drawW = isQuarterTurn ? targetHeight : targetWidth;
  const drawH = isQuarterTurn ? targetWidth : targetHeight;

  ctx.translate(targetWidth / 2, targetHeight / 2);
  if (settings.rotation !== 0) {
    ctx.rotate((settings.rotation * Math.PI) / 180);
  }
  if (settings.flipH || settings.flipV) {
    ctx.scale(settings.flipH ? -1 : 1, settings.flipV ? -1 : 1);
  }

  ctx.drawImage(video, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();

  if (settings.chromaKeyEnabled) {
    applyChromaKey(
      ctx,
      targetWidth,
      targetHeight,
      settings.chromaKeyColor,
      settings.chromaKeyTolerance
    );
  }

  // Draw crisp sticker outline inside the rounded boundary
  if (settings.borderWidth > 0) {
    const strokeW = Math.min(settings.borderWidth, Math.min(targetWidth, targetHeight) / 4);
    const half = strokeW / 2;
    ctx.save();
    ctx.filter = 'none';
    ctx.strokeStyle = settings.borderColor || '#FFFFFF';
    ctx.lineWidth = strokeW;
    buildRoundedRectPath(
      ctx,
      half,
      half,
      targetWidth - strokeW,
      targetHeight - strokeW,
      Math.max(0, radiusPx - half)
    );
    ctx.stroke();
    ctx.restore();
  }

  if (settings.captionText.trim()) {
    ctx.save();
    if (radiusPx > 0) {
      buildRoundedRectPath(ctx, 0, 0, targetWidth, targetHeight, radiusPx);
      ctx.clip();
    }
    drawCaptionOverlay(ctx, targetWidth, targetHeight, settings);
    ctx.restore();
  }
}

export async function captureSingleFramePngBlob(
  video: HTMLVideoElement,
  sourceWidth: number,
  sourceHeight: number,
  settings: ConversionSettings
): Promise<Blob> {
  const targetWidth = Math.max(16, Math.round(settings.width));
  const targetHeight = Math.max(16, Math.round(settings.height));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Unable to create 2D canvas context for still frame export.');
  }

  drawStyledVideoFrame(ctx, video, sourceWidth, sourceHeight, targetWidth, targetHeight, settings);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    throw new Error('Failed to encode still PNG frame.');
  }
  return blob;
}

export async function probeAndExtractThumbnails(file: File): Promise<SourceMedia> {
  const isMkv = file.name.toLowerCase().endsWith('.mkv');
  const mediaBlob: Blob =
    isMkv && (!file.type || file.type === 'application/octet-stream')
      ? new Blob([file], { type: 'video/x-matroska' })
      : file;
  const objectUrl = URL.createObjectURL(mediaBlob);

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = objectUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      const onLoadedData = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(
          new Error(
            isMkv
              ? 'Unable to decode this MKV file in your browser. Chromium browsers support MKV with H.264, VP8, VP9, or AV1 video; HEVC (H.265) or other codecs may need to be remuxed to MP4 first.'
              : 'Unable to decode this video file in your browser. Please verify it is a valid MP4 (H.264), MKV (H.264/VP9/AV1), MOV, or WebM clip.'
          )
        );
      };
      const cleanup = () => {
        video.removeEventListener('loadeddata', onLoadedData);
        video.removeEventListener('error', onError);
      };
      video.addEventListener('loadeddata', onLoadedData);
      video.addEventListener('error', onError);
      video.load();
    });

    const width = video.videoWidth;
    const height = video.videoHeight;
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

    if (!width || !height || duration <= 0) {
      throw new Error('This file does not contain a readable video track.');
    }

    const thumbCount = 10;
    const thumbHeight = 56;
    const thumbWidth = Math.max(32, Math.round((width / height) * thumbHeight));
    const canvas = document.createElement('canvas');
    canvas.width = thumbWidth;
    canvas.height = thumbHeight;
    const ctx = canvas.getContext('2d');
    const thumbnails: string[] = [];

    if (ctx) {
      for (let i = 0; i < thumbCount; i++) {
        const t = Math.min(duration - 0.01, (i / thumbCount) * duration + 0.01);
        await waitForSeek(video, Math.max(0, t));
        ctx.drawImage(video, 0, 0, thumbWidth, thumbHeight);
        thumbnails.push(canvas.toDataURL('image/jpeg', 0.72));
      }
    }

    return {
      file,
      objectUrl,
      name: file.name,
      size: file.size,
      width,
      height,
      duration,
      thumbnails,
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

export async function captureVideoFrames(
  source: SourceMedia,
  settings: ConversionSettings,
  onProgress: (job: ConversionJob) => void,
  signal: AbortSignal
): Promise<CapturedFrame[]> {
  const rawDuration = Math.max(0.05, settings.trimEnd - settings.trimStart);
  const speed = Math.max(0.25, settings.speed || 1);
  const effectiveDuration = rawDuration / speed;
  const baseCount = Math.max(1, Math.round(effectiveDuration * settings.fps));
  const frameDurationMs = Math.max(10, Math.round(1000 / settings.fps));

  const targetWidth = Math.max(16, Math.round(settings.width));
  const targetHeight = Math.max(16, Math.round(settings.height));

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = source.objectUrl;

  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Failed to load video stream for frame extraction.'));
    };
    const cleanup = () => {
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('error', onError);
    video.load();
  });

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Could not initialize 2D canvas context for frame rendering.');
  }

  const thumbCanvas = document.createElement('canvas');
  const thumbH = 72;
  const thumbW = Math.max(24, Math.round((targetWidth / targetHeight) * thumbH));
  thumbCanvas.width = thumbW;
  thumbCanvas.height = thumbH;
  const thumbCtx = thumbCanvas.getContext('2d');

  const baseFrames: CapturedFrame[] = [];

  for (let i = 0; i < baseCount; i++) {
    if (signal.aborted) {
      throw new DOMException('Conversion cancelled by user.', 'AbortError');
    }

    const timestamp = Math.min(
      source.duration - 0.005,
      Math.max(0, settings.trimStart + (i * speed) / settings.fps)
    );

    await waitForSeek(video, timestamp);

    if (signal.aborted) {
      throw new DOMException('Conversion cancelled by user.', 'AbortError');
    }

    drawStyledVideoFrame(
      ctx,
      video,
      source.width,
      source.height,
      targetWidth,
      targetHeight,
      settings
    );

    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const rgbaBuffer = imageData.data.slice().buffer;

    let previewUrl = '';
    if (thumbCtx) {
      thumbCtx.clearRect(0, 0, thumbW, thumbH);
      thumbCtx.drawImage(canvas, 0, 0, thumbW, thumbH);
      previewUrl = thumbCanvas.toDataURL('image/png');
    }

    baseFrames.push({
      id: `f-${i}-${Math.random().toString(36).slice(2, 7)}`,
      index: i,
      timestamp,
      durationMs: frameDurationMs,
      previewUrl,
      rgbaBuffer,
      width: targetWidth,
      height: targetHeight,
    });

    const progressPct = Math.round(((i + 1) / baseCount) * 70);
    onProgress({
      phase: 'extracting',
      progress: progressPct,
      currentFrame: i + 1,
      totalFrames: baseCount,
      statusText: `Capturing frame ${i + 1} of ${baseCount}`,
      errorMessage: null,
    });

    await new Promise<void>((r) => window.setTimeout(r, 0));
  }

  let sequence: CapturedFrame[];
  if (settings.playMode === 'reverse') {
    sequence = [...baseFrames].reverse();
  } else if (settings.playMode === 'pingpong' && baseFrames.length >= 3) {
    const tail = baseFrames
      .slice(1, -1)
      .reverse()
      .map((frame, idx) => ({
        ...frame,
        id: `${frame.id}-pp-${idx}`,
      }));
    sequence = [...baseFrames, ...tail];
  } else {
    sequence = baseFrames;
  }

  // Seamless loop crossfade: blend tail k frames smoothly into opening k frames
  if (
    settings.playMode !== 'pingpong' &&
    settings.loopCrossfadeFrames > 0 &&
    sequence.length > 4
  ) {
    const blendCount = Math.min(settings.loopCrossfadeFrames, Math.floor(sequence.length / 3));
    if (blendCount > 0) {
      const head = sequence.slice(0, sequence.length - blendCount);
      const tail = sequence.slice(sequence.length - blendCount);
      const blendCanvas = document.createElement('canvas');
      blendCanvas.width = targetWidth;
      blendCanvas.height = targetHeight;
      const blendCtx = blendCanvas.getContext('2d');

      for (let i = 0; i < blendCount; i++) {
        const aBytes = new Uint8ClampedArray(tail[i].rgbaBuffer);
        const bBytes = new Uint8ClampedArray(head[i].rgbaBuffer);
        const outBytes = new Uint8ClampedArray(aBytes.length);
        const weightB = (i + 1) / (blendCount + 1);
        const weightA = 1 - weightB;

        for (let p = 0; p < outBytes.length; p++) {
          outBytes[p] = Math.round(aBytes[p] * weightA + bBytes[p] * weightB);
        }

        let previewUrl = head[i].previewUrl;
        if (blendCtx && thumbCtx) {
          blendCtx.putImageData(new ImageData(outBytes, targetWidth, targetHeight), 0, 0);
          thumbCtx.clearRect(0, 0, thumbW, thumbH);
          thumbCtx.drawImage(blendCanvas, 0, 0, thumbW, thumbH);
          previewUrl = thumbCanvas.toDataURL('image/png');
        }

        head[i] = {
          ...head[i],
          rgbaBuffer: outBytes.buffer,
          previewUrl,
        };
      }
      sequence = head;
    }
  }

  const normalized = sequence.map((f, idx) => ({
    ...f,
    index: idx,
    durationMs:
      idx === sequence.length - 1 && settings.holdLastFrameMs > 0
        ? f.durationMs + settings.holdLastFrameMs
        : f.durationMs,
  }));

  return normalized;
}

/**
 * Merges consecutive near-identical frames by summing their durations into the retained frame.
 */
export function deduplicateStaticFrames(
  frames: CapturedFrame[],
  meanChannelDiffThreshold = 2.2
): { frames: CapturedFrame[]; removedCount: number } {
  if (frames.length <= 1) {
    return { frames, removedCount: 0 };
  }

  const result: CapturedFrame[] = [{ ...frames[0] }];
  let removedCount = 0;

  for (let i = 1; i < frames.length; i++) {
    const prev = result[result.length - 1];
    const curr = frames[i];

    const prevBytes = new Uint8Array(prev.rgbaBuffer);
    const currBytes = new Uint8Array(curr.rgbaBuffer);

    let isDuplicate = false;
    if (prevBytes.length === currBytes.length && prevBytes.length > 0) {
      // Sample evenly across up to ~12,000 RGBA bytes for fast comparison
      const stride = Math.max(4, Math.floor(prevBytes.length / 12000) * 4);
      let totalDiff = 0;
      let samples = 0;
      for (let p = 0; p < prevBytes.length; p += stride) {
        totalDiff +=
          Math.abs(prevBytes[p] - currBytes[p]) +
          Math.abs(prevBytes[p + 1] - currBytes[p + 1]) +
          Math.abs(prevBytes[p + 2] - currBytes[p + 2]) +
          Math.abs(prevBytes[p + 3] - currBytes[p + 3]);
        samples += 4;
      }
      const meanDiff = samples > 0 ? totalDiff / samples : 255;
      isDuplicate = meanDiff <= meanChannelDiffThreshold;
    }

    if (isDuplicate) {
      prev.durationMs = Math.min(10000, prev.durationMs + curr.durationMs);
      removedCount++;
    } else {
      result.push({ ...curr });
    }
  }

  return {
    frames: result.map((f, idx) => ({ ...f, index: idx })),
    removedCount,
  };
}

async function encodePass(
  frames: CapturedFrame[],
  width: number,
  height: number,
  format: ConversionSettings['format'],
  quality: number,
  loopCount: number,
  signal: AbortSignal
): Promise<Uint8Array> {
  const srcW = frames[0].width;
  const srcH = frames[0].height;
  const needsScale = width !== srcW || height !== srcH;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext('2d');

  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: format === 'apng' });

  if (!srcCtx || !outCtx) {
    throw new Error('Could not initialize canvas for encoding.');
  }

  if (format === 'webp') {
    const q = Math.max(0.05, Math.min(1, quality / 100));
    const webpInputs: WebpFrameInput[] = [];

    for (let i = 0; i < frames.length; i++) {
      if (signal.aborted) {
        throw new DOMException('Conversion cancelled by user.', 'AbortError');
      }
      const f = frames[i];
      const imgData = new ImageData(new Uint8ClampedArray(f.rgbaBuffer), srcW, srcH);

      if (needsScale) {
        srcCtx.putImageData(imgData, 0, 0);
        outCtx.clearRect(0, 0, width, height);
        outCtx.drawImage(srcCanvas, 0, 0, width, height);
      } else {
        outCtx.putImageData(imgData, 0, 0);
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        outCanvas.toBlob((b) => resolve(b), 'image/webp', q)
      );
      if (!blob) {
        throw new Error('Canvas failed to encode WebP frame.');
      }
      webpInputs.push({
        webpBuffer: await blob.arrayBuffer(),
        durationMs: f.durationMs,
      });
    }

    return muxAnimatedWebp(webpInputs, width, height, loopCount);
  }

  const rgbaBuffers: ArrayBuffer[] = [];
  const delaysMs: number[] = [];

  for (let i = 0; i < frames.length; i++) {
    if (signal.aborted) {
      throw new DOMException('Conversion cancelled by user.', 'AbortError');
    }
    const f = frames[i];
    if (needsScale) {
      const imgData = new ImageData(new Uint8ClampedArray(f.rgbaBuffer), srcW, srcH);
      srcCtx.putImageData(imgData, 0, 0);
      outCtx.clearRect(0, 0, width, height);
      outCtx.drawImage(srcCanvas, 0, 0, width, height);
      rgbaBuffers.push(outCtx.getImageData(0, 0, width, height).data.slice().buffer);
    } else {
      rgbaBuffers.push(f.rgbaBuffer);
    }
    delaysMs.push(f.durationMs);
  }

  return format === 'gif'
    ? encodeGif(rgbaBuffers, width, height, delaysMs, quality, loopCount)
    : encodeApng(rgbaBuffers, width, height, delaysMs, quality, loopCount);
}

export async function encodeCapturedFrames(
  frames: CapturedFrame[],
  sourceName: string,
  settings: ConversionSettings,
  onProgress: (job: ConversionJob) => void,
  signal: AbortSignal
): Promise<EncodedOutput> {
  if (frames.length === 0) {
    throw new Error('At least one frame is required to encode.');
  }

  const startedAt = performance.now();
  const baseW = frames[0].width;
  const baseH = frames[0].height;

  onProgress({
    phase: 'encoding',
    progress: 80,
    currentFrame: frames.length,
    totalFrames: frames.length,
    statusText:
      settings.format === 'webp'
        ? 'Muxing Animated WebP container...'
        : settings.format === 'gif'
        ? 'Quantizing & encoding Animated GIF...'
        : 'Compressing APNG frames...',
    errorMessage: null,
  });

  await new Promise<void>((r) => window.setTimeout(r, 12));

  let activeWidth = baseW;
  let activeHeight = baseH;
  let activeQuality = settings.quality;
  let optimizedToTarget = false;

  let outputBytes = await encodePass(
    frames,
    activeWidth,
    activeHeight,
    settings.format,
    activeQuality,
    settings.loopCount,
    signal
  );

  if (settings.targetMaxSizeKb && settings.targetMaxSizeKb > 0) {
    const targetBytes = settings.targetMaxSizeKb * 1024;
    if (outputBytes.length > targetBytes) {
      const attempts: Array<{ quality: number; scale: number }> = [
        { quality: Math.min(settings.quality - 18, 72), scale: 1 },
        { quality: Math.min(settings.quality - 34, 54), scale: 1 },
        { quality: 36, scale: 1 },
        { quality: 24, scale: 1 },
        { quality: 52, scale: 0.75 },
        { quality: 34, scale: 0.75 },
        { quality: 45, scale: 0.55 },
        { quality: 28, scale: 0.55 },
      ].filter((a) => a.quality >= 12);

      for (let i = 0; i < attempts.length; i++) {
        const attempt = attempts[i];
        const nextW = Math.max(16, Math.round(baseW * attempt.scale));
        const nextH = Math.max(16, Math.round(baseH * attempt.scale));

        onProgress({
          phase: 'encoding',
          progress: Math.min(97, 82 + i * 2),
          currentFrame: frames.length,
          totalFrames: frames.length,
          statusText: `Optimizing for ${settings.targetMaxSizeKb} KB target (${attempt.quality}% q)...`,
          errorMessage: null,
        });

        await new Promise<void>((r) => window.setTimeout(r, 10));

        const candidate = await encodePass(
          frames,
          nextW,
          nextH,
          settings.format,
          attempt.quality,
          settings.loopCount,
          signal
        );

        if (candidate.length < outputBytes.length) {
          outputBytes = candidate;
          activeWidth = nextW;
          activeHeight = nextH;
          activeQuality = attempt.quality;
        }

        if (outputBytes.length <= targetBytes) {
          optimizedToTarget = true;
          break;
        }
      }
    }
  }

  const totalDurationMs = frames.reduce((acc, f) => acc + f.durationMs, 0);
  const mimeType =
    settings.format === 'webp'
      ? 'image/webp'
      : settings.format === 'gif'
      ? 'image/gif'
      : 'image/png';
  const blobBuffer = outputBytes.slice().buffer;
  const blob = new Blob([blobBuffer], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const elapsedMs = Math.round(performance.now() - startedAt);

  return {
    id: `out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    blob,
    objectUrl,
    format: settings.format,
    size: blob.size,
    frameCount: frames.length,
    width: activeWidth,
    height: activeHeight,
    duration: Number((totalDurationMs / 1000).toFixed(2)),
    fps: settings.fps,
    quality: activeQuality,
    loopCount: settings.loopCount,
    speed: settings.speed,
    playMode: settings.playMode,
    cornerRadius: settings.cornerRadius,
    elapsedMs,
    filename: buildOutputFilename(sourceName, settings.format),
    optimizedToTarget,
  };
}

export async function convertVideoToAnimation(
  source: SourceMedia,
  settings: ConversionSettings,
  onProgress: (job: ConversionJob) => void,
  signal: AbortSignal
): Promise<{ output: EncodedOutput; capturedFrames: CapturedFrame[] }> {
  const capturedFrames = await captureVideoFrames(source, settings, onProgress, signal);
  const output = await encodeCapturedFrames(
    capturedFrames,
    source.name,
    settings,
    onProgress,
    signal
  );
  return { output, capturedFrames };
}
