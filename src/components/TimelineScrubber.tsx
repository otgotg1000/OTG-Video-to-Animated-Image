import React, { useRef, useState } from 'react';
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { formatTimecode } from '../lib/formatters';

interface TimelineScrubberProps {
  duration: number;
  currentTime: number;
  trimStart: number;
  trimEnd: number;
  fps: number;
  isPlaying: boolean;
  thumbnails: string[];
  onSeek: (time: number) => void;
  onTrimChange: (start: number, end: number) => void;
  onTogglePlay: () => void;
  onResetTrim: () => void;
}

type DragMode = 'playhead' | 'start' | 'end' | null;

export const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  duration,
  currentTime,
  trimStart,
  trimEnd,
  fps,
  isPlaying,
  thumbnails,
  onSeek,
  onTrimChange,
  onTogglePlay,
  onResetTrim,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);

  const minClip = Math.min(0.1, duration * 0.1);

  const pointerToTime = (clientX: number): number => {
    const el = trackRef.current;
    if (!el || duration <= 0) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  const handlePointerDown = (mode: DragMode) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragMode(mode);

    const t = pointerToTime(e.clientX);
    if (mode === 'playhead') {
      onSeek(Math.max(trimStart, Math.min(trimEnd, t)));
    } else if (mode === 'start') {
      const nextStart = Math.max(0, Math.min(trimEnd - minClip, t));
      onTrimChange(nextStart, trimEnd);
      onSeek(nextStart);
    } else if (mode === 'end') {
      const nextEnd = Math.min(duration, Math.max(trimStart + minClip, t));
      onTrimChange(trimStart, nextEnd);
      onSeek(nextEnd);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragMode) return;
    const t = pointerToTime(e.clientX);
    if (dragMode === 'playhead') {
      onSeek(Math.max(trimStart, Math.min(trimEnd, t)));
    } else if (dragMode === 'start') {
      const nextStart = Math.max(0, Math.min(trimEnd - minClip, t));
      onTrimChange(nextStart, trimEnd);
      onSeek(nextStart);
    } else if (dragMode === 'end') {
      const nextEnd = Math.min(duration, Math.max(trimStart + minClip, t));
      onTrimChange(trimStart, nextEnd);
      onSeek(nextEnd);
    }
  };

  const handlePointerUp = () => {
    setDragMode(null);
  };

  const startPct = duration > 0 ? (trimStart / duration) * 100 : 0;
  const endPct = duration > 0 ? (trimEnd / duration) * 100 : 100;
  const playheadPct = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;
  const stepSec = 1 / Math.max(1, fps);
  const isTrimmed = trimStart > 0.01 || trimEnd < duration - 0.01;

  return (
    <div className="border-t border-[#262B38] bg-[#13161D] px-4 py-3.5 select-none">
      {/* Transport & Timecode Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause source video' : 'Play source video'}
            title="Play / Pause (Space)"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-[#1B1F29] hover:bg-[#242938] border border-[#262B38] text-[#F1F5F9] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => onSeek(Math.max(trimStart, currentTime - stepSec))}
            aria-label="Step back one frame"
            title="Previous frame"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-[#1B1F29] hover:bg-[#242938] border border-[#262B38] text-[#94A3B8] hover:text-[#F1F5F9] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onSeek(Math.min(trimEnd, currentTime + stepSec))}
            aria-label="Step forward one frame"
            title="Next frame"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-[#1B1F29] hover:bg-[#242938] border border-[#262B38] text-[#94A3B8] hover:text-[#F1F5F9] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>

          <div className="h-4 w-px bg-[#262B38] mx-1" aria-hidden="true" />

          {[
            { delta: -5, label: '-5s', title: 'Seek backward 5 seconds' },
            { delta: -1, label: '-1s', title: 'Seek backward 1 second' },
            { delta: -0.5, label: '-0.5s', title: 'Seek backward 0.5 seconds' },
            { delta: 0.5, label: '+0.5s', title: 'Seek forward 0.5 seconds' },
            { delta: 1, label: '+1s', title: 'Seek forward 1 second' },
            { delta: 5, label: '+5s', title: 'Seek forward 5 seconds' },
          ].map((btn) => (
            <button
              key={btn.label}
              type="button"
              onClick={() =>
                onSeek(Math.max(0, Math.min(duration, currentTime + btn.delta)))
              }
              aria-label={btn.title}
              title={btn.title}
              className="h-8 px-2 inline-flex items-center justify-center rounded-md bg-[#1B1F29] hover:bg-[#242938] border border-[#262B38] font-mono text-[11px] tabular-nums text-[#CBD5E1] hover:text-[#F1F5F9] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              {btn.label}
            </button>
          ))}

          <div className="h-4 w-px bg-[#262B38] mx-1" aria-hidden="true" />

          <button
            type="button"
            onClick={() => {
              const clamped = Math.min(currentTime, trimEnd - minClip);
              onTrimChange(Math.max(0, clamped), trimEnd);
            }}
            className="h-8 px-2.5 text-xs font-medium rounded-md bg-[#1B1F29] hover:bg-[#242938] border border-[#262B38] text-[#CBD5E1] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            Set In
          </button>

          <button
            type="button"
            onClick={() => {
              const clamped = Math.max(currentTime, trimStart + minClip);
              onTrimChange(trimStart, Math.min(duration, clamped));
            }}
            className="h-8 px-2.5 text-xs font-medium rounded-md bg-[#1B1F29] hover:bg-[#242938] border border-[#262B38] text-[#CBD5E1] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            Set Out
          </button>

          {isTrimmed && (
            <button
              type="button"
              onClick={onResetTrim}
              title="Reset trim to full clip"
              className="h-8 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium rounded-md text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#1B1F29] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>

        {/* Tabular Timecode Readout */}
        <div className="flex items-center gap-2 font-mono text-xs tabular-nums text-[#94A3B8]">
          <span className="text-[#F1F5F9] font-medium">{formatTimecode(currentTime)}</span>
          <span aria-hidden="true">/</span>
          <span>{formatTimecode(duration)}</span>
          <span aria-hidden="true" className="text-[#475569]">·</span>
          <span className="text-amber-400">
            Clip {formatTimecode(Math.max(0, trimEnd - trimStart))}
          </span>
        </div>
      </div>

      {/* Filmstrip Trim Track */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown('playhead')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative h-14 rounded-md overflow-hidden border border-[#262B38] bg-[#0B0D11] cursor-ew-resize touch-none"
      >
        {/* Thumbnail Strip */}
        <div className="absolute inset-0 flex">
          {thumbnails.length > 0 ? (
            thumbnails.map((src, idx) => (
              <img
                key={idx}
                src={src}
                alt={`Timeline frame ${idx + 1}`}
                draggable={false}
                className="h-full flex-1 object-cover opacity-80 pointer-events-none"
              />
            ))
          ) : (
            <div className="w-full h-full bg-[#13161D]" />
          )}
        </div>

        {/* Dimmed Excluded Left Region */}
        <div
          className="absolute inset-y-0 left-0 bg-[#0B0D11]/75 pointer-events-none"
          style={{ width: `${startPct}%` }}
        />

        {/* Dimmed Excluded Right Region */}
        <div
          className="absolute inset-y-0 right-0 bg-[#0B0D11]/75 pointer-events-none"
          style={{ width: `${Math.max(0, 100 - endPct)}%` }}
        />

        {/* Active Trim Window Border */}
        <div
          className="absolute inset-y-0 border-y-2 border-amber-500 pointer-events-none"
          style={{
            left: `${startPct}%`,
            width: `${Math.max(0, endPct - startPct)}%`,
          }}
        />

        {/* Start Trim Handle */}
        <div
          role="slider"
          aria-label="Trim start time"
          aria-valuemin={0}
          aria-valuemax={trimEnd}
          aria-valuenow={Number(trimStart.toFixed(2))}
          tabIndex={0}
          onPointerDown={handlePointerDown('start')}
          style={{ left: `${startPct}%` }}
          className="absolute inset-y-0 -translate-x-1/2 w-3.5 bg-amber-500 hover:bg-amber-400 flex items-center justify-center cursor-col-resize z-20 rounded-l-sm"
        >
          <span className="w-0.5 h-5 bg-[#0B0D11] rounded-full" />
        </div>

        {/* End Trim Handle */}
        <div
          role="slider"
          aria-label="Trim end time"
          aria-valuemin={trimStart}
          aria-valuemax={duration}
          aria-valuenow={Number(trimEnd.toFixed(2))}
          tabIndex={0}
          onPointerDown={handlePointerDown('end')}
          style={{ left: `${endPct}%` }}
          className="absolute inset-y-0 -translate-x-1/2 w-3.5 bg-amber-500 hover:bg-amber-400 flex items-center justify-center cursor-col-resize z-20 rounded-r-sm"
        >
          <span className="w-0.5 h-5 bg-[#0B0D11] rounded-full" />
        </div>

        {/* Playhead Needle */}
        <div
          style={{ left: `${playheadPct}%` }}
          className="absolute inset-y-0 -translate-x-1/2 w-0.5 bg-[#F1F5F9] z-10 pointer-events-none"
        >
          <div className="w-2.5 h-2.5 -ml-[4px] bg-[#F1F5F9] rotate-45 -mt-1" />
        </div>
      </div>
    </div>
  );
};
