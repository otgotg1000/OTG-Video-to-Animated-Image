import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookmarkPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Crop,
  Download,
  FlipHorizontal,
  FlipVertical,
  Infinity as InfinityIcon,
  Lock,
  RotateCcw,
  RotateCw,
  Unlock,
  X,
} from 'lucide-react';
import {
  estimateFrameCount,
  formatBytes,
  formatTimecode,
  parseTimecode,
} from '../lib/formatters';
import {
  computePresetDimensions,
  EXPORT_PRESETS,
  type ExportPreset,
} from '../lib/presets';
import type {
  CaptionPosition,
  ConversionJob,
  ConversionSettings,
  CropAspectPreset,
  CropRegion,
  CustomPreset,
  EncodedOutput,
  OutputFormat,
  PlayMode,
  RotationDegrees,
  SourceMedia,
} from '../types/studio';

interface ExportInspectorProps {
  source: SourceMedia;
  settings: ConversionSettings;
  job: ConversionJob;
  output: EncodedOutput | null;
  webpSupported: boolean;
  cropAspect: CropAspectPreset;
  isCropEditing: boolean;
  customPresets: CustomPreset[];
  onSaveCustomPreset: (name: string) => void;
  onApplyCustomPreset: (preset: CustomPreset) => void;
  onDeleteCustomPreset: (id: string) => void;
  onRotate: (delta: 90 | -90) => void;
  onSelectCropAspect: (preset: CropAspectPreset) => void;
  onToggleCropEditing: () => void;
  onCropChange: (nextCrop: CropRegion) => void;
  onResetCrop: () => void;
  onUpdateSettings: (patch: Partial<ConversionSettings>) => void;
  onConvert: () => void;
  onCancel: () => void;
  onDownload: () => void;
  onCopyOutput: () => Promise<'copied-animation' | 'copied-still' | 'failed'>;
}

const CROP_ASPECT_OPTIONS: CropAspectPreset[] = ['free', '16:9', '1:1', '4:3', '9:16'];
const SPEED_PRESETS = [0.5, 0.75, 1, 1.5, 2, 3];
const BORDER_COLOR_SWATCHES = ['#FFFFFF', '#0B0D11', '#F59E0B', '#38BDF8'];
const CHROMA_COLOR_SWATCHES = ['#00FF00', '#0000FF', '#FFFFFF', '#000000'];
const TARGET_SIZE_PRESETS: Array<{ label: string; kb: number | null }> = [
  { label: 'Off', kb: null },
  { label: '300 KB', kb: 300 },
  { label: '512 KB', kb: 512 },
  { label: '1 MB', kb: 1024 },
  { label: '2 MB', kb: 2048 },
];

