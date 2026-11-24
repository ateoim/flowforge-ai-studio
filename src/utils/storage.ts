import type { ExecutionRun, LLMSettings } from '../engine/types';

const HISTORY_KEY = 'flowforge_run_history_v1';
const SETTINGS_KEY = 'flowforge_llm_settings_v1';
const MAX_HISTORY_ITEMS = 25;

export const DEFAULT_LLM_SETTINGS: LLMSettings = {
  enabled: false,
  apiUrl:
    (import.meta.env.VITE_LLM_API_URL as string | undefined) ||
    'https://api.openai.com/v1/chat/completions',
  apiKey: (import.meta.env.VITE_LLM_API_KEY as string | undefined) || '',
  model: (import.meta.env.VITE_LLM_MODEL as string | undefined) || 'gpt-4o-mini',
  stepDelayMs: 280,
};

export function loadRunHistory(): ExecutionRun[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ExecutionRun[]) : [];
  } catch {
    return [];
  }
}

export function saveRunHistory(runs: ExecutionRun[]): void {
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(runs.slice(0, MAX_HISTORY_ITEMS)),
    );
  } catch {
    // Ignore storage quota errors in restricted environments
  }
}

export function loadLLMSettings(): LLMSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_LLM_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<LLMSettings>;
    return {
      ...DEFAULT_LLM_SETTINGS,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_LLM_SETTINGS };
  }
}

export function saveLLMSettings(settings: LLMSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}
