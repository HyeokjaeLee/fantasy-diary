# 판타지 다이어리 기술 아키텍처

## Overview

Next.js 15 + tRPC v11 + Supabase 기반의 AI 스토리 생성 서비스 기술 설계 문서. 매일 자동 발행되는 개인화 판타지 에피소드 시스템의 상세 기술 구현 가이드.

## Key Points

### 시스템 아키텍처
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   External      │
│   Next.js 15    │◄──►│   tRPC v11      │◄──►│   OpenAI API    │
│   React 19      │    │   Supabase      │    │   Upstash Redis │
│   Tailwind v4   │    │   Prisma        │    │   Vercel Cron   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 핵심 기술 스택
- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS v4, shadcn/ui
- **Backend**: tRPC v11, Supabase (PostgreSQL + Auth + Realtime), Prisma ORM
- **AI**: OpenAI GPT-4 Turbo, Langchain
- **Cache**: Upstash Redis
- **Deployment**: Vercel
- **Monitoring**: Vercel Analytics, Supabase Metrics

## Technical Details

### 프로젝트 구조
```
fantasy-diary/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # 인증 관련 페이지
│   ├── (dashboard)/             # 메인 대시보드
│   ├── api/                     # API Routes & tRPC
│   │   └── trpc/[trpc]/        # tRPC handler
│   ├── episode/[id]/           # 에피소드 상세 페이지
│   └── globals.css             # Global styles
├── components/                  # React 컴포넌트
│   ├── ui/                     # shadcn/ui 컴포넌트
│   ├── episode/                # 에피소드 관련 컴포넌트
│   ├── auth/                   # 인증 컴포넌트
│   └── layout/                 # 레이아웃 컴포넌트
├── lib/                        # 유틸리티 함수
│   ├── ai/                     # AI 관련 함수
│   ├── db/                     # DB 관련 함수
│   ├── auth/                   # 인증 관련 함수
│   └── utils/                  # 공통 유틸리티
├── server/                     # 서버 사이드 로직
│   ├── trpc/                   # tRPC 라우터
│   │   ├── routers/           # 기능별 라우터
│   │   └── context.ts         # tRPC 컨텍스트
│   ├── ai/                    # AI 서비스
│   └── scheduler/             # 스케줄링 작업
├── types/                      # TypeScript 타입 정의
├── middleware.ts               # Next.js 미들웨어
└── tailwind.config.ts         # Tailwind 설정
```

### 데이터베이스 스키마 (Supabase PostgreSQL)
```sql
-- 사용자 테이블
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    display_name TEXT,
    preferences JSONB DEFAULT '{}', -- 장르, 스타일, 선호도
    reading_streak INTEGER DEFAULT 0,
    notification_time TIME DEFAULT '20:00:00',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 스토리 시리즈 테이블
CREATE TABLE stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    genre TEXT NOT NULL DEFAULT 'fantasy',
    world_setting JSONB DEFAULT '{}', -- 세계관 설정
    character_info JSONB DEFAULT '{}', -- 주인공 정보
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
    episode_count INTEGER DEFAULT 0,
    last_episode_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 에피소드 테이블
CREATE TABLE episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
    episode_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    summary TEXT, -- 다음 에피소드를 위한 요약
    choices JSONB DEFAULT '[]', -- 선택지 배열
    user_choice INTEGER, -- 선택된 옵션 인덱스
    ai_prompt JSONB, -- AI 생성에 사용된 프롬프트 (디버깅용)
    published_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE,
    reading_time INTEGER, -- 읽는데 걸린 시간 (초)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(story_id, episode_number)
);

-- 사용자 선택 히스토리 (AI 학습용)
CREATE TABLE user_choices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID REFERENCES episodes(id) ON DELETE CASCADE,
    choice_index INTEGER NOT NULL,
    choice_text TEXT NOT NULL,
    selected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX idx_stories_user_id ON stories(user_id);
CREATE INDEX idx_episodes_story_id ON episodes(story_id);
CREATE INDEX idx_episodes_published_at ON episodes(published_at);
CREATE INDEX idx_user_choices_episode_id ON user_choices(episode_id);
```

