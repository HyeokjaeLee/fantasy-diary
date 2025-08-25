# 판타지 다이어리 기술 아키텍처 v2.0

## Overview

SEO 최적화와 광고 수익 극대화를 위한 완전 정적 사이트 생성 기반 아키텍처. 매일 5회 랜덤 발행, 댓글-AI 연동, 비회원 접근 허용을 핵심으로 하는 기술 설계.

## Key Points

### 아키텍처 핵심 변화
- **완전 정적 생성**: 모든 에피소드를 SSG로 생성하여 SEO 최적화
- **비회원 친화**: 인증 없이 모든 콘텐츠 접근 가능
- **랜덤 스케줄링**: Vercel Cron + Redis로 매일 5회 랜덤 발행
- **댓글-AI 연동**: GPT API로 댓글 분석 → 다음 에피소드 반영

### 시스템 아키텍처
```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (정적 생성)                      │
│   Next.js 15 SSG + Tailwind CSS + shadcn/ui                │
│   ↓                                                        │
│   모든 에피소드 빌드타임 정적 생성 (SEO 최적화)               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   Backend API Layer                        │
│   tRPC v11 (댓글, 결제만) + Supabase Realtime              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Data & Services                         │
│   Supabase PostgreSQL + Upstash Redis + OpenAI GPT-4      │
└─────────────────────────────────────────────────────────────┘
```

## Technical Details

### 프로젝트 구조 개편
```
fantasy-diary/
├── app/                         # Next.js App Router (정적 생성)
│   ├── page.tsx                # 메인 페이지 (최신 에피소드 목록)
│   ├── episode/
│   │   └── [id]/
│   │       └── page.tsx        # 개별 에피소드 페이지 (SSG)
│   ├── archive/
│   │   └── page.tsx           # 전체 에피소드 아카이브
│   ├── api/
│   │   ├── trpc/[trpc]/       # tRPC (댓글/결제만)
│   │   ├── cron/
│   │   │   └── generate/      # 에피소드 생성 크론
│   │   └── webhook/           # 결제 웹훅
│   ├── sitemap.xml            # 동적 사이트맵
│   └── robots.txt             # SEO 크롤링 설정
├── components/
│   ├── episode/               # 에피소드 관련 컴포넌트
│   │   ├── EpisodeViewer.tsx  # 메인 뷰어
│   │   ├── CommentSection.tsx # 댓글 섹션 (회원만)
│   │   └── PreviewPayment.tsx # 미리보기 결제
│   ├── ads/                   # 광고 컴포넌트
│   │   ├── AdSenseUnit.tsx    # Google AdSense
│   │   └── AdPlacements.tsx   # 광고 배치
│   └── seo/                   # SEO 컴포넌트
│       ├── StructuredData.tsx # JSON-LD
│       └── MetaTags.tsx       # OG, Twitter 메타
├── lib/
│   ├── ai/                    # AI 관련
│   │   ├── episodeGenerator.ts # GPT 에피소드 생성
│   │   ├── commentAnalyzer.ts  # 댓글 분석
│   │   └── promptTemplates.ts  # 프롬프트 템플릿
│   ├── scheduler/             # 스케줄링
│   │   ├── randomScheduler.ts # 랜덤 발행 시간
│   │   └── episodeCron.ts     # 크론 작업
│   ├── seo/                   # SEO 유틸
│   │   ├── metadata.ts        # 메타데이터 생성
│   │   ├── sitemap.ts         # 사이트맵 생성
│   │   └── structuredData.ts  # 구조화 데이터
│   └── payment/               # 결제
│       └── tossPayments.ts    # 토스페이 연동
└── scripts/
    ├── prebuild-episodes.ts   # 빌드 전 에피소드 생성
    └── migrate-data.ts        # 데이터 마이그레이션
```

### 완전 정적 생성 설정
```typescript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // 완전 정적 사이트 생성
  output: 'export',
  trailingSlash: true,
  
  // 이미지 최적화 (정적 배포용)
  images: {
    unoptimized: true,
    domains: ['fantasy-diary.com']
  },
  
  // 실험적 기능
  experimental: {
    serverActions: false, // 정적 생성이므로 비활성화
  },
  
  // 환경별 설정
  env: {
    NEXT_PUBLIC_SITE_URL: process.env.NODE_ENV === 'production' 
      ? 'https://fantasy-diary.com'
      : 'http://localhost:3000'
  },

  // 빌드 최적화
  compress: true,
  poweredByHeader: false,
  
  webpack: (config) => {
    // Bundle analyzer for optimization
    if (process.env.ANALYZE === 'true') {
      config.plugins.push(
        new (require('webpack-bundle-analyzer')).BundleAnalyzerPlugin()
      )
    }
    return config
  }
}

module.exports = nextConfig
```

