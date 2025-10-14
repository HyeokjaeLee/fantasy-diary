import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  fetchPlaceDetails,
  type GooglePlace,
  type GooglePlacesSearchResponse,
  searchPlacesByText,
} from '@/app/api/escape-from-seoul/mcp/google/_libs/fetchGooglePlaces';
import { publicProcedure, router } from '@/configs/trpc/settings';
import type { Tool } from '@/types/mcp';

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

const describePlace = (place: GooglePlace) => ({
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
      weekdayDescriptions: place.currentOpeningHours?.weekdayDescriptions ?? [],
    },
    regular: place.regularOpeningHours?.weekdayDescriptions ?? [],
  },
  accessibility: place.accessibilityOptions ?? null,
  utcOffsetMinutes: place.utcOffsetMinutes ?? null,
  timeZone: place.timeZone?.id ?? null,
});

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

export const googleTools: Tool[] = [
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
    usageGuidelines: [
      '실제 장소를 묘사할 때만 사용하세요.',
      '한국어가 아닌 장소 명칭이라도 Google Maps 기준으로 정확한 정보를 반환합니다.',
      '리뷰는 최신순으로 제공되며 최대 5개까지만 포함됩니다.',
    ],
    allowedPhases: ['prewriting', 'drafting'],
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
          ? args.placeId
          : `places/${args.placeId}`;
      })();

      const fieldMask = args.includeReviews
        ? 'id,displayName.text,formattedAddress,location.latitude,location.longitude,primaryTypeDisplayName.text,editorialSummary.text,generativeSummary.overview.text,reviews'
        : undefined;

      if (normalizedPlaceId) {
        detailPlace = await fetchPlaceDetails({
          placeId: normalizedPlaceId,
          languageCode,
          regionCode,
          fieldMask,
        });
      } else {
        const topCandidate = searchResponse?.places?.[0] ?? null;
        if (topCandidate?.id) {
          detailPlace = await fetchPlaceDetails({
            placeId: topCandidate.id,
            languageCode,
            regionCode,
            fieldMask,
          });
        }
      }

      return {
        searchResults: (searchResponse?.places ?? []).map(describePlace),
        topCandidate: detailPlace ? describePlace(detailPlace) : null,
        reviews: detailPlace ? collectReviews(detailPlace) : [],
      };
    },
  },
];

const sanitizeTool = (tool: Tool): Omit<Tool, 'handler'> => {
  const { handler: _handler, ...rest } = tool;
  void _handler;

  return rest;
};

const zCallInput = z.object({
  name: z.string().min(1),
  arguments: z.unknown().optional(),
});

export const escapeFromSeoulGoogleRouter = router({
  list: publicProcedure.query(() =>
    googleTools.map((tool) => sanitizeTool(tool)),
  ),
  execute: publicProcedure.input(zCallInput).mutation(async ({ input }) => {
    const tool = googleTools.find((candidate) => candidate.name === input.name);
    if (!tool) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `google tool ${input.name} not found`,
      });
    }

    const result = await tool.handler(input.arguments ?? {});

    return JSON.stringify(result);
  }),
});
