import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  CopyPlus,
  Layers,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { formatTimecode } from '../lib/formatters';
import type { CapturedFrame } from '../types/studio';

interface FrameEditorProps {
  frames: CapturedFrame[];
  isBusy: boolean;
  onDeleteFrame: (frameId: string) => void;
  onUpdateDelay: (frameId: string, durationMs: number) => void;
  onDuplicateFrame: (frameId: string) => void;
  onMoveFrame: (frameId: string, direction: -1 | 1) => void;
  onDeduplicateFrames: () => number;
  onCaptureFrames: () => void;
  onApplyAndReencode: () => void;
}

export const FrameEditor: React.FC<FrameEditorProps> = ({
  frames,
  isBusy,
  onDeleteFrame,
  onUpdateDelay,
  onDuplicateFrame,
  onMoveFrame,
  onDeduplicateFrames,
  onCaptureFrames,
  onApplyAndReencode,
}) => {
  const [dedupStatus, setDedupStatus] = useState<string | null>(null);
  const totalDurationMs = frames.reduce((sum, f) => sum + f.durationMs, 0);

  const handleDedupClick = () => {
    const removed = onDeduplicateFrames();
    setDedupStatus(
      removed > 0
        ? `Merged ${removed} static ${removed === 1 ? 'frame' : 'frames'}`
        : 'No static duplicates found'
    );
    window.setTimeout(() => setDedupStatus(null), 3200);
  };

  if (frames.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center rounded-lg border border-[#262B38] bg-[#08090C] p-8 text-center">
        <p className="text-sm font-medium text-[#F1F5F9]">No extracted frames yet</p>
        <p className="mt-1.5 text-xs text-[#94A3B8] max-w-md">
          Extract frames using your current trim, crop, speed, and dimension settings to inspect,
          reorder, deduplicate static frames, remove unwanted frames, or customize hold durations.
        </p>
        <button
          type="button"
          disabled={isBusy}
          onClick={onCaptureFrames}
          className="mt-5 px-4 py-2 text-xs font-semibold text-[#0B0D11] bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          Extract Frames Now
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col rounded-lg border border-[#262B38] bg-[#08090C] overflow-hidden">
      {/* Frame Editor Toolbar */}
      <div className="px-4 py-2.5 border-b border-[#262B38] bg-[#13161D] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
          <span className="font-mono tabular-nums text-[#F1F5F9] font-medium">
            {frames.length} frames
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            Total {(totalDurationMs / 1000).toFixed(2)}s
          </span>
          {dedupStatus && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-amber-400 font-medium">{dedupStatus}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isBusy || frames.length <= 1}
            onClick={handleDedupClick}
            title="Merge consecutive identical frames and preserve total playback timing"
            className="px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-[#CBD5E1] bg-[#1B1F29] hover:bg-[#242A38] border border-[#262B38] rounded-md transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            Dedup Static
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={onCaptureFrames}
            className="px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-[#CBD5E1] bg-[#1B1F29] hover:bg-[#242A38] border border-[#262B38] rounded-md transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Re-extract
          </button>

          <button
            type="button"
            disabled={isBusy || frames.length === 0}
            onClick={onApplyAndReencode}
            className="px-3.5 py-1.5 text-xs font-semibold text-[#0B0D11] bg-amber-500 hover:bg-amber-400 rounded-md transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            Encode Edited Frames
          </button>
        </div>
      </div>

      {/* Scrollable Frame Grid */}
      <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 content-start">
        {frames.map((frame, idx) => (
          <div
            key={frame.id}
            className="group rounded-md border border-[#262B38] bg-[#13161D] overflow-hidden flex flex-col"
          >
            <div className="relative aspect-video studio-checkerboard flex items-center justify-center overflow-hidden">
              {frame.previewUrl && (
                <img
                  src={frame.previewUrl}
                  alt={`Frame ${idx + 1}`}
                  className="max-h-full max-w-full object-contain"
                />
              )}

              <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-[#0B0D11]/85 font-mono text-[10px] tabular-nums text-[#F1F5F9]">
                #{idx + 1}
              </span>

              <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                {idx > 0 && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onMoveFrame(frame.id, -1)}
                    title="Move frame left"
                    className="p-1 rounded bg-[#0B0D11]/90 text-[#CBD5E1] hover:text-amber-400 border border-[#262B38] cursor-pointer"
                  >
                    <ArrowLeft className="w-3 h-3" />
                  </button>
                )}
                {idx < frames.length - 1 && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onMoveFrame(frame.id, 1)}
                    title="Move frame right"
                    className="p-1 rounded bg-[#0B0D11]/90 text-[#CBD5E1] hover:text-amber-400 border border-[#262B38] cursor-pointer"
                  >
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onDuplicateFrame(frame.id)}
                  title="Duplicate frame"
                  className="p-1 rounded bg-[#0B0D11]/90 text-[#CBD5E1] hover:text-amber-400 border border-[#262B38] cursor-pointer"
                >
                  <CopyPlus className="w-3 h-3" />
                </button>
                {frames.length > 1 && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onDeleteFrame(frame.id)}
                    title="Remove frame"
                    className="p-1 rounded bg-[#0B0D11]/90 text-[#CBD5E1] hover:text-red-400 border border-[#262B38] cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="p-2 flex items-center justify-between gap-2 border-t border-[#262B38]">
              <span className="font-mono text-[10px] tabular-nums text-[#64748B]">
                {formatTimecode(frame.timestamp)}
              </span>

              <label className="inline-flex items-center gap-1 text-[10px] text-[#94A3B8]">
                <Clock className="w-2.5 h-2.5 text-[#64748B]" />
                <input
                  type="number"
                  min={10}
                  max={10000}
                  step={10}
                  disabled={isBusy}
                  value={frame.durationMs}
                  onChange={(e) => {
                    const val = Math.max(10, Math.min(10000, Number(e.target.value) || 10));
                    onUpdateDelay(frame.id, val);
                  }}
                  aria-label={`Frame ${idx + 1} duration in milliseconds`}
                  className="w-12 px-1 py-0.5 text-right font-mono tabular-nums bg-[#0B0D11] border border-[#262B38] rounded text-[#F1F5F9] focus:outline-none focus:border-amber-500"
                />
                <span>ms</span>
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
