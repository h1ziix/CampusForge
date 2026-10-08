export interface FlashcardJobData {
  operationId: string;
}
export async function processFlashcardJob(data: FlashcardJobData): Promise<void> {
  if (typeof data?.operationId !== 'string' || !data.operationId || data.operationId.length > 128)
    throw new Error('Invalid document job identity');
  const { processAIOperation } = await import('./ai-operation');
  await processAIOperation(data.operationId);
}
