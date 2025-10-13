import { z } from 'zod';

import {
  fetchPlaceDetails,
  type GooglePlace,
  type GooglePlacesSearchResponse,
  searchPlacesByText,
} from '@/app/api/escape-from-seoul/mcp/google/_libs/fetchGooglePlaces';
import type { Tool } from '@/types/mcp';
import { handleMcpRequest } from '@/utils';

export const runtime = 'edge';

const zPlaceDescribeArgs = z
  .object({
    textQuery: z.string().min(1).max(120).optional(),
    placeId: z.string().min(1).optional(),
    languageCode: z.string().min(2).max(20).optional(),
    regionCode: z.string().min(2).max(10).optional(),
    pageSize: z.number().int().min(1).max(10).optional(),
    includeReviews: z.boolean().optional(),
  })
  .refine(
    (value) =>
      typeof value.textQuery === 'string' || typeof value.placeId === 'string',
    {
      message: 'textQuery 또는 placeId 중 최소 하나는 필요합니다.',
      path: ['textQuery'],
    },
  );

const describePlace = (place: GooglePlace) => {
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
    },
    googleMapsUri: review.googleMapsUri ?? null,
    visitDate: review.visitDate ?? null,
  }));
};

const tools: Tool[] = [
  {
    name: 'google.places.describe',
    description:
      'Google Places API 텍스트 검색/상세 조회를 조합해 장소의 특징, 연락처, 운영 정보, 후기 등 스토리텔링에 유용한 정보를 제공합니다.',
    inputSchema: {
      type: 'object',
      required: [],
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
      },
      additionalProperties: false,
    },
    handler: async (rawArgs: unknown) => {
      const args = zPlaceDescribeArgs.parse(rawArgs);

      const languageCode = args.languageCode ?? 'ko';
      const regionCode = args.regionCode;
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
        searchResponse?.places?.map((place) => describePlace(place)) ?? [];

      const detailedSummary = detailPlace ? describePlace(detailPlace) : null;

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
