import ky, { HTTPError } from 'ky';
import { z } from 'zod';

import { ENV } from '@/env';

const PLACES_BASE_URL = 'https://places.googleapis.com/v1';

const DEFAULT_DETAILS_FIELD_MASK_LIST = [
  'id', // 여러 호출에서 재사용하는 고유 식별자
  'displayName.text', // 검색과 동일한 읽기 쉬운 이름
  'formattedAddress', // 묘사에 쓰이는 표준 주소
  'location.latitude', // 지리 맥락을 위한 정확한 위도
  'location.longitude', // 지리 맥락을 위한 정확한 경도
  'primaryTypeDisplayName.text', // 설명에 쓰기 좋은 카테고리 텍스트
  'editorialSummary.text', // 공식 요약 문구
  'generativeSummary.overview.text', // AI가 작성한 풍부한 설명
];

const DEFAULT_DETAILS_FIELD_MASK = DEFAULT_DETAILS_FIELD_MASK_LIST.join(',');
const DEFAULT_SEARCH_FIELD_MASK = DEFAULT_DETAILS_FIELD_MASK_LIST.map(
  (fieldMask) => `places.${fieldMask}`,
);

const zLocalizedText = z
  .object({
    text: z.string().optional(),
    languageCode: z.string().optional(),
  })
  .passthrough();

const zLatLng = z
  .object({
    latitude: z.number(),
    longitude: z.number(),
  })
  .partial()
  .passthrough();

const zAuthorAttribution = z
  .object({
    displayName: z.string().optional(),
    uri: z.string().optional(),
  })
  .partial()
  .passthrough();

const zOpeningHoursPoint = z
  .object({
    day: z.number().int().optional(),
    hour: z.number().int().optional(),
    minute: z.number().int().optional(),
    date: z
      .object({
        year: z.number().int().optional(),
        month: z.number().int().optional(),
        day: z.number().int().optional(),
      })
      .passthrough()
      .optional(),
    truncated: z.boolean().optional(),
  })
  .passthrough();

const zOpeningHoursPeriod = z
  .object({
    open: zOpeningHoursPoint.optional(),
    close: zOpeningHoursPoint.optional(),
  })
  .partial()
  .passthrough();

const zOpeningHours = z
  .object({
    openNow: z.boolean().optional(),
    periods: z.array(zOpeningHoursPeriod).optional(),
    weekdayDescriptions: z.array(z.string()).optional(),
    secondaryHoursType: z.string().optional(),
    specialDays: z.array(z.unknown()).optional(),
    nextOpenTime: z.string().optional(),
    nextCloseTime: z.string().optional(),
  })
  .partial()
  .passthrough();

const zAccessibilityOptions = z
  .object({
    wheelchairAccessibleParking: z.boolean().optional(),
    wheelchairAccessibleEntrance: z.boolean().optional(),
    wheelchairAccessibleRestroom: z.boolean().optional(),
    wheelchairAccessibleSeating: z.boolean().optional(),
    wheelchairAccessibleElevator: z.boolean().optional(),
  })
  .partial()
  .passthrough();

const zReview = z
  .object({
    name: z.string().optional(),
    rating: z.number().optional(),
    text: zLocalizedText.optional(),
    originalText: zLocalizedText.optional(),
    publishTime: z.string().optional(),
    relativePublishTimeDescription: z.string().optional(),
    googleMapsUri: z.string().optional(),
    flagContentUri: z.string().optional(),
    visitDate: z.string().optional(),
    authorAttribution: zAuthorAttribution.optional(),
  })
  .partial()
  .passthrough();

const zPlace = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    displayName: zLocalizedText.optional(),
    formattedAddress: z.string().optional(),
    shortFormattedAddress: z.string().optional(),
    location: zLatLng.optional(),
    types: z.array(z.string()).optional(),
    primaryType: z.string().optional(),
    primaryTypeDisplayName: zLocalizedText.optional(),
    rating: z.number().optional(),
    userRatingCount: z.number().optional(),
    priceLevel: z.string().optional(),
    businessStatus: z.string().optional(),
    googleMapsUri: z.string().optional(),
    websiteUri: z.string().optional(),
    editorialSummary: zLocalizedText.optional(),
    currentOpeningHours: zOpeningHours.optional(),
    regularOpeningHours: zOpeningHours.optional(),
    nationalPhoneNumber: z.string().optional(),
    internationalPhoneNumber: z.string().optional(),
    accessibilityOptions: zAccessibilityOptions.optional(),
    generativeSummary: z
      .object({
        overview: zLocalizedText.optional(),
        overviewFlagContentUri: z.string().optional(),
        disclosureText: zLocalizedText.optional(),
      })
      .partial()
      .passthrough()
      .optional(),
    utcOffsetMinutes: z.number().optional(),
    timeZone: z
      .object({
        id: z.string().optional(),
        version: z.string().optional(),
      })
      .partial()
      .passthrough()
      .optional(),
    reviews: z.array(zReview).optional(),
  })
  .passthrough();

const zSearchTextResponse = z.object({
  places: z.array(zPlace).optional(),
  nextPageToken: z.string().optional(),
  searchUri: z.string().optional(),
});

export type GooglePlace = z.infer<typeof zPlace>;
export type GooglePlacesSearchResponse = z.infer<typeof zSearchTextResponse>;

interface SearchPlacesOptions {
  textQuery: string;
  languageCode?: string;
  regionCode?: string;
  pageSize?: number;
  fieldMask?: string | string[];
  openNow?: boolean;
  minRating?: number;
  rankPreference?: 'DISTANCE' | 'RELEVANCE';
  includedType?: string;
}

