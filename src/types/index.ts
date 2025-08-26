import { Database } from './database'

// Re-export database types
export type { Database } from './database'

// Helper types for easier usage - Characters
export type FantasyDiaryCharacter = Database['public']['Tables']['fantasy_diary_characters']['Row']
export type FantasyDiaryCharacterInsert = Database['public']['Tables']['fantasy_diary_characters']['Insert']
export type FantasyDiaryCharacterUpdate = Database['public']['Tables']['fantasy_diary_characters']['Update']

// Helper types for easier usage - Entries
export type FantasyDiaryEntry = Database['public']['Tables']['fantasy_diary_entries']['Row']
export type FantasyDiaryEntryInsert = Database['public']['Tables']['fantasy_diary_entries']['Insert']
export type FantasyDiaryEntryUpdate = Database['public']['Tables']['fantasy_diary_entries']['Update']

// Character relationships structure
export interface CharacterRelationships {
  [characterName: string]: {
    relationship_type: 'friend' | 'enemy' | 'neutral' | 'romantic' | 'family'
    description: string
    trust_level: number // 1-10
    current_status: 'good' | 'strained' | 'complicated' | 'unknown'
  }
}

// Example usage interfaces for better type safety
export interface CreateCharacterData {
  name: string
  personality?: string
  background?: string
  appearance?: string
  current_location?: string
  relationships?: CharacterRelationships
  character_traits?: string[]
  current_status?: string
}

export interface CreateDiaryEntryData {
  content: string
  summary?: string
  weather_condition?: string
  weather_temperature?: number
  location?: string
  mood?: string
  major_events?: string[]
  appeared_characters?: string[]
  emotional_tone?: string
  story_tags?: string[]
  previous_context?: string
  next_context_hints?: string
}