import { z } from 'zod';

import {
  buildPlacePhotoUrl,
  fetchPlaceDetails,
  type GooglePlace,
  type GooglePlacesSearchResponse,
  searchPlacesByText,
} from '@/app/api/escape-from-seoul/mcp/google/_libs/fetchGooglePlaces';
import {
  type CurrentWeather,
  fetchCurrentWeatherFromGoogle,
  fetchWeatherForecastFromGoogle,
  type WeatherForecastDays,
  type WeatherForecastHours,
  type WeatherUnitsSystem,
} from '@/app/api/escape-from-seoul/mcp/google/_libs/fetchGoogleWeather';
import { handleMcpRequest, type ToolDef } from '@/utils';

export const runtime = 'edge';

const zWeatherLookupArgs = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  unitsSystem: z.enum(['METRIC', 'IMPERIAL']).optional(),
  languageCode: z.string().min(2).max(20).optional(),
  includeHourly: z.boolean().optional(),
  includeDaily: z.boolean().optional(),
  hourCount: z.number().int().min(1).max(240).optional(),
  dayCount: z.number().int().min(1).max(10).optional(),
  hourlyPageSize: z.number().int().min(1).max(24).optional(),
  dailyPageSize: z.number().int().min(1).max(10).optional(),
});

const zPlaceDescribeArgs = z
  .object({
    textQuery: z.string().min(1).max(120).optional(),
    placeId: z.string().min(1).optional(),
    languageCode: z.string().min(2).max(20).optional(),
    regionCode: z.string().min(2).max(10).optional(),
    pageSize: z.number().int().min(1).max(10).optional(),
    includeReviews: z.boolean().optional(),
    photoMaxWidthPx: z.number().int().min(64).max(2048).optional(),
    photoMaxHeightPx: z.number().int().min(64).max(2048).optional(),
  })
  .refine(
    (value) =>
      typeof value.textQuery === 'string' || typeof value.placeId === 'string',
    {
      message: 'textQuery 또는 placeId 중 최소 하나는 필요합니다.',
      path: ['textQuery'],
    },
  );

const temperatureUnitSymbol = (unit?: string) => {
  if (unit === 'FAHRENHEIT') return '°F';
  if (unit === 'CELSIUS') return '°C';

  return '';
};

const toTemperatureInfo = (temperature?: CurrentWeather['temperature']) => {
  if (!temperature || typeof temperature.degrees !== 'number') return null;

  const unit = temperature.unit ?? 'CELSIUS';
  const symbol = temperatureUnitSymbol(unit);

  return {
    degrees: temperature.degrees,
    unit,
    formatted: `${temperature.degrees.toFixed(1)}${symbol}`,
  };
};

const toPrecipInfo = (precipitation?: CurrentWeather['precipitation']) => {
  if (!precipitation) return null;

  const probability = precipitation.probability?.percent;
  const precipitationType = precipitation.probability?.type;
  const rainfall = precipitation.qpf
    ? {
        quantity: precipitation.qpf.quantity,
        unit: precipitation.qpf.unit,
      }
    : undefined;
  const snowfall = precipitation.snowQpf
    ? {
        quantity: precipitation.snowQpf.quantity,
        unit: precipitation.snowQpf.unit,
      }
    : undefined;

  if (
    probability === undefined &&
    rainfall === undefined &&
    snowfall === undefined &&
    precipitationType === undefined
  ) {
    return null;
  }

  return {
    probability,
    precipitationType,
    rainfall,
    snowfall,
  };
};

const toWindInfo = (wind?: CurrentWeather['wind']) => {
  if (!wind) return null;

  const speedValue = wind.speed?.value;
  const speedUnit = wind.speed?.unit;
  const gustValue = wind.gust?.value;
  const gustUnit = wind.gust?.unit;
  const degrees = wind.direction?.degrees;
  const cardinal = wind.direction?.cardinal;

  if (
    speedValue === undefined &&
    gustValue === undefined &&
    degrees === undefined &&
    !cardinal
  ) {
    return null;
  }

  return {
    speed:
      speedValue !== undefined
        ? { value: speedValue, unit: speedUnit }
        : undefined,
    gust:
      gustValue !== undefined
        ? { value: gustValue, unit: gustUnit }
        : undefined,
    direction: {
      degrees,
      cardinal,
    },
  };
};

