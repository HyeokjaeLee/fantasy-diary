import type {
  EscapeFromSeoulCharacters,
  EscapeFromSeoulEntries,
  EscapeFromSeoulPlaces,
} from '@supabase-api/types.gen';

// 챕터 작성 중 상태 관리
export interface ChapterContext {
  chapterId: string;
  currentTime: Date;
  previousChapter?: EscapeFromSeoulEntries;
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
    characters: Partial<EscapeFromSeoulCharacters>[];
    places: Partial<EscapeFromSeoulPlaces>[];
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