### tRPC 라우터 구조
```typescript
// server/trpc/routers/episode.ts
export const episodeRouter = router({
  // 오늘의 에피소드 조회
  getTodayEpisode: protectedProcedure
    .input(z.object({ storyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return await getTodayEpisode(ctx.user.id, input.storyId)
    }),

  // 에피소드 읽음 처리
  markAsRead: protectedProcedure
    .input(z.object({ 
      episodeId: z.string().uuid(),
      readingTime: z.number().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      return await markEpisodeAsRead(input.episodeId, input.readingTime)
    }),

  // 선택지 선택
  makeChoice: protectedProcedure
    .input(z.object({
      episodeId: z.string().uuid(),
      choiceIndex: z.number()
    }))
    .mutation(async ({ ctx, input }) => {
      return await recordUserChoice(input.episodeId, input.choiceIndex)
    }),

  // 에피소드 히스토리
  getHistory: protectedProcedure
    .input(z.object({ 
      storyId: z.string().uuid(),
      limit: z.number().default(20),
      offset: z.number().default(0)
    }))
    .query(async ({ ctx, input }) => {
      return await getEpisodeHistory(input.storyId, input.limit, input.offset)
    })
})
```

### AI 스토리 생성 시스템
```typescript
// lib/ai/storyGenerator.ts
interface StoryGenerationContext {
  user: User
  story: Story
  previousEpisodes: Episode[]
  userPreferences: UserPreferences
  lastChoice?: UserChoice
}

class StoryGenerator {
  private openai: OpenAI
  private redis: Redis

  async generateEpisode(context: StoryGenerationContext): Promise<Episode> {
    // 1. 캐시 확인
    const cacheKey = this.buildCacheKey(context)
    const cached = await this.redis.get(cacheKey)
    if (cached) return JSON.parse(cached)

    // 2. 프롬프트 구성
    const prompt = this.buildPrompt(context)
    
    // 3. OpenAI API 호출
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        { role: 'system', content: this.getSystemPrompt() },
        { role: 'user', content: prompt }
      ],
      functions: [this.getEpisodeSchema()],
      function_call: { name: 'generate_episode' },
      temperature: 0.8,
      max_tokens: 2000
    })

    // 4. 응답 파싱 및 검증
    const episode = this.parseAndValidateResponse(response)
    
    // 5. 캐싱 (24시간)
    await this.redis.setex(cacheKey, 86400, JSON.stringify(episode))
    
    return episode
  }

  private buildPrompt(context: StoryGenerationContext): string {
    return `
사용자 정보:
- 선호 장르: ${context.userPreferences.genres.join(', ')}
- 스토리 스타일: ${context.userPreferences.style}
- 캐릭터: ${JSON.stringify(context.story.character_info)}

현재 스토리 상황:
${this.summarizePreviousEpisodes(context.previousEpisodes)}

이전 선택:
${context.lastChoice ? `사용자가 "${context.lastChoice.choice_text}"을(를) 선택했습니다.` : '첫 번째 에피소드입니다.'}

다음 에피소드를 생성해주세요:
- 길이: 800-1200자
- 선택지: 3-4개
- 장르: 판타지
- 톤: ${context.userPreferences.tone || 'adventurous'}
    `
  }

  private getSystemPrompt(): string {
    return `
당신은 매력적인 판타지 소설을 쓰는 전문 작가입니다.
사용자의 선택에 따라 스토리가 발전하는 인터랙티브 에피소드를 작성합니다.

규칙:
1. 각 에피소드는 완결성이 있으면서도 다음으로 이어지는 구조
2. 선택지는 스토리에 의미 있는 영향을 주어야 함
3. 캐릭터의 성장과 변화를 보여줄 것
4. 적절한 긴장감과 호기심을 유발할 것
5. 건전하고 창의적인 내용만 작성할 것
    `
  }
}
```

