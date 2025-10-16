import type {
  EscapeFromSeoulCharacters,
  EscapeFromSeoulPlaces,
} from '@supabase-api/types.gen';
import type {
  zPatchEscapeFromSeoulCharactersData,
  zPatchEscapeFromSeoulPlacesData,
  zPostEscapeFromSeoulCharactersData,
  zPostEscapeFromSeoulPlacesData,
} from '@supabase-api/zod.gen';
import type z from 'zod';

export interface CharacterDraft extends Partial<EscapeFromSeoulCharacters> {
  externalId?: string;
}

export interface PlaceDraft extends Partial<EscapeFromSeoulPlaces> {
  externalId?: string;
}

// 챕터 작성 중 상태 관리
export interface ChapterContext {
  id?: string;
  previousStory?: string;
  content: string;
  summary: string;
  places: {
    new: Exclude<
      z.infer<typeof zPostEscapeFromSeoulPlacesData>['body'],
      undefined
    >[];
    updated: Exclude<
      z.infer<typeof zPatchEscapeFromSeoulPlacesData>['body'],
      undefined
    >[];
  };
  characters: {
    new: Exclude<
      z.infer<typeof zPostEscapeFromSeoulCharactersData>['body'],
      undefined
    >[];
    updated: Exclude<
      z.infer<typeof zPatchEscapeFromSeoulCharactersData>['body'],
      undefined
    >[];
  };
}

// Phase 실행 결과
export interface PhaseResult {
  success: boolean;
  phase: 'planning' | 'prewriting' | 'drafting' | 'revision';
  output: string;
  context: ChapterContext;
}

// API Request
export interface WriteChapterRequest {
  currentTime: string; // ISO 8601 형식
}

// API Response
export interface WriteChapterResponse {
  success: boolean;
  chapterId: string;
  content: string;
  stats: {
    wordCount: number;
    charactersAdded: number;
    placesAdded: number;
    executionTime: number;
  };
  error?: string;
}
