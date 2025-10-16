import ky from 'ky';
import { z } from 'zod';

const CURRENT_PARAMS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'visibility',
] as const;

const HOURLY_PARAMS = [
  'temperature_2m',
  'apparent_temperature',
  'precipitation_probability',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'relative_humidity_2m',
  'visibility',
] as const;

const DAILY_PARAMS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'apparent_temperature_max',
  'apparent_temperature_min',
  'precipitation_probability_max',
  'sunrise',
  'sunset',
] as const;

const zOpenMeteoResponse = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  timezone_abbreviation: z.string().optional(),
  current_units: z.record(z.string(), z.string()).optional(),
  hourly_units: z.record(z.string(), z.string()).optional(),
  daily_units: z.record(z.string(), z.string()).optional(),
  current: z
    .object({
      time: z.string(),
      interval: z.number().optional(),
      temperature_2m: z.number().optional(),
      apparent_temperature: z.number().optional(),
      relative_humidity_2m: z.number().optional(),
      precipitation: z.number().optional(),
      weather_code: z.number(),
      wind_speed_10m: z.number().optional(),
      wind_direction_10m: z.number().optional(),
      wind_gusts_10m: z.number().optional(),
      visibility: z.number().optional(),
    })
    .optional(),
  hourly: z
    .object({
      time: z.array(z.string()),
      temperature_2m: z.array(z.number()).optional(),
      apparent_temperature: z.array(z.number()).optional(),
      precipitation_probability: z.array(z.number()).optional(),
      weather_code: z.array(z.number()).optional(),
      wind_speed_10m: z.array(z.number()).optional(),
      wind_direction_10m: z.array(z.number()).optional(),
      relative_humidity_2m: z.array(z.number()).optional(),
      visibility: z.array(z.number()).optional(),
    })
    .optional(),
  daily: z
    .object({
      time: z.array(z.string()),
      weather_code: z.array(z.number()).optional(),
      temperature_2m_max: z.array(z.number()).optional(),
      temperature_2m_min: z.array(z.number()).optional(),
      apparent_temperature_max: z.array(z.number()).optional(),
      apparent_temperature_min: z.array(z.number()).optional(),
      precipitation_probability_max: z.array(z.number()).optional(),
      sunrise: z.array(z.string()).optional(),
      sunset: z.array(z.string()).optional(),
    })
    .optional(),
});

export type OpenMeteoResponse = z.infer<typeof zOpenMeteoResponse>;

export enum WeatherUnitsSystem {
  METRIC = 'METRIC',
  IMPERIAL = 'IMPERIAL',
}

export const zWeatherLookupArgs = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  unitsSystem: z.enum(WeatherUnitsSystem).optional(),
  hourCount: z.number().int().min(1).max(168).optional(),
  dayCount: z.number().int().min(1).max(16).optional(),
  timezone: z.string().min(1).max(40).optional(),
});

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const degToCardinal = (degrees?: number | null) => {
  if (typeof degrees !== 'number' || Number.isNaN(degrees)) return null;

  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;

  return [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ][index];
};

const WMO_CODE_DESCRIPTION: Record<number, string> = {
  0: '맑음',
  1: '대체로 맑음',
  2: '부분적으로 흐림',
  3: '흐림',
  45: '안개',
  48: '상층 안개',
  51: '약한 이슬비',
  53: '보통 이슬비',
  55: '강한 이슬비',
  56: '약한 언 이슬비',
  57: '강한 언 이슬비',
  61: '약한 비',
  63: '보통 비',
  65: '강한 비',
  66: '약한 언 비',
  67: '강한 언 비',
  71: '약한 눈',
  73: '보통 눈',
  75: '강한 눈',
  77: '진눈깨비',
  80: '약한 소나기',
  81: '보통 소나기',
  82: '강한 소나기',
  85: '약한 눈소나기',
  86: '강한 눈소나기',
  95: '천둥번개',
  96: '천둥번개와 약한 우박',
  99: '천둥번개와 강한 우박',
};

const describeWeatherCode = (code?: number | null) => {
  if (code === undefined || code === null) return '알 수 없는 날씨';

  return WMO_CODE_DESCRIPTION[code] ?? `날씨 코드 ${code}`;
};

const formatTemperature = (
  value: number | null | undefined,
  unitsSystem: WeatherUnitsSystem,
) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  const symbol = unitsSystem === 'IMPERIAL' ? '°F' : '°C';

  return { value, unit: symbol, formatted: `${value.toFixed(1)}${symbol}` };
};

const formatDistanceKm = (meters?: number | null) => {
  if (typeof meters !== 'number' || Number.isNaN(meters)) return null;

  return meters / 1000;
};