const summarizeCurrentWeather = (
  weather: CurrentWeather,
  unitsSystem: WeatherUnitsSystem,
) => {
  const temperature = toTemperatureInfo(weather.temperature);
  const feelsLike = toTemperatureInfo(weather.feelsLikeTemperature);
  const dewPoint = toTemperatureInfo(weather.dewPoint);
  const wind = toWindInfo(weather.wind);
  const precipitation = toPrecipInfo(weather.precipitation);
  const visibility =
    weather.visibility && typeof weather.visibility.distance === 'number'
      ? {
          distance: weather.visibility.distance,
          unit: weather.visibility.unit,
        }
      : undefined;

  const conditionText =
    weather.weatherCondition.description?.text ??
    weather.weatherCondition.type ??
    '알 수 없는 날씨';

  const hints: string[] = [];
  if (temperature) {
    if (feelsLike && feelsLike.formatted !== temperature.formatted) {
      hints.push(
        `체감온도 ${feelsLike.formatted} (실제 기온 ${temperature.formatted})`,
      );
    } else {
      hints.push(`현재 기온 ${temperature.formatted}`);
    }
  }

  if (weather.relativeHumidity !== undefined) {
    hints.push(`습도 ${weather.relativeHumidity}%`);
  }

  if (wind) {
    const speedLabel =
      wind.speed?.value !== undefined
        ? `${wind.speed.value.toFixed(1)} ${wind.speed.unit === 'MILES_PER_HOUR' ? 'mph' : 'km/h'}`
        : null;
    const gustLabel =
      wind.gust?.value !== undefined
        ? `돌풍 ${wind.gust.value.toFixed(1)} ${wind.gust.unit === 'MILES_PER_HOUR' ? 'mph' : 'km/h'}`
        : null;
    const directionLabel =
      wind.direction.cardinal ?? `${wind.direction.degrees ?? 0}°`;
    const segments = [
      directionLabel,
      speedLabel ? `풍속 ${speedLabel}` : null,
      gustLabel,
    ].filter(Boolean);
    if (segments.length > 0) hints.push(segments.join(', '));
  }

  if (precipitation?.probability !== undefined) {
    hints.push(`강수확률 ${precipitation.probability}%`);
  }

  if (weather.uvIndex !== undefined) {
    hints.push(`UV 지수 ${weather.uvIndex}`);
  }

  if (visibility) {
    const unitLabel = visibility.unit === 'MILES' ? '마일' : 'km';
    hints.push(`시정 ${visibility.distance.toFixed(1)}${unitLabel}`);
  }

  return {
    conditionText,
    isDaytime: weather.isDaytime ?? null,
    temperature,
    feelsLike,
    dewPoint,
    wind,
    precipitation,
    visibility,
    relativeHumidity: weather.relativeHumidity ?? null,
    uvIndex: weather.uvIndex ?? null,
    airPressure: weather.airPressure?.meanSeaLevelMillibars ?? null,
    cloudCover: weather.cloudCover ?? null,
    thunderstormProbability: weather.thunderstormProbability ?? null,
    hints,
    unitsSystem,
  };
};

const limitArray = <T>(input: T[] | undefined, limit: number) => {
  if (!input) return [];

  return input.slice(0, Math.max(limit, 0));
};

const simplifyForecastDays = (
  forecast: WeatherForecastDays | undefined,
  limit: number,
) => {
  if (!forecast?.forecastDays) return [];

  return limitArray(forecast.forecastDays, limit).map((item) => {
    const daytimeCondition =
      item.daytimeForecast?.weatherCondition?.description?.text ??
      item.daytimeForecast?.weatherCondition?.type;
    const nighttimeCondition =
      item.nighttimeForecast?.weatherCondition?.description?.text ??
      item.nighttimeForecast?.weatherCondition?.type;

    const sunrise = item.sunEvents?.events?.find(
      (event) => event.type === 'SUNRISE',
    );
    const sunset = item.sunEvents?.events?.find(
      (event) => event.type === 'SUNSET',
    );

    return {
      displayDate: item.displayDate,
      interval: item.interval,
      daytimeCondition: daytimeCondition ?? null,
      nighttimeCondition: nighttimeCondition ?? null,
      maxTemperature: toTemperatureInfo(item.maxTemperature),
      minTemperature: toTemperatureInfo(item.minTemperature),
      feelsLikeMax: toTemperatureInfo(item.feelsLikeMaxTemperature),
      feelsLikeMin: toTemperatureInfo(item.feelsLikeMinTemperature),
      maxHeatIndex: toTemperatureInfo(item.maxHeatIndex),
      daytime: {
        precipitation: toPrecipInfo(item.daytimeForecast?.precipitation),
        wind: toWindInfo(item.daytimeForecast?.wind),
        relativeHumidity: item.daytimeForecast?.relativeHumidity ?? null,
      },
      nighttime: {
        precipitation: toPrecipInfo(item.nighttimeForecast?.precipitation),
        wind: toWindInfo(item.nighttimeForecast?.wind),
        relativeHumidity: item.nighttimeForecast?.relativeHumidity ?? null,
      },
      sunrise,
      sunset,
    };
  });
};

