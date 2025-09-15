import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getToolByName, tools } from './tools';

export async function GET() {
  // 간단한 인트로스펙션: 이름/설명만 제공 (입력 검증은 서버에서 zod로 처리)
  const result = tools.map((t) => ({
    name: t.name,
    description: t.description,
  }));

  
  return NextResponse.json({ tools: result });
}

const executeSchema = z.object({
  tool: z.string().min(1),
  input: z.unknown().optional(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const { tool, input } = executeSchema.parse(json);

    const t = getToolByName(tool);
    if (!t) {
      return NextResponse.json(
        { error: `Unknown tool: ${tool}` },
        { status: 400 },
      );
    }

    // 입력 검증
    const args = t.input.parse(input ?? {});

    // 실행
    const result = await t.execute(args as never);

    
    return NextResponse.json({ ok: true, tool, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

