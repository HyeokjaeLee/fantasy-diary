import {
  getEscapeFromSeoulCharacters,
  postEscapeFromSeoulCharacters,
} from '@supabase-api/sdk.gen';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ensureSupabaseRestConfigured } from '../_client';

const listSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50).optional(),
});

export async function GET(req: Request) {
  try {
    ensureSupabaseRestConfigured();
    const { searchParams } = new URL(req.url);
    const { limit = 50 } = listSchema.parse({
      limit: searchParams.get('limit'),
    });

    const { data, error } = await getEscapeFromSeoulCharacters({
      query: {
        order: 'name.asc',
        limit: String(Math.max(1, Math.min(100, limit))),
      },
      headers: { Prefer: 'count=none' },
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
    ensureSupabaseRestConfigured();
    const body = await req.json();
    const { data, error } = await postEscapeFromSeoulCharacters({
      body,
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
