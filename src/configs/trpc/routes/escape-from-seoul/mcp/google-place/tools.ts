import type { Tool } from '@/types/mcp';

import {
  fetchPlaceDetails,
  type GooglePlacesSearchResponse,
  searchPlacesByText,
} from './fetch-google-places';
import { collectReviews, describePlace } from './helpers';
import { zPlaceDescribeArgs } from './schemas';

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
      let detailPlace = null;

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