export const fetchWeatherFromOpenMeteo = async (
  options: z.infer<typeof zWeatherLookupArgs>,
) => {
  const unitsSystem = options.unitsSystem ?? WeatherUnitsSystem.METRIC;
  const hourCount = options.hourCount ?? 24;
  const dayCount = options.dayCount ?? 7;
  const forecastDays = clamp(
    Math.max(Math.ceil(hourCount / 24), dayCount),
    1,
    16,
  );

  const params = new URLSearchParams({
    latitude: options.latitude.toString(),
    longitude: options.longitude.toString(),
    timezone: options.timezone ?? 'auto',
    forecast_days: forecastDays.toString(),
    current: CURRENT_PARAMS.join(','),
    hourly: HOURLY_PARAMS.join(','),
    daily: DAILY_PARAMS.join(','),
  });

  if (unitsSystem === WeatherUnitsSystem.IMPERIAL) {
    params.set('temperature_unit', 'fahrenheit');
    params.set('wind_speed_unit', 'mph');
    params.set('precipitation_unit', 'inch');
  } else {
    params.set('temperature_unit', 'celsius');
    params.set('wind_speed_unit', 'kmh');
    params.set('precipitation_unit', 'mm');
  }

  const response = await ky.get(
    `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
  );
  const json = await response.json();
  const parsed = zOpenMeteoResponse.parse(json);

  const current = parsed.current ?? null;
  const timezone = parsed.timezone;

  const currentSummary = current
    ? {
        time: current.time,
        temperature: formatTemperature(
          current.temperature_2m ?? null,
          unitsSystem,
        ),
        apparentTemperature: formatTemperature(
          current.apparent_temperature ?? null,
          unitsSystem,
        ),
        humidity: current.relative_humidity_2m ?? null,
        precipitation: current.precipitation ?? null,
        weatherCode: current.weather_code,
        weatherDescription: describeWeatherCode(current.weather_code),
        wind: {
          speed: current.wind_speed_10m ?? null,
          gust: current.wind_gusts_10m ?? null,
          direction: current.wind_direction_10m ?? null,
          cardinal: degToCardinal(current.wind_direction_10m),
        },
        visibilityKm: formatDistanceKm(current.visibility),
      }
    : null;

  const hourly = parsed.hourly;
  const hourlyForecast =
    hourly && hourly.time.length > 0
      ? hourly.time
          .slice(0, clamp(hourCount, 1, hourly.time.length))
          .map((_, index) => ({
            time: hourly.time[index],
            temperature: formatTemperature(
              hourly.temperature_2m?.[index],
              unitsSystem,
            ),
            apparentTemperature: formatTemperature(
              hourly.apparent_temperature?.[index],
              unitsSystem,
            ),
            precipitationProbability:
              hourly.precipitation_probability?.[index] ?? null,
            weatherCode: hourly.weather_code?.[index] ?? null,
            weatherDescription: describeWeatherCode(
              hourly.weather_code?.[index],
            ),
            wind: {
              speed: hourly.wind_speed_10m?.[index] ?? null,
              direction: hourly.wind_direction_10m?.[index] ?? null,
              cardinal: degToCardinal(hourly.wind_direction_10m?.[index]),
            },
            humidity: hourly.relative_humidity_2m?.[index] ?? null,
            visibilityKm: formatDistanceKm(hourly.visibility?.[index]),
          }))
      : [];

  const daily = parsed.daily;
  const dailyForecast =
    daily && daily.time.length > 0
      ? daily.time
          .slice(0, clamp(dayCount, 1, daily.time.length))
          .map((_, index) => ({
            date: daily.time[index],
            weatherCode: daily.weather_code?.[index] ?? null,
            weatherDescription: describeWeatherCode(
              daily.weather_code?.[index],
            ),
            temperatureMax: formatTemperature(
              daily.temperature_2m_max?.[index],
              unitsSystem,
            ),
            temperatureMin: formatTemperature(
              daily.temperature_2m_min?.[index],
              unitsSystem,
            ),
            apparentTemperatureMax: formatTemperature(
              daily.apparent_temperature_max?.[index],
              unitsSystem,
            ),
            apparentTemperatureMin: formatTemperature(
              daily.apparent_temperature_min?.[index],
              unitsSystem,
            ),
            precipitationProbabilityMax:
              daily.precipitation_probability_max?.[index] ?? null,
            sunrise: daily.sunrise?.[index] ?? null,
            sunset: daily.sunset?.[index] ?? null,
          }))
      : [];

  return {
    raw: parsed,
    timezone,
    current: currentSummary,
    hourly: hourlyForecast,
    daily: dailyForecast,
    unitsSystem,
    hourCount,
    dayCount,
  };
};
