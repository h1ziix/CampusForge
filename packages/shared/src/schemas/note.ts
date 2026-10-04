import { z } from 'zod';

export const NOTE_SOURCES = ['MANUAL', 'AI_GENERATED', 'IMPORTED'] as const;

export const createNoteSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().max(50000).default(''),
  workspaceId: z.string().cuid(),
});

export const updateNoteSchema = z.object({
  id: z.string().cuid(),
  title: z.string().min(1, 'Title is required').max(200).optional(),
  content: z.string().max(50000).optional(),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
