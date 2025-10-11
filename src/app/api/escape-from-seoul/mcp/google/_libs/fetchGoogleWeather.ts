import ky, { HTTPError } from 'ky';
import { z } from 'zod';

import { ENV } from '@/env';

const WEATHER_BASE_URL = 'https://weather.googleapis.com';

const zLocalizedText = z
  .object({
    text: z.string().optional(),
    languageCode: z.string().optional(),
  })
  .passthrough();

const zTemperature = z
  .object({
    degrees: z.number(),
    unit: z.string(),
  })
  .partial()
  .passthrough();

const zWindSpeed = z
  .object({
    value: z.number(),
    unit: z.string(),
  })
  .partial()
  .passthrough();

const zWindDirection = z
  .object({
    degrees: z.number().int(),
    cardinal: z.string(),
  })
  .partial()
  .passthrough();

const zWind = z
  .object({
    speed: zWindSpeed.optional(),
    gust: zWindSpeed.optional(),
    direction: zWindDirection.optional(),
  })
  .partial()
  .passthrough();

const zPrecipitationAmount = z
  .object({
    quantity: z.number(),
    unit: z.string(),
  })
  .partial()
  .passthrough();

const zPrecipitationProbability = z
  .object({
    percent: z.number().int(),
    type: z.string(),
  })
  .partial()
  .passthrough();

const zPrecipitation = z
  .object({
    probability: zPrecipitationProbability.optional(),
    qpf: zPrecipitationAmount.optional(),
    snowQpf: zPrecipitationAmount.optional(),
  })
  .partial()
  .passthrough();

const zVisibility = z
  .object({
    distance: z.number(),
    unit: z.string(),
  })
  .partial()
  .passthrough();

const zAirPressure = z
  .object({
    meanSeaLevelMillibars: z.number(),
  })
  .partial()
  .passthrough();

const zWeatherCondition = z
  .object({
    iconBaseUri: z.string().optional(),
    description: zLocalizedText.optional(),
    type: z.string().optional(),
  })
  .passthrough();

const zTimeZone = z
  .object({
    id: z.string().optional(),
    version: z.string().optional(),
  })
  .passthrough();

const zLookupCurrentConditionsResponse = z.object({
  currentTime: z.string(),
  timeZone: zTimeZone,
  isDaytime: z.boolean().optional(),
  weatherCondition: zWeatherCondition,
  temperature: zTemperature,
  feelsLikeTemperature: zTemperature.optional(),
  dewPoint: zTemperature.optional(),
  heatIndex: zTemperature.optional(),
  windChill: zTemperature.optional(),
  relativeHumidity: z.number().int().optional(),
  uvIndex: z.number().int().optional(),
  precipitation: zPrecipitation.optional(),
  thunderstormProbability: z.number().int().optional(),
  airPressure: zAirPressure.optional(),
  wind: zWind.optional(),
  visibility: zVisibility.optional(),
  cloudCover: z.number().int().optional(),
  currentConditionsHistory: z.unknown().optional(),
});

const zDate = z
  .object({
    year: z.number().int(),
    month: z.number().int(),
    day: z.number().int(),
  })
  .partial()
  .passthrough();

const zInterval = z
  .object({
    startTime: z.string().optional(),
    endTime: z.string().optional(),
  })
  .passthrough();

const zForecastDayPart = z
  .object({
    weatherCondition: zWeatherCondition.optional(),
    precipitation: zPrecipitation.optional(),
    wind: zWind.optional(),
    cloudCover: z.number().int().optional(),
    relativeHumidity: z.number().int().optional(),
  })
  .partial()
  .passthrough();

const zSunEvent = z
  .object({
    type: z.string().optional(),
    time: z.string().optional(),
  })
  .passthrough();

const zSunEvents = z
  .object({
    events: z.array(zSunEvent).optional(),
  })
  .partial()
  .passthrough();

const zMoonEvents = zSunEvents;

const zForecastDay = z
  .object({
    interval: zInterval.optional(),
    displayDate: zDate.optional(),
    daytimeForecast: zForecastDayPart.optional(),
    nighttimeForecast: zForecastDayPart.optional(),
    maxTemperature: zTemperature.optional(),
    minTemperature: zTemperature.optional(),
    feelsLikeMaxTemperature: zTemperature.optional(),
    feelsLikeMinTemperature: zTemperature.optional(),
    maxHeatIndex: zTemperature.optional(),
    sunEvents: zSunEvents.optional(),
    moonEvents: zMoonEvents.optional(),
  })
  .passthrough();

const zLookupForecastDaysResponse = z.object({
  forecastDays: z.array(zForecastDay).optional(),
  timeZone: zTimeZone.optional(),
  nextPageToken: z.string().optional(),
});

const zForecastHour = z
  .object({
    interval: zInterval.optional(),
    weatherCondition: zWeatherCondition.optional(),
    temperature: zTemperature.optional(),
    feelsLikeTemperature: zTemperature.optional(),
    precipitation: zPrecipitation.optional(),
    wind: zWind.optional(),
    relativeHumidity: z.number().int().optional(),
    cloudCover: z.number().int().optional(),
  })
  .passthrough();

const zLookupForecastHoursResponse = z.object({
  forecastHours: z.array(zForecastHour).optional(),
  timeZone: zTimeZone.optional(),
  nextPageToken: z.string().optional(),
});

