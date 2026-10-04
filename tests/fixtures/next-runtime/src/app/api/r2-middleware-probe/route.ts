import { NextRequest, NextResponse } from 'next/server';
import applicationMiddleware from '@/fixture/middleware';

// Invoke the copied application middleware with real encrypted Auth.js cookies.
// The target path is synthetic; this is runtime compatibility, not live DB proof.
export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get('path') ?? '/dashboard';
  const synthetic = new NextRequest(new URL(target, request.url), { headers: request.headers });
  const response = await applicationMiddleware(synthetic, {} as never);
  if (!response) throw new Error('Application middleware returned no response');
  // NextResponse.next is a middleware result and cannot be returned from a
  // Route Handler. This explicit harness adapter exposes the allowed branch.
  return response.headers.get('x-middleware-next') === '1'
    ? NextResponse.json({ result: 'NextResponse.next' })
    : response;
}
