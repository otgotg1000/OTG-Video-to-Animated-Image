/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyDropzone } from './components/EmptyDropzone';
import { ExportInspector } from './components/ExportInspector';
import { FormatGuide } from './components/FormatGuide';
import { MediaStage } from './components/MediaStage';
import { type ActiveTab, TopBar } from './components/TopBar';
import {
  buildCustomPresetFromSettings,
  computePresetDimensions,
  loadCustomPresets,
  persistCustomPresets,
} from './lib/presets';
import { generateSampleClipFile } from './lib/sampleVideo';
import {
  captureSingleFramePngBlob,
  captureVideoFrames,
  convertVideoToAnimation,
  deduplicateStaticFrames,
  encodeCapturedFrames,
  probeAndExtractThumbnails,
} from './lib/videoProcessor';
import { isNativeWebpEncodingSupported } from './lib/webpMuxer';
import type {
  CapturedFrame,
  ConversionJob,
  ConversionSettings,
  CropAspectPreset,
  CropRegion,
  CustomPreset,
  EncodedOutput,
  PreviewBackdrop,
  RotationDegrees,
  SourceMedia,
  StageViewMode,
} from './types/studio';

const MAX_HISTORY_ITEMS = 6;

const INITIAL_JOB: ConversionJob = {
  phase: 'idle',
  progress: 0,
  currentFrame: 0,
  totalFrames: 0,
  statusText: '',
  errorMessage: null,
};

function computeDefaultDimensions(srcW: number, srcH: number): { width: number; height: number } {
  const maxWidth = 128;
  if (srcW <= maxWidth) {
    return { width: srcW, height: srcH };
  }
  const scale = maxWidth / srcW;
  return {
    width: maxWidth,
    height: Math.max(16, Math.round(srcH * scale)),
  };
}

