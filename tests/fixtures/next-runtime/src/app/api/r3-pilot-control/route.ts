import { completeSyntheticOperation, generationState } from '@/fixture/document-generation';
import { resetPilot, savePilotUpload } from '@/fixture/r3-pilot';

// Explicit browser-test persistence/worker boundary. Never a provider, queue or database.
export async function POST(request: Request) {
  const body = await request.json();
  if (body.reset) resetPilot(body.mode ?? 'pending');
  if (body.upload) savePilotUpload(body.upload);
  if (body.parse) generationState().parseStatuses.set('botany', body.parse);
  if (body.complete) {
    for (const operation of generationState().operations.values())
      completeSyntheticOperation(operation);
  }
  return Response.json({ success: true });
}