export const ExportInspector: React.FC<ExportInspectorProps> = ({
  source,
  settings,
  job,
  output,
  webpSupported,
  cropAspect,
  isCropEditing,
  customPresets,
  onSaveCustomPreset,
  onApplyCustomPreset,
  onDeleteCustomPreset,
  onRotate,
  onSelectCropAspect,
  onToggleCropEditing,
  onCropChange,
  onResetCrop,
  onUpdateSettings,
  onConvert,
  onCancel,
  onDownload,
  onCopyOutput,
}) => {
  const [inInput, setInInput] = useState(formatTimecode(settings.trimStart));
  const [outInput, setOutInput] = useState(formatTimecode(settings.trimEnd));
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    setInInput(formatTimecode(settings.trimStart));
  }, [settings.trimStart]);

  useEffect(() => {
    setOutInput(formatTimecode(settings.trimEnd));
  }, [settings.trimEnd]);

  const isRunning = job.phase === 'extracting' || job.phase === 'encoding';
  const isQuarterTurn = settings.rotation === 90 || settings.rotation === 270;
  const orientedCropW = isQuarterTurn ? settings.crop.height : settings.crop.width;
  const orientedCropH = isQuarterTurn ? settings.crop.width : settings.crop.height;
  const cropAspectRatio = orientedCropW / Math.max(1, orientedCropH);

  const estimatedFrames = estimateFrameCount(
    settings.trimStart,
    settings.trimEnd,
    settings.fps,
    settings.speed,
    settings.playMode,
    settings.loopCrossfadeFrames
  );
  const frameIntervalMs = Math.round(1000 / Math.max(1, settings.fps));
  const estimatedBufferBytes = estimatedFrames * settings.width * settings.height * 4;
  const isHeavyExport = estimatedFrames > 180 || estimatedBufferBytes > 100 * 1024 * 1024;

  const isCropped =
    settings.crop.x > 0 ||
    settings.crop.y > 0 ||
    settings.crop.width < source.width ||
    settings.crop.height < source.height;

  const hasTransformOrColor =
    settings.rotation !== 0 ||
    settings.flipH ||
    settings.flipV ||
    settings.brightness !== 100 ||
    settings.contrast !== 100 ||
    settings.saturation !== 100;

  const commitInTime = () => {
    const parsed = parseTimecode(inInput);
    if (parsed === null) {
      setInInput(formatTimecode(settings.trimStart));
      return;
    }
    const clamped = Math.max(0, Math.min(settings.trimEnd - 0.1, parsed));
    onUpdateSettings({ trimStart: Number(clamped.toFixed(2)) });
  };

  const commitOutTime = () => {
    const parsed = parseTimecode(outInput);
    if (parsed === null) {
      setOutInput(formatTimecode(settings.trimEnd));
      return;
    }
    const clamped = Math.min(source.duration, Math.max(settings.trimStart + 0.1, parsed));
    onUpdateSettings({ trimEnd: Number(clamped.toFixed(2)) });
  };

  const nudgeInTime = (delta: number) => {
    const base = parseTimecode(inInput) ?? settings.trimStart;
    const clamped = Math.max(0, Math.min(settings.trimEnd - 0.1, base + delta));
    onUpdateSettings({ trimStart: Number(clamped.toFixed(2)) });
  };

  const nudgeOutTime = (delta: number) => {
    const base = parseTimecode(outInput) ?? settings.trimEnd;
    const clamped = Math.min(source.duration, Math.max(settings.trimStart + 0.1, base + delta));
    onUpdateSettings({ trimEnd: Number(clamped.toFixed(2)) });
  };

  const handleWidthChange = (rawWidth: number) => {
    if (!Number.isFinite(rawWidth)) return;
    const width = Math.max(16, Math.min(3840, Math.round(rawWidth)));
    if (settings.lockAspect) {
      const height = Math.max(16, Math.round(width / cropAspectRatio));
      onUpdateSettings({ width, height });
    } else {
      onUpdateSettings({ width });
    }
  };

  const handleHeightChange = (rawHeight: number) => {
    if (!Number.isFinite(rawHeight)) return;
    const height = Math.max(16, Math.min(2160, Math.round(rawHeight)));
    if (settings.lockAspect) {
      const width = Math.max(16, Math.round(height * cropAspectRatio));
      onUpdateSettings({ width, height });
    } else {
      onUpdateSettings({ height });
    }
  };

  const applyWidthPreset = (targetWidth: number) => {
    const w = Math.max(16, Math.min(3840, Math.round(targetWidth)));
    if (settings.lockAspect) {
      const h = Math.max(16, Math.round(w / cropAspectRatio));
      onUpdateSettings({ width: w, height: h });
    } else {
      onUpdateSettings({ width: w });
    }
  };

  const applyExportPreset = (preset: ExportPreset) => {
    const dims = computePresetDimensions(settings.crop, preset.maxWidth, settings.rotation);
    onUpdateSettings({
      format: preset.format,
      fps: preset.fps,
      width: dims.width,
      height: dims.height,
      quality: preset.quality,
      loopCount: preset.loopCount,
      lockAspect: true,
    });
  };

  const isPresetActive = (preset: ExportPreset): boolean => {
    const expectedDims = computePresetDimensions(
      settings.crop,
      preset.maxWidth,
      settings.rotation
    );
    return (
      settings.format === preset.format &&
      settings.fps === preset.fps &&
      settings.quality === preset.quality &&
      settings.loopCount === preset.loopCount &&
      settings.width === expectedDims.width &&
      settings.height === expectedDims.height
    );
  };

  const updateCropField = (field: keyof CropRegion, rawValue: number) => {
    if (!Number.isFinite(rawValue)) return;
    const minSize = Math.min(16, source.width, source.height);
    const next = { ...settings.crop };

    if (field === 'x') {
      next.x = Math.max(0, Math.min(source.width - next.width, Math.round(rawValue)));
    } else if (field === 'y') {
      next.y = Math.max(0, Math.min(source.height - next.height, Math.round(rawValue)));
    } else if (field === 'width') {
      next.width = Math.max(minSize, Math.min(source.width - next.x, Math.round(rawValue)));
    } else if (field === 'height') {
      next.height = Math.max(minSize, Math.min(source.height - next.y, Math.round(rawValue)));
    }
    onCropChange(next);
  };

  const handleSavePresetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = presetNameInput.trim();
    if (!trimmed) return;
    onSaveCustomPreset(trimmed);
    setPresetNameInput('');
    setIsSavingPreset(false);
  };

  const handleResetTransformAndColor = () => {
    const dims = computePresetDimensions(settings.crop, settings.width, 0 as RotationDegrees);
    onUpdateSettings({
      rotation: 0,
      flipH: false,
      flipV: false,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      width: settings.rotation === 90 || settings.rotation === 270 ? settings.height : dims.width,
      height: settings.rotation === 90 || settings.rotation === 270 ? settings.width : dims.height,
    });
  };

  const apngColorCount =
    settings.quality >= 100
      ? 0
      : Math.max(16, Math.min(256, Math.round(16 + (settings.quality / 99) * 240)));

  const gifColorCount = Math.max(24, Math.min(256, Math.round(24 + (settings.quality / 100) * 232)));

  const sizeDeltaPct =
    output && source.size > 0
      ? Math.round(((output.size - source.size) / source.size) * 100)
      : null;

  const handleCopyClick = async () => {
    const result = await onCopyOutput();
    if (result === 'copied-animation') {
      setCopyFeedback('Copied');
    } else if (result === 'copied-still') {
      setCopyFeedback('Copied PNG');
    } else {
      setCopyFeedback('Failed');
    }
    window.setTimeout(() => setCopyFeedback(null), 2400);
  };

  const webpPresets = EXPORT_PRESETS.filter((p) => p.format === 'webp');
  const apngPresets = EXPORT_PRESETS.filter((p) => p.format === 'apng');
  const gifPresets = EXPORT_PRESETS.filter((p) => p.format === 'gif');

  return (
    <aside
      aria-label="Export settings inspector"
      className="w-full lg:w-[390px] xl:w-[410px] lg:h-full shrink-0 bg-[#13161D] flex flex-col min-h-0"
    >
      {/* Scrollable Inspector Controls */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Format Switch */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-[#CBD5E1]">Output Format</label>
            <span className="text-[11px] text-[#64748B]">
              {settings.format === 'webp'
                ? 'RIFF Animated WebP'
                : settings.format === 'gif'
                ? 'GIF89a (256-Color)'
                : 'Lossless / Palette APNG'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#0B0D11] border border-[#262B38]">
            {(
              [
                { id: 'webp', label: 'WebP' },
                { id: 'apng', label: 'APNG' },
                { id: 'gif', label: 'GIF' },
              ] as Array<{ id: OutputFormat; label: string }>
            ).map((fmt) => (
              <button
                key={fmt.id}
                type="button"
                disabled={isRunning}
                onClick={() => onUpdateSettings({ format: fmt.id })}
                className={`py-2 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed ${
                  settings.format === fmt.id
                    ? 'bg-[#1B1F29] text-amber-400 border border-[#2F3647]'
                    : 'text-[#94A3B8] hover:text-[#F1F5F9] border border-transparent'
                }`}
              >
                {fmt.label}
              </button>
            ))}
          </div>
          {settings.format === 'webp' && !webpSupported && (
            <p className="mt-2 text-xs text-amber-300 leading-relaxed">
              This browser lacks native WebP canvas encoding. Switch to APNG or GIF, or use Chrome,
              Firefox, or Edge.
            </p>
          )}
        </div>

        {/* Export Presets & Custom Saved Presets */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[#CBD5E1]">Export Presets</span>
            <button
              type="button"
              disabled={isRunning}
              onClick={() => setIsSavingPreset((prev) => !prev)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 hover:text-amber-300 cursor-pointer"
            >
              <BookmarkPlus className="w-3 h-3" />
              {isSavingPreset ? 'Cancel' : 'Save Current'}
            </button>
          </div>

          {isSavingPreset && (
            <form onSubmit={handleSavePresetSubmit} className="mb-3 flex items-center gap-1.5">
              <input
                type="text"
                maxLength={28}
                placeholder="Preset name (e.g. Discord Sticker)"
                value={presetNameInput}
                onChange={(e) => setPresetNameInput(e.target.value)}
                autoFocus
                className="flex-1 px-2.5 py-1.5 text-xs bg-[#0B0D11] border border-[#262B38] rounded text-[#F1F5F9] placeholder-[#64748B] focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                disabled={!presetNameInput.trim()}
                className="px-3 py-1.5 text-xs font-semibold text-[#0B0D11] bg-amber-500 hover:bg-amber-400 disabled:opacity-40 rounded cursor-pointer"
              >
                Save
              </button>
            </form>
          )}

          <div className="space-y-2">
            {customPresets.length > 0 && (
              <div>
                <div className="text-[11px] text-[#64748B] mb-1">Saved Presets</div>
                <div className="flex flex-wrap gap-1.5">
                  {customPresets.map((cp) => (
                    <div
                      key={cp.id}
                      className="inline-flex items-center rounded-md border border-[#262B38] bg-[#0B0D11] hover:border-[#384054] overflow-hidden"
                    >
                      <button
                        type="button"
                        disabled={isRunning || (cp.format === 'webp' && !webpSupported)}
                        onClick={() => onApplyCustomPreset(cp)}
                        className="px-2 py-1 text-left cursor-pointer disabled:opacity-40"
                      >
                        <span className="text-[11px] font-medium text-[#F1F5F9]">{cp.name}</span>
                        <span className="ml-1.5 font-mono text-[10px] text-[#64748B]">
                          {cp.format.toUpperCase()} · {cp.fps}fps
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteCustomPreset(cp.id)}
                        title={`Delete ${cp.name}`}
                        className="px-1.5 py-1 text-[#64748B] hover:text-red-400 border-l border-[#262B38] cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="text-[11px] text-[#64748B] mb-1">Animated WebP</div>
              <div className="grid grid-cols-3 gap-1.5">
                {webpPresets.map((preset) => {
                  const active = isPresetActive(preset);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={isRunning || !webpSupported}
                      onClick={() => applyExportPreset(preset)}
                      title={preset.summary}
                      className={`px-2 py-1.5 rounded-md border text-left transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        active
                          ? 'bg-[#1B1F29] border-amber-500/70 text-amber-400'
                          : 'bg-[#0B0D11] border-[#262B38] text-[#CBD5E1] hover:bg-[#1B1F29] hover:text-[#F1F5F9]'
                      }`}
                    >
                      <div className="text-[11px] font-medium truncate">{preset.label}</div>
                      <div className="text-[10px] font-mono tabular-nums text-[#64748B] truncate">
                        {preset.fps}fps · {preset.quality}%
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-[#64748B] mb-1">Animated PNG (APNG)</div>
              <div className="grid grid-cols-3 gap-1.5">
                {apngPresets.map((preset) => {
                  const active = isPresetActive(preset);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={isRunning}
                      onClick={() => applyExportPreset(preset)}
                      title={preset.summary}
                      className={`px-2 py-1.5 rounded-md border text-left transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        active
                          ? 'bg-[#1B1F29] border-amber-500/70 text-amber-400'
                          : 'bg-[#0B0D11] border-[#262B38] text-[#CBD5E1] hover:bg-[#1B1F29] hover:text-[#F1F5F9]'
                      }`}
                    >
                      <div className="text-[11px] font-medium truncate">{preset.label}</div>
                      <div className="text-[10px] font-mono tabular-nums text-[#64748B] truncate">
                        {preset.fps}fps · {preset.quality}%
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-[#64748B] mb-1">Animated GIF</div>
              <div className="grid grid-cols-3 gap-1.5">
                {gifPresets.map((preset) => {
                  const active = isPresetActive(preset);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={isRunning}
                      onClick={() => applyExportPreset(preset)}
                      title={preset.summary}
                      className={`px-2 py-1.5 rounded-md border text-left transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        active
                          ? 'bg-[#1B1F29] border-amber-500/70 text-amber-400'
                          : 'bg-[#0B0D11] border-[#262B38] text-[#CBD5E1] hover:bg-[#1B1F29] hover:text-[#F1F5F9]'
                      }`}
                    >
                      <div className="text-[11px] font-medium truncate">{preset.label}</div>
                      <div className="text-[10px] font-mono tabular-nums text-[#64748B] truncate">
                        {preset.fps}fps · {preset.quality}%
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="h-px bg-[#262B38]" />

        {/* Crop Region Controls */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[#CBD5E1]">Crop Region</span>
            <div className="flex items-center gap-2">
              {isCropped && (
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={onResetCrop}
                  className="inline-flex items-center gap-1 text-[11px] text-[#94A3B8] hover:text-[#F1F5F9] cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              )}
              <button
                type="button"
                disabled={isRunning}
                onClick={onToggleCropEditing}
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border transition-colors cursor-pointer ${
                  isCropEditing
                    ? 'bg-amber-500 text-[#0B0D11] border-amber-500'
                    : 'bg-[#0B0D11] text-[#CBD5E1] border-[#262B38] hover:text-[#F1F5F9]'
                }`}
              >
                <Crop className="w-3 h-3" />
                {isCropEditing ? 'Done' : 'Edit on Video'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 mb-2.5">
            {CROP_ASPECT_OPTIONS.map((ratio) => (
              <button
                key={ratio}
                type="button"
                disabled={isRunning}
                onClick={() => onSelectCropAspect(ratio)}
                className={`flex-1 py-1 text-[11px] font-mono rounded border transition-colors capitalize cursor-pointer ${
                  cropAspect === ratio
                    ? 'bg-[#1B1F29] border-amber-500/70 text-amber-400'
                    : 'bg-[#0B0D11] border-[#262B38] text-[#94A3B8] hover:text-[#F1F5F9]'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div>
              <label htmlFor="crop-x" className="block text-[10px] text-[#64748B] mb-1">
                X
              </label>
              <input
                id="crop-x"
                type="number"
                min={0}
                max={Math.max(0, source.width - settings.crop.width)}
                disabled={isRunning}
                value={settings.crop.x}
                onChange={(e) => updateCropField('x', Number(e.target.value))}
                className="w-full px-2 py-1.5 text-xs font-mono tabular-nums bg-[#0B0D11] border border-[#262B38] rounded text-[#F1F5F9] focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label htmlFor="crop-y" className="block text-[10px] text-[#64748B] mb-1">
                Y
              </label>
              <input
                id="crop-y"
                type="number"
                min={0}
                max={Math.max(0, source.height - settings.crop.height)}
                disabled={isRunning}
                value={settings.crop.y}
                onChange={(e) => updateCropField('y', Number(e.target.value))}
                className="w-full px-2 py-1.5 text-xs font-mono tabular-nums bg-[#0B0D11] border border-[#262B38] rounded text-[#F1F5F9] focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label htmlFor="crop-w" className="block text-[10px] text-[#64748B] mb-1">
                W
              </label>
              <input
                id="crop-w"
                type="number"
                min={16}
                max={source.width - settings.crop.x}
                disabled={isRunning}
                value={settings.crop.width}
                onChange={(e) => updateCropField('width', Number(e.target.value))}
                className="w-full px-2 py-1.5 text-xs font-mono tabular-nums bg-[#0B0D11] border border-[#262B38] rounded text-[#F1F5F9] focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label htmlFor="crop-h" className="block text-[10px] text-[#64748B] mb-1">
                H
              </label>
              <input
                id="crop-h"
                type="number"
                min={16}
                max={source.height - settings.crop.y}
                disabled={isRunning}
                value={settings.crop.height}
                onChange={(e) => updateCropField('height', Number(e.target.value))}
                className="w-full px-2 py-1.5 text-xs font-mono tabular-nums bg-[#0B0D11] border border-[#262B38] rounded text-[#F1F5F9] focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Rotate, Flip & Color Adjustments */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#CBD5E1]">Transform &amp; Color</span>
            {hasTransformOrColor && (
              <button
                type="button"
                disabled={isRunning}
                onClick={handleResetTransformAndColor}
                className="inline-flex items-center gap-1 text-[11px] text-[#94A3B8] hover:text-[#F1F5F9] cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            )}
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            <button
              type="button"
              disabled={isRunning}
              onClick={() => onRotate(-90)}
              title="Rotate 90° Counter-Clockwise"
              className="py-1.5 px-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium bg-[#0B0D11] hover:bg-[#1B1F29] border border-[#262B38] rounded text-[#CBD5E1] cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              -90°
            </button>
            <button
              type="button"
              disabled={isRunning}
              onClick={() => onRotate(90)}
              title="Rotate 90° Clockwise"
              className={`py-1.5 px-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium border rounded cursor-pointer ${
                settings.rotation !== 0
                  ? 'bg-[#1B1F29] border-amber-500/70 text-amber-400'
                  : 'bg-[#0B0D11] hover:bg-[#1B1F29] border-[#262B38] text-[#CBD5E1]'
              }`}
            >
              <RotateCw className="w-3 h-3" />
              {settings.rotation === 0 ? '+90°' : `${settings.rotation}°`}
            </button>
            <button
              type="button"
              disabled={isRunning}
              onClick={() => onUpdateSettings({ flipH: !settings.flipH })}
              title="Flip Horizontally"
              className={`py-1.5 px-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium border rounded cursor-pointer ${
                settings.flipH
                  ? 'bg-[#1B1F29] border-amber-500/70 text-amber-400'
                  : 'bg-[#0B0D11] hover:bg-[#1B1F29] border-[#262B38] text-[#CBD5E1]'
              }`}
            >
              <FlipHorizontal className="w-3 h-3" />
              Flip H
            </button>
            <button
              type="button"
              disabled={isRunning}
              onClick={() => onUpdateSettings({ flipV: !settings.flipV })}
              title="Flip Vertically"
              className={`py-1.5 px-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium border rounded cursor-pointer ${
                settings.flipV
                  ? 'bg-[#1B1F29] border-amber-500/70 text-amber-400'
                  : 'bg-[#0B0D11] hover:bg-[#1B1F29] border-[#262B38] text-[#CBD5E1]'
              }`}
            >
              <FlipVertical className="w-3 h-3" />
              Flip V
            </button>
          </div>

          <div className="space-y-2 pt-1">
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-[#94A3B8]">Brightness</span>
                <span className="font-mono tabular-nums text-[#F1F5F9]">
                  {settings.brightness}%
                </span>
              </div>
              <input
                type="range"
                min={50}
                max={150}
                step={1}
                disabled={isRunning}
                value={settings.brightness}
                onChange={(e) => onUpdateSettings({ brightness: Number(e.target.value) })}
                className="w-full studio-slider"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-[#94A3B8]">Contrast</span>
                <span className="font-mono tabular-nums text-[#F1F5F9]">
                  {settings.contrast}%
                </span>
              </div>
              <input
                type="range"
                min={50}
                max={150}
                step={1}
                disabled={isRunning}
                value={settings.contrast}
                onChange={(e) => onUpdateSettings({ contrast: Number(e.target.value) })}
                className="w-full studio-slider"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-[#94A3B8]">Saturation</span>
                <span className="font-mono tabular-nums text-[#F1F5F9]">
                  {settings.saturation}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={200}
                step={1}
                disabled={isRunning}
                value={settings.saturation}
                onChange={(e) => onUpdateSettings({ saturation: Number(e.target.value) })}
                className="w-full studio-slider"
              />
            </div>
          </div>
        </div>

        {/* Trim Inputs */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[#CBD5E1]">Trim Range</span>
            <span className="font-mono text-[11px] tabular-nums text-[#94A3B8]">
              {formatTimecode(Math.max(0, settings.trimEnd - settings.trimStart))} selected
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="trim-in" className="block text-[11px] text-[#64748B] mb-1">
                In (MM:SS.cc)
              </label>
              <div className="flex items-stretch bg-[#0B0D11] border border-[#262B38] rounded-md focus-within:border-amber-500 overflow-hidden">
                <input
                  id="trim-in"
                  type="text"
                  disabled={isRunning}
                  value={inInput}
                  onChange={(e) => setInInput(e.target.value)}
                  onBlur={commitInTime}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitInTime();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      nudgeInTime(e.shiftKey ? 1 : 0.1);
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      nudgeInTime(e.shiftKey ? -1 : -0.1);
                    }
                  }}
                  className="flex-1 min-w-0 px-2.5 py-2 text-xs font-mono tabular-nums bg-transparent text-[#F1F5F9] focus:outline-none"
                />
                <div className="flex flex-col w-6 border-l border-[#262B38] shrink-0">
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={(e) => nudgeInTime(e.shiftKey ? 1 : 0.1)}
                    aria-label="Increase trim start time"
                    title="Increase In (+0.10s, Shift +1.00s)"
                    className="flex-1 flex items-center justify-center text-[#94A3B8] hover:text-amber-400 hover:bg-[#1B1F29] border-b border-[#262B38] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={(e) => nudgeInTime(e.shiftKey ? -1 : -0.1)}
                    aria-label="Decrease trim start time"
                    title="Decrease In (-0.10s, Shift -1.00s)"
                    className="flex-1 flex items-center justify-center text-[#94A3B8] hover:text-amber-400 hover:bg-[#1B1F29] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
            <div>
              <label htmlFor="trim-out" className="block text-[11px] text-[#64748B] mb-1">
                Out (MM:SS.cc)
              </label>
              <div className="flex items-stretch bg-[#0B0D11] border border-[#262B38] rounded-md focus-within:border-amber-500 overflow-hidden">
                <input
                  id="trim-out"
                  type="text"
                  disabled={isRunning}
                  value={outInput}
                  onChange={(e) => setOutInput(e.target.value)}
                  onBlur={commitOutTime}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitOutTime();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      nudgeOutTime(e.shiftKey ? 1 : 0.1);
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      nudgeOutTime(e.shiftKey ? -1 : -0.1);
                    }
                  }}
                  className="flex-1 min-w-0 px-2.5 py-2 text-xs font-mono tabular-nums bg-transparent text-[#F1F5F9] focus:outline-none"
                />
                <div className="flex flex-col w-6 border-l border-[#262B38] shrink-0">
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={(e) => nudgeOutTime(e.shiftKey ? 1 : 0.1)}
                    aria-label="Increase trim end time"
                    title="Increase Out (+0.10s, Shift +1.00s)"
                    className="flex-1 flex items-center justify-center text-[#94A3B8] hover:text-amber-400 hover:bg-[#1B1F29] border-b border-[#262B38] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={(e) => nudgeOutTime(e.shiftKey ? -1 : -0.1)}
                    aria-label="Decrease trim end time"
                    title="Decrease Out (-0.10s, Shift -1.00s)"
                    className="flex-1 flex items-center justify-center text-[#94A3B8] hover:text-amber-400 hover:bg-[#1B1F29] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            {[
              { label: '60cc', seconds: 0.6 },
              { label: '1s', seconds: 1 },
              { label: '2s', seconds: 2 },
            ].map((preset) => {
              const selectedLen = settings.trimEnd - settings.trimStart;
              const isActive = Math.abs(selectedLen - preset.seconds) < 0.015;
              return (
                <button
                  key={preset.label}
                  type="button"
                  disabled={isRunning}
                  onClick={() => {
                    const targetDuration = Math.min(source.duration, preset.seconds);
                    let nextStart = settings.trimStart;
                    let nextEnd = nextStart + targetDuration;
                    if (nextEnd > source.duration) {
                      nextEnd = source.duration;
                      nextStart = Math.max(0, Number((nextEnd - targetDuration).toFixed(2)));
                    }
                    onUpdateSettings({
                      trimStart: Number(nextStart.toFixed(2)),
                      trimEnd: Number(nextEnd.toFixed(2)),
                    });
                  }}
                  title={`Set trim length to ${preset.seconds.toFixed(2)}s from In point`}
                  className={`flex-1 py-1 text-[11px] font-mono tabular-nums rounded border transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#1B1F29] border-amber-500/70 text-amber-400'
                      : 'bg-[#0B0D11] border-[#262B38] text-[#94A3B8] hover:text-[#F1F5F9]'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Speed & Playback Direction */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[#CBD5E1]">Speed &amp; Direction</span>
            <span className="font-mono text-[11px] tabular-nums text-[#94A3B8]">
              {settings.speed}× · {settings.playMode}
            </span>
          </div>

          <div className="flex items-center gap-1 mb-2">
            {SPEED_PRESETS.map((spd) => (
              <button
                key={spd}
                type="button"
                disabled={isRunning}
                onClick={() => onUpdateSettings({ speed: spd })}
                className={`flex-1 py-1 text-[11px] font-mono tabular-nums rounded border transition-colors cursor-pointer ${
                  settings.speed === spd
                    ? 'bg-[#1B1F29] border-amber-500/70 text-amber-400'
                    : 'bg-[#0B0D11] border-[#262B38] text-[#94A3B8] hover:text-[#F1F5F9]'
                }`}
              >
                {spd}×
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 rounded-md bg-[#0B0D11] border border-[#262B38]">
            {(
              [
                { id: 'forward', label: 'Forward' },
                { id: 'reverse', label: 'Reverse' },
                { id: 'pingpong', label: 'Boomerang' },
              ] as Array<{ id: PlayMode; label: string }>
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                disabled={isRunning}
                onClick={() => onUpdateSettings({ playMode: mode.id })}
                className={`py-1.5 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                  settings.playMode === mode.id
                    ? 'bg-[#1B1F29] text-amber-400'
                    : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* Frame Rate (FPS) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="fps-slider" className="text-xs font-medium text-[#CBD5E1]">
              Frame Rate (FPS)
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={60}
                disabled={isRunning}
                value={settings.fps}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(60, Number(e.target.value) || 1));
                  onUpdateSettings({ fps: val });
                }}
                className="w-14 px-2 py-1 text-xs font-mono tabular-nums text-right bg-[#0B0D11] border border-[#262B38] rounded text-[#F1F5F9] focus:outline-none focus:border-amber-500"
              />
              <span className="text-xs text-[#64748B]">fps</span>
            </div>
          </div>
          <input
            id="fps-slider"
            type="range"
            min={1}
            max={60}
            step={1}
            disabled={isRunning}
            value={settings.fps}
            onChange={(e) => onUpdateSettings({ fps: Number(e.target.value) })}
            className="w-full studio-slider"
          />
          <div className="mt-2 flex items-center justify-between gap-1.5">
            {[10, 12, 15, 24, 30].map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={isRunning}
                onClick={() => onUpdateSettings({ fps: preset })}
                className={`flex-1 py-1 text-[11px] font-mono tabular-nums rounded border transition-colors cursor-pointer ${
                  settings.fps === preset
                    ? 'bg-[#1B1F29] border-amber-500/70 text-amber-400'
                    : 'bg-[#0B0D11] border-[#262B38] text-[#94A3B8] hover:text-[#F1F5F9]'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>


        {/* Rounded Corners & Sticker Outline */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="radius-slider" className="text-xs font-medium text-[#CBD5E1]">
                Corner Radius (Alpha)
              </label>
              <span className="font-mono text-xs tabular-nums text-[#F1F5F9]">
                {settings.cornerRadius === 0 ? 'Sharp (0%)' : `${settings.cornerRadius}%`}
              </span>
            </div>
            <input
              id="radius-slider"
              type="range"
              min={0}
              max={50}
              step={1}
              disabled={isRunning}
              value={settings.cornerRadius}
              onChange={(e) => onUpdateSettings({ cornerRadius: Number(e.target.value) })}
              className="w-full studio-slider"
            />
            <div className="mt-2 flex items-center gap-1.5">
              {[
                { label: '0%', val: 0 },
                { label: '8%', val: 8 },
                { label: '18%', val: 18 },
                { label: '50% Circle', val: 50 },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  disabled={isRunning}
                  onClick={() => onUpdateSettings({ cornerRadius: item.val })}
                  className={`flex-1 py-1 text-[11px] font-mono rounded border transition-colors cursor-pointer ${
                    settings.cornerRadius === item.val
                      ? 'bg-[#1B1F29] border-amber-500/70 text-amber-400'
                      : 'bg-[#0B0D11] border-[#262B38] text-[#94A3B8] hover:text-[#F1F5F9]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="border-slider" className="text-xs font-medium text-[#CBD5E1]">
                Sticker Outline
              </label>
              <span className="font-mono text-xs tabular-nums text-[#F1F5F9]">
                {settings.borderWidth === 0 ? 'None' : `${settings.borderWidth} px`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="border-slider"
                type="range"
                min={0}
                max={16}
                step={1}
                disabled={isRunning}
                value={settings.borderWidth}
                onChange={(e) => onUpdateSettings({ borderWidth: Number(e.target.value) })}
                className="flex-1 studio-slider"
              />
              <div className="flex items-center gap-1 shrink-0">
                {BORDER_COLOR_SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    disabled={isRunning}
                    onClick={() =>
                      onUpdateSettings({
                        borderColor: hex,
                        borderWidth: settings.borderWidth === 0 ? 4 : settings.borderWidth,
                      })
                    }
                    title={`Outline ${hex}`}
                    style={{ backgroundColor: hex }}
                    className={`w-4 h-4 rounded-sm border cursor-pointer ${
                      settings.borderColor.toUpperCase() === hex
                        ? 'border-amber-400 ring-1 ring-amber-400'
                        : 'border-[#384054]'
                    }`}
                  />
                ))}
                <input
                  type="color"
                  aria-label="Custom sticker outline color"
                  disabled={isRunning}
                  value={settings.borderColor}
                  onChange={(e) =>
                    onUpdateSettings({
                      borderColor: e.target.value,
                      borderWidth: settings.borderWidth === 0 ? 4 : settings.borderWidth,
                    })
                  }
                  className="w-5 h-5 p-0 bg-transparent border border-[#262B38] rounded cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Chroma Key & Background Removal */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#CBD5E1]">Chroma Key (Alpha)</span>
            <button
              type="button"
              disabled={isRunning}
              onClick={() =>
                onUpdateSettings({ chromaKeyEnabled: !settings.chromaKeyEnabled })
              }
              className={`px-2.5 py-0.5 text-[11px] font-medium rounded border transition-colors cursor-pointer ${
                settings.chromaKeyEnabled
                  ? 'bg-[#1B1F29] border-amber-500/70 text-amber-400'
                  : 'bg-[#0B0D11] border-[#262B38] text-[#94A3B8] hover:text-[#F1F5F9]'
              }`}
            >
              {settings.chromaKeyEnabled ? 'Enabled' : 'Off'}
            </button>
          </div>

          {settings.chromaKeyEnabled && (
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#94A3B8]">Key Color</span>
                <div className="flex items-center gap-1.5">
                  {CHROMA_COLOR_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      disabled={isRunning}
                      onClick={() => onUpdateSettings({ chromaKeyColor: hex })}
                      title={`Key out ${hex}`}
                      style={{ backgroundColor: hex }}
                      className={`w-4 h-4 rounded-sm border cursor-pointer ${
                        settings.chromaKeyColor.toUpperCase() === hex
                          ? 'border-amber-400 ring-1 ring-amber-400'
                          : 'border-[#384054]'
                      }`}
                    />
                  ))}
                  <input
                    type="color"
                    aria-label="Custom chroma key color"
                    disabled={isRunning}
                    value={settings.chromaKeyColor}
                    onChange={(e) => onUpdateSettings({ chromaKeyColor: e.target.value })}
                    className="w-5 h-5 p-0 bg-transparent border border-[#262B38] rounded cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-[#94A3B8]">Tolerance</span>
                  <span className="font-mono tabular-nums text-[#F1F5F9]">
                    {settings.chromaKeyTolerance}
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={1}
                  disabled={isRunning}
                  value={settings.chromaKeyTolerance}
                  onChange={(e) =>
                    onUpdateSettings({ chromaKeyTolerance: Number(e.target.value) })
                  }
                  className="w-full studio-slider"
                />
              </div>
            </div>
          )}
        </div>

        {/* Caption & Watermark Overlay */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label htmlFor="caption-input" className="text-xs font-medium text-[#CBD5E1]">
              Caption / Watermark
            </label>
            {settings.captionText.trim() && (
              <button
                type="button"
                disabled={isRunning}
                onClick={() => onUpdateSettings({ captionText: '' })}
                className="text-[11px] text-[#94A3B8] hover:text-[#F1F5F9] cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          <input
            id="caption-input"
            type="text"
            maxLength={64}
            disabled={isRunning}
            placeholder="Optional overlay text or @handle"
            value={settings.captionText}
            onChange={(e) => onUpdateSettings({ captionText: e.target.value })}
            className="w-full px-3 py-1.5 text-xs bg-[#0B0D11] border border-[#262B38] rounded-md text-[#F1F5F9] placeholder-[#64748B] focus:outline-none focus:border-amber-500"
          />

          {settings.captionText.trim() && (
            <div className="space-y-2 pt-0.5">
              <div className="grid grid-cols-3 gap-1 p-1 rounded-md bg-[#0B0D11] border border-[#262B38]">
                {(
                  [
                    { id: 'top', label: 'Top' },
                    { id: 'bottom', label: 'Bottom' },
                    { id: 'bottom-right', label: 'Corner' },
                  ] as Array<{ id: CaptionPosition; label: string }>
                ).map((pos) => (
                  <button
                    key={pos.id}
                    type="button"
                    disabled={isRunning}
                    onClick={() => onUpdateSettings({ captionPosition: pos.id })}
                    className={`py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                      settings.captionPosition === pos.id
                        ? 'bg-[#1B1F29] text-amber-400'
                        : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-[#94A3B8]">Size</span>
                    <span className="font-mono tabular-nums text-[#F1F5F9]">
                      {settings.captionSize}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={48}
                    step={1}
                    disabled={isRunning}
                    value={settings.captionSize}
                    onChange={(e) =>
                      onUpdateSettings({ captionSize: Number(e.target.value) })
                    }
                    className="w-full studio-slider"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-[#94A3B8]">Opacity</span>
                    <span className="font-mono tabular-nums text-[#F1F5F9]">
                      {settings.captionOpacity}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={100}
                    step={5}
                    disabled={isRunning}
                    value={settings.captionOpacity}
                    onChange={(e) =>
                      onUpdateSettings({ captionOpacity: Number(e.target.value) })
                    }
                    className="w-full studio-slider"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#94A3B8]">Text Color</span>
                <div className="flex items-center gap-1.5">
                  {BORDER_COLOR_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      disabled={isRunning}
                      onClick={() => onUpdateSettings({ captionColor: hex })}
                      style={{ backgroundColor: hex }}
                      className={`w-4 h-4 rounded-sm border cursor-pointer ${
                        settings.captionColor.toUpperCase() === hex
                          ? 'border-amber-400 ring-1 ring-amber-400'
                          : 'border-[#384054]'
                      }`}
                    />
                  ))}
                  <input
                    type="color"
                    aria-label="Custom caption text color"
                    disabled={isRunning}
                    value={settings.captionColor}
                    onChange={(e) => onUpdateSettings({ captionColor: e.target.value })}
                    className="w-5 h-5 p-0 bg-transparent border border-[#262B38] rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quality & Target File Size */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="quality-slider" className="text-xs font-medium text-[#CBD5E1]">
              Compression Quality
            </label>
            <span className="font-mono text-xs tabular-nums text-[#F1F5F9]">
              {settings.quality}%
            </span>
          </div>
          <input
            id="quality-slider"
            type="range"
            min={10}
            max={100}
            step={1}
            disabled={isRunning}
            value={settings.quality}
            onChange={(e) => onUpdateSettings({ quality: Number(e.target.value) })}
            className="w-full studio-slider"
          />
          <div className="mt-2 flex items-center gap-1.5">
            {[60, 80, 99].map((q) => (
              <button
                key={q}
                type="button"
                disabled={isRunning}
                onClick={() => onUpdateSettings({ quality: q })}
                className={`flex-1 py-1 text-[11px] font-mono tabular-nums rounded border transition-colors cursor-pointer ${
                  settings.quality === q
                    ? 'bg-[#1B1F29] border-amber-500/70 text-amber-400'
                    : 'bg-[#0B0D11] border-[#262B38] text-[#94A3B8] hover:text-[#F1F5F9]'
                }`}
              >
                {q}%
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-[#64748B]">
            {settings.format === 'webp'
              ? `Lossy VP8 frame compression (${settings.quality}/100).`
              : settings.format === 'gif'
              ? `Adaptive ${gifColorCount}-color GIF89a palette per frame.`
              : apngColorCount === 0
              ? 'Full 32-bit lossless RGBA APNG (largest file size).'
              : `Adaptive ${apngColorCount}-color palette compression for smaller APNG.`}
          </p>
        </div>

        {/* Target Max Size Optimizer */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[#CBD5E1]">Target Max File Size</span>
            <span className="font-mono text-[11px] tabular-nums text-[#94A3B8]">
              {settings.targetMaxSizeKb ? `${settings.targetMaxSizeKb} KB cap` : 'No cap'}
            </span>
          </div>
          <div className="flex items-center gap-1 mb-2">
            {TARGET_SIZE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={isRunning}
                onClick={() => onUpdateSettings({ targetMaxSizeKb: preset.kb })}
                className={`flex-1 py-1 text-[11px] font-mono rounded border transition-colors cursor-pointer ${
                  settings.targetMaxSizeKb === preset.kb
                    ? 'bg-[#1B1F29] border-amber-500/70 text-amber-400'
                    : 'bg-[#0B0D11] border-[#262B38] text-[#94A3B8] hover:text-[#F1F5F9]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Loop Count & Hold Last Frame */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#CBD5E1]">Loop Behavior</span>
              <span className="font-mono text-[11px] tabular-nums text-[#94A3B8]">
                {settings.loopCount === 0
                  ? 'Infinite'
                  : `${settings.loopCount} ${settings.loopCount === 1 ? 'play' : 'plays'}`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isRunning}
                onClick={() => onUpdateSettings({ loopCount: 0 })}
                className={`h-9 px-3 inline-flex items-center justify-center gap-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  settings.loopCount === 0
                    ? 'bg-[#1B1F29] border-amber-500/70 text-amber-400'
                    : 'bg-[#0B0D11] border-[#262B38] text-[#94A3B8] hover:text-[#F1F5F9]'
                }`}
              >
                <InfinityIcon className="w-3.5 h-3.5" />
                Infinite Loop
              </button>

              <div className="flex items-center gap-1.5 bg-[#0B0D11] border border-[#262B38] rounded-md px-2.5 h-9">
                <span className="text-[11px] text-[#64748B] whitespace-nowrap">Plays:</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  disabled={isRunning}
                  placeholder="1"
                  value={settings.loopCount === 0 ? '' : settings.loopCount}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (!e.target.value) {
                      onUpdateSettings({ loopCount: 0 });
                    } else {
                      onUpdateSettings({
                        loopCount: Math.max(1, Math.min(100, Math.round(val))),
                      });
                    }
                  }}
                  onFocus={() => {
                    if (settings.loopCount === 0) onUpdateSettings({ loopCount: 1 });
                  }}
                  className="w-full text-xs font-mono tabular-nums bg-transparent text-[#F1F5F9] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-[#CBD5E1]">Seamless Loop Crossfade</span>
              <span className="font-mono text-[11px] tabular-nums text-[#94A3B8]">
                {settings.playMode === 'pingpong'
                  ? 'N/A (Boomerang)'
                  : settings.loopCrossfadeFrames === 0
                  ? 'Off'
                  : `${settings.loopCrossfadeFrames} frames`}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {[0, 4, 8, 12].map((count) => (
                <button
                  key={count}
                  type="button"
                  disabled={isRunning || settings.playMode === 'pingpong'}
                  onClick={() => onUpdateSettings({ loopCrossfadeFrames: count })}
                  className={`flex-1 py-1 text-[11px] font-mono tabular-nums rounded border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    settings.loopCrossfadeFrames === count && settings.playMode !== 'pingpong'
                      ? 'bg-[#1B1F29] border-amber-500/70 text-amber-400'
                      : 'bg-[#0B0D11] border-[#262B38] text-[#94A3B8] hover:text-[#F1F5F9]'
                  }`}
                >
                  {count === 0 ? 'Off' : `${count}f`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-[#CBD5E1]">Hold Final Frame</span>
              <span className="font-mono text-[11px] tabular-nums text-[#94A3B8]">
                +{settings.holdLastFrameMs} ms
              </span>
            </div>
            <div className="flex items-center gap-1">
              {[0, 500, 1000, 1500].map((ms) => (
                <button
                  key={ms}
                  type="button"
                  disabled={isRunning}
                  onClick={() => onUpdateSettings({ holdLastFrameMs: ms })}
                  className={`flex-1 py-1 text-[11px] font-mono tabular-nums rounded border transition-colors cursor-pointer ${
                    settings.holdLastFrameMs === ms
                      ? 'bg-[#1B1F29] border-amber-500/70 text-amber-400'
                      : 'bg-[#0B0D11] border-[#262B38] text-[#94A3B8] hover:text-[#F1F5F9]'
                  }`}
                >
                  {ms === 0 ? 'None' : `${(ms / 1000).toFixed(1)}s`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Dimensions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[#CBD5E1]">Output Dimensions (px)</span>
            <button
              type="button"
              disabled={isRunning}
              onClick={() => onUpdateSettings({ lockAspect: !settings.lockAspect })}
              className="inline-flex items-center gap-1 text-[11px] text-[#94A3B8] hover:text-[#F1F5F9] cursor-pointer"
            >
              {settings.lockAspect ? (
                <>
                  <Lock className="w-3 h-3 text-amber-500" />
                  <span>Aspect Locked</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3 h-3" />
                  <span>Unlocked</span>
                </>
              )}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="width-input" className="block text-[11px] text-[#64748B] mb-1">
                Width
              </label>
              <input
                id="width-input"
                type="number"
                min={16}
                max={3840}
                disabled={isRunning}
                value={settings.width}
                onChange={(e) => handleWidthChange(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-[#0B0D11] border border-[#262B38] rounded-md text-[#F1F5F9] focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label htmlFor="height-input" className="block text-[11px] text-[#64748B] mb-1">
                Height
              </label>
              <input
                id="height-input"
                type="number"
                min={16}
                max={2160}
                disabled={isRunning}
                value={settings.height}
                onChange={(e) => handleHeightChange(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-[#0B0D11] border border-[#262B38] rounded-md text-[#F1F5F9] focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            {[128, 256, 480, 512, 720].map((w) => (
              <button
                key={w}
                type="button"
                disabled={isRunning}
                onClick={() => applyWidthPreset(w)}
                className={`flex-1 py-1 text-[11px] font-mono tabular-nums rounded border transition-colors cursor-pointer ${
                  settings.width === w
                    ? 'bg-[#1B1F29] border-amber-500/70 text-amber-400'
                    : 'bg-[#0B0D11] border-[#262B38] text-[#94A3B8] hover:text-[#F1F5F9]'
                }`}
              >
                {w}px
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pinned Sticky Action & Output Summary */}
      <div className="p-4 border-t border-[#262B38] bg-[#101319] space-y-3 shrink-0">
        <div className="flex items-center justify-between text-xs text-[#94A3B8]">
          <span>Estimated Output</span>
          <span className="font-mono tabular-nums text-[#F1F5F9]">
            {estimatedFrames}f · {frameIntervalMs} ms · {formatBytes(estimatedBufferBytes)} raw
          </span>
        </div>

        {isHeavyExport && (
          <div className="p-2.5 rounded-md bg-amber-950/35 border border-amber-700/40 text-[11px] text-amber-200 space-y-1.5">
            <div className="flex items-start gap-2 leading-snug">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Heavy encode ({estimatedFrames} frames, {formatBytes(estimatedBufferBytes)} RGBA
                buffer). Downscaling speeds up processing.
              </span>
            </div>
            {(settings.fps > 15 || settings.width > 512) && (
              <div className="flex items-center gap-1.5 pl-5">
                {settings.fps > 15 && (
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => onUpdateSettings({ fps: 15 })}
                    className="px-2 py-0.5 text-[10px] font-medium rounded bg-[#1B1F29] hover:bg-[#252B39] border border-amber-500/50 text-amber-300 cursor-pointer"
                  >
                    Drop to 15 fps
                  </button>
                )}
                {settings.width > 512 && (
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => applyWidthPreset(512)}
                    className="px-2 py-0.5 text-[10px] font-medium rounded bg-[#1B1F29] hover:bg-[#252B39] border border-amber-500/50 text-amber-300 cursor-pointer"
                  >
                    Cap 512px
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {job.phase === 'error' && job.errorMessage && (
          <div
            role="alert"
            className="p-2.5 rounded-md bg-red-950/40 border border-red-800/60 text-xs text-red-200 leading-relaxed"
          >
            {job.errorMessage}
          </div>
        )}

        {isRunning ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#CBD5E1] truncate">{job.statusText}</span>
              <span className="font-mono tabular-nums text-amber-400">{job.progress}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-[#1B1F29] overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-150"
                style={{ width: `${job.progress}%` }}
              />
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="w-full py-2 px-4 inline-flex items-center justify-center gap-2 text-xs font-medium text-[#F1F5F9] bg-[#1B1F29] hover:bg-[#252B39] border border-[#262B38] rounded-md transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Cancel Encoding
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onConvert}
            disabled={settings.format === 'webp' && !webpSupported}
            className="w-full py-2.5 px-4 text-sm font-semibold text-[#0B0D11] bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            Convert to{' '}
            {settings.format === 'webp'
              ? 'Animated WebP'
              : settings.format === 'gif'
              ? 'Animated GIF'
              : 'APNG'}
          </button>
        )}

        {/* Encoded Result Summary, Download & Copy */}
        {output && !isRunning && (
          <div className="pt-2.5 border-t border-[#262B38] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {output.optimizedToTarget ? 'Fitted to Target' : 'Ready to Download'}
                </span>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-[#64748B]">
                {(output.elapsedMs / 1000).toFixed(2)}s · q{output.quality}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-y-1 text-xs">
              <span className="text-[#94A3B8]">Output Size</span>
              <span className="text-right font-mono tabular-nums text-[#F1F5F9]">
                {formatBytes(output.size)}
                {sizeDeltaPct !== null && (
                  <span
                    className={`ml-1.5 ${
                      sizeDeltaPct <= 0 ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    ({sizeDeltaPct > 0 ? `+${sizeDeltaPct}%` : `${sizeDeltaPct}%`})
                  </span>
                )}
              </span>

              <span className="text-[#94A3B8]">Resolution · Frames</span>
              <span className="text-right font-mono tabular-nums text-[#F1F5F9]">
                {output.width}×{output.height} · {output.frameCount}f
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onDownload}
                className="flex-1 py-2 px-3 inline-flex items-center justify-center gap-2 text-sm font-semibold text-[#F1F5F9] bg-[#1B1F29] hover:bg-[#242A38] border border-emerald-500/40 rounded-md transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                Download{' '}
                {output.format === 'webp' ? '.webp' : output.format === 'gif' ? '.gif' : '.png'}
              </button>

              <button
                type="button"
                onClick={handleCopyClick}
                title="Copy output image to clipboard (APNG copies animated PNG; WebP/GIF copies frame PNG where restricted)"
                className="py-2 px-3 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-[#CBD5E1] bg-[#0B0D11] hover:bg-[#1B1F29] border border-[#262B38] rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                {copyFeedback === 'Copied' || copyFeedback === 'Copied PNG' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copyFeedback ?? 'Copy'}
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
