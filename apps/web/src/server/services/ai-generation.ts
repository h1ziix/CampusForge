import { requestAIOperation, AIOperationError } from '@campusforge/db';
import { estimateReservationMicros } from '@campusforge/ai';
import { readAIEnvironmentPolicy, ok, err, type ActionResult } from '@campusforge/shared';
import { estimateDocumentInput } from '@/server/services/ai-input';

export interface GenerationReceipt {
  documentId: string;
  operationId: string;
  status: string;
}

const publicErrors: Record<string, string> = {
  IDEMPOTENCY_KEY_CONFLICT: 'This idempotency key was already used with different input.',
  DOCUMENT_UNAVAILABLE: 'Document not found or parsing is not complete.',
  DOCUMENT_NOT_READY: 'Document not found or parsing is not complete.',
  INPUT_TOKEN_BUDGET_EXCEEDED: 'Document exceeds the configured AI input budget.',
  INPUT_EMPTY: 'Document has no text content to generate from.',
  OPERATION_BUDGET_EXCEEDED: 'Generation exceeds the configured AI operation budget.',
  WORKSPACE_BUDGET_EXCEEDED: 'AI budget is exhausted. Ask the workspace owner to review usage.',
  WORKSPACE_CONCURRENCY_EXCEEDED:
    'The workspace has reached its AI operation limit. Please retry later.',
};

/** All result-affecting settings come from the server, never from form fields. */
export async function requestGeneration(
  userId: string,
  type: 'SUMMARY' | 'FLASHCARD',
  formData: FormData,
): Promise<ActionResult<GenerationReceipt>> {
  const documentId = formData.get('documentId');
  const workspaceId = formData.get('workspaceId');
  const idempotencyKey = formData.get('idempotencyKey');
  if (typeof documentId !== 'string' || !documentId || documentId.length > 128)
    return err('Document ID is required');
  if (typeof workspaceId !== 'string' || !workspaceId || workspaceId.length > 128)
    return err('Workspace ID is required');
  if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(idempotencyKey))
    return err('A valid idempotency key is required. Reuse it when retrying this request.');

  try {
    const policy = readAIEnvironmentPolicy();
    const reservationMicros = estimateReservationMicros(
      policy.model,
      policy.parameters.maxInputTokens,
      policy.parameters.maxOutputTokens,
      policy.parameters.maxAttempts,
    );
    if (reservationMicros === null)
      return err('The configured AI model has no approved pricing policy.');
    const operation = await requestAIOperation({
      userId,
      type,
      documentId,
      workspaceId,
      idempotencyKey,
      model: policy.model,
      parameters: policy.parameters,
      reservationMicros,
      workspaceBudgetMicros: policy.workspaceBudgetMicros,
      operationBudgetMicros: policy.operationBudgetMicros,
      workspaceConcurrency: policy.workspaceConcurrency,
      validateSnapshot: ({ text, filename }) => {
        const tokens = estimateDocumentInput(type, text, filename);
        if (tokens > policy.parameters.maxInputTokens)
          throw new AIOperationError('INPUT_TOKEN_BUDGET_EXCEEDED');
      },
    });
    return ok({ documentId, operationId: operation.id, status: operation.status });
  } catch (error) {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : 'AI_ADMISSION_UNAVAILABLE';
    // Never log document text, provider output, raw transport errors or form data.
    console.error('[CampusForge] AI admission failed.', {
      code: Object.hasOwn(publicErrors, code) ? code : 'AI_ADMISSION_UNAVAILABLE',
    });
    return err(
      publicErrors[code] ?? 'Could not confirm AI operation. Retry with the same idempotency key.',
    );
  }
}