### 에피소드 정적 생성 시스템
```typescript
// app/episode/[id]/page.tsx
import { getAllEpisodes, getEpisode } from '@/lib/db/episodes'
import { generateEpisodeMetadata } from '@/lib/seo/metadata'

// 빌드타임에 모든 에피소드 페이지 생성
export async function generateStaticParams() {
  const episodes = await getAllEpisodes()
  
  return episodes.map((episode) => ({
    id: episode.id
  }))
}

// SEO 메타데이터 생성  
export async function generateMetadata({ params }: { params: { id: string } }) {
  const episode = await getEpisode(params.id)
  if (!episode) return {}
  
  return generateEpisodeMetadata(episode)
}

// 에피소드 페이지 컴포넌트
export default async function EpisodePage({ params }: { params: { id: string } }) {
  const episode = await getEpisode(params.id)
  
  if (!episode) {
    return <div>에피소드를 찾을 수 없습니다.</div>
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <EpisodeViewer episode={episode} />
      <AdSenseUnit slot="IN_CONTENT_NATIVE" />
      <CommentSection episodeId={episode.id} />
      <AdSenseUnit slot="FOOTER_BANNER" />
    </div>
  )
}
```

### 랜덤 발행 스케줄러
```typescript
// lib/scheduler/randomScheduler.ts
export class RandomEpisodeScheduler {
  private timeSlots = [
    { start: 6, end: 10, theme: 'morning_adventure' },
    { start: 10, end: 14, theme: 'action_battle' },
    { start: 14, end: 18, theme: 'romance_relationship' },
    { start: 18, end: 21, theme: 'mystery_twist' },
    { start: 21, end: 23, theme: 'emotional_climax' }
  ]

  generateDailySchedule(date: Date = new Date()): EpisodeSchedule[] {
    return this.timeSlots.map((slot, index) => {
      const randomTime = this.getRandomTimeInSlot(slot, date)
      
      return {
        id: `${date.toISOString().split('T')[0]}-${index}`,
        scheduledAt: randomTime,
        theme: slot.theme,
        episodeNumber: this.calculateEpisodeNumber(date, index),
        status: 'scheduled'
      }
    })
  }

  private getRandomTimeInSlot(slot: TimeSlot, date: Date): Date {
    const slotDuration = slot.end - slot.start
    const randomHours = Math.random() * slotDuration
    const randomMinutes = Math.random() * 60
    
    const scheduledTime = new Date(date)
    scheduledTime.setHours(
      slot.start + Math.floor(randomHours),
      Math.floor(randomMinutes),
      0,
      0
    )
    
    return scheduledTime
  }
}

// app/api/cron/generate/route.ts  
export async function POST(request: Request) {
  // Vercel Cron 인증
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const scheduler = new RandomEpisodeScheduler()
    const now = new Date()
    
    // 현재 시간에 맞는 에피소드 생성
    const schedule = await redis.get(`schedule:${now.toISOString().split('T')[0]}`)
    const currentSlot = schedule?.find(slot => 
      Math.abs(slot.scheduledAt - now.getTime()) < 30 * 60 * 1000 // 30분 이내
    )
    
    if (currentSlot) {
      const episode = await generateEpisodeForSlot(currentSlot)
      await saveEpisode(episode)
      
      // 다음날 스케줄 미리 생성
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const tomorrowSchedule = scheduler.generateDailySchedule(tomorrow)
      await redis.set(`schedule:${tomorrow.toISOString().split('T')[0]}`, tomorrowSchedule)
      
      return Response.json({ success: true, episode: episode.id })
    }
    
    return Response.json({ message: 'No episode scheduled for this time' })
  } catch (error) {
    console.error('Episode generation failed:', error)
    return Response.json({ error: 'Generation failed' }, { status: 500 })
  }
}
```

