import { resetFixture } from '@/fixture/db';
import { fixtureState } from '@/fixture/state';
import { NextResponse } from 'next/server';

// Fixture-only management route, never copied into the production application.
export function GET() {
  return NextResponse.json({ counters: fixtureState().counters, outage: fixtureState().outage });
}
export async function POST(request: Request) {
  const input = await request.json();
  if (input.reset) resetFixture();
  if ('outage' in input) fixtureState().outage = Boolean(input.outage);
  if (input.cooldown) fixtureState().budgets.clear();
  return GET();
}
