import { useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import type { LLMSettings } from '../engine/types';

interface SettingsModalProps {
  isOpen: boolean;
  settings: LLMSettings;
  onSave: (next: LLMSettings) => void;
  onClose: () => void;
}

export function SettingsModal({
  isOpen,
  settings,
  onSave,
  onClose,
}: SettingsModalProps) {
  const [draft, setDraft] = useState<LLMSettings>(settings);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-xl border border-[#252D3F] bg-[#0F131C] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1E2534] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-100">
              Runtime & BYOK LLM Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-[#151922] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between rounded-lg border border-[#1E2534] bg-[#151922] p-3">
            <div>
              <div className="text-xs font-semibold text-slate-200">
                Enable Live OpenAI-Compatible API
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                Off by default — deterministic simulation runs all templates out
                of the box.
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.enabled}
              onClick={() => setDraft((d) => ({ ...d, enabled: !d.enabled }))}
              className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                draft.enabled ? 'bg-emerald-500' : 'bg-[#252D3F]'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  draft.enabled ? 'translate-x-4' : ''
                }`}
              />
            </button>
          </div>

          <div className={`space-y-3 ${draft.enabled ? '' : 'opacity-55'}`}>
            <div>
              <label className="block text-[11px] font-medium text-slate-400">
                Endpoint URL
              </label>
              <input
                type="url"
                disabled={!draft.enabled}
                value={draft.apiUrl}
                onChange={(e) => setDraft((d) => ({ ...d, apiUrl: e.target.value }))}
                className="mt-1 h-8 w-full rounded-md border border-[#252D3F] bg-[#0B0E14] px-2.5 font-mono text-xs text-slate-100 outline-none focus:border-cyan-500/60"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400">
                API Key (stored locally in browser)
              </label>
              <input
                type="password"
                disabled={!draft.enabled}
                placeholder="sk-..."
                value={draft.apiKey}
                onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
                className="mt-1 h-8 w-full rounded-md border border-[#252D3F] bg-[#0B0E14] px-2.5 font-mono text-xs text-slate-100 outline-none focus:border-cyan-500/60"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400">
                Default Model
              </label>
              <input
                type="text"
                disabled={!draft.enabled}
                value={draft.model}
                onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
                className="mt-1 h-8 w-full rounded-md border border-[#252D3F] bg-[#0B0E14] px-2.5 font-mono text-xs text-slate-100 outline-none focus:border-cyan-500/60"
              />
            </div>
          </div>

          <div className="border-t border-[#1E2534] pt-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-slate-300">
                Step Animation Delay
              </label>
              <span className="font-mono text-xs text-cyan-300">
                {draft.stepDelayMs}ms
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={600}
              step={40}
              value={draft.stepDelayMs}
              onChange={(e) =>
                setDraft((d) => ({ ...d, stepDelayMs: Number(e.target.value) }))
              }
              className="mt-2 w-full accent-cyan-400"
            />
            <div className="flex justify-between font-mono text-[10px] text-slate-500">
              <span>0ms (Instant)</span>
              <span>280ms (Balanced)</span>
              <span>600ms (Trace)</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#1E2534] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-md border border-[#252D3F] bg-[#151922] px-3 text-xs text-slate-300 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="h-8 rounded-md border border-cyan-500/50 bg-cyan-500/20 px-3.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/30"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