### 댓글-AI 반영 시스템
```typescript
// lib/ai/commentAnalyzer.ts
export class CommentAnalyzer {
  private openai: OpenAI

  async analyzeEpisodeComments(episodeId: string): Promise<CommentAnalysis> {
    const comments = await getEpisodeComments(episodeId)
    
    if (comments.length === 0) {
      return { suggestions: [], sentiment: 'neutral', themes: [] }
    }

    const prompt = this.buildAnalysisPrompt(comments)
    
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: this.getAnalysisSystemPrompt() },
        { role: 'user', content: prompt }
      ],
      functions: [this.getAnalysisSchema()],
      function_call: { name: 'analyze_comments' },
      temperature: 0.3
    })

    return this.parseAnalysisResult(response)
  }

  private buildAnalysisPrompt(comments: Comment[]): string {
    return `
다음 에피소드에 대한 독자 댓글들을 분석해주세요:

댓글 내용:
${comments.map(c => `- ${c.content}`).join('\n')}

분석 요청사항:
1. 독자들이 좋아한/흥미로워한 요소들
2. 아쉬워하거나 개선을 원하는 부분들  
3. 다음 에피소드에서 보고 싶어하는 전개
4. 전반적인 감정 반응 (positive/negative/neutral)
5. 자주 언급되는 키워드/테마들

이 분석을 바탕으로 다음 에피소드 생성에 활용할 구체적인 제안사항들을 제시해주세요.
    `
  }

  private getAnalysisSystemPrompt(): string {
    return `
당신은 독자 댓글을 분석하여 스토리 개선점을 찾는 전문가입니다.

분석 기준:
1. 객관성: 개인적 편견 없이 댓글 내용 그대로 분석
2. 실용성: 실제 스토리 생성에 활용할 수 있는 구체적 제안
3. 균형성: 긍정과 부정 피드백 모두 공정하게 반영
4. 창의성: 댓글에서 새로운 스토리 가능성 발굴

주의사항:
- 부적절한 댓글은 무시하고 건설적인 의견만 반영
- 스토리의 일관성을 해치지 않는 선에서 반영
- 독자 만족도와 스토리 품질의 균형점 찾기
    `
  }
}

// lib/ai/episodeGenerator.ts  
export class EpisodeGenerator {
  async generateWithCommentFeedback(
    theme: string,
    previousEpisodes: Episode[],
    commentAnalysis?: CommentAnalysis
  ): Promise<Episode> {
    
    const basePrompt = this.buildBasePrompt(theme, previousEpisodes)
    const enhancedPrompt = commentAnalysis 
      ? this.enhanceWithComments(basePrompt, commentAnalysis)
      : basePrompt

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        { role: 'system', content: this.getSystemPrompt() },
        { role: 'user', content: enhancedPrompt }
      ],
      functions: [this.getEpisodeSchema()],
      function_call: { name: 'generate_episode' },
      temperature: 0.8,
      max_tokens: 2500
    })

    return this.parseEpisodeResult(response)
  }

  private enhanceWithComments(basePrompt: string, analysis: CommentAnalysis): string {
    return `
${basePrompt}

📝 독자 피드백 반영사항:
- 독자 선호 요소: ${analysis.themes.join(', ')}
- 감정 반응: ${analysis.sentiment}
- 개선 제안: ${analysis.suggestions.join(', ')}

위 피드백을 자연스럽게 반영하되, 스토리의 흐름과 일관성을 유지해주세요.
독자들이 좋아한 요소는 강화하고, 개선 요청은 적절히 반영해주세요.
    `
  }
}
```