const simplifyForecastHours = (
  forecast: WeatherForecastHours | undefined,
  limit: number,
) => {
  if (!forecast?.forecastHours) return [];

  return limitArray(forecast.forecastHours, limit).map((item) => {
    const condition =
      item.weatherCondition?.description?.text ??
      item.weatherCondition?.type ??
      null;

    return {
      interval: item.interval,
      condition,
      temperature: toTemperatureInfo(item.temperature),
      feelsLike: toTemperatureInfo(item.feelsLikeTemperature),
      precipitation: toPrecipInfo(item.precipitation),
      wind: toWindInfo(item.wind),
      relativeHumidity: item.relativeHumidity ?? null,
      cloudCover: item.cloudCover ?? null,
    };
  });
};

const describePlace = (
  place: GooglePlace,
  photoOptions: { maxWidthPx?: number; maxHeightPx?: number },
) => {
  const photoUrls =
    place.photos?.map((photo) => ({
      name: photo.name,
      widthPx: photo.widthPx,
      heightPx: photo.heightPx,
      attributions: photo.authorAttributions,
      url: photo.name ? buildPlacePhotoUrl(photo.name, photoOptions) : null,
    })) ?? [];

  return {
    id: place.id ?? null,
    resourceName: place.name ?? null,
    displayName: place.displayName?.text ?? null,
    formattedAddress:
      place.formattedAddress ?? place.shortFormattedAddress ?? null,
    coordinates: place.location
      ? {
          latitude: place.location.latitude ?? null,
          longitude: place.location.longitude ?? null,
        }
      : null,
    primaryType: place.primaryType ?? null,
    primaryTypeDisplayName: place.primaryTypeDisplayName?.text ?? null,
    types: place.types ?? [],
    businessStatus: place.businessStatus ?? null,
    rating: place.rating ?? null,
    userRatingCount: place.userRatingCount ?? null,
    priceLevel: place.priceLevel ?? null,
    websites: {
      googleMapsUri: place.googleMapsUri ?? null,
      websiteUri: place.websiteUri ?? null,
    },
    contact: {
      nationalPhoneNumber: place.nationalPhoneNumber ?? null,
      internationalPhoneNumber: place.internationalPhoneNumber ?? null,
    },
    editorialSummary: place.editorialSummary?.text ?? null,
    generativeSummary: {
      overview: place.generativeSummary?.overview?.text ?? null,
      disclosure: place.generativeSummary?.disclosureText?.text ?? null,
    },
    openingHours: {
      current: {
        openNow: place.currentOpeningHours?.openNow ?? null,
        weekdayDescriptions:
          place.currentOpeningHours?.weekdayDescriptions ?? [],
      },
      regular: place.regularOpeningHours?.weekdayDescriptions ?? [],
    },
    accessibility: place.accessibilityOptions ?? null,
    utcOffsetMinutes: place.utcOffsetMinutes ?? null,
    timeZone: place.timeZone?.id ?? null,
    photos: photoUrls.filter((photo) => photo.url !== null),
  };
};

const collectReviews = (place: GooglePlace) => {
  if (!place.reviews) return [];

  return place.reviews.map((review) => ({
    name: review.name ?? null,
    rating: review.rating ?? null,
    text: review.text?.text ?? review.originalText?.text ?? null,
    language:
      review.text?.languageCode ?? review.originalText?.languageCode ?? null,
    publishTime: review.publishTime ?? null,
    relativePublishTimeDescription:
      review.relativePublishTimeDescription ?? null,
    author: {
      displayName: review.authorAttribution?.displayName ?? null,
      uri: review.authorAttribution?.uri ?? null,
      photoUri: review.authorAttribution?.photoUri ?? null,
    },
    googleMapsUri: review.googleMapsUri ?? null,
    visitDate: review.visitDate ?? null,
  }));
};

