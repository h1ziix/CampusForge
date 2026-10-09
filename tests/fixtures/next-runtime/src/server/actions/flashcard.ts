'use server';

import { syntheticGenerate } from '@/fixture/document-generation';

export async function generateFlashcardsAction(form: FormData) {
  return syntheticGenerate('FLASHCARD', form);
}

export async function deleteFlashcardSetAction(_form: FormData) {
  void _form;
  return { success: false as const, error: 'Synthetic fixture: no deletion performed.' };
}