### 자동 에피소드 발행 시스템
```typescript
// app/api/cron/generate-episodes/route.ts
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  // Vercel Cron Jobs 인증 확인
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    // 1. 활성 사용자들의 알림 시간 확인
    const usersToGenerate = await getUsersForEpisodeGeneration()
    
    // 2. 병렬 처리로 에피소드 생성
    const results = await Promise.allSettled(
      usersToGenerate.map(user => generateDailyEpisode(user))
    )
    
    // 3. 결과 로깅
    const successful = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    
    console.log(`Episode generation complete: ${successful} success, ${failed} failed`)
    
    return Response.json({ 
      success: successful, 
      failed: failed,
      total: usersToGenerate.length 
    })
  } catch (error) {
    console.error('Episode generation failed:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

async function getUsersForEpisodeGeneration() {
  const now = new Date()
  const currentTime = now.toTimeString().slice(0, 8) // HH:MM:SS
  
  // 현재 시간에 맞는 사용자들 조회 (±15분 범위)
  return await db.user.findMany({
    where: {
      notification_time: {
        gte: new Date(`1970-01-01 ${currentTime}`).getTime() - 15 * 60 * 1000,
        lte: new Date(`1970-01-01 ${currentTime}`).getTime() + 15 * 60 * 1000
      },
      stories: {
        some: {
          status: 'active'
        }
      }
    },
    include: {
      stories: {
        where: { status: 'active' }
      }
    }
  })
}
```

### 캐싱 전략
```typescript
// lib/cache/redis.ts
import { Redis } from '@upstash/redis'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
})

// 캐시 키 패턴
export const CacheKeys = {
  userProfile: (userId: string) => `user:${userId}`,
  todayEpisode: (userId: string, date: string) => `episode:today:${userId}:${date}`,
  storyContext: (storyId: string) => `story:context:${storyId}`,
  aiResponse: (promptHash: string) => `ai:response:${promptHash}`,
} as const

// 캐시 TTL (초)
export const CacheTTL = {
  userProfile: 3600,      // 1시간
  todayEpisode: 86400,    // 24시간
  storyContext: 1800,     // 30분
  aiResponse: 86400,      // 24시간
} as const
```

### 성능 최적화
```typescript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static optimization
  output: 'standalone',
  
  // 이미지 최적화
  images: {
    domains: ['supabase.com'],
    formats: ['image/webp', 'image/avif']
  },
  
  // 실험적 기능
  experimental: {
    serverActions: true,
    serverComponentsExternalPackages: ['@prisma/client']
  },
  
  // 압축
  compress: true,
  
  // 번들 분석
  webpack: (config, { buildId, dev, isServer }) => {
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all'
          }
        }
      }
    }
    return config
  }
}

module.exports = nextConfig
```

## Related Documents

- [[fantasy-diary-product-requirements]] - 제품 요구사항 정의서

## Lessons Learned

### AI 시스템 설계
- **프롬프트 엔지니어링**이 품질의 80%를 결정함
- **캐싱 전략**으로 AI 비용을 70% 절약 가능
- **비동기 생성**으로 사용자 경험 개선 필수

### 데이터베이스 설계
- **JSONB 컬럼**으로 유연한 스키마 설계 가능
- **적절한 인덱싱**으로 쿼리 성능 10배 향상
- **RLS 정책**으로 보안과 성능을 동시에 확보

### Next.js 최적화
- **App Router**의 스트리밍으로 초기 로딩 속도 향상
- **Server Components**로 클라이언트 번들 크기 50% 감소
- **ISR**로 동적 콘텐츠의 CDN 캐싱 효과 극대화

### 모니터링 포인트
- AI 응답 시간 및 품질 지표
- 일일 에피소드 생성 성공률
- 사용자 읽기 완료율
- API 응답 시간 및 에러율