const tools: Array<ToolDef<unknown, unknown>> = [
  {
    name: 'google.weather.lookup',
    description:
      'Google Weather API를 사용해 지정한 위도/경도의 현재 날씨와 선택적인 예보(시간별, 일별)를 조회합니다. 소설 속 배경 묘사를 위해 실시간 기상 정보를 참고하세요.',
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
          description: '단위계 (미지정 시 METRIC)',
        },
        languageCode: {
          type: 'string',
          description: '응답 언어 코드 (기본값: ko)',
        },
        includeHourly: {
          type: 'boolean',
          description: '시간별 예보 포함 여부 (기본값: false)',
        },
        includeDaily: {
          type: 'boolean',
          description: '일별 예보 포함 여부 (기본값: false)',
        },
        hourCount: {
          type: 'integer',
          minimum: 1,
          maximum: 240,
          description: '시간별 예보 조회 개수 (1~240)',
        },
        dayCount: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          description: '일별 예보 조회 개수 (1~10)',
        },
        hourlyPageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 24,
          description: '시간별 예보 페이지당 레코드 수 (1~24)',
        },
        dailyPageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          description: '일별 예보 페이지당 레코드 수 (1~10)',
        },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = zWeatherLookupArgs.parse(rawArgs);

      const units: WeatherUnitsSystem = args.unitsSystem ?? 'METRIC';
      const languageCode = args.languageCode ?? 'ko';

      const requestHourly =
        args.includeHourly === true ||
        (args.hourCount !== undefined && args.hourCount > 0);
      const requestDaily =
        args.includeDaily === true ||
        (args.dayCount !== undefined && args.dayCount > 0);

      const hoursToFetch = requestHourly ? (args.hourCount ?? 12) : undefined;
      const daysToFetch = requestDaily ? (args.dayCount ?? 5) : undefined;

      const [currentWeather, forecast] = await Promise.all([
        fetchCurrentWeatherFromGoogle({
          latitude: args.latitude,
          longitude: args.longitude,
          unitsSystem: units,
          languageCode,
        }),
        (async () => {
          if (!hoursToFetch && !daysToFetch) return {};

          return fetchWeatherForecastFromGoogle({
            latitude: args.latitude,
            longitude: args.longitude,
            unitsSystem: units,
            languageCode,
            hours: hoursToFetch,
            days: daysToFetch,
            hourlyPageSize: args.hourlyPageSize,
            dailyPageSize: args.dailyPageSize,
          });
        })(),
      ]);

      const summary = summarizeCurrentWeather(currentWeather, units);

      const simplifiedForecast = {
        daily: simplifyForecastDays(
          forecast.days,
          daysToFetch ?? forecast.days?.forecastDays?.length ?? 0,
        ),
        hourly: simplifyForecastHours(
          forecast.hours,
          hoursToFetch ?? forecast.hours?.forecastHours?.length ?? 0,
        ),
      };

      const aiHints = [`날씨: ${summary.conditionText}`, ...summary.hints];

      return {
        request: {
          latitude: args.latitude,
          longitude: args.longitude,
          unitsSystem: units,
          languageCode,
          hourCount:
            simplifiedForecast.hourly.length > 0
              ? simplifiedForecast.hourly.length
              : null,
          dayCount:
            simplifiedForecast.daily.length > 0
              ? simplifiedForecast.daily.length
              : null,
        },
        current: {
          summary,
          raw: currentWeather,
        },
        forecast: {
          simplified: simplifiedForecast,
          raw: forecast,
        },
        ai: {
          hints: aiHints,
          narrativePrompts: [
            summary.isDaytime
              ? '낮 시간 배경 묘사: 빛과 그림자의 대비, 하늘 색감, 가시거리 등을 활용해 장면을 묘사해보세요.'
              : '밤 시간 배경 묘사: 습도, 체감온도, 풍향을 활용해 공기의 느낌을 표현해보세요.',
            '강수확률과 운량 정보를 활용해 인물의 감정선과 연결되는 자연스러운 배경을 만들어보세요.',
          ],
        },
      };
    },
  },
  {
    name: 'google.places.describe',
    description:
      'Google Places API 텍스트 검색/상세 조회를 조합해 장소의 특징, 연락처, 운영 정보, 사진, 후기 등 스토리텔링에 유용한 정보를 제공합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        textQuery: {
          type: 'string',
          description: '검색할 텍스트 (예: 명동 카페, 서울 종각역 근처 공원)',
        },
        placeId: {
          type: 'string',
          description:
            'Google Place ID (textQuery 없이 placeId만 전달해 상세조회 가능)',
        },
        languageCode: {
          type: 'string',
          description: '응답 언어 코드 (기본값: ko)',
        },
        regionCode: {
          type: 'string',
          description: '결과에 영향을 줄 수 있는 지역 코드 (예: KR, US)',
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          description: '텍스트 검색 결과 최대 개수',
        },
        includeReviews: {
          type: 'boolean',
          description:
            'true 면 대표 장소에 대한 최신 리뷰(최대 5개)를 포함합니다.',
        },
        photoMaxWidthPx: {
          type: 'integer',
          minimum: 64,
          maximum: 2048,
          description: '생성할 사진 URL의 최대 가로 픽셀',
        },
        photoMaxHeightPx: {
          type: 'integer',
          minimum: 64,
          maximum: 2048,
          description: '생성할 사진 URL의 최대 세로 픽셀',
        },
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = zPlaceDescribeArgs.parse(rawArgs);

      const languageCode = args.languageCode ?? 'ko';
      const regionCode = args.regionCode;
      const photoOptions = {
        maxWidthPx: args.photoMaxWidthPx,
        maxHeightPx: args.photoMaxHeightPx,
      };

      let searchResponse: GooglePlacesSearchResponse | null = null;
      let detailPlace: GooglePlace | null = null;

      if (args.textQuery) {
        searchResponse = await searchPlacesByText({
          textQuery: args.textQuery,
          languageCode,
          regionCode,
          pageSize: args.pageSize ?? 5,
        });
      }

      const normalizedPlaceId = (() => {
        if (!args.placeId) return undefined;

        return args.placeId.startsWith('places/')
          ? args.placeId.replace(/^places\//, '')
          : args.placeId;
      })();

      const fallbackPlaceId =
        normalizedPlaceId ??
        searchResponse?.places?.[0]?.id?.replace(/^places\//, '');

      if (fallbackPlaceId) {
        detailPlace = await fetchPlaceDetails({
          placeId: fallbackPlaceId,
          languageCode,
          regionCode,
        });
      }

      const searchSummaries =
        searchResponse?.places?.map((place) =>
          describePlace(place, photoOptions),
        ) ?? [];

      const detailedSummary = detailPlace
        ? describePlace(detailPlace, photoOptions)
        : null;

      const reviews =
        detailPlace && args.includeReviews ? collectReviews(detailPlace) : [];

      const aiHints: string[] = [];
      if (detailedSummary?.displayName) {
        aiHints.push(`대표 장소: ${detailedSummary.displayName}`);
      }
      if (detailedSummary?.formattedAddress) {
        aiHints.push(`주소: ${detailedSummary.formattedAddress}`);
      }
      if (detailedSummary?.rating) {
        const ratingHint =
          detailedSummary.userRatingCount !== null
            ? `${detailedSummary.rating.toFixed(1)}점 (${detailedSummary.userRatingCount}명)`
            : `${detailedSummary.rating.toFixed(1)}점`;
        aiHints.push(`평균 평점: ${ratingHint}`);
      }
      if (detailedSummary?.generativeSummary?.overview) {
        aiHints.push(`AI 요약: ${detailedSummary.generativeSummary.overview}`);
      } else if (detailedSummary?.editorialSummary) {
        aiHints.push(`요약: ${detailedSummary.editorialSummary}`);
      }

      return {
        query: {
          textQuery: args.textQuery ?? null,
          placeId: fallbackPlaceId ?? null,
          languageCode,
          regionCode: regionCode ?? null,
          pageSize: args.pageSize ?? null,
          includeReviews: args.includeReviews ?? false,
        },
        places: searchSummaries,
        detail: detailedSummary,
        reviews,
        ai: {
          hints: aiHints,
          narrativePrompts: [
            'AI 요약과 리뷰에서 분위기 키워드를 추출해 장면 배경 톤을 설정해보세요.',
            '운영시간과 접근성 정보를 활용해 등장인물의 행동 동선을 자연스럽게 구성해보세요.',
          ],
        },
        raw: {
          search: searchResponse,
          detail: detailPlace,
        },
      };
    },
  },
];

export async function POST(req: Request) {
  return handleMcpRequest({ req, tools });
}
