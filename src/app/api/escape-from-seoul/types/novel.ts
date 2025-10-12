import type {
  EscapeFromSeoulCharacters,
  EscapeFromSeoulEpisodes,
  EscapeFromSeoulPlaces,
} from '@supabase-api/types.gen';

export interface CharacterDraft extends Partial<EscapeFromSeoulCharacters> {
  externalId?: string;
}

export interface PlaceDraft extends Partial<EscapeFromSeoulPlaces> {
  externalId?: string;
}

// 챕터 작성 중 상태 관리
export interface ChapterContext {
  chapterId: string;
  currentTime: Date;
  previousChapter?: EscapeFromSeoulEpisodes;
  weather?: {
    location:
      | { latitude: number; longitude: number }
      | { nx: number; ny: number };
    data: unknown;
    unitsSystem?: string;
    timeZone?: string;
  };
  references: {
    characters: EscapeFromSeoulCharacters[];
    places: EscapeFromSeoulPlaces[];
  };
  draft: {
    prewriting?: string;
    content?: string;
    characters: CharacterDraft[];
    places: PlaceDraft[];
  };
}

// Phase 실행 결과
export interface PhaseResult {
  success: boolean;
  phase: 'prewriting' | 'drafting' | 'revision';
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
