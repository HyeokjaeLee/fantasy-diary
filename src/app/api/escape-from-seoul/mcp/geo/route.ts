import { z } from 'zod';

import { fetchKmaUltraSrtNcst } from '@/app/api/external/kma';
import { handleMcpRequest, type ToolDef } from '@/utils';

export const runtime = 'edge';

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

// External reverse geocoding removed. All place inference is AI-only using geometry hints.

const zGridArgs = z.object({
  nx: z.number().int(),
  ny: z.number().int(),
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
    description:
      '기상청 DFS 격자좌표(nx, ny)를 WGS84 위경도(lat, lon)로 변환합니다. 서울 지역의 격자 좌표를 실제 지도 좌표로 변환할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['nx', 'ny'],
      properties: {
        nx: { type: 'integer', description: '기상청 격자 X 좌표' },
        ny: { type: 'integer', description: '기상청 격자 Y 좌표' },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { nx, ny } = zGridArgs.parse(rawArgs);
      const { lat, lon } = gridToLatLon(nx, ny);

      return { lat, lon, nx, ny };
    },
  },
  {
    name: 'geo.gridToName',
    description:
      '기상청 격자좌표로부터 한국 지명을 추론합니다. 격자의 위경도와 경계상자(bbox) 정보를 제공하며, AI가 서울 내 동/읍/면 이름을 추론할 수 있도록 힌트를 제공합니다. 장소 이름이 필요하지만 정확한 주소를 모를 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['nx', 'ny'],
      properties: {
        nx: { type: 'integer', description: '기상청 격자 X 좌표' },
        ny: { type: 'integer', description: '기상청 격자 Y 좌표' },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const { nx, ny } = zGridArgs.parse(rawArgs);
      const { lat, lon } = gridToLatLon(nx, ny);

      const corner = (dx: number, dy: number) => gridToLatLon(nx + dx, ny + dy);
      const bbox = {
        nw: corner(-0.5, -0.5),
        ne: corner(0.5, -0.5),
        se: corner(0.5, 0.5),
        sw: corner(-0.5, 0.5),
      };

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

      const hints = [
        `WGS84 좌표(lat, lon): ${lat.toFixed(6)}, ${lon.toFixed(6)} (DMS: ${dms(lat, 'lat')}, ${dms(lon, 'lon')})`,
        '이 응답은 KMA DFS 격자(약 5km 해상도) 기반입니다. 행정구 경계와 정확히 일치하지 않을 수 있습니다.',
        '지명을 생성할 때 lat/lon과 bbox 모서리 좌표를 활용해 가장 가까운 동/읍/면 또는 지명 후보를 추론하세요.',
        '도/시/구/동 순으로 구체화하고, 건물명/도로명은 외부 API 없이 근거가 있을 때만 기술하세요.',
      ];

      return {
        grid: { nx, ny },
        latlon: { lat, lon },
        bbox,
        ai: { hints },
      };
    },
  },
  {
    name: 'geo.gridPlaceWeather',
    description:
      '특정 격자 위치의 기상청 초단기실황 날씨 데이터를 조회하고, 해당 위치의 좌표·경계상자·주변 격자 정보를 함께 제공합니다. 서울 지역의 실시간 날씨(기온, 강수, 습도 등)와 위치 맥락이 필요할 때 사용하세요. 장면에 날씨 묘사를 추가하거나 특정 지역의 기상 상황을 확인할 때 유용합니다.',
    inputSchema: {
      type: 'object',
      required: ['nx', 'ny'],
      properties: {
        nx: { type: 'integer', description: '기상청 격자 X 좌표' },
        ny: { type: 'integer', description: '기상청 격자 Y 좌표' },
        baseDate: {
          type: 'string',
          description: '조회 기준일 (YYYYMMDD 형식, 생략 시 오늘)',
        },
        baseTime: {
          type: 'string',
          description: '조회 기준시각 (HHmm 형식, 생략 시 가장 최근)',
        },
        pageNumber: {
          type: 'integer',
          description: '페이지 번호 (기본값: 1)',
        },
        numberOfRows: {
          type: 'integer',
          description: '한 페이지당 결과 수 (기본값: 10)',
        },
        neighbors: {
          type: 'boolean',
          description:
            '주변 8개 격자의 좌표도 함께 반환할지 여부 (넓은 지역 날씨 비교 시 유용)',
        },
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
  return handleMcpRequest({ req, tools });
}
