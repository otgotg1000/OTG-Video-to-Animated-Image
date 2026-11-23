import React, { useEffect, useRef, useState } from 'react';
import { Camera, Crop, Download, Maximize2, RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import { formatBytes, formatTimecode } from '../lib/formatters';
import { buildCssFilterString, drawStyledVideoFrame } from '../lib/videoProcessor';
import type {
  CapturedFrame,
  ConversionSettings,
  CropAspectPreset,
  CropRegion,
  EncodedOutput,
  PreviewBackdrop,
  SourceMedia,
  StageViewMode,
} from '../types/studio';
import { CropOverlay } from './CropOverlay';
import { FrameEditor } from './FrameEditor';
import { TimelineScrubber } from './TimelineScrubber';

interface MediaStageProps {
  source: SourceMedia;
  settings: ConversionSettings;
  output: EncodedOutput | null;
  exportsHistory: EncodedOutput[];
  capturedFrames: CapturedFrame[];
  viewMode: StageViewMode;
  backdrop: PreviewBackdrop;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  currentTime: number;
  isPlaying: boolean;
  isBusy: boolean;
  cropAspect: CropAspectPreset;
  isCropEditing: boolean;
  onToggleCropEditing: () => void;
  onCropChange: (nextCrop: CropRegion) => void;
  onResetCrop: () => void;
  onChangeViewMode: (mode: StageViewMode) => void;
  onChangeBackdrop: (backdrop: PreviewBackdrop) => void;
  onSeek: (time: number) => void;
  onTrimChange: (start: number, end: number) => void;
  onTogglePlay: () => void;
  onRestartBoth: () => void;
  onResetTrim: () => void;
  onTimeUpdate: () => void;
  onPlayStateChange: (playing: boolean) => void;
  onDeleteFrame: (frameId: string) => void;
  onUpdateFrameDelay: (frameId: string, durationMs: number) => void;
  onDuplicateFrame: (frameId: string) => void;
  onMoveFrame: (frameId: string, direction: -1 | 1) => void;
  onDeduplicateFrames: () => number;
  onGrabStillPng: () => void;
  onCaptureFrames: () => void;
  onApplyEditedFrames: () => void;
  onSelectHistoryItem: (item: EncodedOutput) => void;
  onDownloadItem: (item: EncodedOutput) => void;
  onClearHistory: () => void;
}

export const MediaStage: React.FC<MediaStageProps> = ({
  source,
  settings,
  output,
  exportsHistory,
  capturedFrames,
  viewMode,
  backdrop,
  videoRef,
  currentTime,
  isPlaying,
  isBusy,
  cropAspect,
  isCropEditing,
  onToggleCropEditing,
  onCropChange,
  onResetCrop,
  onChangeViewMode,
  onChangeBackdrop,
  onSeek,
  onTrimChange,
  onTogglePlay,
  onRestartBoth,
  onResetTrim,
  onTimeUpdate,
  onPlayStateChange,
  onDeleteFrame,
  onUpdateFrameDelay,
  onDuplicateFrame,
  onMoveFrame,
  onDeduplicateFrames,
  onGrabStillPng,
  onCaptureFrames,
  onApplyEditedFrames,
  onSelectHistoryItem,
  onDownloadItem,
  onClearHistory,
}) => {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const splitOutputImgRef = useRef<HTMLImageElement | null>(null);
  const [zoomToCrop, setZoomToCrop] = useState(false);

  const backdropClass =
    backdrop === 'checkerboard'
      ? 'studio-checkerboard'
      : backdrop === 'light'
      ? 'bg-[#E2E8F0]'
      : 'bg-[#08090C]';

  const effectiveMode: StageViewMode = isCropEditing
    ? 'source'
    : !output && (viewMode === 'output' || viewMode === 'split')
    ? 'source'
    : viewMode;

  const isCropped =
    settings.crop.x > 0 ||
    settings.crop.y > 0 ||
    settings.crop.width < source.width ||
    settings.crop.height < source.height;

  const hasVisualTransform =
    settings.rotation !== 0 ||
    settings.flipH ||
    settings.flipV ||
    settings.cornerRadius > 0 ||
    settings.borderWidth > 0 ||
    settings.brightness !== 100 ||
    settings.contrast !== 100 ||
    settings.saturation !== 100 ||
    settings.chromaKeyEnabled ||
    Boolean(settings.captionText.trim());

  const showOverlay =
    isCropEditing || isCropped || settings.cornerRadius > 0 || settings.borderWidth > 0;

  const useStyledCanvasPreview =
    effectiveMode === 'source' && !isCropEditing && zoomToCrop;

  // Turn off zoomToCrop if user enters interactive Crop Edit mode
  useEffect(() => {
    if (isCropEditing && zoomToCrop) {
      setZoomToCrop(false);
    }
  }, [isCropEditing, zoomToCrop]);

  // Live 60fps canvas rendering when Zoom-to-Crop preview is active
  useEffect(() => {
    if (!useStyledCanvasPreview) return;
    let rafId = 0;

    const render = () => {
      const video = videoRef.current;
      const canvas = previewCanvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawStyledVideoFrame(
            ctx,
            video,
            source.width,
            source.height,
            canvas.width,
            canvas.height,
            settings
          );
        }
      }
      if (isPlaying) {
        rafId = window.requestAnimationFrame(render);
      }
    };

    render();
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [useStyledCanvasPreview, isPlaying, currentTime, settings, source, videoRef]);

  const handleRestartSplitSync = () => {
    const img = splitOutputImgRef.current;
    if (img && output) {
      img.src = '';
      window.requestAnimationFrame(() => {
        if (splitOutputImgRef.current) {
          splitOutputImgRef.current.src = output.objectUrl;
        }
      });
    }
    onRestartBoth();
  };

  const cssFilter = buildCssFilterString(settings);

  return (
    <section
      aria-label="Media viewport and timeline"
      className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#0B0D11] border-b lg:border-b-0 lg:border-r border-[#262B38]"
    >
      {/* Stage Sub-toolbar */}
      <div className="px-4 py-2.5 border-b border-[#262B38] bg-[#13161D] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 text-xs text-[#94A3B8] min-w-0">
          <span className="text-[#F1F5F9] font-medium truncate max-w-[180px]">
            {source.name}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums whitespace-nowrap">
            {source.width}×{source.height}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums whitespace-nowrap">
            {formatTimecode(source.duration)}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums whitespace-nowrap">
            {formatBytes(source.size)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Crop & Styled Preview Controls */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleCropEditing}
              className={`px-2.5 py-1 inline-flex items-center gap-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isCropEditing
                  ? 'bg-amber-500 text-[#0B0D11] border-amber-500 font-semibold'
                  : isCropped
                  ? 'bg-[#1B1F29] text-amber-400 border-amber-500/50 hover:bg-[#232836]'
                  : 'bg-[#0B0D11] text-[#CBD5E1] border-[#262B38] hover:text-[#F1F5F9] hover:bg-[#1B1F29]'
              }`}
            >
              <Crop className="w-3.5 h-3.5" />
              {isCropEditing ? 'Done Cropping' : isCropped ? 'Cropped' : 'Crop'}
            </button>

            {effectiveMode === 'source' && !isCropEditing && (isCropped || hasVisualTransform) && (
              <button
                type="button"
                onClick={() => setZoomToCrop((prev) => !prev)}
                title="Preview exact cropped, rotated, rounded, and bordered output frame"
                className={`px-2.5 py-1 inline-flex items-center gap-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  zoomToCrop
                    ? 'bg-[#1B1F29] text-amber-400 border-amber-500/60'
                    : 'bg-[#0B0D11] text-[#CBD5E1] border-[#262B38] hover:text-[#F1F5F9] hover:bg-[#1B1F29]'
                }`}
              >
                <Maximize2 className="w-3 h-3" />
                {zoomToCrop ? 'Full Frame' : 'Preview Output Crop'}
              </button>
            )}

            {isCropped && (
              <button
                type="button"
                onClick={onResetCrop}
                title="Reset crop to full frame"
                className="px-2 py-1 inline-flex items-center gap-1 text-[11px] font-medium rounded-md text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#1B1F29] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            )}

            {effectiveMode !== 'frames' && !isCropEditing && (
              <button
                type="button"
                disabled={isBusy}
                onClick={onGrabStillPng}
                title="Download current styled playhead frame as a PNG"
                className="px-2.5 py-1 inline-flex items-center gap-1.5 text-xs font-medium rounded-md border border-[#262B38] bg-[#0B0D11] text-[#CBD5E1] hover:text-[#F1F5F9] hover:bg-[#1B1F29] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
              >
                <Camera className="w-3.5 h-3.5" />
                Grab PNG
              </button>
            )}
          </div>

          {effectiveMode === 'split' && output && (
            <button
              type="button"
              onClick={handleRestartSplitSync}
              title="Restart source video and encoded animation together from frame 1"
              className="px-2.5 py-1 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[#1B1F29] hover:bg-[#242A38] border border-[#262B38] text-[#F1F5F9] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCw className="w-3 h-3 text-amber-400" />
              Restart Both
            </button>
          )}

          {/* Backdrop toggle when output or styled crop preview is visible */}
          {((output && (effectiveMode === 'output' || effectiveMode === 'split')) ||
            useStyledCanvasPreview) && (
            <div className="flex items-center gap-1 p-0.5 rounded-md bg-[#0B0D11] border border-[#262B38]">
              {(['dark', 'checkerboard', 'light'] as PreviewBackdrop[]).map((bg) => (
                <button
                  key={bg}
                  type="button"
                  onClick={() => onChangeBackdrop(bg)}
                  className={`px-2 py-1 text-[11px] font-medium rounded transition-colors capitalize whitespace-nowrap shrink-0 cursor-pointer ${
                    backdrop === bg
                      ? 'bg-[#1B1F29] text-[#F1F5F9]'
                      : 'text-[#64748B] hover:text-[#CBD5E1]'
                  }`}
                >
                  {bg}
                </button>
              ))}
            </div>
          )}

          {/* Segmented View Switcher */}
          <div className="flex items-center gap-1 p-0.5 rounded-md bg-[#0B0D11] border border-[#262B38]">
            <button
              type="button"
              onClick={() => onChangeViewMode('source')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                effectiveMode === 'source'
                  ? 'bg-[#1B1F29] text-[#F1F5F9]'
                  : 'text-[#94A3B8] hover:text-[#F1F5F9]'
              }`}
            >
              Source
            </button>
            <button
              type="button"
              disabled={isCropEditing}
              onClick={() => onChangeViewMode('frames')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                effectiveMode === 'frames'
                  ? 'bg-[#1B1F29] text-[#F1F5F9]'
                  : 'text-[#94A3B8] hover:text-[#F1F5F9]'
              }`}
            >
              Frames{capturedFrames.length > 0 ? ` (${capturedFrames.length})` : ''}
            </button>
            <button
              type="button"
              disabled={!output || isCropEditing}
              onClick={() => onChangeViewMode('output')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                effectiveMode === 'output'
                  ? 'bg-[#1B1F29] text-amber-400'
                  : 'text-[#94A3B8] hover:text-[#F1F5F9]'
              }`}
            >
              Output
            </button>
            <button
              type="button"
              disabled={!output || isCropEditing}
              onClick={() => onChangeViewMode('split')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                effectiveMode === 'split'
                  ? 'bg-[#1B1F29] text-amber-400'
                  : 'text-[#94A3B8] hover:text-[#F1F5F9]'
              }`}
            >
              Side-by-Side
            </button>
          </div>
        </div>
      </div>

      {/* Main Preview Canvas */}
      <div className="flex-1 min-h-[260px] p-4 md:p-5 flex items-center justify-center overflow-hidden">
        {effectiveMode === 'frames' ? (
          <FrameEditor
            frames={capturedFrames}
            isBusy={isBusy}
            onDeleteFrame={onDeleteFrame}
            onUpdateDelay={onUpdateFrameDelay}
            onDuplicateFrame={onDuplicateFrame}
            onMoveFrame={onMoveFrame}
            onDeduplicateFrames={onDeduplicateFrames}
            onCaptureFrames={onCaptureFrames}
            onApplyAndReencode={onApplyEditedFrames}
          />
        ) : effectiveMode === 'split' && output ? (
          <div className="w-full h-full grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <div className="h-full flex flex-col rounded-lg border border-[#262B38] bg-[#08090C] overflow-hidden">
              <div className="px-3 py-1.5 border-b border-[#262B38] bg-[#13161D] flex items-center justify-between text-xs text-[#94A3B8]">
                <span>Original Video</span>
                <span className="font-mono tabular-nums">{formatBytes(source.size)}</span>
              </div>
              <div className="flex-1 flex items-center justify-center p-3 min-h-[200px]">
                <div className="relative inline-flex items-center justify-center max-w-full max-h-[380px]">
                  <video
                    ref={videoRef}
                    src={source.objectUrl}
                    muted
                    playsInline
                    onTimeUpdate={onTimeUpdate}
                    onPlay={() => onPlayStateChange(true)}
                    onPause={() => onPlayStateChange(false)}
                    onClick={onTogglePlay}
                    style={{ filter: cssFilter }}
                    className="block max-h-[380px] max-w-full rounded cursor-pointer object-contain"
                  />
                  {showOverlay && (
                    <CropOverlay
                      sourceWidth={source.width}
                      sourceHeight={source.height}
                      crop={settings.crop}
                      aspectPreset={cropAspect}
                      cornerRadius={settings.cornerRadius}
                      borderWidth={settings.borderWidth}
                      borderColor={settings.borderColor}
                      interactive={false}
                      onChange={onCropChange}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="h-full flex flex-col rounded-lg border border-[#262B38] overflow-hidden">
              <div className="px-3 py-1.5 border-b border-[#262B38] bg-[#13161D] flex items-center justify-between text-xs text-[#94A3B8]">
                <span className="text-amber-400 font-medium">
                  Encoded{' '}
                  {output.format === 'webp'
                    ? 'Animated WebP'
                    : output.format === 'gif'
                    ? 'Animated GIF'
                    : 'APNG'}
                </span>
                <span className="font-mono tabular-nums">{formatBytes(output.size)}</span>
              </div>
              <div
                className={`flex-1 flex items-center justify-center p-3 min-h-[200px] ${backdropClass}`}
              >
                <img
                  ref={splitOutputImgRef}
                  src={output.objectUrl}
                  alt={`Encoded ${output.format.toUpperCase()} animation`}
                  className="max-h-[380px] max-w-full object-contain"
                />
              </div>
            </div>
          </div>
        ) : (
          <div
            className={`w-full h-full flex items-center justify-center rounded-lg border border-[#262B38] p-4 ${
              effectiveMode === 'output' || useStyledCanvasPreview ? backdropClass : 'bg-[#08090C]'
            }`}
          >
            {/* Source Video Wrapper (kept mounted for live canvas preview when zoomToCrop is on) */}
            <div
              className={`relative items-center justify-center max-w-full max-h-[460px] ${
                effectiveMode === 'source' && !useStyledCanvasPreview ? 'inline-flex' : 'hidden'
              }`}
            >
              <video
                ref={videoRef}
                src={source.objectUrl}
                muted
                playsInline
                onTimeUpdate={onTimeUpdate}
                onPlay={() => onPlayStateChange(true)}
                onPause={() => onPlayStateChange(false)}
                onClick={isCropEditing ? undefined : onTogglePlay}
                style={{
                  filter: cssFilter,
                  transform:
                    !isCropEditing && (settings.flipH || settings.flipV)
                      ? `scale(${settings.flipH ? -1 : 1}, ${settings.flipV ? -1 : 1})`
                      : undefined,
                }}
                className={`block max-h-[460px] max-w-full rounded object-contain ${
                  isCropEditing ? 'cursor-default' : 'cursor-pointer'
                }`}
              />
              {showOverlay && (
                <CropOverlay
                  sourceWidth={source.width}
                  sourceHeight={source.height}
                  crop={settings.crop}
                  aspectPreset={cropAspect}
                  cornerRadius={settings.cornerRadius}
                  borderWidth={settings.borderWidth}
                  borderColor={settings.borderColor}
                  interactive={isCropEditing}
                  onChange={onCropChange}
                />
              )}
            </div>

            {/* Pixel-Accurate Cropped + Rotated + Rounded + Bordered Live Canvas Preview */}
            {useStyledCanvasPreview && (
              <canvas
                ref={previewCanvasRef}
                width={settings.width}
                height={settings.height}
                onClick={onTogglePlay}
                className="max-h-[460px] max-w-full object-contain cursor-pointer"
              />
            )}

            {effectiveMode === 'output' && output && (
              <img
                src={output.objectUrl}
                alt={`Encoded ${output.format.toUpperCase()} preview`}
                className="max-h-[460px] max-w-full object-contain"
              />
            )}
          </div>
        )}
      </div>

      {/* Session Export Comparison Strip */}
      {exportsHistory.length > 0 && (
        <div className="px-4 py-2 border-t border-[#262B38] bg-[#101319] flex items-center gap-3 overflow-x-auto shrink-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-medium text-[#94A3B8] whitespace-nowrap">
              Session Exports
            </span>
            <button
              type="button"
              onClick={onClearHistory}
              title="Clear session exports"
              className="p-1 text-[#64748B] hover:text-[#CBD5E1] cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {exportsHistory.map((item, idx) => {
              const isSelected = output?.id === item.id;
              return (
                <div
                  key={item.id}
                  className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs transition-colors shrink-0 ${
                    isSelected
                      ? 'bg-[#1B1F29] border-amber-500/70 text-[#F1F5F9]'
                      : 'bg-[#0B0D11] border-[#262B38] text-[#94A3B8] hover:text-[#F1F5F9]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectHistoryItem(item)}
                    className="inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <span className="font-mono text-[10px] text-[#64748B]">#{idx + 1}</span>
                    <span className={isSelected ? 'text-amber-400 font-medium' : 'font-medium'}>
                      {item.format === 'webp' ? 'WebP' : item.format === 'gif' ? 'GIF' : 'APNG'}
                    </span>
                    <span className="text-[#475569]">·</span>
                    <span className="font-mono text-[11px] tabular-nums">
                      {item.width}×{item.height}
                    </span>
                    <span className="text-[#475569]">·</span>
                    <span className="font-mono text-[11px] tabular-nums text-[#CBD5E1]">
                      {formatBytes(item.size)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDownloadItem(item)}
                    title={`Download ${item.filename}`}
                    className="p-0.5 text-[#94A3B8] hover:text-emerald-400 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filmstrip Scrubber */}
      <TimelineScrubber
        duration={source.duration}
        currentTime={currentTime}
        trimStart={settings.trimStart}
        trimEnd={settings.trimEnd}
        fps={settings.fps}
        isPlaying={isPlaying}
        thumbnails={source.thumbnails}
        onSeek={onSeek}
        onTrimChange={onTrimChange}
        onTogglePlay={onTogglePlay}
        onResetTrim={onResetTrim}
      />
    </section>
  );
};
