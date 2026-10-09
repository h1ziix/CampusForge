import {
  completeSyntheticOperation,
  generationState,
  resetGeneration,
  seedSavedResults,
} from '@/fixture/document-generation';

export async function GET() {
  const state = generationState();
  return Response.json({
    requests: state.requests,
    reads: state.reads,
    operations: [...state.operations.values()],
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (body.reset) resetGeneration(body.mode ?? 'complete');
  if (typeof body.readOutage === 'boolean') generationState().readOutage = body.readOutage;
  if (body.seed) seedSavedResults(body.seed);
  if (body.complete) {
    for (const operation of generationState().operations.values()) {
      completeSyntheticOperation(operation);
    }
  }
  return GET();
}
