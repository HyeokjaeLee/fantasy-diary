import type { JSONSchema4 } from 'json-schema';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { fetchKmaUltraSrtNcst } from '@/app/api/external/kma';
import { ENV } from '@/env';
import {
  type JsonRpcFailure,
  type JsonRpcId,
  type JsonRpcSuccess,
  zCallToolParams,
  zJsonRpcRequest,
} from '@/types/mcp';

export const runtime = 'edge';

function ok<T>(id: JsonRpcId, result: T): JsonRpcSuccess<T> {
  return { jsonrpc: '2.0', id, result };
}
function fail(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcFailure {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

// KMA DFS (LCC) constants
const RE = 6371.00877; // 지구 반경 (km)
const GRID = 5.0; // 격자 간격 (km)
const SLAT1 = 30.0; // 표준위도 1 (degree)
const SLAT2 = 60.0; // 표준위도 2 (degree)
const OLON = 126.0; // 기준경도 (degree)
const OLAT = 38.0; // 기준위도 (degree)
const XO = 43.0; // 기준점 X좌표 (GRID)
const YO = 136.0; // 기준점 Y좌표 (GRID)

interface LatLon {
  lat: number; // WGS84 latitude
  lon: number; // WGS84 longitude
}

function gridToLatLon(nx: number, ny: number): LatLon {
  const DEGRAD = Math.PI / 180.0;
  const RADDEG = 180.0 / Math.PI;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn =
    Math.tan(Math.PI * 0.25 + slat2 * 0.5) /
    Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = Math.pow(sf, sn) * (Math.cos(slat1) / sn);
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  const xn = nx - XO;
  const yn = ro - (ny - YO);
  const ra = Math.sqrt(xn * xn + yn * yn);
  let alat: number;
  let alon: number;
  if (ra === 0) {
    alat = OLAT;
    alon = OLON;
  } else {
    let theta = Math.atan2(xn, yn);
    if (theta < 0) theta += 2.0 * Math.PI;
    const alatRad =
      2.0 * Math.atan(Math.pow((re * sf) / ra, 1.0 / sn)) - Math.PI * 0.5;
    const alonRad = theta / sn + olon;
    alat = alatRad * RADDEG;
    alon = alonRad * RADDEG;
  }

  return { lat: alat, lon: alon };
}

interface ReverseResult {
  name: string;
  source: 'kakao' | 'osm';
  lat: number;
  lon: number;
  nx: number;
  ny: number;
  address?: string;
  raw?: unknown;
}

async function reverseWithKakao(
  lon: number,
  lat: number,
): Promise<ReverseResult | null> {
  const key = ENV.NEXT_KAKAO_REST_API_KEY;
  if (!key) return null;

  const headers = { Authorization: `KakaoAK ${key}` } as const;

  const addrUrl = new URL(
    'https://dapi.kakao.com/v2/local/geo/coord2address.json',
  );
  addrUrl.searchParams.set('x', String(lon));
  addrUrl.searchParams.set('y', String(lat));

  const addrRes = await fetch(addrUrl.toString(), { headers });
  if (!addrRes.ok) return null;
  const addrJson = (await addrRes.json()) as {
    documents?: Array<{
      address?: { address_name?: string };
      road_address?: { address_name?: string; building_name?: string };
    }>;
  };

  const regUrl = new URL(
    'https://dapi.kakao.com/v2/local/geo/coord2regioncode.json',
  );
  regUrl.searchParams.set('x', String(lon));
  regUrl.searchParams.set('y', String(lat));
  const regRes = await fetch(regUrl.toString(), { headers });
  const regJson = regRes.ok
    ? ((await regRes.json()) as {
        documents?: Array<{
          region_type?: string;
          address_name?: string;
          region_1depth_name?: string;
          region_2depth_name?: string;
          region_3depth_name?: string;
        }>;
      })
    : undefined;

  const doc = addrJson.documents?.[0];
  const building = doc?.road_address?.building_name?.trim();
  const roadName = doc?.road_address?.address_name?.trim();
  const lotName = doc?.address?.address_name?.trim();

  const region =
    regJson?.documents?.find(
      (d) => d.region_type === 'H' || d.region_type === 'B',
    ) ?? regJson?.documents?.[0];

  const regionPart =
    region?.address_name ||
    [
      region?.region_1depth_name,
      region?.region_2depth_name,
      region?.region_3depth_name,
    ]
      .filter(Boolean)
      .join(' ');

  const address = building
    ? `${roadName ?? lotName ?? ''} ${building}`.trim()
    : (roadName ?? lotName ?? regionPart ?? '');

  let name = '';
  if (building) name = building;
  else if (roadName) name = roadName;
  else if (region?.region_3depth_name)
    name = `${region.region_3depth_name} 근처`;
  else if (regionPart) name = regionPart;
  else name = address || '알 수 없는 위치';

  return {
    name,
    source: 'kakao',
    lat,
    lon,
    nx: 0, // will be filled by caller
    ny: 0, // will be filled by caller
    address,
    raw: { addrJson, regJson },
  };
}

async function reverseWithOSM(
  lon: number,
  lat: number,
): Promise<ReverseResult | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('accept-language', 'ko');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('namedetails', '1');

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'fantasy-diary/1.0 (+https://example.com)',
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    display_name?: string;
    name?: string;
    namedetails?: Record<string, string>;
    address?: Record<string, string>;
  };

  const nameKo = json.namedetails?.['name:ko']?.trim();
  const name = nameKo || json.name || json.display_name || '알 수 없는 위치';
  const address = json.display_name;

  return {
    name,
    source: 'osm',
    lat,
    lon,
    nx: 0, // will be filled by caller
    ny: 0, // will be filled by caller
    address,
    raw: json,
  };
}