### SEO 최적화 시스템
```typescript
// lib/seo/metadata.ts
export function generateEpisodeMetadata(episode: Episode): Metadata {
  const title = `${episode.title} - 판타지 다이어리`
  const description = episode.summary.slice(0, 155)
  const url = `https://fantasy-diary.com/episode/${episode.id}`
  
  return {
    title,
    description,
    keywords: [
      '판타지',
      '소설', 
      '무료소설',
      episode.genre,
      ...episode.keywords
    ],
    openGraph: {
      title,
      description,
      url,
      siteName: '판타지 다이어리',
      type: 'article',
      publishedTime: episode.published_at,
      authors: ['판타지 다이어리 AI'],
      images: [
        {
          url: `${process.env.NEXT_PUBLIC_SITE_URL}/og-image-episode.png`,
          width: 1200,
          height: 630,
          alt: title
        }
      ]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${process.env.NEXT_PUBLIC_SITE_URL}/og-image-episode.png`]
    },
    alternates: {
      canonical: url
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1
      }
    }
  }
}

// lib/seo/structuredData.ts
export function generateArticleStructuredData(episode: Episode) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: episode.title,
    description: episode.summary,
    image: `${process.env.NEXT_PUBLIC_SITE_URL}/og-image-episode.png`,
    datePublished: episode.published_at,
    dateModified: episode.updated_at || episode.published_at,
    author: {
      '@type': 'Organization',
      name: '판타지 다이어리',
      url: 'https://fantasy-diary.com'
    },
    publisher: {
      '@type': 'Organization',
      name: '판타지 다이어리',
      logo: {
        '@type': 'ImageObject',
        url: `${process.env.NEXT_PUBLIC_SITE_URL}/logo.png`
      }
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://fantasy-diary.com/episode/${episode.id}`
    },
    genre: '판타지',
    inLanguage: 'ko-KR',
    wordCount: episode.content.length,
    isAccessibleForFree: true
  }
}

// app/sitemap.ts
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const episodes = await getAllEpisodes()
  
  const episodeUrls = episodes.map(episode => ({
    url: `https://fantasy-diary.com/episode/${episode.id}`,
    lastModified: new Date(episode.published_at),
    changeFrequency: 'never' as const,
    priority: 0.8
  }))

  return [
    {
      url: 'https://fantasy-diary.com',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1
    },
    {
      url: 'https://fantasy-diary.com/archive',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9
    },
    ...episodeUrls
  ]
}
```

### Google AdSense 통합
```typescript
// components/ads/AdSenseUnit.tsx
'use client'

interface AdSenseUnitProps {
  slot: string
  format?: 'auto' | 'rectangle' | 'banner'
  responsive?: boolean
  className?: string
}

export function AdSenseUnit({ 
  slot, 
  format = 'auto', 
  responsive = true,
  className = ''
}: AdSenseUnitProps) {
  useEffect(() => {
    try {
      // AdSense 스크립트 로드 확인
      if (typeof window !== 'undefined' && window.adsbygoogle) {
        (window.adsbygoogle = window.adsbygoogle || []).push({})
      }
    } catch (err) {
      console.error('AdSense load failed:', err)
    }
  }, [])

  return (
    <div className={`ad-container ${className}`}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={responsive}
      />
    </div>
  )
}

// components/ads/AdPlacements.tsx
export const AdSlots = {
  HEADER_BANNER: '1234567890',
  SIDEBAR_SQUARE: '2345678901', 
  IN_CONTENT_NATIVE: '3456789012',
  FOOTER_BANNER: '4567890123'
} as const

export function OptimalAdPlacements({ children }: { children: React.ReactNode }) {
  return (
    <div className="content-with-ads">
      {/* 상단 배너 */}
      <AdSenseUnit 
        slot={AdSlots.HEADER_BANNER}
        format="banner"
        className="mb-6"
      />
      
      <div className="flex gap-6">
        {/* 메인 콘텐츠 */}
        <div className="flex-1">
          {children}
        </div>
        
        {/* 사이드바 광고 */}
        <aside className="w-80 hidden lg:block">
          <div className="sticky top-6">
            <AdSenseUnit 
              slot={AdSlots.SIDEBAR_SQUARE}
              format="rectangle"
            />
          </div>
        </aside>
      </div>
      
      {/* 하단 배너 */}
      <AdSenseUnit 
        slot={AdSlots.FOOTER_BANNER}
        format="banner"  
        className="mt-6"
      />
    </div>
  )
}
```

### 미리보기 결제 시스템
```typescript
// lib/payment/tossPayments.ts
export class PreviewPaymentService {
  private tossPayments: any
  
  constructor() {
    this.tossPayments = TossPayments(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY)
  }

  async requestPreviewPayment(episodeId: string, userIdentifier: string) {
    const orderId = `preview_${episodeId}_${Date.now()}`
    const orderName = `에피소드 미리보기 - ${episodeId.slice(0, 8)}`
    
    try {
      await this.tossPayments.requestPayment('카드', {
        amount: 100,
        orderId,
        orderName,
        customerName: userIdentifier,
        successUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/payment/success`,
        failUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/payment/fail`,
      })
    } catch (error) {
      console.error('Payment request failed:', error)
      throw error
    }
  }

