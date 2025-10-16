import { z } from 'zod';

/**
 * Entity extraction input schema
 */
export const entityExtractionInputSchema = z.object({
  content: z.string().min(1, 'Content must not be empty'),
});

/**
 * Character schema for extraction
 */
export const extractedCharacterSchema = z.object({
  name: z.string().min(1, 'Character name is required'),
  role: z.string().optional(),
  action: z.string().optional(),
});

/**
 * Place schema for extraction
 */
export const extractedPlaceSchema = z.object({
  name: z.string().min(1, 'Place name is required'),
  description: z.string().optional(),
});

/**
 * Entity extraction output schema
 */
export const entityExtractionOutputSchema = z.object({
  characters: z.array(extractedCharacterSchema),
  places: z.array(extractedPlaceSchema),
});

/**
 * Type definitions
 */
export type EntityExtractionInput = z.infer<typeof entityExtractionInputSchema>;
export type ExtractedCharacter = z.infer<typeof extractedCharacterSchema>;
export type ExtractedPlace = z.infer<typeof extractedPlaceSchema>;
export type EntityExtractionOutput = z.infer<typeof entityExtractionOutputSchema>;