interface ToolDef<TArgs, TResult> {
  name: string;
  description: string;
  inputSchema: JSONSchema4;
  handler: (args: TArgs) => Promise<TResult>;
}

const zGridArgs = z.object({
  nx: z.number().int(),
  ny: z.number().int(),
  prefer: z.enum(['kakao', 'osm']).optional(),
});

const zGridPlaceWeatherArgs = z.object({
  nx: z.number().int(),
  ny: z.number().int(),
  baseDate: z
    .string()
    .regex(/^\d{8}$/)
    .optional(),
  baseTime: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  pageNumber: z.number().int().optional(),
  numberOfRows: z.number().int().optional(),
  neighbors: z.boolean().optional(),
});

const tools: Array<ToolDef<unknown, unknown>> = [
  {
    name: 'geo.gridToLatLon',
    description: 'Convert KMA DFS grid (nx, ny) to WGS84 latitude/longitude',
    inputSchema: {
      type: 'object',
      required: ['nx', 'ny'],
      properties: {
        nx: { type: 'integer' },
        ny: { type: 'integer' },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { nx, ny } = zGridArgs.omit({ prefer: true }).parse(rawArgs);
      const { lat, lon } = gridToLatLon(nx, ny);

      return { lat, lon, nx, ny };
    },
  },
  {
    name: 'geo.gridToName',
    description:
      'Convert KMA DFS grid (nx, ny) to a detailed Korean place name using reverse geocoding (Kakao if available, otherwise OSM).',
    inputSchema: {
      type: 'object',
      required: ['nx', 'ny'],
      properties: {
        nx: { type: 'integer' },
        ny: { type: 'integer' },
        prefer: {
          type: 'string',
          enum: ['kakao', 'osm'],
          description: 'Force specific provider if desired',
        },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { nx, ny, prefer } = zGridArgs.parse(rawArgs);
      const { lat, lon } = gridToLatLon(nx, ny);

      let result: ReverseResult | null = null;
      if (prefer === 'kakao') result = await reverseWithKakao(lon, lat);
      if (!result && prefer === 'osm') result = await reverseWithOSM(lon, lat);
      if (!result) {
        // auto: kakao first if key exists, else osm
        result =
          (await reverseWithKakao(lon, lat)) ??
          (await reverseWithOSM(lon, lat));
      }

      if (!result) throw new Error('역지오코딩 실패');

      return { ...result, nx, ny };
    },
  },
  {
    name: 'geo.gridPlaceWeather',
    description:
      'Return KMA ultra short-term observations and grid context (lat/lon, bbox, optional neighbors) with AI hints for place name inference. No external geocoding used.',
    inputSchema: {
      type: 'object',
      required: ['nx', 'ny'],
      properties: {
        nx: { type: 'integer' },
        ny: { type: 'integer' },
        baseDate: { type: 'string', description: 'YYYYMMDD' },
        baseTime: { type: 'string', description: 'HHmm' },
        pageNumber: { type: 'integer' },
        numberOfRows: { type: 'integer' },
        neighbors: { type: 'boolean', description: 'Include 8-neighbor cells' },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = zGridPlaceWeatherArgs.parse(rawArgs);
      const { nx, ny } = args;

      const { lat, lon } = gridToLatLon(nx, ny);

      const corner = (dx: number, dy: number) => gridToLatLon(nx + dx, ny + dy);
      const bbox = {
        nw: corner(-0.5, -0.5),
        ne: corner(0.5, -0.5),
        se: corner(0.5, 0.5),
        sw: corner(-0.5, 0.5),
      };

      const neighborOffsets: Array<[number, number]> = [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ];
      const neighborCells = args.neighbors
        ? neighborOffsets.map(([dx, dy]) => {
            const nxx = nx + dx;
            const nyy = ny + dy;
            const p = gridToLatLon(nxx, nyy);

            return { dx, dy, nx: nxx, ny: nyy, lat: p.lat, lon: p.lon };
          })
        : [];

      const dms = (value: number, pos: 'lat' | 'lon') => {
        const abs = Math.abs(value);
        const deg = Math.floor(abs);
        const minFloat = (abs - deg) * 60;
        const min = Math.floor(minFloat);
        const sec = Math.round((minFloat - min) * 60 * 100) / 100;
        const hemi =
          pos === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';

        return `${deg}°${min}'${sec}" ${hemi}`;
      };

      const weather = await fetchKmaUltraSrtNcst({
        gridX: nx,
        gridY: ny,
        baseDate: args.baseDate,
        baseTime: args.baseTime,
        pageNumber: args.pageNumber,
        numberOfRows: args.numberOfRows,
      });

      const hints = [
        `WGS84 좌표(lat, lon): ${lat.toFixed(6)}, ${lon.toFixed(6)} (DMS: ${dms(lat, 'lat')}, ${dms(lon, 'lon')})`,
        '이 응답은 KMA DFS 격자(약 5km 해상도) 기반입니다. 한국의 행정구 경계와 정확히 일치하지 않을 수 있습니다.',
        '지명을 생성할 때는 lat/lon과 bbox의 모서리 좌표를 활용해 가장 가까운 동/읍/면 또는 지명 후보를 추론하세요.',
        '가능하다면 도/시/구/동 순으로 구체화하고, 건물명/도로명은 별도 외부 API 없이 근거가 있을 때만 기술하세요.',
      ];

      return {
        grid: { nx, ny },
        latlon: { lat, lon },
        bbox,
        neighbors: neighborCells,
        weather: {
          baseDate: weather.baseDate,
          baseTime: weather.baseTime,
          items: weather.items,
          header: weather.header,
        },
        ai: { hints },
      };
    },
  },
];

export async function POST(req: Request) {
  try {
    const body = zJsonRpcRequest.parse(await req.json());
    if (body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      return NextResponse.json(fail(null, -32600, 'Invalid Request'), {
        status: 400,
      });
    }

    if (body.method === 'tools/list') {
      return NextResponse.json(
        ok(body.id, {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        }),
      );
    }

    if (body.method === 'tools/call') {
      const parsed = zCallToolParams.safeParse(body.params ?? {});
      if (!parsed.success || !parsed.data.name)
        return NextResponse.json(fail(body.id, -32602, 'Missing tool name'), {
          status: 400,
        });
      const tool = tools.find((t) => t.name === parsed.data.name);
      if (!tool)
        return NextResponse.json(
          fail(body.id, -32601, `Unknown tool: ${parsed.data.name}`),
          { status: 404 },
        );
      const result = await tool.handler(parsed.data.arguments ?? {});

      return NextResponse.json(
        ok(body.id, {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        }),
      );
    }

    return NextResponse.json(
      fail(body.id, -32601, `Unknown method: ${body.method}`),
      { status: 404 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';

    return NextResponse.json(fail(null, -32000, message), { status: 500 });
  }
}
