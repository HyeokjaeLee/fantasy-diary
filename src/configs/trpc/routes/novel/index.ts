import z from 'zod';

import { supabase } from '@/configs/supabase/server';
import { publicProcedure } from '@/configs/trpc/settings';
import { NovelId } from '@/types/novel';

const zNovelCreateInput = z.object({
  id: z.enum(NovelId),
});

export const novel = publicProcedure
  .input(zNovelCreateInput)
  .mutation(async ({ input: { id } }) => {
    await supabase
      .from('episode')
      .select('timeline_at ,content')
      .eq('novel_id', id);
  });
