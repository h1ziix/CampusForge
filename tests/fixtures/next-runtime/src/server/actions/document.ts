'use server';

import { generationSnapshot, generationState } from '@/fixture/document-generation';
import { pilotSnapshot, pilotWorkspace } from '@/fixture/r3-pilot';

export async function setSyntheticParseStatusAction(status: string) {
  generationState().parseStatuses.set('r3-synthetic-document', status);
}

export async function getDocumentGenerationStateAction(form: FormData) {
  if (generationState().readOutage) {
    generationState().reads++;
    return { success: false as const, error: 'Synthetic status query is unavailable.' };
  }
  if (form.get('workspaceId') === pilotWorkspace) {
    generationState().reads++;
    return { success: true as const, data: pilotSnapshot() };
  }
  return {
    success: true as const,
    data: generationSnapshot(String(form.get('documentId') ?? 'botany'), true),
  };
}

// Fixture-only: QA cannot delete documents or touch user data.
export async function deleteDocumentAction(_formData: FormData) {
  void _formData;
  return { success: false as const, error: 'Synthetic fixture: no deletion performed.' };
}
