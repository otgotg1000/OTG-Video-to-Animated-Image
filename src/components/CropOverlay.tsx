import React, { useRef, useState } from 'react';
import type { CropAspectPreset, CropRegion } from '../types/studio';

interface CropOverlayProps {
  sourceWidth: number;
  sourceHeight: number;
  crop: CropRegion;
  aspectPreset: CropAspectPreset;
  cornerRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  interactive: boolean;
  onChange: (nextCrop: CropRegion) => void;
}

type HandleType = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface DragState {
  handle: HandleType;
  startX: number;
  startY: number;
  initialCrop: CropRegion;
}

function getTargetRatio(preset: CropAspectPreset): number | null {
  switch (preset) {
    case '16:9':
      return 16 / 9;
    case '1:1':
      return 1;
    case '4:3':
      return 4 / 3;
    case '9:16':
      return 9 / 16;
    default:
      return null;
  }
}

export const CropOverlay: React.FC<CropOverlayProps> = ({
  sourceWidth,
  sourceHeight,
  crop,
  aspectPreset,
  cornerRadius = 0,
  borderWidth = 0,
  borderColor = '#FFFFFF',
  interactive,
  onChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const minSize = Math.min(32, sourceWidth, sourceHeight);

  const startDrag = (handle: HandleType) => (e: React.PointerEvent) => {
    if (!interactive) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragState({
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initialCrop: { ...crop },
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState || !interactive || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const scaleX = sourceWidth / rect.width;
    const scaleY = sourceHeight / rect.height;
    const dx = (e.clientX - dragState.startX) * scaleX;
    const dy = (e.clientY - dragState.startY) * scaleY;

    const init = dragState.initialCrop;
    const ratio = getTargetRatio(aspectPreset);

    if (dragState.handle === 'move') {
      const nextX = Math.max(0, Math.min(sourceWidth - init.width, Math.round(init.x + dx)));
      const nextY = Math.max(0, Math.min(sourceHeight - init.height, Math.round(init.y + dy)));
      onChange({ ...init, x: nextX, y: nextY });
      return;
    }

    let left = init.x;
    let top = init.y;
    let right = init.x + init.width;
    let bottom = init.y + init.height;

    const h = dragState.handle;
    if (h.includes('w')) {
      left = Math.max(0, Math.min(right - minSize, init.x + dx));
    }
    if (h.includes('e')) {
      right = Math.min(sourceWidth, Math.max(left + minSize, init.x + init.width + dx));
    }
    if (h.includes('n')) {
      top = Math.max(0, Math.min(bottom - minSize, init.y + dy));
    }
    if (h.includes('s')) {
      bottom = Math.min(sourceHeight, Math.max(top + minSize, init.y + init.height + dy));
    }

    let width = right - left;
    let height = bottom - top;

    if (ratio !== null) {
      // Adjust height or width to honor locked aspect ratio within source bounds
      if (h === 'n' || h === 's') {
        width = height * ratio;
        if (left + width > sourceWidth) {
          width = sourceWidth - left;
          height = width / ratio;
          if (h === 'n') top = bottom - height;
        }
      } else {
        height = width / ratio;
        if (h.includes('n')) {
          top = bottom - height;
          if (top < 0) {
            top = 0;
            height = bottom;
            width = height * ratio;
            if (h.includes('w')) left = right - width;
          }
        } else {
          if (top + height > sourceHeight) {
            height = sourceHeight - top;
            width = height * ratio;
            if (h.includes('w')) left = right - width;
          }
        }
      }

      if (left < 0) {
        left = 0;
        width = right;
        height = width / ratio;
      }
      if (left + width > sourceWidth) {
        width = sourceWidth - left;
        height = width / ratio;
      }
    }

    const finalX = Math.max(0, Math.round(left));
    const finalY = Math.max(0, Math.round(top));
    const finalW = Math.max(minSize, Math.min(sourceWidth - finalX, Math.round(width)));
    const finalH = Math.max(minSize, Math.min(sourceHeight - finalY, Math.round(height)));

    onChange({
      x: finalX,
      y: finalY,
      width: finalW,
      height: finalH,
    });
  };

  const endDrag = () => {
    setDragState(null);
  };

  const leftPct = (crop.x / sourceWidth) * 100;
  const topPct = (crop.y / sourceHeight) * 100;
  const widthPct = (crop.width / sourceWidth) * 100;
  const heightPct = (crop.height / sourceHeight) * 100;

  const rxPct =
    cornerRadius > 0
      ? cornerRadius * Math.min(1, crop.height / Math.max(1, crop.width))
      : 0;
  const ryPct =
    cornerRadius > 0
      ? cornerRadius * Math.min(1, crop.width / Math.max(1, crop.height))
      : 0;

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`absolute inset-0 overflow-hidden rounded select-none ${
        interactive ? 'touch-none' : 'pointer-events-none'
      }`}
    >
      {/* Active Crop Box with darkened exterior mask */}
      <div
        onPointerDown={startDrag('move')}
        style={{
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: `${widthPct}%`,
          height: `${heightPct}%`,
          borderRadius: cornerRadius > 0 ? `${rxPct.toFixed(2)}% / ${ryPct.toFixed(2)}%` : undefined,
          boxShadow:
            borderWidth > 0
              ? `inset 0 0 0 ${Math.max(1, Math.round(borderWidth * 0.6))}px ${borderColor}, 0 0 0 9999px rgba(8, 9, 12, 0.72)`
              : '0 0 0 9999px rgba(8, 9, 12, 0.72)',
        }}
        className={`absolute border ${
          interactive
            ? 'border-amber-400 cursor-move'
            : 'border-amber-400/75 border-dashed'
        }`}
      >
        {/* Subtle rule-of-thirds guides while editing */}
        {interactive && (
          <>
            <div className="absolute inset-y-0 left-1/3 w-px bg-white/20 pointer-events-none" />
            <div className="absolute inset-y-0 left-2/3 w-px bg-white/20 pointer-events-none" />
            <div className="absolute inset-x-0 top-1/3 h-px bg-white/20 pointer-events-none" />
            <div className="absolute inset-x-0 top-2/3 h-px bg-white/20 pointer-events-none" />
          </>
        )}

        {/* Dimension badge */}
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-[#0B0D11]/85 border border-[#262B38] font-mono text-[10px] tabular-nums text-amber-300 pointer-events-none">
          {crop.width}×{crop.height}
        </div>

        {/* 8 Resize Handles */}
        {interactive && (
          <>
            <div
              onPointerDown={startDrag('nw')}
              className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-amber-400 border border-[#0B0D11] rounded-xs cursor-nwse-resize"
            />
            <div
              onPointerDown={startDrag('n')}
              className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-5 h-2.5 bg-amber-400 border border-[#0B0D11] rounded-xs cursor-ns-resize"
            />
            <div
              onPointerDown={startDrag('ne')}
              className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber-400 border border-[#0B0D11] rounded-xs cursor-nesw-resize"
            />
            <div
              onPointerDown={startDrag('e')}
              className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-2.5 h-5 bg-amber-400 border border-[#0B0D11] rounded-xs cursor-ew-resize"
            />
            <div
              onPointerDown={startDrag('se')}
              className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-amber-400 border border-[#0B0D11] rounded-xs cursor-nwse-resize"
            />
            <div
              onPointerDown={startDrag('s')}
              className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-2.5 bg-amber-400 border border-[#0B0D11] rounded-xs cursor-ns-resize"
            />
            <div
              onPointerDown={startDrag('sw')}
              className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-amber-400 border border-[#0B0D11] rounded-xs cursor-nesw-resize"
            />
            <div
              onPointerDown={startDrag('w')}
              className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-2.5 h-5 bg-amber-400 border border-[#0B0D11] rounded-xs cursor-ew-resize"
            />
          </>
        )}
      </div>
    </div>
  );
};