function fitCropToAspect(
  srcW: number,
  srcH: number,
  preset: CropAspectPreset
): CropRegion {
  if (preset === 'free') {
    return { x: 0, y: 0, width: srcW, height: srcH };
  }
  const targetRatio =
    preset === '16:9'
      ? 16 / 9
      : preset === '1:1'
      ? 1
      : preset === '4:3'
      ? 4 / 3
      : 9 / 16;

  let width = srcW;
  let height = Math.round(width / targetRatio);
  if (height > srcH) {
    height = srcH;
    width = Math.round(height * targetRatio);
  }
  const x = Math.max(0, Math.round((srcW - width) / 2));
  const y = Math.max(0, Math.round((srcH - height) / 2));
  return {
    x,
    y,
    width: Math.max(16, Math.min(srcW, width)),
    height: Math.max(16, Math.min(srcH, height)),
  };
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('workspace');
  const [webpSupported, setWebpSupported] = useState<boolean>(true);

  const [source, setSource] = useState<SourceMedia | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isGeneratingSample, setIsGeneratingSample] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [settings, setSettings] = useState<ConversionSettings>({
    format: 'apng',
    trimStart: 0,
    trimEnd: 0,
    fps: 30,
    width: 128,
    height: 128,
    lockAspect: true,
    quality: 99,
    loopCount: 0,
    crop: { x: 0, y: 0, width: 128, height: 128 },
    speed: 1,
    playMode: 'forward',
    loopCrossfadeFrames: 0,
    cornerRadius: 18,
    borderWidth: 0,
    borderColor: '#FFFFFF',
    rotation: 0,
    flipH: false,
    flipV: false,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    chromaKeyEnabled: false,
    chromaKeyColor: '#00FF00',
    chromaKeyTolerance: 36,
    captionText: '',
    captionPosition: 'bottom',
    captionColor: '#FFFFFF',
    captionSize: 24,
    captionOpacity: 92,
    holdLastFrameMs: 0,
    targetMaxSizeKb: null,
  });

  const [customPresets, setCustomPresets] = useState<CustomPreset[]>(() => loadCustomPresets());
  const [cropAspect, setCropAspect] = useState<CropAspectPreset>('1:1');
  const [isCropEditing, setIsCropEditing] = useState(false);

  const [job, setJob] = useState<ConversionJob>(INITIAL_JOB);
  const [capturedFrames, setCapturedFrames] = useState<CapturedFrame[]>([]);
  const [output, setOutput] = useState<EncodedOutput | null>(null);
  const [exportsHistory, setExportsHistory] = useState<EncodedOutput[]>([]);
  const [viewMode, setViewMode] = useState<StageViewMode>('source');
  const [backdrop, setBackdrop] = useState<PreviewBackdrop>('dark');

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    let active = true;
    isNativeWebpEncodingSupported().then((supported) => {
      if (active) {
        setWebpSupported(supported);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Sync source video playback speed preview
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = settings.speed;
    }
  }, [settings.speed, source]);

  // Keep refs for safe cleanup on unmount
  const sourceUrlRef = useRef<string | null>(null);
  const historyRef = useRef<EncodedOutput[]>([]);
  sourceUrlRef.current = source?.objectUrl ?? null;
  historyRef.current = exportsHistory;

  useEffect(() => {
    return () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      historyRef.current.forEach((item) => URL.revokeObjectURL(item.objectUrl));
      abortRef.current?.abort();
    };
  }, []);

  const pushToHistory = useCallback((encoded: EncodedOutput) => {
    setOutput(encoded);
    setExportsHistory((prev) => {
      const next = [encoded, ...prev];
      if (next.length > MAX_HISTORY_ITEMS) {
        const evicted = next.slice(MAX_HISTORY_ITEMS);
        evicted.forEach((item) => URL.revokeObjectURL(item.objectUrl));
        return next.slice(0, MAX_HISTORY_ITEMS);
      }
      return next;
    });
  }, []);

  const handleOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  const loadVideoFile = useCallback(async (file: File) => {
    setLoadError(null);
    setIsLoadingFile(true);
    try {
      const probed = await probeAndExtractThumbnails(file);

      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      historyRef.current.forEach((item) => URL.revokeObjectURL(item.objectUrl));

      const defaultCrop = fitCropToAspect(probed.width, probed.height, '1:1');
      const dims = computeDefaultDimensions(defaultCrop.width, defaultCrop.height);
      const defaultTrimEnd = Number(probed.duration.toFixed(2));

      setSource(probed);
      setOutput(null);
      setExportsHistory([]);
      setCapturedFrames([]);
      setJob(INITIAL_JOB);
      setViewMode('source');
      setCurrentTime(0);
      setIsPlaying(false);
      setIsCropEditing(false);
      setCropAspect('1:1');
      setActiveTab('workspace');
      setSettings((prev) => ({
        ...prev,
        trimStart: 0,
        trimEnd: defaultTrimEnd,
        width: dims.width,
        height: dims.height,
        rotation: 0,
        flipH: false,
        flipV: false,
        crop: defaultCrop,
      }));
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Unable to read the selected video file.'
      );
    } finally {
      setIsLoadingFile(false);
    }
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      loadVideoFile(file);
    }
  };

  const handleLoadSample = async () => {
    setLoadError(null);
    setIsGeneratingSample(true);
    try {
      const sampleFile = await generateSampleClipFile();
      await loadVideoFile(sampleFile);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Failed to generate sample motion clip.'
      );
    } finally {
      setIsGeneratingSample(false);
    }
  };

  const handleSeek = useCallback((time: number) => {
    const video = videoRef.current;
    setCurrentTime(time);
    if (video) {
      video.currentTime = time;
    }
  }, []);

  const handleTrimChange = useCallback((start: number, end: number) => {
    setSettings((prev) => ({ ...prev, trimStart: start, trimEnd: end }));
    setCurrentTime((prev) => Math.max(start, Math.min(end, prev)));
  }, []);

  const handleResetTrim = useCallback(() => {
    if (!source) return;
    setSettings((prev) => ({ ...prev, trimStart: 0, trimEnd: source.duration }));
  }, [source]);

  const handleTogglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !source) return;
    if (video.paused) {
      if (video.currentTime < settings.trimStart || video.currentTime >= settings.trimEnd) {
        video.currentTime = settings.trimStart;
      }
      video.playbackRate = settings.speed;
      video.play().catch(() => {
        setIsPlaying(false);
      });
    } else {
      video.pause();
    }
  }, [source, settings.trimStart, settings.trimEnd, settings.speed]);

  const handleRestartBoth = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = settings.trimStart;
    setCurrentTime(settings.trimStart);
    video.playbackRate = settings.speed;
    video.play().catch(() => {
      setIsPlaying(false);
    });
  }, [settings.trimStart, settings.speed]);

  const handleVideoTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused && video.currentTime >= settings.trimEnd) {
      video.currentTime = settings.trimStart;
    }
    setCurrentTime(video.currentTime);
  }, [settings.trimStart, settings.trimEnd]);

  // Keyboard shortcuts in Workspace
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'workspace' || !source) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === '[') {
        const minClip = Math.min(0.1, source.duration * 0.1);
        const nextStart = Math.max(0, Math.min(settings.trimEnd - minClip, currentTime));
        handleTrimChange(nextStart, settings.trimEnd);
      } else if (e.key === ']') {
        const minClip = Math.min(0.1, source.duration * 0.1);
        const nextEnd = Math.min(source.duration, Math.max(settings.trimStart + minClip, currentTime));
        handleTrimChange(settings.trimStart, nextEnd);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeTab,
    source,
    currentTime,
    settings.trimStart,
    settings.trimEnd,
    handleTogglePlay,
    handleTrimChange,
  ]);

  const handleUpdateSettings = useCallback((patch: Partial<ConversionSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleRotate = useCallback((delta: 90 | -90) => {
    setSettings((prev) => {
      const nextRot = (((prev.rotation + delta + 360) % 360) as RotationDegrees);
      // Swap output width/height when rotating 90 deg from current orientation
      return {
        ...prev,
        rotation: nextRot,
        width: prev.height,
        height: prev.width,
      };
    });
  }, []);

  const handleSaveCustomPreset = useCallback(
    (name: string) => {
      const preset = buildCustomPresetFromSettings(name, settings);
      setCustomPresets((prev) => {
        const next = [preset, ...prev];
        persistCustomPresets(next);
        return next;
      });
    },
    [settings]
  );

  const handleApplyCustomPreset = useCallback((preset: CustomPreset) => {
    setSettings((prev) => {
      const dims = computePresetDimensions(prev.crop, preset.maxWidth, prev.rotation);
      return {
        ...prev,
        format: preset.format,
        fps: preset.fps,
        width: dims.width,
        height: dims.height,
        quality: preset.quality,
        loopCount: preset.loopCount,
        speed: preset.speed,
        playMode: preset.playMode,
        loopCrossfadeFrames: preset.loopCrossfadeFrames ?? 0,
        cornerRadius: preset.cornerRadius,
        borderWidth: preset.borderWidth,
        borderColor: preset.borderColor,
        holdLastFrameMs: preset.holdLastFrameMs,
        targetMaxSizeKb: preset.targetMaxSizeKb,
        brightness: preset.brightness,
        contrast: preset.contrast,
        saturation: preset.saturation,
        lockAspect: true,
      };
    });
  }, []);

  const handleDeleteCustomPreset = useCallback((id: string) => {
    setCustomPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      persistCustomPresets(next);
      return next;
    });
  }, []);

  const handleCropChange = useCallback((nextCrop: CropRegion) => {
    setSettings((prev) => {
      const isQuarter = prev.rotation === 90 || prev.rotation === 270;
      const orientedW = isQuarter ? nextCrop.height : nextCrop.width;
      const orientedH = isQuarter ? nextCrop.width : nextCrop.height;
      const cropAspectRatio = orientedW / Math.max(1, orientedH);
      const clampedWidth = Math.max(16, Math.min(orientedW, prev.width));
      const nextWidth = prev.lockAspect ? clampedWidth : prev.width;
      const nextHeight = prev.lockAspect
        ? Math.max(16, Math.round(nextWidth / cropAspectRatio))
        : prev.height;

      return {
        ...prev,
        crop: nextCrop,
        width: nextWidth,
        height: nextHeight,
      };
    });
  }, []);

  const handleSelectCropAspect = useCallback(
    (preset: CropAspectPreset) => {
      setCropAspect(preset);
      if (!source) return;
      const fitted = fitCropToAspect(source.width, source.height, preset);
      handleCropChange(fitted);
      setIsCropEditing(true);
      setViewMode('source');
    },
    [source, handleCropChange]
  );

  const handleResetCrop = useCallback(() => {
    if (!source) return;
    setCropAspect('free');
    const fullCrop: CropRegion = {
      x: 0,
      y: 0,
      width: source.width,
      height: source.height,
    };
    setSettings((prev) => {
      const isQuarter = prev.rotation === 90 || prev.rotation === 270;
      const orientedW = isQuarter ? source.height : source.width;
      const orientedH = isQuarter ? source.width : source.height;
      const dims = computeDefaultDimensions(orientedW, orientedH);
      return {
        ...prev,
        crop: fullCrop,
        width: dims.width,
        height: dims.height,
      };
    });
  }, [source]);

  const handleToggleCropEditing = useCallback(() => {
    setIsCropEditing((prev) => {
      const next = !prev;
      if (next) {
        setViewMode('source');
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
      }
      return next;
    });
  }, []);

  const handleConvert = async () => {
    if (!source) return;

    setIsCropEditing(false);

    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setJob({
      phase: 'extracting',
      progress: 0,
      currentFrame: 0,
      totalFrames: 0,
      statusText: 'Preparing video decoder...',
      errorMessage: null,
    });

    try {
      const { output: encoded, capturedFrames: frames } = await convertVideoToAnimation(
        source,
        settings,
        (nextJob) => setJob(nextJob),
        controller.signal
      );

      setCapturedFrames(frames);
      pushToHistory(encoded);
      setViewMode('output');
      setJob({
        phase: 'done',
        progress: 100,
        currentFrame: encoded.frameCount,
        totalFrames: encoded.frameCount,
        statusText: 'Conversion complete',
        errorMessage: null,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setJob({
          ...INITIAL_JOB,
          phase: 'cancelled',
        });
        return;
      }

      setJob({
        phase: 'error',
        progress: 0,
        currentFrame: 0,
        totalFrames: 0,
        statusText: '',
        errorMessage:
          err instanceof Error ? err.message : 'An unexpected error occurred during encoding.',
      });
    }
  };

  const handleCaptureFramesOnly = async () => {
    if (!source) return;
    setIsCropEditing(false);
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setJob({
      phase: 'extracting',
      progress: 0,
      currentFrame: 0,
      totalFrames: 0,
      statusText: 'Extracting frames for editor...',
      errorMessage: null,
    });

    try {
      const frames = await captureVideoFrames(
        source,
        settings,
        (nextJob) => setJob(nextJob),
        controller.signal
      );
      setCapturedFrames(frames);
      setViewMode('frames');
      setJob(INITIAL_JOB);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setJob({ ...INITIAL_JOB, phase: 'cancelled' });
        return;
      }
      setJob({
        phase: 'error',
        progress: 0,
        currentFrame: 0,
        totalFrames: 0,
        statusText: '',
        errorMessage:
          err instanceof Error ? err.message : 'Failed to extract frames.',
      });
    }
  };

  const handleDeleteFrame = useCallback((frameId: string) => {
    setCapturedFrames((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((f) => f.id !== frameId);
    });
  }, []);

  const handleUpdateFrameDelay = useCallback((frameId: string, durationMs: number) => {
    setCapturedFrames((prev) =>
      prev.map((f) => (f.id === frameId ? { ...f, durationMs } : f))
    );
  }, []);

  const handleDuplicateFrame = useCallback((frameId: string) => {
    setCapturedFrames((prev) => {
      const idx = prev.findIndex((f) => f.id === frameId);
      if (idx === -1) return prev;
      const clone: CapturedFrame = {
        ...prev[idx],
        id: `${prev[idx].id}-dup-${Date.now().toString(36)}`,
      };
      return [...prev.slice(0, idx + 1), clone, ...prev.slice(idx + 1)].map((f, i) => ({
        ...f,
        index: i,
      }));
    });
  }, []);

  const handleMoveFrame = useCallback((frameId: string, direction: -1 | 1) => {
    setCapturedFrames((prev) => {
      const idx = prev.findIndex((f) => f.id === frameId);
      const targetIdx = idx + direction;
      if (idx === -1 || targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, item);
      return copy.map((f, i) => ({ ...f, index: i }));
    });
  }, []);

  const handleDeduplicateFrames = useCallback((): number => {
    const { frames: deduped, removedCount } = deduplicateStaticFrames(capturedFrames);
    if (removedCount > 0) {
      setCapturedFrames(deduped);
    }
    return removedCount;
  }, [capturedFrames]);

  const handleGrabStillPng = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !source || video.readyState < 2) return;
    try {
      const blob = await captureSingleFramePngBlob(video, source.width, source.height, settings);
      const url = URL.createObjectURL(blob);
      const base = source.name.replace(/\.[^/.]+$/, '').trim() || 'frame';
      const link = document.createElement('a');
      link.href = url;
      link.download = `${base}-still.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // Ignore transient capture failures cleanly
    }
  }, [source, settings]);

  const handleApplyEditedFrames = async () => {
    if (!source || capturedFrames.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setJob({
      phase: 'encoding',
      progress: 80,
      currentFrame: capturedFrames.length,
      totalFrames: capturedFrames.length,
      statusText: 'Re-encoding edited frames...',
      errorMessage: null,
    });

    try {
      const encoded = await encodeCapturedFrames(
        capturedFrames,
        source.name,
        settings,
        (nextJob) => setJob(nextJob),
        controller.signal
      );
      pushToHistory(encoded);
      setViewMode('output');
      setJob({
        phase: 'done',
        progress: 100,
        currentFrame: encoded.frameCount,
        totalFrames: encoded.frameCount,
        statusText: 'Conversion complete',
        errorMessage: null,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setJob({ ...INITIAL_JOB, phase: 'cancelled' });
        return;
      }
      setJob({
        phase: 'error',
        progress: 0,
        currentFrame: 0,
        totalFrames: 0,
        statusText: '',
        errorMessage:
          err instanceof Error ? err.message : 'Failed to encode edited frames.',
      });
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleDownloadItem = useCallback((item: EncodedOutput) => {
    const link = document.createElement('a');
    link.href = item.objectUrl;
    link.download = item.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, []);

  const handleDownload = () => {
    if (output) handleDownloadItem(output);
  };

  const handleCopyOutput = useCallback(async (): Promise<
    'copied-animation' | 'copied-still' | 'failed'
  > => {
    if (!output || typeof navigator === 'undefined' || !navigator.clipboard || typeof ClipboardItem === 'undefined') {
      return 'failed';
    }

    try {
      if (output.format === 'apng') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': output.blob })]);
        return 'copied-animation';
      }

      const supportsFn = (ClipboardItem as unknown as { supports?: (type: string) => boolean }).supports;
      if (supportsFn && supportsFn(output.blob.type)) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ [output.blob.type]: output.blob })]);
          return 'copied-animation';
        } catch {
          // Fall through to PNG raster copy below
        }
      }

      const bitmap = await createImageBitmap(output.blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close();
        return 'failed';
      }
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!pngBlob) return 'failed';
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      return 'copied-still';
    } catch {
      return 'failed';
    }
  }, [output]);

  const handleSelectHistoryItem = useCallback((item: EncodedOutput) => {
    setOutput(item);
    setViewMode('output');
  }, []);

  const handleClearHistory = useCallback(() => {
    setExportsHistory((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.objectUrl));
      return [];
    });
    setOutput(null);
    setViewMode('source');
  }, []);

  const isBusy =
    isLoadingFile ||
    isGeneratingSample ||
    job.phase === 'extracting' ||
    job.phase === 'encoding';

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-[#0B0D11] text-[#F1F5F9]">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,.mkv,video/x-matroska,video/matroska,video/*"
        onChange={handleFileInputChange}
        className="hidden"
      />

      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenFilePicker={handleOpenFilePicker}
        isBusy={isBusy}
      />

      {activeTab === 'guide' ? (
        <FormatGuide onBackToWorkspace={() => setActiveTab('workspace')} />
      ) : !source ? (
        <EmptyDropzone
          onFileSelected={loadVideoFile}
          onOpenFilePicker={handleOpenFilePicker}
          onLoadSample={handleLoadSample}
          isLoadingFile={isLoadingFile}
          isGeneratingSample={isGeneratingSample}
          loadError={loadError}
        />
      ) : (
        <main
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (isBusy) return;
            const file = e.dataTransfer.files?.[0];
            if (file) loadVideoFile(file);
          }}
          className="flex-1 flex flex-col lg:flex-row min-h-0 lg:overflow-hidden"
        >
          <MediaStage
            source={source}
            settings={settings}
            output={output}
            exportsHistory={exportsHistory}
            capturedFrames={capturedFrames}
            viewMode={viewMode}
            backdrop={backdrop}
            videoRef={videoRef}
            currentTime={currentTime}
            isPlaying={isPlaying}
            isBusy={isBusy}
            cropAspect={cropAspect}
            isCropEditing={isCropEditing}
            onToggleCropEditing={handleToggleCropEditing}
            onCropChange={handleCropChange}
            onResetCrop={handleResetCrop}
            onChangeViewMode={setViewMode}
            onChangeBackdrop={setBackdrop}
            onSeek={handleSeek}
            onTrimChange={handleTrimChange}
            onTogglePlay={handleTogglePlay}
            onRestartBoth={handleRestartBoth}
            onResetTrim={handleResetTrim}
            onTimeUpdate={handleVideoTimeUpdate}
            onPlayStateChange={setIsPlaying}
            onDeleteFrame={handleDeleteFrame}
            onUpdateFrameDelay={handleUpdateFrameDelay}
            onDuplicateFrame={handleDuplicateFrame}
            onMoveFrame={handleMoveFrame}
            onDeduplicateFrames={handleDeduplicateFrames}
            onGrabStillPng={handleGrabStillPng}
            onCaptureFrames={handleCaptureFramesOnly}
            onApplyEditedFrames={handleApplyEditedFrames}
            onSelectHistoryItem={handleSelectHistoryItem}
            onDownloadItem={handleDownloadItem}
            onClearHistory={handleClearHistory}
          />

          <ExportInspector
            source={source}
            settings={settings}
            job={job}
            output={output}
            webpSupported={webpSupported}
            cropAspect={cropAspect}
            isCropEditing={isCropEditing}
            customPresets={customPresets}
            onSaveCustomPreset={handleSaveCustomPreset}
            onApplyCustomPreset={handleApplyCustomPreset}
            onDeleteCustomPreset={handleDeleteCustomPreset}
            onRotate={handleRotate}
            onSelectCropAspect={handleSelectCropAspect}
            onToggleCropEditing={handleToggleCropEditing}
            onCropChange={handleCropChange}
            onResetCrop={handleResetCrop}
            onUpdateSettings={handleUpdateSettings}
            onConvert={handleConvert}
            onCancel={handleCancel}
            onDownload={handleDownload}
            onCopyOutput={handleCopyOutput}
          />
        </main>
      )}
    </div>
  );
}
