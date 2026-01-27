export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      /** @table characters: 소설 내 등장인물 마스터 데이터 */
      characters: {
        Row: {
          /** @column characters.birthday: 캐릭터 생일(필수): YYYY-MM-DD */
          birthday: string
          /** @column characters.created_at: 생성 시각(기본값 now()) */
          created_at: string
          /** @column characters.gender: 캐릭터 성별(필수): male|female */
          gender: Database["public"]["Enums"]["gender"]
          /** @column characters.id: 캐릭터 ID (UUID, 기본값 gen_random_uuid()) */
          id: string
          /** @column characters.name: 캐릭터 이름 */
          name: string
          /** @column characters.novel_id: 소속 소설 ID (public.novels.id) */
          novel_id: string
          /** @column characters.personality: 캐릭터 성격(필수) */
          personality: string
        }
        Insert: {
          /** @column characters.birthday: 캐릭터 생일(필수): YYYY-MM-DD */
          birthday: string
          /** @column characters.created_at: 생성 시각(기본값 now()) */
          created_at?: string
          /** @column characters.gender: 캐릭터 성별(필수): male|female */
          gender: Database["public"]["Enums"]["gender"]
          /** @column characters.id: 캐릭터 ID (UUID, 기본값 gen_random_uuid()) */
          id?: string
          /** @column characters.name: 캐릭터 이름 */
          name: string
          /** @column characters.novel_id: 소속 소설 ID (public.novels.id) */
          novel_id: string
          /** @column characters.personality: 캐릭터 성격(필수) */
          personality: string
        }
        Update: {
          /** @column characters.birthday: 캐릭터 생일(필수): YYYY-MM-DD */
          birthday?: string
          /** @column characters.created_at: 생성 시각(기본값 now()) */
          created_at?: string
          /** @column characters.gender: 캐릭터 성별(필수): male|female */
          gender?: Database["public"]["Enums"]["gender"]
          /** @column characters.id: 캐릭터 ID (UUID, 기본값 gen_random_uuid()) */
          id?: string
          /** @column characters.name: 캐릭터 이름 */
          name?: string
          /** @column characters.novel_id: 소속 소설 ID (public.novels.id) */
          novel_id?: string
          /** @column characters.personality: 캐릭터 성격(필수) */
          personality?: string
        }
        Relationships: [
          {
            foreignKeyName: "characters_novel_id_fkey1"
            columns: ["novel_id"]
            isOneToOne: false
            referencedRelation: "novels"
            referencedColumns: ["id"]
          },
        ]
      }
      /** @table episode_chunks: 에피소드 기반 RAG를 위한 청크/요약 및 임베딩 저장(근거 검색용) */
      episode_chunks: {
        Row: {
          /** @column episode_chunks.chunk_index: 같은 episode_id + chunk_kind 내 0부터 시작하는 인덱스 */
          chunk_index: number
          /** @column episode_chunks.chunk_kind: 청크 종류('episode': 에피소드 요약/대표, 'fact': 사실/설정 근거, 'style': 문체 예시) */
          chunk_kind: string
          /** @column episode_chunks.content: 임베딩 대상 텍스트(요약/근거 단락) */
          content: string
          /** @column episode_chunks.created_at: 생성 시각(기본값 now()) */
          created_at: string
          /** @column episode_chunks.embedding: 텍스트 임베딩(pgvector) */
          embedding: string
          /** @column episode_chunks.embedding_dim: 임베딩 차원(vector_dims(embedding)과 일치) */
          embedding_dim: number
          /** @column episode_chunks.embedding_model: 임베딩 모델 식별자(예: gemini/text-embedding-004) */
          embedding_model: string
          /** @column episode_chunks.episode_id: 소속 에피소드 ID (public.episodes.id) */
          episode_id: string
          /** @column episode_chunks.episode_no: 에피소드 번호(episodes.episode_no 복제, 정렬/필터용) */
          episode_no: number
          /** @column episode_chunks.id: 청크 ID (UUID, 기본값 gen_random_uuid()) */
          id: string
          /** @column episode_chunks.novel_id: 소속 소설 ID (public.novels.id) */
          novel_id: string
        }
        Insert: {
          /** @column episode_chunks.chunk_index: 같은 episode_id + chunk_kind 내 0부터 시작하는 인덱스 */
          chunk_index: number
          /** @column episode_chunks.chunk_kind: 청크 종류('episode': 에피소드 요약/대표, 'fact': 사실/설정 근거, 'style': 문체 예시) */
          chunk_kind: string
          /** @column episode_chunks.content: 임베딩 대상 텍스트(요약/근거 단락) */
          content: string
          /** @column episode_chunks.created_at: 생성 시각(기본값 now()) */
          created_at?: string
          /** @column episode_chunks.embedding: 텍스트 임베딩(pgvector) */
          embedding: string
          /** @column episode_chunks.embedding_dim: 임베딩 차원(vector_dims(embedding)과 일치) */
          embedding_dim: number
          /** @column episode_chunks.embedding_model: 임베딩 모델 식별자(예: gemini/text-embedding-004) */
          embedding_model: string
          /** @column episode_chunks.episode_id: 소속 에피소드 ID (public.episodes.id) */
          episode_id: string
          /** @column episode_chunks.episode_no: 에피소드 번호(episodes.episode_no 복제, 정렬/필터용) */
          episode_no: number
          /** @column episode_chunks.id: 청크 ID (UUID, 기본값 gen_random_uuid()) */
          id?: string
          /** @column episode_chunks.novel_id: 소속 소설 ID (public.novels.id) */
          novel_id: string
        }
        Update: {
          /** @column episode_chunks.chunk_index: 같은 episode_id + chunk_kind 내 0부터 시작하는 인덱스 */
          chunk_index?: number
          /** @column episode_chunks.chunk_kind: 청크 종류('episode': 에피소드 요약/대표, 'fact': 사실/설정 근거, 'style': 문체 예시) */
          chunk_kind?: string
          /** @column episode_chunks.content: 임베딩 대상 텍스트(요약/근거 단락) */
          content?: string
          /** @column episode_chunks.created_at: 생성 시각(기본값 now()) */
          created_at?: string
          /** @column episode_chunks.embedding: 텍스트 임베딩(pgvector) */
          embedding?: string
          /** @column episode_chunks.embedding_dim: 임베딩 차원(vector_dims(embedding)과 일치) */
          embedding_dim?: number
          /** @column episode_chunks.embedding_model: 임베딩 모델 식별자(예: gemini/text-embedding-004) */
          embedding_model?: string
          /** @column episode_chunks.episode_id: 소속 에피소드 ID (public.episodes.id) */
          episode_id?: string
          /** @column episode_chunks.episode_no: 에피소드 번호(episodes.episode_no 복제, 정렬/필터용) */
          episode_no?: number
          /** @column episode_chunks.id: 청크 ID (UUID, 기본값 gen_random_uuid()) */
          id?: string
          /** @column episode_chunks.novel_id: 소속 소설 ID (public.novels.id) */
          novel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_chunks_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_chunks_novel_id_fkey"
            columns: ["novel_id"]
            isOneToOne: false
            referencedRelation: "novels"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_reviews: {
        Row: {
          attempt: number
          created_at: string
          episode_id: string | null
          episode_no: number
          id: string
          issues: Json
          model: string | null
          novel_id: string
          passed: boolean
          review_type: Database["public"]["Enums"]["episode_review_type"]
          revision_instruction: string | null
        }
        Insert: {
          attempt?: number
          created_at?: string
          episode_id?: string | null
          episode_no: number
          id?: string
          issues?: Json
          model?: string | null
          novel_id: string
          passed: boolean
          review_type: Database["public"]["Enums"]["episode_review_type"]
          revision_instruction?: string | null
        }
        Update: {
          attempt?: number
          created_at?: string
          episode_id?: string | null
          episode_no?: number
          id?: string
          issues?: Json
          model?: string | null
          novel_id?: string
          passed?: boolean
          review_type?: Database["public"]["Enums"]["episode_review_type"]
          revision_instruction?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "episode_reviews_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_reviews_novel_id_fkey"
            columns: ["novel_id"]
            isOneToOne: false
            referencedRelation: "novels"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_runs: {
        Row: {
          attempt_count: number
          created_at: string
          episode_id: string | null
          episode_no: number
          id: string
          last_review_issues: Json
          last_revision_instruction: string | null
          novel_id: string
          status: Database["public"]["Enums"]["episode_run_status"]
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          episode_id?: string | null
          episode_no: number
          id?: string
          last_review_issues?: Json
          last_revision_instruction?: string | null
          novel_id: string
          status: Database["public"]["Enums"]["episode_run_status"]
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          episode_id?: string | null
          episode_no?: number
          id?: string
          last_review_issues?: Json
          last_revision_instruction?: string | null
          novel_id?: string
          status?: Database["public"]["Enums"]["episode_run_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_runs_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_runs_novel_id_fkey"
            columns: ["novel_id"]
            isOneToOne: false
            referencedRelation: "novels"
            referencedColumns: ["id"]
          },
        ]
      }
      /** @table episodes: 소설의 회차/에피소드(챕터) 본문 */
      episodes: {
        Row: {
          /** @column episodes.content: 에피소드 내용(원문 텍스트) */
          content: string
          /** @column episodes.created_at: 생성 시각(기본값 now()) */
          created_at: string
          /** @column episodes.episode_no: 회차 번호(정수) */
          episode_no: number
          /** @column episodes.id: 에피소드 ID (UUID, 기본값 gen_random_uuid()) */
          id: string
          /** @column episodes.novel_id: 소속 소설 ID (public.novels.id) */
          novel_id: string
          /** @column episodes.story_time: 회차 내 사건 진행 시간(스토리 타임라인, timestamptz) */
          story_time: string
        }
        Insert: {
          /** @column episodes.content: 에피소드 내용(원문 텍스트) */
          content: string
          /** @column episodes.created_at: 생성 시각(기본값 now()) */
          created_at?: string
          /** @column episodes.episode_no: 회차 번호(정수) */
          episode_no: number
          /** @column episodes.id: 에피소드 ID (UUID, 기본값 gen_random_uuid()) */
          id?: string
          /** @column episodes.novel_id: 소속 소설 ID (public.novels.id) */
          novel_id: string
          /** @column episodes.story_time: 회차 내 사건 진행 시간(스토리 타임라인, timestamptz) */
          story_time: string
        }
        Update: {
          /** @column episodes.content: 에피소드 내용(원문 텍스트) */
          content?: string
          /** @column episodes.created_at: 생성 시각(기본값 now()) */
          created_at?: string
          /** @column episodes.episode_no: 회차 번호(정수) */
          episode_no?: number
          /** @column episodes.id: 에피소드 ID (UUID, 기본값 gen_random_uuid()) */
          id?: string
          /** @column episodes.novel_id: 소속 소설 ID (public.novels.id) */
          novel_id?: string
          /** @column episodes.story_time: 회차 내 사건 진행 시간(스토리 타임라인, timestamptz) */
          story_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "episodes_novel_id_fkey1"
            columns: ["novel_id"]
            isOneToOne: false
            referencedRelation: "novels"
            referencedColumns: ["id"]
          },
        ]
      }
      /** @table locations: 소설 내 장소/배경 마스터 데이터 */
      locations: {
        Row: {
          /** @column locations.created_at: 생성 시각(기본값 now()) */
          created_at: string
          /** @column locations.id: 장소 ID (UUID, 기본값 gen_random_uuid()) */
          id: string
          /** @column locations.name: 장소 이름 */
          name: string
          /** @column locations.novel_id: 소속 소설 ID (public.novels.id) */
          novel_id: string
          /** @column locations.situation: 장소의 현재 상황/상태(필수) */
          situation: string
        }
        Insert: {
          /** @column locations.created_at: 생성 시각(기본값 now()) */
          created_at?: string
          /** @column locations.id: 장소 ID (UUID, 기본값 gen_random_uuid()) */
          id?: string
          /** @column locations.name: 장소 이름 */
          name: string
          /** @column locations.novel_id: 소속 소설 ID (public.novels.id) */
          novel_id: string
          /** @column locations.situation: 장소의 현재 상황/상태(필수) */
          situation: string
        }
        Update: {
          /** @column locations.created_at: 생성 시각(기본값 now()) */
          created_at?: string
          /** @column locations.id: 장소 ID (UUID, 기본값 gen_random_uuid()) */
          id?: string
          /** @column locations.name: 장소 이름 */
          name?: string
          /** @column locations.novel_id: 소속 소설 ID (public.novels.id) */
          novel_id?: string
          /** @column locations.situation: 장소의 현재 상황/상태(필수) */
          situation?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_novel_id_fkey"
            columns: ["novel_id"]
            isOneToOne: false
            referencedRelation: "novels"
            referencedColumns: ["id"]
          },
        ]
      }
      /** @table novels: 소설(시리즈) 메타데이터 루트 엔티티 */
      novels: {
        Row: {
          /** @column novels.created_at: 생성 시각(기본값 now()) */
          created_at: string
          /** @column novels.genre: 장르(자유 텍스트) */
          genre: string
          /** @column novels.id: 소설 ID (UUID, 기본값 gen_random_uuid()) */
          id: string
          /** @column novels.status: 소설 상태(기본값 'active') */
          status: string
          /** @column novels.story_bible: 소설 성경/스토리 바이블(Markdown 텍스트) */
          story_bible: string
          /** @column novels.title: 소설 제목 */
          title: string
        }
        Insert: {
          /** @column novels.created_at: 생성 시각(기본값 now()) */
          created_at?: string
          /** @column novels.genre: 장르(자유 텍스트) */
          genre: string
          /** @column novels.id: 소설 ID (UUID, 기본값 gen_random_uuid()) */
          id?: string
          /** @column novels.status: 소설 상태(기본값 'active') */
          status?: string
          /** @column novels.story_bible: 소설 성경/스토리 바이블(Markdown 텍스트) */
          story_bible?: string
          /** @column novels.title: 소설 제목 */
          title: string
        }
        Update: {
          /** @column novels.created_at: 생성 시각(기본값 now()) */
          created_at?: string
          /** @column novels.genre: 장르(자유 텍스트) */
          genre?: string
          /** @column novels.id: 소설 ID (UUID, 기본값 gen_random_uuid()) */
          id?: string
          /** @column novels.status: 소설 상태(기본값 'active') */
          status?: string
          /** @column novels.story_bible: 소설 성경/스토리 바이블(Markdown 텍스트) */
          story_bible?: string
          /** @column novels.title: 소설 제목 */
          title?: string
        }
        Relationships: []
      }
      /** @table plot_seed_characters: 플롯 시드 ↔ 캐릭터 N:M 연결(조인 테이블) */
      plot_seed_characters: {
        Row: {
          /** @column plot_seed_characters.character_id: 캐릭터 ID (public.characters.id) */
          character_id: string
          /** @column plot_seed_characters.created_at: 연결 생성 시각(기본값 now()) */
          created_at: string
          /** @column plot_seed_characters.plot_seed_id: 플롯 시드 ID (public.plot_seeds.id) */
          plot_seed_id: string
        }
        Insert: {
          /** @column plot_seed_characters.character_id: 캐릭터 ID (public.characters.id) */
          character_id: string
          /** @column plot_seed_characters.created_at: 연결 생성 시각(기본값 now()) */
          created_at?: string
          /** @column plot_seed_characters.plot_seed_id: 플롯 시드 ID (public.plot_seeds.id) */
          plot_seed_id: string
        }
        Update: {
          /** @column plot_seed_characters.character_id: 캐릭터 ID (public.characters.id) */
          character_id?: string
          /** @column plot_seed_characters.created_at: 연결 생성 시각(기본값 now()) */
          created_at?: string
          /** @column plot_seed_characters.plot_seed_id: 플롯 시드 ID (public.plot_seeds.id) */
          plot_seed_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plot_seed_characters_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plot_seed_characters_plot_seed_id_fkey"
            columns: ["plot_seed_id"]
            isOneToOne: false
            referencedRelation: "plot_seeds"
            referencedColumns: ["id"]
          },
        ]
      }
      /** @table plot_seed_locations: 플롯 시드 ↔ 장소 N:M 연결(조인 테이블) */
      plot_seed_locations: {
        Row: {
          /** @column plot_seed_locations.created_at: 연결 생성 시각(기본값 now()) */
          created_at: string
          /** @column plot_seed_locations.location_id: 장소 ID (public.locations.id) */
          location_id: string
          /** @column plot_seed_locations.plot_seed_id: 플롯 시드 ID (public.plot_seeds.id) */
          plot_seed_id: string
        }
        Insert: {
          /** @column plot_seed_locations.created_at: 연결 생성 시각(기본값 now()) */
          created_at?: string
          /** @column plot_seed_locations.location_id: 장소 ID (public.locations.id) */
          location_id: string
          /** @column plot_seed_locations.plot_seed_id: 플롯 시드 ID (public.plot_seeds.id) */
          plot_seed_id: string
        }
        Update: {
          /** @column plot_seed_locations.created_at: 연결 생성 시각(기본값 now()) */
          created_at?: string
          /** @column plot_seed_locations.location_id: 장소 ID (public.locations.id) */
          location_id?: string
          /** @column plot_seed_locations.plot_seed_id: 플롯 시드 ID (public.plot_seeds.id) */
          plot_seed_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plot_seed_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plot_seed_locations_plot_seed_id_fkey"
            columns: ["plot_seed_id"]
            isOneToOne: false
            referencedRelation: "plot_seeds"
            referencedColumns: ["id"]
          },
        ]
      }
      /** @table plot_seeds: 떡밥/플롯 시드(미해결 과제, 사건의 씨앗) 관리 */
      plot_seeds: {
        Row: {
          /** @column plot_seeds.created_at: 생성 시각(기본값 now()) */
          created_at: string
          /** @column plot_seeds.detail: 떡밥 상세 설명 */
          detail: string
          /** @column plot_seeds.id: 플롯 시드 ID (UUID, 기본값 gen_random_uuid()) */
          id: string
          /** @column plot_seeds.introduced_in_episode_id: 등장 에피소드 ID (public.episodes.id, Nullable) */
          introduced_in_episode_id: string | null
          /** @column plot_seeds.novel_id: 소속 소설 ID (public.novels.id) */
          novel_id: string
          /** @column plot_seeds.resolved_in_episode_id: 해결 에피소드 ID (public.episodes.id, Nullable) */
          resolved_in_episode_id: string | null
          /** @column plot_seeds.status: 떡밥 상태(기본값 'open') */
          status: string
          /** @column plot_seeds.title: 떡밥 제목/요약 */
          title: string
        }
        Insert: {
          /** @column plot_seeds.created_at: 생성 시각(기본값 now()) */
          created_at?: string
          /** @column plot_seeds.detail: 떡밥 상세 설명 */
          detail: string
          /** @column plot_seeds.id: 플롯 시드 ID (UUID, 기본값 gen_random_uuid()) */
          id?: string
          /** @column plot_seeds.introduced_in_episode_id: 등장 에피소드 ID (public.episodes.id, Nullable) */
          introduced_in_episode_id?: string | null
          /** @column plot_seeds.novel_id: 소속 소설 ID (public.novels.id) */
          novel_id: string
          /** @column plot_seeds.resolved_in_episode_id: 해결 에피소드 ID (public.episodes.id, Nullable) */
          resolved_in_episode_id?: string | null
          /** @column plot_seeds.status: 떡밥 상태(기본값 'open') */
          status?: string
          /** @column plot_seeds.title: 떡밥 제목/요약 */
          title: string
        }
        Update: {
          /** @column plot_seeds.created_at: 생성 시각(기본값 now()) */
          created_at?: string
          /** @column plot_seeds.detail: 떡밥 상세 설명 */
          detail?: string
          /** @column plot_seeds.id: 플롯 시드 ID (UUID, 기본값 gen_random_uuid()) */
          id?: string
          /** @column plot_seeds.introduced_in_episode_id: 등장 에피소드 ID (public.episodes.id, Nullable) */
          introduced_in_episode_id?: string | null
          /** @column plot_seeds.novel_id: 소속 소설 ID (public.novels.id) */
          novel_id?: string
          /** @column plot_seeds.resolved_in_episode_id: 해결 에피소드 ID (public.episodes.id, Nullable) */
          resolved_in_episode_id?: string | null
          /** @column plot_seeds.status: 떡밥 상태(기본값 'open') */
          status?: string
          /** @column plot_seeds.title: 떡밥 제목/요약 */
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "plot_seeds_introduced_in_episode_id_fkey"
            columns: ["introduced_in_episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plot_seeds_novel_id_fkey"
            columns: ["novel_id"]
            isOneToOne: false
            referencedRelation: "novels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plot_seeds_resolved_in_episode_id_fkey"
            columns: ["resolved_in_episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_episode_chunks: {
        Args: {
          p_chunk_kind: string
          p_embedding_model?: string
          p_match_count?: number
          p_max_episode_no?: number
          p_min_episode_no?: number
          p_novel_id: string
          p_query_embedding: string
        }
        Returns: {
          chunk_index: number
          chunk_kind: string
          content: string
          episode_id: string
          episode_no: number
          id: string
          similarity: number
        }[]
      }
      match_episode_summaries: {
        Args: {
          p_embedding_model?: string
          p_match_count?: number
          p_max_episode_no?: number
          p_min_episode_no?: number
          p_novel_id: string
          p_query_embedding: string
        }
        Returns: {
          chunk_index: number
          chunk_kind: string
          content: string
          episode_id: string
          episode_no: number
          id: string
          similarity: number
        }[]
      }
    }
    Enums: {
      episode_review_type: "continuity" | "consistency"
      episode_run_status:
        | "drafting"
        | "reviewing"
        | "review_failed"
        | "persisted"
      gender: "male" | "female"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      episode_review_type: ["continuity", "consistency"],
      episode_run_status: [
        "drafting",
        "reviewing",
        "review_failed",
        "persisted",
      ],
      gender: ["male", "female"],
    },
  },
} as const
