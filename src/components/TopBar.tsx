import React from 'react';

export type ActiveTab = 'workspace' | 'guide';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenFilePicker: () => void;
  isBusy: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onOpenFilePicker,
  isBusy,
}) => {
  return (
    <header className="h-14 border-b border-[#262B38] bg-[#0B0D11] px-6 flex items-center justify-between gap-8 shrink-0">
      {/* Zone 1: Single-element brand wordmark */}
      <button
        type="button"
        onClick={() => onSelectTab('workspace')}
        className="font-display text-base font-semibold tracking-tight text-[#F1F5F9] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
      >
        OTG Video to Animated Image
      </button>

      {/* Zone 2: Clean single-line text navigation */}
      <nav aria-label="Primary navigation" className="flex items-center gap-6">
        <button
          type="button"
          onClick={() => onSelectTab('workspace')}
          className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-sm ${
            activeTab === 'workspace'
              ? 'border-amber-500 text-[#F1F5F9]'
              : 'border-transparent text-[#94A3B8] hover:text-[#F1F5F9]'
          }`}
        >
          Workspace
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('guide')}
          className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-sm ${
            activeTab === 'guide'
              ? 'border-amber-500 text-[#F1F5F9]'
              : 'border-transparent text-[#94A3B8] hover:text-[#F1F5F9]'
          }`}
        >
          Format Guide
        </button>
      </nav>

      {/* Zone 3: Single primary action */}
      <div className="shrink-0">
        <button
          type="button"
          onClick={onOpenFilePicker}
          disabled={isBusy}
          className="px-4 py-2 text-xs font-semibold text-[#0B0D11] bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0D11]"
        >
          Open Video
        </button>
      </div>
    </header>
  );
};
