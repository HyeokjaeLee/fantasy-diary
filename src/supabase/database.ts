import type {
  EscapeFromSeoulCharacters,
  EscapeFromSeoulEpisodes,
  EscapeFromSeoulPlaces,
} from '@/supabase/type';

type TableWithCrud<Row> = {
  Row: Row;
  Insert: Row;
  Update: Partial<Row>;
  Relationships: never;
};

type RpcDefinition<Args, Returns> = {
  Args: Args;
  Returns: Returns;
};

export type Database = {
  public: {
    Tables: {
      escape_from_seoul_episodes: TableWithCrud<EscapeFromSeoulEpisodes>;
      escape_from_seoul_places: TableWithCrud<EscapeFromSeoulPlaces>;
      escape_from_seoul_characters: TableWithCrud<EscapeFromSeoulCharacters>;
    };
    Views: Record<string, never>;
    Functions: {
      acquire_lock: RpcDefinition<
        { name: string; owner: string; ttl_ms: number },
        boolean
      >;
      release_lock: RpcDefinition<{ name: string; owner: string }, void>;
      extend_lock: RpcDefinition<
        { name: string; owner: string; ttl_ms: number },
        boolean
      >;
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