  async verifyPayment(paymentKey: string, orderId: string, amount: number) {
    const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${process.env.TOSS_SECRET_KEY}:`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        paymentKey,
        orderId, 
        amount
      })
    })
    
    if (!response.ok) {
      throw new Error('Payment verification failed')
    }
    
    return await response.json()
  }
}

// app/api/webhook/payment/route.ts
export async function POST(request: Request) {
  try {
    const { paymentKey, orderId, amount } = await request.json()
    
    // 결제 검증
    const paymentService = new PreviewPaymentService()
    const payment = await paymentService.verifyPayment(paymentKey, orderId, amount)
    
    // DB에 결제 기록 저장
    const episodeId = orderId.split('_')[1]
    await savePreviewPurchase({
      episodeId,
      paymentKey,
      orderId,
      amount: payment.totalAmount,
      status: 'completed'
    })
    
    return Response.json({ success: true })
  } catch (error) {
    console.error('Payment webhook failed:', error)
    return Response.json({ error: 'Webhook failed' }, { status: 500 })
  }
}
```

## Performance Optimization

### 빌드 최적화
```typescript
// 빌드 시 에피소드 미리 생성
// scripts/prebuild-episodes.ts
async function prebuildEpisodes() {
  const generator = new EpisodeGenerator()
  const scheduler = new RandomEpisodeScheduler()
  
  // 다음 7일간의 스케줄 미리 생성
  for (let i = 0; i < 7; i++) {
    const date = new Date()
    date.setDate(date.getDate() + i)
    
    const schedule = scheduler.generateDailySchedule(date)
    
    for (const slot of schedule) {
      if (!await episodeExists(slot.episodeNumber)) {
        const episode = await generator.generateForTheme(slot.theme)
        await saveEpisode({ ...episode, ...slot })
      }
    }
  }
}

// package.json
{
  "scripts": {
    "prebuild": "tsx scripts/prebuild-episodes.ts",
    "build": "next build",
    "postbuild": "tsx scripts/optimize-bundle.ts"
  }
}
```

### 캐싱 전략
```typescript
// lib/cache/strategy.ts
export const CacheStrategy = {
  // 정적 콘텐츠 (에피소드)
  episodes: {
    ttl: 'infinite', // 빌드타임 생성으로 변경 불가
    strategy: 'static-generation'
  },
  
  // 동적 콘텐츠 (댓글)
  comments: {
    ttl: 300, // 5분
    strategy: 'redis-cache'
  },
  
  // AI 응답 캐싱
  aiResponses: {
    ttl: 86400, // 24시간
    strategy: 'redis-cache'
  },
  
  // 사용자 세션
  userSessions: {
    ttl: 3600, // 1시간
    strategy: 'redis-cache'
  }
}
```

## Related Documents

- [[fantasy-diary-product-requirements-v2]] - 수정된 제품 요구사항
- [[fantasy-diary-seo-implementation]] - SEO 구현 가이드  
- [[fantasy-diary-ai-prompts]] - AI 프롬프트 모음집

## Lessons Learned

### 아키텍처 설계
- **정적 생성이 SEO의 핵심**: 동적 페이지보다 정적 생성이 검색 랭킹에 월등히 유리
- **비회원 접근성이 트래픽을 만든다**: 로그인 장벽 제거로 유입 10배 증가 예상
- **랜덤성과 일관성의 균형**: 예측불가능한 발행 시간 + 안정적인 품질

### 기술 선택
- **tRPC의 역할 재정의**: 전체 API가 아닌 실시간 기능(댓글/결제)만 담당
- **Redis 활용 극대화**: 스케줄링, 캐싱, 세션 관리의 핵심 인프라
- **AI 비용 최적화**: 프롬프트 캐싱과 결과 재사용으로 50% 절약 가능

### 성능 고려사항  
- **빌드 타임 생성의 한계**: 7일치 미리 생성으로 배포 시간 단축
- **광고 성능 최적화**: 적절한 광고 배치가 수익의 80% 결정
- **모바일 최우선**: 모바일 독자가 전체의 85% 차지 예상