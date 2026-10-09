'use client';

import * as React from 'react';
import { Sun, Moon, Monitor, Download, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { MODEL_LIST } from '@/lib/assistant/models';
import type {
  AssistantSettings,
  ModelId,
  ResponseLength,
  ThemePreference,
} from '@/lib/assistant/types';
import { cn } from '@/lib/utils';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AssistantSettings;
  onChange: (patch: Partial<AssistantSettings>) => void;
  onExport: () => void;
  onClearHistory: () => void;
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

const LENGTHS: { value: ResponseLength; label: string }[] = [
  { value: 'concise', label: 'Concise' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'detailed', label: 'Detailed' },
];

const LANGUAGES = [
  'English',
  'Español',
  'Français',
  'Deutsch',
  'Русский',
  '中文',
  'العربية',
  'हिन्दी',
];

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: typeof Sun }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
      {options.map((opt) => {
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              value === opt.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Switch({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function UnavailableBadge() {
  return (
    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      Unavailable
    </span>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onChange,
  onExport,
  onClearHistory,
}: SettingsDialogProps) {
  const [confirmClear, setConfirmClear] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="cf-scroll max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Demo settings</DialogTitle>
          <DialogDescription>
            Local interface preferences. No selected model is called, and sample replies are not
            based on your files or workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y">
          {/* Appearance */}
          <div className="pb-1">
            <p className="pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Appearance
            </p>
            <Row label="Theme" hint="Match the rest of CampusForge">
              <Segmented
                options={THEME_OPTIONS}
                value={settings.theme}
                onChange={(v) => onChange({ theme: v })}
              />
            </Row>
            <Row label="Language" hint="Unavailable in this demo">
              <select
                aria-label="Language"
                value={settings.language}
                disabled
                className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Row>
          </div>

          {/* Model behavior */}
          <div className="pb-1">
            <p className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Demo reply style
            </p>
            <Row label="Default demo style" hint="Changes sample tone and avatar only">
              <select
                aria-label="Default demo style"
                value={settings.model}
                onChange={(e) => onChange({ model: e.target.value as ModelId })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {MODEL_LIST.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Temperature" hint="Unavailable; no effect on sample replies">
              <div className="flex w-40 items-center gap-2">
                <span className="text-xs text-muted-foreground">0</span>
                <input
                  aria-label="Temperature"
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={settings.temperature}
                  disabled
                  className="cf-range h-1.5 flex-1 appearance-none rounded-full bg-muted accent-primary disabled:opacity-50"
                />
                <span className="text-xs text-muted-foreground">1</span>
              </div>
            </Row>
            <Row label="Response length" hint="Trims the scripted sample">
              <Segmented
                options={LENGTHS}
                value={settings.responseLength}
                onChange={(v) => onChange({ responseLength: v })}
              />
            </Row>
          </div>

          {/* Features */}
          <div className="pb-1">
            <p className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Features
            </p>
            <Row label="Memory" hint="No context is remembered for replies">
              <Switch label="Memory" checked={false} disabled />
            </Row>
            <Row label="Notifications" hint="Unavailable in this demo">
              <Switch label="Notifications" checked={false} disabled />
            </Row>
            <Row label="Auto-save chats" hint="Keep conversation history on this device">
              <Switch
                label="Auto-save chats"
                checked={settings.autoSave}
                onChange={(v) => onChange({ autoSave: v })}
              />
            </Row>
            <Row label="Internet access" hint="This demo does not browse the web">
              <div className="flex items-center gap-2">
                <UnavailableBadge />
                <Switch label="Internet access" checked={false} disabled />
              </div>
            </Row>
            <Row label="Voice mode" hint="Unavailable in this demo">
              <div className="flex items-center gap-2">
                <UnavailableBadge />
                <Switch label="Voice mode" checked={false} disabled />
              </div>
            </Row>
          </div>

          {/* System prompt */}
          <div className="py-3">
            <p className="pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              System prompt
            </p>
            <textarea
              aria-label="System prompt"
              value={settings.systemPrompt}
              disabled
              rows={3}
              className="cf-scroll w-full resize-none rounded-md border border-input bg-background p-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Unavailable; sample replies do not use a system prompt"
            />
            <p className="mt-1 text-xs text-muted-foreground">No effect on this demo.</p>
          </div>

          {/* Data */}
          <div className="py-3">
            <p className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Data
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="flex-1 gap-2" onClick={onExport}>
                <Download className="h-4 w-4" />
                Export chats
              </Button>
              {confirmClear ? (
                <div className="flex flex-1 gap-2">
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => {
                      onClearHistory();
                      setConfirmClear(false);
                    }}
                  >
                    Confirm delete
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmClear(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="flex-1 gap-2 text-destructive hover:text-destructive"
                  onClick={() => setConfirmClear(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete history
                </Button>
              )}
            </div>
          </div>
        </div>

        <Separator />
        <p className="text-center text-xs text-muted-foreground">
          Demo chat history stays in this browser when auto-save is enabled. Attachments are not
          uploaded by this demo.
        </p>
      </DialogContent>
    </Dialog>
  );
}