interface SearchNearbyOptions {
  center: {
    latitude: number;
    longitude: number;
  };
  radiusMeters: number;
  includedTypes?: string[];
  excludedTypes?: string[];
  maxResultCount?: number;
  languageCode?: string;
  regionCode?: string;
  rankPreference?: 'DISTANCE' | 'POPULARITY';
  fieldMask?: string | string[];
}

export const searchPlacesByText = async (options: SearchPlacesOptions) => {
  const {
    textQuery,
    languageCode,
    regionCode,
    pageSize,
    fieldMask = DEFAULT_SEARCH_FIELD_MASK,
    openNow,
    minRating,
    rankPreference,
    includedType,
  } = options;

  const serializedFieldMask = Array.isArray(fieldMask)
    ? fieldMask.join(',')
    : fieldMask;

  const payload: Record<string, unknown> = {
    textQuery,
  };

  if (languageCode) payload.languageCode = languageCode;
  if (regionCode) payload.regionCode = regionCode;
  if (pageSize) payload.pageSize = Math.min(Math.max(pageSize, 1), 20);
  if (openNow !== undefined) payload.openNow = openNow;
  if (minRating !== undefined) payload.minRating = minRating;
  if (rankPreference) payload.rankPreference = rankPreference;
  if (includedType) payload.includedType = includedType;

  let response: Response;
  try {
    response = await ky.post(`${PLACES_BASE_URL}/places:searchText`, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Goog-Api-Key': ENV.NEXT_GOOGLE_MAP_API_KEY,
        'X-Goog-FieldMask': serializedFieldMask,
      },
      json: payload,
    });
  } catch (error) {
    if (error instanceof HTTPError) {
      const message = `Google Places 검색 실패: HTTP ${error.response.status}`;
      throw new Error(message);
    }

    if (error instanceof Error) throw error;

    throw new Error(`Google Places 검색 실패: ${JSON.stringify(error)}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('json')) {
    const preview = (await response.text()).slice(0, 300);
    throw new Error(
      `Google Places 검색 응답이 JSON이 아님 (content-type: ${contentType}): ${preview}`,
    );
  }

  const json = await response.json();

  return zSearchTextResponse.parse(json);
};

interface GetPlaceDetailsOptions {
  placeId: string;
  languageCode?: string;
  regionCode?: string;
  fieldMask?: string | string[];
}

export const fetchPlaceDetails = async (options: GetPlaceDetailsOptions) => {
  const {
    placeId,
    languageCode,
    regionCode,
    fieldMask = DEFAULT_DETAILS_FIELD_MASK,
  } = options;

  const serializedFieldMask = Array.isArray(fieldMask)
    ? fieldMask.join(',')
    : fieldMask;

  const searchParams = new URLSearchParams();
  if (languageCode) searchParams.set('languageCode', languageCode);
  if (regionCode) searchParams.set('regionCode', regionCode);

  let response: Response;
  try {
    response = await ky.get(
      `${PLACES_BASE_URL}/places/${placeId}?${searchParams.toString()}`,
      {
        headers: {
          Accept: 'application/json',
          'X-Goog-Api-Key': ENV.NEXT_GOOGLE_MAP_API_KEY,
          'X-Goog-FieldMask': serializedFieldMask,
        },
      },
    );
  } catch (error) {
    if (error instanceof HTTPError) {
      const message = `Google Places 상세조회 실패: HTTP ${error.response.status}`;
      throw new Error(message);
    }

    if (error instanceof Error) throw error;

    throw new Error(`Google Places 상세조회 실패: ${JSON.stringify(error)}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('json')) {
    const preview = (await response.text()).slice(0, 300);
    throw new Error(
      `Google Places 상세조회 응답이 JSON이 아님 (content-type: ${contentType}): ${preview}`,
    );
  }

  const json = await response.json();

  return zPlace.parse(json);
};

export const searchPlacesNearby = async (options: SearchNearbyOptions) => {
  const {
    center,
    radiusMeters,
    includedTypes,
    excludedTypes,
    maxResultCount,
    languageCode,
    regionCode,
    rankPreference,
    fieldMask = DEFAULT_SEARCH_FIELD_MASK,
  } = options;

  const serializedFieldMask = Array.isArray(fieldMask)
    ? fieldMask.join(',')
    : fieldMask;

  const payload: Record<string, unknown> = {
    locationRestriction: {
      circle: {
        center: {
          latitude: center.latitude,
          longitude: center.longitude,
        },
        radius: Math.min(Math.max(radiusMeters, 1), 50000),
      },
    },
  };

  if (includedTypes?.length) payload.includedTypes = includedTypes;
  if (excludedTypes?.length) payload.excludedTypes = excludedTypes;
  if (languageCode) payload.languageCode = languageCode;
  if (regionCode) payload.regionCode = regionCode;
  if (rankPreference) payload.rankPreference = rankPreference;

  if (maxResultCount) {
    payload.maxResultCount = Math.min(Math.max(maxResultCount, 1), 20);
  }

  let response: Response;
  try {
    response = await ky.post(`${PLACES_BASE_URL}/places:searchNearby`, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Goog-Api-Key': ENV.NEXT_GOOGLE_MAP_API_KEY,
        'X-Goog-FieldMask': serializedFieldMask,
      },
      json: payload,
    });
  } catch (error) {
    if (error instanceof HTTPError) {
      const message = `Google Places 주변검색 실패: HTTP ${error.response.status}`;
      throw new Error(message);
    }

    if (error instanceof Error) throw error;

    throw new Error(`Google Places 주변검색 실패: ${JSON.stringify(error)}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('json')) {
    const preview = (await response.text()).slice(0, 300);
    throw new Error(
      `Google Places 주변검색 응답이 JSON이 아님 (content-type: ${contentType}): ${preview}`,
    );
  }

  const json = await response.json();

  return zSearchTextResponse.parse(json);
};
