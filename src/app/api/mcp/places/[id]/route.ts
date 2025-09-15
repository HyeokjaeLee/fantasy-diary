import { NextResponse } from 'next/server';

import { rest } from '../../_client';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;
    const { data, error } = await rest.get('/escape_from_seoul_places', {
      headers: { Prefer: 'count=none' },
      query: { id: `eq.${id}`, limit: '1' },
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
    const { id } = params;
    const body = await req.json();
    const { error } = await rest.patch('/escape_from_seoul_places', body, {
      headers: { Prefer: 'return=minimal' },
      query: { id: `eq.${id}` },
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
    const { id } = params;
    const { error } = await rest.delete('/escape_from_seoul_places', {
      query: { id: `eq.${id}` },
    });
    if (error) throw error as any;

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';

    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
