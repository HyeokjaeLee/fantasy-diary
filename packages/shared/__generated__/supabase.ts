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
  dev: {
    Tables: {
      characters: {
        Row: {
          /** @column characters.created_at: 생성 시간 */
          created_at: string
          /** @column characters.description: 캐릭터 상세 설명 (선택 사항) */
          description: string | null
          /** @column characters.id: 캐릭터 고유 ID (NanoID) */
          id: string
          /** @column characters.name: 캐릭터 이름 */
          name: string
          /** @column characters.novel_id: 소설 ID */
          novel_id: string
          /** @column characters.personality: 캐릭터 성격 설명 (선택 사항) */
          personality: string | null
          /** @column characters.traits: 캐릭터 특징 (선택 사항) */
          traits: string | null
          /** @column characters.updated_at: 마지막 수정 시간 */
          updated_at: string
        }
        Insert: {
          /** @column characters.created_at: 생성 시간 */
          created_at?: string
          /** @column characters.description: 캐릭터 상세 설명 (선택 사항) */
          description?: string | null
          /** @column characters.id: 캐릭터 고유 ID (NanoID) */
          id?: string
          /** @column characters.name: 캐릭터 이름 */
          name: string
          /** @column characters.novel_id: 소설 ID */
          novel_id: string
          /** @column characters.personality: 캐릭터 성격 설명 (선택 사항) */
          personality?: string | null
          /** @column characters.traits: 캐릭터 특징 (선택 사항) */
          traits?: string | null
          /** @column characters.updated_at: 마지막 수정 시간 */
          updated_at?: string
        }
        Update: {
          /** @column characters.created_at: 생성 시간 */
          created_at?: string
          /** @column characters.description: 캐릭터 상세 설명 (선택 사항) */
          description?: string | null
          /** @column characters.id: 캐릭터 고유 ID (NanoID) */
          id?: string
          /** @column characters.name: 캐릭터 이름 */
          name?: string
          /** @column characters.novel_id: 소설 ID */
          novel_id?: string
          /** @column characters.personality: 캐릭터 성격 설명 (선택 사항) */
          personality?: string | null
          /** @column characters.traits: 캐릭터 특징 (선택 사항) */
          traits?: string | null
          /** @column characters.updated_at: 마지막 수정 시간 */
          updated_at?: string
        }
        Relationships: []
      }
      episode_characters: {
        Row: {
          /** @column episode_characters.character_id: 캐릭터 ID */
          character_id: string
          /** @column episode_characters.created_at: 생성 시간 */
          created_at: string
          /** @column episode_characters.episode_id: 에피소드 ID */
          episode_id: string
          /** @column episode_characters.id: 조인 레코드 고유 ID (NanoID) */
          id: string
          /** @column episode_characters.updated_at: 마지막 수정 시간 */
          updated_at: string | null
        }
        Insert: {
          /** @column episode_characters.character_id: 캐릭터 ID */
          character_id: string
          /** @column episode_characters.created_at: 생성 시간 */
          created_at?: string
          /** @column episode_characters.episode_id: 에피소드 ID */
          episode_id: string
          /** @column episode_characters.id: 조인 레코드 고유 ID (NanoID) */
          id?: string
          /** @column episode_characters.updated_at: 마지막 수정 시간 */
          updated_at?: string | null
        }
        Update: {
          /** @column episode_characters.character_id: 캐릭터 ID */
          character_id?: string
          /** @column episode_characters.created_at: 생성 시간 */
          created_at?: string
          /** @column episode_characters.episode_id: 에피소드 ID */
          episode_id?: string
          /** @column episode_characters.id: 조인 레코드 고유 ID (NanoID) */
          id?: string
          /** @column episode_characters.updated_at: 마지막 수정 시간 */
          updated_at?: string | null
        }
        Relationships: []
      }
      episode_locations: {
        Row: {
          /** @column episode_locations.created_at: 생성 시간 */
          created_at: string
          /** @column episode_locations.episode_id: 에피소드 ID */
          episode_id: string
          /** @column episode_locations.id: 조인 레코드 고유 ID (NanoID) */
          id: string
          /** @column episode_locations.location_id: 장소 ID */
          location_id: string
          /** @column episode_locations.updated_at: 마지막 수정 시간 */
          updated_at: string | null
        }
        Insert: {
          /** @column episode_locations.created_at: 생성 시간 */
          created_at?: string
          /** @column episode_locations.episode_id: 에피소드 ID */
          episode_id: string
          /** @column episode_locations.id: 조인 레코드 고유 ID (NanoID) */
          id?: string
          /** @column episode_locations.location_id: 장소 ID */
          location_id: string
          /** @column episode_locations.updated_at: 마지막 수정 시간 */
          updated_at?: string | null
        }
        Update: {
          /** @column episode_locations.created_at: 생성 시간 */
          created_at?: string
          /** @column episode_locations.episode_id: 에피소드 ID */
          episode_id?: string
          /** @column episode_locations.id: 조인 레코드 고유 ID (NanoID) */
          id?: string
          /** @column episode_locations.location_id: 장소 ID */
          location_id?: string
          /** @column episode_locations.updated_at: 마지막 수정 시간 */
          updated_at?: string | null
        }
        Relationships: []
      }
      episodes: {
        Row: {
          /** @column episodes.body: 에피소드 본문 */
          body: string
          /** @column episodes.created_at: 생성 시간 */
          created_at: string
          /** @column episodes.embedding: 에피소드 본문의 임베딩 벡터 (JSON 배열 형식, 선택 사항) */
          embedding: Json | null
          /** @column episodes.embedding_model: 임베딩 생성에 사용된 모델 식별자 */
          embedding_model: string | null
          /** @column episodes.episode_number: 에피소드 번호 (1부터 시작) */
          episode_number: number
          /** @column episodes.id: 에피소드 고유 ID (NanoID) */
          id: string
          /** @column episodes.novel_id: 소설 ID */
          novel_id: string
          /** @column episodes.updated_at: 마지막 수정 시간 */
          updated_at: string
        }
        Insert: {
          /** @column episodes.body: 에피소드 본문 */
          body: string
          /** @column episodes.created_at: 생성 시간 */
          created_at?: string
          /** @column episodes.embedding: 에피소드 본문의 임베딩 벡터 (JSON 배열 형식, 선택 사항) */
          embedding?: Json | null
          /** @column episodes.embedding_model: 임베딩 생성에 사용된 모델 식별자 */
          embedding_model?: string | null
          /** @column episodes.episode_number: 에피소드 번호 (1부터 시작) */
          episode_number: number
          /** @column episodes.id: 에피소드 고유 ID (NanoID) */
          id?: string
          /** @column episodes.novel_id: 소설 ID */
          novel_id: string
          /** @column episodes.updated_at: 마지막 수정 시간 */
          updated_at?: string
        }
        Update: {
          /** @column episodes.body: 에피소드 본문 */
          body?: string
          /** @column episodes.created_at: 생성 시간 */
          created_at?: string
          /** @column episodes.embedding: 에피소드 본문의 임베딩 벡터 (JSON 배열 형식, 선택 사항) */
          embedding?: Json | null
          /** @column episodes.embedding_model: 임베딩 생성에 사용된 모델 식별자 */
          embedding_model?: string | null
          /** @column episodes.episode_number: 에피소드 번호 (1부터 시작) */
          episode_number?: number
          /** @column episodes.id: 에피소드 고유 ID (NanoID) */
          id?: string
          /** @column episodes.novel_id: 소설 ID */
          novel_id?: string
          /** @column episodes.updated_at: 마지막 수정 시간 */
          updated_at?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          /** @column locations.created_at: 생성 시간 */
          created_at: string
          /** @column locations.description: 장소 설명 (선택 사항) */
          description: string | null
          /** @column locations.id: 장소 고유 ID (NanoID) */
          id: string
          /** @column locations.name: 장소 이름 */
          name: string
          /** @column locations.novel_id: 소설 ID */
          novel_id: string
          /** @column locations.updated_at: 마지막 수정 시간 */
          updated_at: string
        }
        Insert: {
          /** @column locations.created_at: 생성 시간 */
          created_at?: string
          /** @column locations.description: 장소 설명 (선택 사항) */
          description?: string | null
          /** @column locations.id: 장소 고유 ID (NanoID) */
          id?: string
          /** @column locations.name: 장소 이름 */
          name: string
          /** @column locations.novel_id: 소설 ID */
          novel_id: string
          /** @column locations.updated_at: 마지막 수정 시간 */
          updated_at?: string
        }
        Update: {
          /** @column locations.created_at: 생성 시간 */
          created_at?: string
          /** @column locations.description: 장소 설명 (선택 사항) */
          description?: string | null
          /** @column locations.id: 장소 고유 ID (NanoID) */
          id?: string
          /** @column locations.name: 장소 이름 */
          name?: string
          /** @column locations.novel_id: 소설 ID */
          novel_id?: string
          /** @column locations.updated_at: 마지막 수정 시간 */
          updated_at?: string
        }
        Relationships: []
      }
      novels: {
        Row: {
          /** @column novels.append_prompt: Writer Agent 실행 시 추가로 전달할 프롬프트 (Markdown) */
          append_prompt: string | null
          /** @column novels.created_at: 소설 생성 시각 */
          created_at: string
          /** @column novels.genre: 장르(자유 텍스트) */
          genre: string
          /** @column novels.id: 소설 고유 ID (nanoid) */
          id: string
          /** @column novels.initial_plot_seeds: 초기 플롯 시드  (Markdown) */
          initial_plot_seeds: string | null
          /** @column novels.plot_seeds_resolved: 초기 플롯 시드가 모두 회수되었는지 여부 */
          plot_seeds_resolved: boolean | null
          /** @column novels.status: 소설 상태(기본값 'active') */
          status: string
          /** @column novels.story_bible: 소설 세계관, 설정, 톤앤매너 등 작품 전반의 바이블  (Markdown) */
          story_bible: string
          /** @column novels.title: 소설 제목 */
          title: string
          /** @column novels.updated_at: 소설 정보 마지막 수정 시각 */
          updated_at: string | null
        }
        Insert: {
          /** @column novels.append_prompt: Writer Agent 실행 시 추가로 전달할 프롬프트 (Markdown) */
          append_prompt?: string | null
          /** @column novels.created_at: 소설 생성 시각 */
          created_at?: string
          /** @column novels.genre: 장르(자유 텍스트) */
          genre: string
          /** @column novels.id: 소설 고유 ID (nanoid) */
          id?: string
          /** @column novels.initial_plot_seeds: 초기 플롯 시드  (Markdown) */
          initial_plot_seeds?: string | null
          /** @column novels.plot_seeds_resolved: 초기 플롯 시드가 모두 회수되었는지 여부 */
          plot_seeds_resolved?: boolean | null
          /** @column novels.status: 소설 상태(기본값 'active') */
          status?: string
          /** @column novels.story_bible: 소설 세계관, 설정, 톤앤매너 등 작품 전반의 바이블  (Markdown) */
          story_bible?: string
          /** @column novels.title: 소설 제목 */
          title: string
          /** @column novels.updated_at: 소설 정보 마지막 수정 시각 */
          updated_at?: string | null
        }
        Update: {
          /** @column novels.append_prompt: Writer Agent 실행 시 추가로 전달할 프롬프트 (Markdown) */
          append_prompt?: string | null
          /** @column novels.created_at: 소설 생성 시각 */
          created_at?: string
          /** @column novels.genre: 장르(자유 텍스트) */
          genre?: string
          /** @column novels.id: 소설 고유 ID (nanoid) */
          id?: string
          /** @column novels.initial_plot_seeds: 초기 플롯 시드  (Markdown) */
          initial_plot_seeds?: string | null
          /** @column novels.plot_seeds_resolved: 초기 플롯 시드가 모두 회수되었는지 여부 */
          plot_seeds_resolved?: boolean | null
          /** @column novels.status: 소설 상태(기본값 'active') */
          status?: string
          /** @column novels.story_bible: 소설 세계관, 설정, 톤앤매너 등 작품 전반의 바이블  (Markdown) */
          story_bible?: string
          /** @column novels.title: 소설 제목 */
          title?: string
          /** @column novels.updated_at: 소설 정보 마지막 수정 시각 */
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  dev: {
    Enums: {},
  },
} as const
