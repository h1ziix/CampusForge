'use server';

import { syntheticGenerate } from '@/fixture/document-generation';

export async function generateSummaryAction(form: FormData) {
  return syntheticGenerate('SUMMARY', form);
}
