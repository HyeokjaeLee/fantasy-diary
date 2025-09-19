import { NextResponse } from 'next/server';

import { apiRouter } from '@/configs/trpc/routes';
import { createCaller } from '@/configs/trpc/settings';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const input = body?.input ?? {
      topic: '한강에서 시작된 탈출',
      style: '호러',
      length: '중편',
      chapters: 2,
    };

    const caller = createCaller(apiRouter)({
      isClient: true,
      headers: req.headers,
    });
    const result = await caller.story.generate(input);

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
