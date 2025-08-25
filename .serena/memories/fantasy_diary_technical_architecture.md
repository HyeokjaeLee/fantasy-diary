# 판타지 다이어리 기술 아키텍처 상세 설계

## 1. 시스템 아키텍처 다이어그램

### 1.1 전체 시스템 구조
```
[User Interface]
    ↓
[Next.js 15 Frontend] ←→ [tRPC API Layer]
    ↓                      ↓
[Supabase] ←→ [AI Content Generation] ←→ [Content Management]
    ↓                      ↓
[PostgreSQL] ←→ [Vector DB] ←→ [Content Scheduler]
```

### 1.2 핵심 컴포넌트
- **Frontend**: Next.js 15 + React 19 + Tailwind CSS
- **API Layer**: tRPC v11 Router
- **Database**: Supabase PostgreSQL + Vector Extension
- **AI Service**: OpenAI API + Custom Fine-tuned Models
- **Scheduler**: Supabase Edge Functions + Cron Jobs
- **CDN**: Vercel Edge Network

## 2. 데이터베이스 스키마 상세 설계

### 2.1 사용자 관리 테이블
```sql
-- 사용자 기본 정보
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  premium_tier TEXT DEFAULT 'basic' CHECK (premium_tier IN ('basic', 'premium', 'lifetime')),
  subscription_expires_at TIMESTAMP,
  preferred_language TEXT DEFAULT 'ko',
  timezone TEXT DEFAULT 'Asia/Seoul',
  notification_time TIME DEFAULT '20:00:00',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 사용자 설정 및 선호도
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  preferred_genres TEXT[] DEFAULT '{}',
  story_tone TEXT DEFAULT 'balanced' CHECK (story_tone IN ('light', 'balanced', 'dark')),
  reading_speed INTEGER DEFAULT 250, -- words per minute
  notifications_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2.2 스토리 관리 테이블
```sql
-- 스토리 시리즈 (사용자별 메인 스토리)
CREATE TABLE story_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  genre TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  current_season INTEGER DEFAULT 1,
  total_episodes INTEGER DEFAULT 0,
  character_settings JSONB DEFAULT '{}',
  world_settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 에피소드
CREATE TABLE episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID REFERENCES story_series(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  season_number INTEGER DEFAULT 1,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  word_count INTEGER DEFAULT 0,
  estimated_reading_time INTEGER DEFAULT 0, -- minutes
  published_at TIMESTAMP,
  is_published BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}', -- AI generation metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(series_id, episode_number)
);

-- 사용자 선택지 및 결과
CREATE TABLE episode_choices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID REFERENCES episodes(id) ON DELETE CASCADE,
  choice_text TEXT NOT NULL,
  choice_order INTEGER NOT NULL,
  consequence_description TEXT,
  impact_level TEXT DEFAULT 'minor' CHECK (impact_level IN ('minor', 'moderate', 'major')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_choices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  episode_id UUID REFERENCES episodes(id) ON DELETE CASCADE,
  choice_id UUID REFERENCES episode_choices(id) ON DELETE CASCADE,
  chosen_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, episode_id)
);
```

### 2.3 사용자 활동 추적 테이블
```sql
-- 읽기 진행률
CREATE TABLE reading_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  episode_id UUID REFERENCES episodes(id) ON DELETE CASCADE,
  progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  time_spent INTEGER DEFAULT 0, -- seconds
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  last_position TEXT, -- for resuming reading
  UNIQUE(user_id, episode_id)
);

-- 사용자 반응 (좋아요, 평점, 감상평)
CREATE TABLE user_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  episode_id UUID REFERENCES episodes(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'love', 'wow', 'sad', 'angry')),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, episode_id, reaction_type)
);

-- 북마크/즐겨찾기
CREATE TABLE bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  episode_id UUID REFERENCES episodes(id) ON DELETE CASCADE,
  bookmark_type TEXT DEFAULT 'favorite' CHECK (bookmark_type IN ('favorite', 'read_later', 'highlight')),
  note TEXT,
  position_in_content INTEGER, -- character position for highlights
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, episode_id, bookmark_type)
);
```

### 2.4 AI 콘텐츠 생성 관련 테이블
```sql
-- 스토리 템플릿
CREATE TABLE story_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  genre TEXT NOT NULL,
  description TEXT,
  narrative_structure JSONB NOT NULL, -- 서사 구조 정의
  character_archetypes JSONB DEFAULT '[]',
  world_building_elements JSONB DEFAULT '{}',
  tone_guidelines TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- AI 생성 요청 로그
