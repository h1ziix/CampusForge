/**
 * Fake model catalog for the AI Assistant demo.
 *
 * Switching models only changes presentation (icon, accent color) and a light
 * stylistic flavor applied to the mock response — there is no real inference.
 */
import { Sparkles, Brain, Gem, Atom, Wind, type LucideIcon } from 'lucide-react';
import type { ModelId } from './types';

export interface ModelDef {
  id: ModelId;
  name: string;
  vendor: string;
  tagline: string;
  icon: LucideIcon;
  /** Tailwind text color for the icon. */
  color: string;
  /** Tailwind bg tint used behind the avatar / icon chip. */
  tint: string;
  /** Gradient used on the assistant avatar. */
  gradient: string;
  /** Short persona flavor occasionally prepended to a response. */
  flavor: string;
  /** "context window" label shown in the selector for realism. */
  context: string;
}

export const MODELS: Record<ModelId, ModelDef> = {
  'gpt-4.1': {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    vendor: 'OpenAI',
    tagline: 'Fast, balanced, great all-rounder',
    icon: Sparkles,
    color: 'text-emerald-600 dark:text-emerald-400',
    tint: 'bg-emerald-500/10',
    gradient: 'from-emerald-500 to-teal-600',
    flavor: '',
    context: '128K context',
  },
  'claude-4-sonnet': {
    id: 'claude-4-sonnet',
    name: 'Claude 4 Sonnet',
    vendor: 'Anthropic',
    tagline: 'Thoughtful, nuanced, great for writing',
    icon: Brain,
    color: 'text-orange-600 dark:text-orange-400',
    tint: 'bg-orange-500/10',
    gradient: 'from-orange-500 to-amber-600',
    flavor: "Here's how I'd think about it.",
    context: '200K context',
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    vendor: 'Google',
    tagline: 'Multimodal reasoning at scale',
    icon: Gem,
    color: 'text-blue-600 dark:text-blue-400',
    tint: 'bg-blue-500/10',
    gradient: 'from-blue-500 via-indigo-500 to-violet-600',
    flavor: '',
    context: '1M context',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    vendor: 'DeepSeek',
    tagline: 'Specialized for code & reasoning',
    icon: Atom,
    color: 'text-indigo-600 dark:text-indigo-400',
    tint: 'bg-indigo-500/10',
    gradient: 'from-indigo-500 to-blue-700',
    flavor: 'Let me reason through this step by step.',
    context: '64K context',
  },
  'mistral-large': {
    id: 'mistral-large',
    name: 'Mistral Large',
    vendor: 'Mistral AI',
    tagline: 'Efficient, concise, open-weight',
    icon: Wind,
    color: 'text-rose-600 dark:text-rose-400',
    tint: 'bg-rose-500/10',
    gradient: 'from-rose-500 to-orange-600',
    flavor: '',
    context: '32K context',
  },
};

export const MODEL_LIST: ModelDef[] = Object.values(MODELS);

export function getModel(id: ModelId): ModelDef {
  return MODELS[id] ?? MODELS['gpt-4.1'];
}