export type WeatherUnitsSystem = 'METRIC' | 'IMPERIAL';

interface BaseWeatherOptions {
  latitude: number;
  longitude: number;
  unitsSystem?: WeatherUnitsSystem;
  languageCode?: string;
}

export const fetchCurrentWeatherFromGoogle = async (
  options: BaseWeatherOptions,
) => {
  const { latitude, longitude, unitsSystem = 'METRIC', languageCode = 'ko' } =
    options;

  const searchParams = new URLSearchParams({
    'location.latitude': latitude.toString(),
    'location.longitude': longitude.toString(),
    unitsSystem,
    languageCode,
  });

  const baseHeaders = {
    Accept: 'application/json',
    'X-Goog-Api-Key': ENV.NEXT_GOOGLE_MAP_API_KEY,
    'X-Goog-FieldMask': '*',
  } as const;

  let response: Response;
  try {
    response = await ky.get(
      `${WEATHER_BASE_URL}/v1/currentConditions:lookup?${searchParams.toString()}`,
      { headers: baseHeaders },
    );
  } catch (error) {
    if (error instanceof HTTPError) {
      const message = `Google Weather API 요청 실패: HTTP ${error.response.status}`;
      throw new Error(message);
    }

    if (error instanceof Error) throw error;

    throw new Error(`Google Weather API 요청 실패: ${String(error)}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('json')) {
    const preview = (await response.text()).slice(0, 300);
    throw new Error(
      `Google Weather API 응답이 JSON이 아님 (content-type: ${contentType}): ${preview}`,
    );
  }

  const json = await response.json();
  return zLookupCurrentConditionsResponse.parse(json);
};

interface ForecastOptions extends BaseWeatherOptions {
  hours?: number;
  days?: number;
  hourlyPageSize?: number;
  dailyPageSize?: number;
}

export const fetchWeatherForecastFromGoogle = async (
  options: ForecastOptions,
) => {
  const {
    latitude,
    longitude,
    unitsSystem = 'METRIC',
    languageCode = 'ko',
    hours,
    days,
    hourlyPageSize,
    dailyPageSize,
  } = options;

  const commonParams: Record<string, string> = {
    'location.latitude': latitude.toString(),
    'location.longitude': longitude.toString(),
    unitsSystem,
    languageCode,
  };

  const forecast: {
    hours?: z.infer<typeof zLookupForecastHoursResponse>;
    days?: z.infer<typeof zLookupForecastDaysResponse>;
  } = {};

  const forecastHeaders = {
    Accept: 'application/json',
    'X-Goog-Api-Key': ENV.NEXT_GOOGLE_MAP_API_KEY,
    'X-Goog-FieldMask': '*',
  } as const;

  if (hours && hours > 0) {
    const params = new URLSearchParams(commonParams);
    params.set('hours', Math.min(Math.floor(hours), 240).toString());
    if (hourlyPageSize) {
      params.set('pageSize', Math.min(Math.max(hourlyPageSize, 1), 24).toString());
    }

    try {
      const res = await ky.get(
        `${WEATHER_BASE_URL}/v1/forecast/hours:lookup?${params.toString()}`,
        { headers: forecastHeaders },
      );

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('json')) {
        const preview = (await res.text()).slice(0, 300);
        throw new Error(
          `Google Weather 시간별 예보 응답이 JSON이 아님 (content-type: ${contentType}): ${preview}`,
        );
      }

      const json = await res.json();
      forecast.hours = zLookupForecastHoursResponse.parse(json);
    } catch (error) {
      if (error instanceof HTTPError) {
        const message = `Google Weather 시간별 예보 요청 실패: HTTP ${error.response.status}`;
        throw new Error(message);
      }

      if (error instanceof Error) throw error;

      throw new Error(`Google Weather 시간별 예보 요청 실패: ${String(error)}`);
    }
  }

  if (days && days > 0) {
    const params = new URLSearchParams(commonParams);
    params.set('days', Math.min(Math.floor(days), 10).toString());
    if (dailyPageSize) {
      params.set('pageSize', Math.min(Math.max(dailyPageSize, 1), 10).toString());
    }

    try {
      const res = await ky.get(
        `${WEATHER_BASE_URL}/v1/forecast/days:lookup?${params.toString()}`,
        { headers: forecastHeaders },
      );

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('json')) {
        const preview = (await res.text()).slice(0, 300);
        throw new Error(
          `Google Weather 일별 예보 응답이 JSON이 아님 (content-type: ${contentType}): ${preview}`,
        );
      }

      const json = await res.json();
      forecast.days = zLookupForecastDaysResponse.parse(json);
    } catch (error) {
      if (error instanceof HTTPError) {
        const message = `Google Weather 일별 예보 요청 실패: HTTP ${error.response.status}`;
        throw new Error(message);
      }

      if (error instanceof Error) throw error;

      throw new Error(`Google Weather 일별 예보 요청 실패: ${String(error)}`);
    }
  }

  return forecast;
};

export type CurrentWeather = z.infer<typeof zLookupCurrentConditionsResponse>;
export type WeatherForecastHours = z.infer<
  typeof zLookupForecastHoursResponse
>;
export type WeatherForecastDays = z.infer<typeof zLookupForecastDaysResponse>;
