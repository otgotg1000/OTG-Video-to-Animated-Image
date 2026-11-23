import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface FormatGuideProps {
  onBackToWorkspace: () => void;
}

export const FormatGuide: React.FC<FormatGuideProps> = ({ onBackToWorkspace }) => {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-10">
      <div className="max-w-4xl mx-auto space-y-10">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#262B38] pb-6">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-[#F1F5F9]">
              Animated WebP vs. APNG Guide
            </h1>
            <p className="mt-1.5 text-sm text-[#94A3B8]">
              Choosing the right format and encoder settings for UI motion, web optimization, and
              lossless archival clips.
            </p>
          </div>

          <button
            type="button"
            onClick={onBackToWorkspace}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-[#F1F5F9] bg-[#1B1F29] hover:bg-[#242A38] border border-[#262B38] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Workspace
          </button>
        </div>

        {/* Comparison Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="p-6 rounded-xl bg-[#13161D] border border-[#262B38] space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-semibold text-amber-400">Animated WebP</h2>
              <span className="font-mono text-xs text-[#64748B]">.webp</span>
            </div>
            <p className="text-sm text-[#CBD5E1] leading-relaxed">
              Modern RIFF container (<code className="font-mono text-xs text-[#F1F5F9]">VP8X</code>{' '}
              + <code className="font-mono text-xs text-[#F1F5F9]">ANIM</code> +{' '}
              <code className="font-mono text-xs text-[#F1F5F9]">ANMF</code>) built for web speed.
              Typically 50–80% smaller than GIF or lossless APNG while keeping full 24-bit color.
            </p>
            <ul className="space-y-2 text-xs text-[#94A3B8] pt-2 border-t border-[#262B38]">
              <li>Best for: Product demos, marketing hero loops, Notion/Slack embeds</li>
              <li>Recommended FPS: 12–24 fps</li>
              <li>Recommended Quality: 75%–88%</li>
              <li>Support: Chrome, Firefox, Edge, Safari 14+</li>
            </ul>
          </div>

          <div className="p-6 rounded-xl bg-[#13161D] border border-[#262B38] space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-semibold text-[#F1F5F9]">
                Animated PNG (APNG)
              </h2>
              <span className="font-mono text-xs text-[#64748B]">.png</span>
            </div>
            <p className="text-sm text-[#CBD5E1] leading-relaxed">
              Backwards-compatible PNG extension supporting crisp pixel-exact frames and full 8-bit
              alpha transparency without VP8 macro-blocking artifacts on sharp UI typography.
            </p>
            <ul className="space-y-2 text-xs text-[#94A3B8] pt-2 border-t border-[#262B38]">
              <li>Best for: Crisp UI captures, pixel art, software stickers, lossless clips</li>
              <li>Quality 100%: True lossless 32-bit RGBA</li>
              <li>Quality 10%–99%: Adaptive palette quantization (16–256 colors)</li>
              <li>Support: Universal across modern desktop &amp; mobile browsers</li>
            </ul>
          </div>

          <div className="p-6 rounded-xl bg-[#13161D] border border-[#262B38] space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-semibold text-[#F1F5F9]">Animated GIF</h2>
              <span className="font-mono text-xs text-[#64748B]">.gif</span>
            </div>
            <p className="text-sm text-[#CBD5E1] leading-relaxed">
              Classic GIF89a format with adaptive 24–256 color palettes and 1-bit transparency.
              Ideal when targeting legacy email clients, GitHub issues, or older CMS platforms.
            </p>
            <ul className="space-y-2 text-xs text-[#94A3B8] pt-2 border-t border-[#262B38]">
              <li>Best for: GitHub PRs, email campaigns, legacy forum/CMS embeds</li>
              <li>Recommended FPS: 12–20 fps</li>
              <li>Color depth: Up to 256 colors per frame + 1-bit alpha</li>
              <li>Support: Universal across virtually every viewer since 1989</li>
            </ul>
          </div>
        </div>

        {/* Practical Presets Table */}
        <div className="rounded-xl bg-[#13161D] border border-[#262B38] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#262B38]">
            <h2 className="font-display text-base font-semibold text-[#F1F5F9]">
              Recommended Export Presets
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#262B38] text-[#64748B]">
                  <th className="py-3 px-6 font-medium">Use Case</th>
                  <th className="py-3 px-4 font-medium">Format</th>
                  <th className="py-3 px-4 font-medium text-right">FPS</th>
                  <th className="py-3 px-4 font-medium text-right">Max Width</th>
                  <th className="py-3 px-6 font-medium text-right">Quality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262B38] text-[#CBD5E1]">
                <tr className="hover:bg-[#1B1F29]/50">
                  <td className="py-3 px-6 font-medium text-[#F1F5F9]">Documentation &amp; READMEs</td>
                  <td className="py-3 px-4">Animated WebP</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">15</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">720 px</td>
                  <td className="py-3 px-6 text-right font-mono tabular-nums">82%</td>
                </tr>
                <tr className="hover:bg-[#1B1F29]/50">
                  <td className="py-3 px-6 font-medium text-[#F1F5F9]">Pixel-Sharp UI Recording</td>
                  <td className="py-3 px-4">APNG</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">15</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">720 px</td>
                  <td className="py-3 px-6 text-right font-mono tabular-nums">100%</td>
                </tr>
                <tr className="hover:bg-[#1B1F29]/50">
                  <td className="py-3 px-6 font-medium text-[#F1F5F9]">Chat Sticker / Reaction</td>
                  <td className="py-3 px-4">APNG</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">20</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">320 px</td>
                  <td className="py-3 px-6 text-right font-mono tabular-nums">80%</td>
                </tr>
                <tr className="hover:bg-[#1B1F29]/50">
                  <td className="py-3 px-6 font-medium text-[#F1F5F9]">GitHub Issue / Email Embed</td>
                  <td className="py-3 px-4">Animated GIF</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">15</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">480 px</td>
                  <td className="py-3 px-6 text-right font-mono tabular-nums">80%</td>
                </tr>
                <tr className="hover:bg-[#1B1F29]/50">
                  <td className="py-3 px-6 font-medium text-[#F1F5F9]">Smooth Motion Showcase</td>
                  <td className="py-3 px-4">Animated WebP</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">30</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">960 px</td>
                  <td className="py-3 px-6 text-right font-mono tabular-nums">88%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
