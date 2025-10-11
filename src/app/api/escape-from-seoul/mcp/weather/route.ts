import { z } from 'zod';

import {
  fetchWeatherFromOpenMeteo,
  type WeatherUnitsSystem,
} from '@/app/api/escape-from-seoul/mcp/weather/_libs/fetchOpenMeteoWeather';
import { handleMcpRequest, type ToolDef } from '@/utils';

export const runtime = 'edge';

const zWeatherLookupArgs = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  unitsSystem: z.enum(['METRIC', 'IMPERIAL']).optional(),
  hourCount: z.number().int().min(1).max(168).optional(),
  dayCount: z.number().int().min(1).max(16).optional(),
  timezone: z.string().min(1).max(40).optional(),
});

const formatSpeed = (value: number | null, unitsSystem: WeatherUnitsSystem) => {
  if (value === null || Number.isNaN(value)) return null;
  const unit = unitsSystem === 'IMPERIAL' ? 'mph' : 'km/h';

  return `${value.toFixed(1)} ${unit}`;
};

const formatPrecipitation = (
  value: number | null,
  unitsSystem: WeatherUnitsSystem,
) => {
  if (value === null || Number.isNaN(value)) return null;
  const unit = unitsSystem === 'IMPERIAL' ? 'inch' : 'mm';

  return `${value.toFixed(unitsSystem === 'IMPERIAL' ? 2 : 1)} ${unit}`;
};

const tools: Array<ToolDef<unknown, unknown>> = [
  {
    name: 'weather.openMeteo.lookup',
    description:
      'Open-Meteo API를 사용해 지정한 위도/경도의 현재 날씨와 단기 예보를 조회합니다. 무료이며 한국 포함 전 세계 지역에서 바로 사용할 수 있습니다.',
    inputSchema: {
      type: 'object',
      required: ['latitude', 'longitude'],
      properties: {
        latitude: {
          type: 'number',
          minimum: -90,
          maximum: 90,
          description: '위도 (degrees)',
        },
        longitude: {
          type: 'number',
          minimum: -180,
          maximum: 180,
          description: '경도 (degrees)',
        },
        unitsSystem: {
          type: 'string',
          enum: ['METRIC', 'IMPERIAL'],
          description: '단위계 (기본값: METRIC)',
        },
        hourCount: {
          type: 'integer',
          minimum: 1,
          maximum: 168,
          description: '시간별 예보 개수 (최대 168시간, 기본 24)',
        },
        dayCount: {
          type: 'integer',
          minimum: 1,
          maximum: 16,
          description: '일별 예보 개수 (최대 16일, 기본 7)',
        },
        timezone: {
          type: 'string',
          description:
            '표준 시간대 (예: Asia/Seoul). 생략 시 자동으로 현지 시간대 설정.',
        },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = zWeatherLookupArgs.parse(rawArgs);

      const unitsSystem: WeatherUnitsSystem = args.unitsSystem ?? 'METRIC';
      const weather = await fetchWeatherFromOpenMeteo({
        latitude: args.latitude,
        longitude: args.longitude,
        unitsSystem,
        hourCount: args.hourCount,
        dayCount: args.dayCount,
        timezone: args.timezone,
      });

      if (!weather.current) {
        throw new Error('Open-Meteo 응답에 현재 날씨 정보가 없습니다.');
      }

      const hintList: string[] = [];
      hintList.push(`현재 날씨: ${weather.current.weatherDescription}`);
      if (weather.current.temperature?.formatted) {
        hintList.push(`기온 ${weather.current.temperature.formatted}`);
      }
      if (weather.current.apparentTemperature?.formatted) {
        hintList.push(
          `체감 ${weather.current.apparentTemperature.formatted}`,
        );
      }
      if (
        typeof weather.current.humidity === 'number' &&
        !Number.isNaN(weather.current.humidity)
      ) {
        hintList.push(`습도 ${weather.current.humidity}%`);
      }
      if (
        typeof weather.current.precipitation === 'number' &&
        weather.current.precipitation > 0
      ) {
        const formattedPrecip = formatPrecipitation(
          weather.current.precipitation,
          unitsSystem,
        );
        if (formattedPrecip) hintList.push(`강수량 ${formattedPrecip}`);
      }
      const windSpeed = formatSpeed(
        weather.current.wind.speed,
        weather.unitsSystem,
      );
      if (windSpeed) {
        const direction =
          weather.current.wind.cardinal ??
          (typeof weather.current.wind.direction === 'number'
            ? `${weather.current.wind.direction}°`
            : null);
        const gust = formatSpeed(weather.current.wind.gust, weather.unitsSystem);
        const segments = [
          direction ? `${direction} 풍` : null,
          `풍속 ${windSpeed}`,
          gust ? `돌풍 ${gust}` : null,
        ].filter(Boolean);
        if (segments.length > 0) hintList.push(segments.join(', '));
      }
      if (
        typeof weather.current.visibilityKm === 'number' &&
        !Number.isNaN(weather.current.visibilityKm)
      ) {
        hintList.push(
          `가시거리 ${weather.current.visibilityKm.toFixed(1)}km`,
        );
      }

      const narrativePrompts = [
        '현재 날씨와 체감 정보를 인물의 감정과 연결해 배경 묘사에 활용하세요.',
        '시간별/일별 예보를 참조해 서사의 진행 중 변화할 기후 요소를 미리 계획하세요.',
      ];

      return {
        request: {
          latitude: args.latitude,
          longitude: args.longitude,
          unitsSystem,
          hourCount: weather.hourCount,
          dayCount: weather.dayCount,
          timezone: weather.timezone,
        },
        current: weather.current,
        forecast: {
          hourly: weather.hourly,
          daily: weather.daily,
        },
        ai: {
          hints: hintList,
          narrativePrompts,
        },
        raw: weather.raw,
      };
    },
  },
];

export async function POST(req: Request) {
  return handleMcpRequest({ req, tools });
}
