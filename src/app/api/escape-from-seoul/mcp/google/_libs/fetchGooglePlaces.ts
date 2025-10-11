import ky, { HTTPError } from 'ky';
import { z } from 'zod';

import { ENV } from '@/env';

const PLACES_BASE_URL = 'https://places.googleapis.com/v1';

const DEFAULT_SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName.text',
  'places.displayName.languageCode',
  'places.formattedAddress',
  'places.shortFormattedAddress',
  'places.location.latitude',
  'places.location.longitude',
  'places.types',
  'places.primaryType',
  'places.primaryTypeDisplayName.text',
  'places.primaryTypeDisplayName.languageCode',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.businessStatus',
  'places.googleMapsUri',
  'places.websiteUri',
  'places.editorialSummary.text',
  'places.editorialSummary.languageCode',
  'places.currentOpeningHours.openNow',
  'places.currentOpeningHours.weekdayDescriptions',
  'places.regularOpeningHours.weekdayDescriptions',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.accessibilityOptions.wheelchairAccessibleParking',
  'places.accessibilityOptions.wheelchairAccessibleEntrance',
  'places.accessibilityOptions.wheelchairAccessibleRestroom',
  'places.accessibilityOptions.wheelchairAccessibleSeating',
  'places.photos.name',
  'places.photos.widthPx',
  'places.photos.heightPx',
  'places.photos.authorAttributions.displayName',
  'places.photos.authorAttributions.uri',
  'places.photos.authorAttributions.photoUri',
  'places.generativeSummary.overview.text',
  'places.generativeSummary.overview.languageCode',
  'places.generativeSummary.overviewFlagContentUri',
  'places.generativeSummary.disclosureText.text',
  'places.generativeSummary.disclosureText.languageCode',
  'places.utcOffsetMinutes',
  'places.timeZone.id',
  'places.timeZone.version',
].join(',');

const DEFAULT_DETAILS_FIELD_MASK = [
  'id',
  'displayName.text',
  'displayName.languageCode',
  'formattedAddress',
  'shortFormattedAddress',
  'location.latitude',
  'location.longitude',
  'types',
  'primaryType',
  'primaryTypeDisplayName.text',
  'primaryTypeDisplayName.languageCode',
  'rating',
  'userRatingCount',
  'priceLevel',
  'businessStatus',
  'googleMapsUri',
  'websiteUri',
  'editorialSummary.text',
  'editorialSummary.languageCode',
  'currentOpeningHours.openNow',
  'currentOpeningHours.weekdayDescriptions',
  'regularOpeningHours.weekdayDescriptions',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'accessibilityOptions.wheelchairAccessibleParking',
  'accessibilityOptions.wheelchairAccessibleEntrance',
  'accessibilityOptions.wheelchairAccessibleRestroom',
  'accessibilityOptions.wheelchairAccessibleSeating',
  'photos.name',
  'photos.widthPx',
  'photos.heightPx',
  'photos.authorAttributions.displayName',
  'photos.authorAttributions.uri',
  'photos.authorAttributions.photoUri',
  'generativeSummary.overview.text',
  'generativeSummary.overview.languageCode',
  'generativeSummary.overviewFlagContentUri',
  'generativeSummary.disclosureText.text',
  'generativeSummary.disclosureText.languageCode',
  'utcOffsetMinutes',
  'timeZone.id',
  'timeZone.version',
  'reviews.name',
  'reviews.rating',
  'reviews.text.text',
  'reviews.text.languageCode',
  'reviews.originalText.text',
  'reviews.originalText.languageCode',
  'reviews.publishTime',
  'reviews.relativePublishTimeDescription',
  'reviews.authorAttribution.displayName',
  'reviews.authorAttribution.uri',
  'reviews.authorAttribution.photoUri',
  'reviews.googleMapsUri',
  'reviews.flagContentUri',
  'reviews.visitDate',
].join(',');

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
    photoUri: z.string().optional(),
  })
  .partial()
  .passthrough();

const zPhoto = z
  .object({
    name: z.string(),
    widthPx: z.number().optional(),
    heightPx: z.number().optional(),
    authorAttributions: z.array(zAuthorAttribution).optional(),
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
    photos: z.array(zPhoto).optional(),
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
  fieldMask?: string;
  openNow?: boolean;
  minRating?: number;
  rankPreference?: 'DISTANCE' | 'RELEVANCE';
  includedType?: string;
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
        'X-Goog-FieldMask': fieldMask,
      },
      json: payload,
    });
  } catch (error) {
    if (error instanceof HTTPError) {
      const message = `Google Places 검색 실패: HTTP ${error.response.status}`;
      throw new Error(message);
    }

    if (error instanceof Error) throw error;

    throw new Error(`Google Places 검색 실패: ${String(error)}`);
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
  fieldMask?: string;
}

export const fetchPlaceDetails = async (options: GetPlaceDetailsOptions) => {
  const {
    placeId,
    languageCode,
    regionCode,
    fieldMask = DEFAULT_DETAILS_FIELD_MASK,
  } = options;

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
          'X-Goog-FieldMask': fieldMask,
        },
      },
    );
  } catch (error) {
    if (error instanceof HTTPError) {
      const message = `Google Places 상세조회 실패: HTTP ${error.response.status}`;
      throw new Error(message);
    }

    if (error instanceof Error) throw error;

    throw new Error(`Google Places 상세조회 실패: ${String(error)}`);
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

export const buildPlacePhotoUrl = (
  photoName: string,
  options?: { maxHeightPx?: number; maxWidthPx?: number },
) => {
  const params = new URLSearchParams({
    key: ENV.NEXT_GOOGLE_MAP_API_KEY,
  });

  if (options?.maxHeightPx) {
    params.set('maxHeightPx', options.maxHeightPx.toString());
  }

  if (options?.maxWidthPx) {
    params.set('maxWidthPx', options.maxWidthPx.toString());
  }

  return `${PLACES_BASE_URL}/${photoName}/media?${params.toString()}`;
};