CREATE TABLE content_generation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID REFERENCES story_series(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  prompt_template TEXT NOT NULL,
  user_context JSONB DEFAULT '{}',
  ai_model_used TEXT NOT NULL,
  generation_time_ms INTEGER,
  token_usage JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- 사용자 피드백 학습용
CREATE TABLE user_feedback_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('preference', 'quality', 'engagement')),
  pattern_data JSONB NOT NULL,
  confidence_score FLOAT DEFAULT 0.0,
  last_updated TIMESTAMP DEFAULT NOW()
);
```

## 3. tRPC Router 구조 설계

### 3.1 라우터 구조
```typescript
// src/server/routers/_app.ts
export const appRouter = router({
  auth: authRouter,          // 인증 관련
  user: userRouter,          // 사용자 관리
  story: storyRouter,        // 스토리 관리
  episode: episodeRouter,    // 에피소드 관리
  reading: readingRouter,    // 읽기 관련
  community: communityRouter, // 커뮤니티 기능
  admin: adminRouter,        // 관리자 기능
});
```

### 3.2 주요 프로시저 예시
```typescript
// src/server/routers/episode.ts
export const episodeRouter = router({
  // 일일 에피소드 조회
  getTodaysEpisode: publicProcedure
    .input(z.object({
      seriesId: z.string().uuid(),
    }))
    .query(async ({ input, ctx }) => {
      // 로직 구현
    }),

  // 에피소드 생성 요청
  generateEpisode: protectedProcedure
    .input(z.object({
      seriesId: z.string().uuid(),
      episodeNumber: z.number().int().positive(),
      previousChoices: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // AI 생성 로직
    }),

  // 선택지 제출
  submitChoice: protectedProcedure
    .input(z.object({
      episodeId: z.string().uuid(),
      choiceId: z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
      // 선택 저장 및 다음 에피소드 영향
    }),
});
```

## 4. AI 콘텐츠 생성 파이프라인

### 4.1 생성 워크플로우
```typescript
// src/lib/ai/storyGeneration.ts
export class StoryGenerator {
  async generateEpisode(params: {
    userId: string;
    seriesId: string;
    episodeNumber: number;
    context: StoryContext;
  }): Promise<Episode> {
    
    // 1. 사용자 컨텍스트 수집
    const userProfile = await this.getUserProfile(params.userId);
    const seriesHistory = await this.getSeriesHistory(params.seriesId);
    const previousChoices = await this.getUserChoices(params.userId, params.seriesId);
    
    // 2. 프롬프트 구성
    const prompt = await this.buildPrompt({
      userProfile,
      seriesHistory,
      previousChoices,
      episodeNumber: params.episodeNumber,
      template: userProfile.preferredTemplate,
    });
    
    // 3. AI 모델 호출
    const generatedContent = await this.callAIModel({
      prompt,
      model: this.selectOptimalModel(userProfile),
      parameters: this.getGenerationParameters(userProfile),
    });
    
    // 4. 후처리
    const processedContent = await this.postProcessContent({
      rawContent: generatedContent,
      userPreferences: userProfile.preferences,
      qualityChecks: true,
    });
    
    // 5. 선택지 생성
    const choices = await this.generateChoices({
      content: processedContent,
      storyContext: params.context,
      maxChoices: 3,
    });
    
    return {
      content: processedContent,
      choices,
      metadata: {
        generationTime: Date.now(),
        modelUsed: this.currentModel,
        tokenUsage: this.lastTokenUsage,
      },
    };
  }
}
```

### 4.2 개인화 엔진
```typescript
// src/lib/ai/personalization.ts
export class PersonalizationEngine {
  async analyzeUserPreferences(userId: string): Promise<UserPreferenceProfile> {
    const readingHistory = await this.getReadingHistory(userId);
    const reactions = await this.getUserReactions(userId);
    const choices = await this.getUserChoiceHistory(userId);
    
    return {
      preferredGenres: this.extractGenrePreferences(readingHistory),
      narrativeStyle: this.analyzeNarrativePreferences(reactions),
      pacingPreference: this.analyzePacingPreference(readingHistory),
      characterPreferences: this.analyzeCharacterPreferences(choices),
      themePreferences: this.extractThemePreferences(reactions),
    };
  }

  async customizeStoryForUser(
    baseStory: string,
    userProfile: UserPreferenceProfile
  ): Promise<string> {
    // 사용자 취향에 맞게 스토리 조정
    let customizedStory = baseStory;
    
    // 톤 조정
    if (userProfile.narrativeStyle === 'lighthearted') {
      customizedStory = await this.adjustTone(customizedStory, 'lighter');
    }
    
    // 캐릭터 요소 강조
    if (userProfile.characterPreferences.includes('strong_female_lead')) {
      customizedStory = await this.emphasizeCharacterTraits(customizedStory, ['leadership', 'independence']);
    }
    
    return customizedStory;
  }
}
```

## 5. 실시간 기능 및 알림 시스템

### 5.1 Supabase Realtime 활용
```typescript
// src/hooks/useRealtimeUpdates.ts
export function useRealtimeUpdates(userId: string) {
  const [newEpisode, setNewEpisode] = useState<Episode | null>(null);
  
  useEffect(() => {
    const channel = supabase
      .channel('episodes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'episodes',
          filter: `series_id=in.(${userSeriesIds.join(',')})`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setNewEpisode(payload.new as Episode);
            // 푸시 알림 트리거
            triggerNotification({
              title: '새로운 에피소드가 도착했어요!',
              body: payload.new.title,
              data: { episodeId: payload.new.id },
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
  
  return { newEpisode };
}
```

### 5.2 푸시 알림 시스템
```typescript
// src/lib/notifications/pushService.ts
export class PushNotificationService {
  async scheduleEpisodeNotification(
    userId: string,
    episodeId: string,
    scheduledTime: Date
  ) {
    const user = await this.getUserSettings(userId);
    
    if (!user.notificationsEnabled) return;
    
    // Edge Function으로 스케줄된 알림 생성
    const { error } = await supabase.functions.invoke('schedule-notification', {
      body: {
        userId,
        episodeId,
        scheduledTime: scheduledTime.toISOString(),
        notificationType: 'new_episode',
        message: await this.generateNotificationMessage(episodeId, user.preferredLanguage),
      },
    });
    
    if (error) {
      console.error('알림 스케줄링 실패:', error);
    }
  }
}
```

## 6. 성능 최적화 전략

### 6.1 콘텐츠 캐싱 전략
```typescript
// src/lib/cache/contentCache.ts
export class ContentCache {
  private redis = new Redis(process.env.REDIS_URL);
  
  async getEpisode(episodeId: string): Promise<Episode | null> {
    // 1차: 메모리 캐시 확인
    const memoryCache = this.memoryCache.get(`episode:${episodeId}`);
    if (memoryCache) return memoryCache;
    
    // 2차: Redis 캐시 확인
    const redisCache = await this.redis.get(`episode:${episodeId}`);
    if (redisCache) {
      const episode = JSON.parse(redisCache);
      this.memoryCache.set(`episode:${episodeId}`, episode, 300); // 5분
      return episode;
    }
    
    // 3차: 데이터베이스 조회
    const episode = await this.db.episodes.findUnique({
      where: { id: episodeId },
      include: { choices: true },
    });
    
    if (episode) {
      // 캐시에 저장 (24시간)
      await this.redis.setex(`episode:${episodeId}`, 86400, JSON.stringify(episode));
      this.memoryCache.set(`episode:${episodeId}`, episode, 300);
    }
    
    return episode;
  }
}
```

### 6.2 AI 생성 최적화
```typescript
// src/lib/ai/optimizedGeneration.ts
export class OptimizedContentGeneration {
  private generationQueue = new Queue('content-generation');
  
  async queueEpisodeGeneration(
    userId: string,
    seriesId: string,
    scheduledFor: Date
  ) {
    // 배치 생성을 위한 큐에 추가
    await this.generationQueue.add(
      'generate-episode',
      { userId, seriesId },
      {
        delay: scheduledFor.getTime() - Date.now(),
        priority: this.calculatePriority(userId),
      }
    );
  }
  
  private calculatePriority(userId: string): number {
    // 프리미엄 사용자 우선순위 높음
    return isPremiumUser(userId) ? 100 : 50;
  }
}
```

## 7. 보안 및 권한 관리

### 7.1 RLS (Row Level Security) 정책
```sql
-- 사용자는 자신의 데이터만 접근 가능
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_preferences_policy ON user_preferences
  FOR ALL USING (user_id = auth.uid());

-- 에피소드는 해당 시리즈 소유자만 접근
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY episodes_policy ON episodes
  FOR ALL USING (
    series_id IN (
      SELECT id FROM story_series 
      WHERE user_id = auth.uid()
    )
  );
```

### 7.2 API 보안 미들웨어
```typescript
// src/server/middleware/auth.ts
export const protectedProcedure = t.procedure
  .use(async ({ ctx, next }) => {
    const { req } = ctx;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: '인증 토큰이 필요합니다.',
      });
    }
    
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: '유효하지 않은 토큰입니다.',
        });
      }
      
      return next({
        ctx: {
          ...ctx,
          user,
        },
      });
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: '인증 처리 중 오류가 발생했습니다.',
      });
    }
  });
```

이 기술 아키텍처는 확장 가능하고 안정적인 판타지 다이어리 서비스를 구축하기 위한 상세한 설계를 제공해. 각 컴포넌트는 독립적으로 개발하고 테스트할 수 있도록 모듈화되어 있어.