import { NextResponse } from 'next/server';
import { z } from 'zod';

import { rest } from '../_client';

const listSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50).optional(),
  order: z.string().default('name.asc').optional(),
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const { limit = 50, order = 'name.asc' } = listSchema.parse({
      limit: searchParams.get('limit'),
      order: searchParams.get('order') ?? undefined,
    });

    const { data, error } = await rest.get('/escape_from_seoul_places', {
      headers: { Prefer: 'count=none' },
      query: { order, limit: String(limit) },
    });
    if (error) throw error as any;

    return NextResponse.json({
      ok: true,
      data: Array.isArray(data) ? data : [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';

    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { data, error } = await rest.post('/escape_from_seoul_places', body, {
      headers: { Prefer: 'return=representation' },
      query: { select: '*' },
    });
    if (error) throw error as any;

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';

    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
