import ky, { HTTPError } from 'ky';
import { z } from 'zod';

import { ENV } from '@/env';

const zKmaUltraItem = z.object({
  baseDate: z.string(), // YYYYMMDD
  baseTime: z.string(), // HHmm
  category: z.string(),
  nx: z.coerce.number(),
  ny: z.coerce.number(),
  obsrValue: z.string(),
});

const zKmaUltraResponse = z.object({
  response: z.object({
    header: z.object({
      resultCode: z.string(),
      resultMsg: z.string(),
    }),
    body: z.object({
      dataType: z.string().optional(),
      items: z
        .object({
          item: z.array(zKmaUltraItem),
        })
        .optional(),
      pageNo: z.coerce.number().optional(),
      numOfRows: z.coerce.number().optional(),
      totalCount: z.coerce.number().optional(),
    }),
  }),
});

/**
 * 초단기실황(getUltraSrtNcst) 조회
 * - baseDate/baseTime 미지정 시 KST 기준으로 스펙에 맞는 최근 기준시각 자동 계산(HH00 / :10 이후)
 * - zod로 응답 구조 검증 후 camelCase로 반환
 *
 * @param options.gridX 예보지점 X 좌표 (정수, nx)
 * @param options.gridY 예보지점 Y 좌표 (정수, ny)
 * @param options.baseDate 발표일자(YYYYMMDD). 미지정 시 자동 계산
 * @param options.baseTime 발표시각(HHmm). 미지정 시 자동 계산(HH00, :10 이후 호출 가능)
 * @param options.pageNumber 페이지 번호 (기본 1)
 * @param options.numberOfRows 한 페이지 결과 수 (기본 1000)
 */
export const fetchCurrentWeatherFromKma = async (options: {
  gridX: number;
  gridY: number;
  baseDate?: string; // YYYYMMDD
  baseTime?: string; // HHmm
  pageNumber?: number;
  numberOfRows?: number;
}) => {
  const { gridX, gridY } = options;
  if (!Number.isInteger(gridX) || !Number.isInteger(gridY)) {
    throw new Error('gridX, gridY는 정수여야 함');
  }

  let baseDate = options.baseDate ?? '';
  let baseTime = options.baseTime ?? '';
  if (!baseDate || !baseTime) {
    // KST now (UTC+9)
    const now = new Date();
    const kst = new Date(
      now.getTime() + now.getTimezoneOffset() * 60_000 + 9 * 60 * 60 * 1000,
    );
    const base = new Date(kst.getTime());
    if (base.getMinutes() < 10) {
      base.setHours(base.getHours() - 1);
    }
    base.setMinutes(0, 0, 0);
    const y = base.getFullYear();
    const m = String(base.getMonth() + 1).padStart(2, '0');
    const d = String(base.getDate()).padStart(2, '0');
    const hh = String(base.getHours()).padStart(2, '0');
    baseDate = `${y}${m}${d}`;
    baseTime = `${hh}00`;
  }

  let res: Response;
  try {
    res = await ky.get(
      'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst',
      {
        headers: { Accept: 'application/json' },
        searchParams: {
          serviceKey: ENV.NEXT_WEATHER_API_KEY,
          pageNo: options.pageNumber ?? 1,
          numOfRows: options.numberOfRows ?? 1_000,
          dataType: 'JSON',
          base_date: baseDate,
          base_time: baseTime,
          nx: gridX,
          ny: gridY,
        },
      },
    );
  } catch (error) {
    if (error instanceof HTTPError)
      throw new Error(`KMA 요청 실패: HTTP ${error.response.status}`);

    if (error instanceof Error) throw error;

    throw new Error(`KMA 요청 실패: ${String(error)}`);
  }

  const contentType = res.headers.get('content-type') || '';

  if (!contentType.toLowerCase().includes('json')) {
    const text = await res.text();
    // KMA가 오류 시 XML(OpenAPI_...)이나 HTML을 반환하는 경우가 있어 JSON 파싱 전에 방어
    const preview = text.slice(0, 300);

    throw new Error(
      `KMA 응답이 JSON이 아님 (content-type: ${contentType}): ${preview}`,
    );
  }

  const test = await res.json();

  const parsed = zKmaUltraResponse.parse(test);

  console.log(test);

  const header = parsed.response.header;
  const body = parsed.response.body;
  const items = body.items?.item ?? [];

  // Success code usually '00'
  if (!(header.resultCode === '00' || header.resultCode === '0'))
    throw new Error(
      `KMA 오류: ${header.resultMsg} (code=${header.resultCode})`,
    );

  const output = {
    baseDate,
    baseTime,
    nx: gridX,
    ny: gridY,
    items,
    header: { resultCode: header.resultCode, resultMsg: header.resultMsg },
    raw: parsed,
  };

  return z
    .object({
      baseDate: z.string(),
      baseTime: z.string(),
      nx: z.number(),
      ny: z.number(),
      items: z.array(zKmaUltraItem),
      header: z.object({ resultCode: z.string(), resultMsg: z.string() }),
      raw: zKmaUltraResponse,
    })
    .parse(output);
};
