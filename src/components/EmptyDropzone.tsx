import React, { useState } from 'react';
import { Film, Loader2, Upload } from 'lucide-react';

interface EmptyDropzoneProps {
  onFileSelected: (file: File) => void;
  onOpenFilePicker: () => void;
  onLoadSample: () => void;
  isLoadingFile: boolean;
  isGeneratingSample: boolean;
  loadError: string | null;
}

export const EmptyDropzone: React.FC<EmptyDropzoneProps> = ({
  onFileSelected,
  onOpenFilePicker,
  onLoadSample,
  isLoadingFile,
  isGeneratingSample,
  loadError,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const busy = isLoadingFile || isGeneratingSample;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!busy) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onFileSelected(file);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6 md:p-10">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`w-full max-w-2xl rounded-xl border transition-colors p-8 md:p-12 text-center bg-[#13161D] ${
          isDragging
            ? 'border-amber-500 bg-[#181C26]'
            : 'border-[#262B38] hover:border-[#363D4F]'
        }`}
      >
        <div className="mx-auto mb-5 w-12 h-12 rounded-lg bg-[#1B1F29] border border-[#262B38] flex items-center justify-center text-amber-500">
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Film className="w-5 h-5" />}
        </div>

        <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight text-[#F1F5F9] text-balance">
          Convert video clips to Animated WebP, APNG, or GIF
        </h1>
        <p className="mt-3 text-sm text-[#94A3B8] max-w-lg mx-auto leading-relaxed">
          Trim exact frame ranges, dial in FPS and dimensions, tune compression quality, and encode
          directly in your browser with zero server uploads.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onOpenFilePicker}
            disabled={busy}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#0B0D11] bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <Upload className="w-4 h-4" />
            {isLoadingFile ? 'Reading Video...' : 'Select Video File'}
          </button>

          <button
            type="button"
            onClick={onLoadSample}
            disabled={busy}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[#F1F5F9] bg-[#1B1F29] hover:bg-[#232836] border border-[#262B38] disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            {isGeneratingSample ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                Generating Sample...
              </>
            ) : (
              'Load Sample Clip'
            )}
          </button>
        </div>

        {loadError && (
          <div
            role="alert"
            className="mt-6 px-4 py-3 rounded-md bg-red-950/50 border border-red-800/70 text-xs text-red-200 text-left max-w-lg mx-auto"
          >
            {loadError}
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-[#262B38] flex flex-wrap items-center justify-center gap-2 text-xs text-[#64748B]">
          <span>Drop MP4, MKV, MOV, or WebM</span>
          <span aria-hidden="true">·</span>
          <span>24-bit color &amp; alpha support</span>
          <span aria-hidden="true">·</span>
          <span>100% client-side encoding</span>
        </div>
      </div>
    </div>
  );
};
