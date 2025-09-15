import {
  deleteEscapeFromSeoulCharacters,
  getEscapeFromSeoulCharacters,
  patchEscapeFromSeoulCharacters,
} from '@supabase-api/sdk.gen';
import { NextResponse } from 'next/server';

import { ensureSupabaseRestConfigured } from '../../_client';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    ensureSupabaseRestConfigured();
    const { id } = params;
    const { data, error } = await getEscapeFromSeoulCharacters({
      query: { id: `eq.${id}`, limit: '1' },
      headers: { Prefer: 'count=none' },
    });
    if (error) throw error as any;
    const row = Array.isArray(data) ? data[0] : null;
    if (!row)
      return NextResponse.json(
        { ok: false, error: 'Not found' },
        { status: 404 },
      );

    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';

    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    ensureSupabaseRestConfigured();
    const { id } = params;
    const body = await req.json();
    const { error } = await patchEscapeFromSeoulCharacters({
      body,
      query: { id: `eq.${id}` },
      headers: { Prefer: 'return=minimal' },
    });
    if (error) throw error as any;

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';

    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    ensureSupabaseRestConfigured();
    const { id } = params;
    const { error } = await deleteEscapeFromSeoulCharacters({
      query: { id: `eq.${id}` },
    });
    if (error) throw error as any;

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';

    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
