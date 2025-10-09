import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const ENV = createEnv({
  // 서버 전용 환경변수 (예: SERVICE_ROLE 등) 필요 시 여기에 추가
  server: {
    NEXT_SUPABASE_SERVICE_ROLE: z.string().min(1),
    NEXT_OPENAI_API_KEY: z.string().min(1),
    NEXT_WEATHER_API_KEY: z.string().min(1),
  },

  // 클라이언트로 노출 가능한 변수만 여기에 선언 (NEXT_PUBLIC_* 필수)
  client: {
    NEXT_PUBLIC_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  },

  // 실제 런타임 환경변수 바인딩
  runtimeEnv: {
    NEXT_PUBLIC_URL: process.env.NEXT_PUBLIC_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_SUPABASE_SERVICE_ROLE: process.env.NEXT_SUPABASE_SERVICE_ROLE,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_OPENAI_API_KEY: process.env.NEXT_OPENAI_API_KEY,
    NEXT_WEATHER_API_KEY: process.env.NEXT_WEATHER_API_KEY,
  },

  // 빈 문자열을 undefined로 취급 (선택)
  emptyStringAsUndefined: true,
});
