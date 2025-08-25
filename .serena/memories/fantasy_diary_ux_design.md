# 판타지 다이어리 UX/UI 설계 및 화면 구성

## 1. 화면 구조 및 네비게이션

### 1.1 앱 구조 (App Router 기반)
```
/
├── [locale]/
│   ├── page.tsx                 # 랜딩/홈 페이지
│   ├── onboarding/
│   │   ├── page.tsx            # 온보딩 메인
│   │   ├── preferences/        # 선호도 설정
│   │   └── character/          # 캐릭터 생성
│   ├── dashboard/
│   │   ├── page.tsx            # 대시보드 메인
│   │   ├── today/              # 오늘의 에피소드
│   │   ├── library/            # 라이브러리
│   │   └── settings/           # 설정
│   ├── read/
│   │   └── [episodeId]/        # 읽기 화면
│   ├── community/
│   │   ├── page.tsx            # 커뮤니티 메인
│   │   ├── reviews/            # 리뷰 모음
│   │   └── discussions/        # 토론 게시판
│   ├── premium/
│   │   └── page.tsx            # 프리미엄 구독
│   └── profile/
│       ├── page.tsx            # 프로필
│       ├── character/          # 캐릭터 관리
│       └── preferences/        # 설정 관리
```

### 1.2 주요 네비게이션 패턴
- **Bottom Tab Navigation**: 모바일 우선 설계
- **Drawer Menu**: 태블릿/데스크톱용 사이드바
- **Contextual Actions**: 화면별 특화 액션 버튼
- **Progressive Disclosure**: 단계적 정보 공개

## 2. 핵심 화면별 상세 설계

### 2.1 홈/대시보드 화면

#### 화면 구성 요소
```typescript
interface DashboardScreenProps {
  todaysEpisode: Episode | null;
  readingStreak: number;
  nextEpisodeTime: Date;
  recentEpisodes: Episode[];
  currentSeries: StorySeries;
  notifications: Notification[];
}
```

#### UI 컴포넌트 구조
```tsx
// src/app/[locale]/dashboard/page.tsx
export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 to-indigo-900">
      {/* Header with user info and streak */}
      <Header />
      
      {/* Today's Episode Card - Hero Section */}
      <TodaysEpisodeCard />
      
      {/* Quick Stats */}
      <QuickStatsRow />
      
      {/* Recent Episodes List */}
      <RecentEpisodesSection />
      
      {/* Community Highlights */}
      <CommunityHighlights />
      
      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}
```

#### 주요 컴포넌트 상세

**TodaysEpisodeCard**
```tsx
const TodaysEpisodeCard = ({ episode }: { episode: Episode | null }) => {
  if (!episode) {
    return (
      <Card className="m-4 p-6 bg-gradient-to-r from-purple-800 to-blue-800">
        <div className="text-center text-white">
          <Clock className="w-12 h-12 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">다음 에피소드까지</h2>
          <CountdownTimer targetTime={nextEpisodeTime} />
        </div>
      </Card>
    );
  }

  return (
    <Card className="m-4 p-6 bg-gradient-to-r from-amber-600 to-orange-600">
      <div className="text-white">
        <div className="flex items-center justify-between mb-4">
          <Badge variant="secondary">새 에피소드</Badge>
          <StarRating rating={episode.averageRating} />
        </div>
        <h2 className="text-2xl font-bold mb-2">{episode.title}</h2>
        <p className="text-amber-100 mb-4 line-clamp-2">{episode.summary}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            <span className="text-sm">{episode.estimatedReadingTime}분</span>
          </div>
          <Button 
            className="bg-white text-orange-600 hover:bg-gray-100"
            onClick={() => router.push(`/read/${episode.id}`)}
          >
            읽기 시작
          </Button>
        </div>
      </div>
    </Card>
  );
};
```

### 2.2 읽기 화면

#### 화면 구성
```tsx
// src/app/[locale]/read/[episodeId]/page.tsx
export default function ReadingScreen({ params }: { params: { episodeId: string } }) {
  const [readingSettings, setReadingSettings] = useState<ReadingSettings>(defaultSettings);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [showChoices, setShowChoices] = useState(false);

  return (
    <div className={`min-h-screen ${readingSettings.theme === 'dark' ? 'bg-gray-900' : 'bg-white'}`}>
      {/* Reading Header */}
      <ReadingHeader 
        episode={episode}
        progress={readingProgress}
        onSettingsClick={() => setShowSettings(true)}
      />
      
      {/* Main Content Area */}
      <article 
        className="max-w-2xl mx-auto px-4 py-8"
        style={{ 
          fontSize: `${readingSettings.fontSize}px`,
          lineHeight: readingSettings.lineHeight,
          fontFamily: readingSettings.fontFamily,
        }}
      >
        <ContentRenderer 
          content={episode.content}
          onPositionChange={setCurrentPosition}
          onChoicesReached={() => setShowChoices(true)}
        />
      </article>
      
      {/* Choice Modal */}
      {showChoices && (
        <ChoiceModal 
          choices={episode.choices}
          onChoiceSelected={handleChoiceSelection}
        />
      )}
      
      {/* Reading Settings Panel */}
      {showSettings && (
        <ReadingSettingsPanel 
          settings={readingSettings}
          onChange={setReadingSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
      
      {/* Progress Bar */}
      <ReadingProgressBar progress={readingProgress} />
    </div>
  );
}
```

#### 읽기 경험 최적화 컴포넌트

**ContentRenderer**
```tsx
const ContentRenderer = ({ content, onPositionChange, onChoicesReached }: ContentRendererProps) => {
  const contentRef = useRef<HTMLDivElement>(null);
  
  // 스크롤 위치 추적
  useScrollPosition(({ currPos }) => {
    const progress = Math.abs(currPos.y) / (contentRef.current?.scrollHeight || 1);
    onPositionChange(progress);
    
    // 선택지 섹션 도달 감지
    if (progress > 0.9) {
      onChoicesReached();
    }
  });

  return (
    <div 
      ref={contentRef}
      className="prose prose-lg max-w-none"
      dangerouslySetInnerHTML={{ 
        __html: formatContentForReading(content) 
      }}
    />
  );
};
```

**ChoiceModal**
```tsx
const ChoiceModal = ({ choices, onChoiceSelected }: ChoiceModalProps) => {
  return (
    <Modal className="fixed inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl">
      <div className="p-6">
        <h3 className="text-xl font-bold mb-4 text-center">어떤 선택을 하시겠어요?</h3>
        <div className="space-y-3">
          {choices.map((choice, index) => (
            <button
              key={choice.id}
              className="w-full p-4 text-left bg-gradient-to-r from-purple-50 to-blue-50 
                         rounded-xl border-2 border-transparent hover:border-purple-300 
                         transition-all duration-200"
              onClick={() => onChoiceSelected(choice)}
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-purple-600 text-white rounded-full 
                               flex items-center justify-center font-bold text-sm">
                  {index + 1}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{choice.text}</p>
                  <p className="text-sm text-gray-600 mt-1">{choice.consequencePreview}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
};
```

### 2.3 온보딩 화면

#### 단계별 온보딩 플로우
```tsx
// src/app/[locale]/onboarding/page.tsx
export default function OnboardingFlow() {
  const [currentStep, setCurrentStep] = useState(0);
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({});

  const steps = [
    WelcomeStep,
    GenrePreferenceStep,
    CharacterCreationStep,
    NotificationSetupStep,
    OnboardingCompleteStep,
  ];

  const CurrentStepComponent = steps[currentStep];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      {/* Progress Indicator */}
      <div className="pt-8 px-4">
        <ProgressIndicator current={currentStep} total={steps.length} />
      </div>
      
      {/* Step Content */}
      <div className="flex-1 px-4 py-8">
        <CurrentStepComponent
          data={onboardingData}
          onUpdate={setOnboardingData}
          onNext={() => setCurrentStep(prev => Math.min(prev + 1, steps.length - 1))}
          onPrevious={() => setCurrentStep(prev => Math.max(prev - 1, 0))}
        />
      </div>
    </div>
  );
}
```

**GenrePreferenceStep**
```tsx
const GenrePreferenceStep = ({ data, onUpdate, onNext }: StepProps) => {
  const [selectedGenres, setSelectedGenres] = useState<string[]>(data.genres || []);

  const genres = [
    { id: 'high-fantasy', name: '하이 판타지', icon: '🏰', description: '마법과 용이 있는 중세 판타지' },
    { id: 'urban-fantasy', name: '어반 판타지', icon: '🌃', description: '현대 도시를 배경으로 한 판타지' },
    { id: 'dark-fantasy', name: '다크 판타지', icon: '🌙', description: '어둡고 진중한 분위기' },
    { id: 'romantic-fantasy', name: '로맨스 판타지', icon: '💖', description: '사랑이 중심인 판타지' },
    { id: 'adventure', name: '모험', icon: '⚔️', description: '탐험과 모험 중심' },
    { id: 'mystery', name: '미스터리', icon: '🔍', description: '추리와 수수께끼' },
  ];

  return (
    <div className="text-center text-white">
      <h1 className="text-3xl font-bold mb-4">어떤 이야기를 좋아하세요?</h1>
      <p className="text-lg text-purple-200 mb-8">최대 3개까지 선택할 수 있어요</p>
      
      <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
        {genres.map((genre) => (
          <button
            key={genre.id}
            className={`p-4 rounded-2xl border-2 transition-all duration-200 ${
              selectedGenres.includes(genre.id)
                ? 'bg-purple-600 border-purple-400'
                : 'bg-white/10 border-white/20 hover:bg-white/20'
            }`}
            onClick={() => handleGenreToggle(genre.id)}
          >
            <div className="text-2xl mb-2">{genre.icon}</div>
            <h3 className="font-semibold mb-1">{genre.name}</h3>
            <p className="text-sm text-purple-200">{genre.description}</p>
          </button>
        ))}
      </div>
      
      <Button 
        className="mt-8 px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600"
        disabled={selectedGenres.length === 0}
        onClick={onNext}
      >
        다음 단계로
      </Button>
    </div>
  );
};
```

### 2.4 커뮤니티 화면

#### 화면 구조
```tsx
// src/app/[locale]/community/page.tsx
export default function CommunityPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <CommunityHeader />
      
      <div className="container mx-auto px-4 py-6">
        {/* Featured Content */}
        <FeaturedSection />
        
        {/* Tabs: Reviews, Discussions, Rankings */}
        <CommunityTabs />
        
        {/* Content Feed */}
        <CommunityFeed />
      </div>
    </div>
  );
}
```

## 3. 컴포넌트 시스템 및 디자인 토큰

### 3.1 색상 시스템
```typescript
// tailwind.config.ts 확장
const colors = {
  primary: {
    50: '#faf5ff',
    100: '#f3e8ff',
    500: '#8b5cf6', // 메인 퍼플
    600: '#7c3aed',
    900: '#4c1d95',
  },
  secondary: {
    50: '#eff6ff',
    500: '#3b82f6', // 메인 블루
    600: '#2563eb',
  },
  fantasy: {
    gold: '#fbbf24',
    mystic: '#6366f1',
    dark: '#1f2937',
    light: '#f9fafb',
  },
};
```

### 3.2 타이포그래피 스케일
```typescript
const typography = {
  fontFamily: {
    fantasy: ['Cinzel', 'serif'], // 판타지 제목용
    reading: ['Noto Serif KR', 'serif'], // 본문 읽기용
    ui: ['Pretendard', 'sans-serif'], // UI 텍스트용
  },
  fontSize: {
    'heading-1': ['2.5rem', { lineHeight: '3rem' }],
    'heading-2': ['2rem', { lineHeight: '2.5rem' }],
    'reading': ['1.125rem', { lineHeight: '1.875rem' }], // 18px, 30px line height
    'reading-large': ['1.25rem', { lineHeight: '2rem' }],
  },
};
```

### 3.3 재사용 가능한 컴포넌트

**EpisodeCard**
```tsx
interface EpisodeCardProps {
  episode: Episode;
  variant?: 'default' | 'compact' | 'featured';
  showProgress?: boolean;
  onClick?: () => void;
}

const EpisodeCard = ({ episode, variant = 'default', showProgress, onClick }: EpisodeCardProps) => {
  return (
    <Card 
      className={cn(
        'cursor-pointer transition-all duration-200 hover:shadow-lg',
        {
          'p-6': variant === 'default',
          'p-4': variant === 'compact',
          'p-8 bg-gradient-to-r from-purple-600 to-blue-600 text-white': variant === 'featured',
        }
      )}
      onClick={onClick}
    >
      {/* Episode 정보 렌더링 */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-lg">{episode.title}</h3>
          <p className="text-sm opacity-75">에피소드 {episode.number}</p>
        </div>
        <Badge variant={episode.isPublished ? 'default' : 'secondary'}>
          {episode.isPublished ? '읽기 가능' : '준비 중'}
        </Badge>
      </div>
      
      <p className="text-sm mb-4 line-clamp-2">{episode.summary}</p>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {episode.estimatedReadingTime}분
          </span>
          <span className="flex items-center gap-1">
            <Star className="w-4 h-4" />
            {episode.averageRating.toFixed(1)}
          </span>
        </div>
        
        {showProgress && (
          <div className="flex items-center gap-2">
            <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-purple-600 transition-all duration-300"
                style={{ width: `${episode.readingProgress}%` }}
              />
            </div>
            <span className="text-xs">{episode.readingProgress}%</span>
          </div>
        )}
      </div>
    </Card>
  );
};
```

## 4. 반응형 디자인 전략

### 4.1 브레이크포인트 정의
```typescript
const screens = {
  'xs': '375px',    // 모바일 세로
  'sm': '640px',    // 모바일 가로
  'md': '768px',    // 태블릿
  'lg': '1024px',   // 데스크톱
  'xl': '1280px',   // 대형 데스크톱
};
```

### 4.2 적응형 레이아웃 패턴
```tsx
// 반응형 그리드 예시
const ResponsiveGrid = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {children}
    </div>
  );
};

// 적응형 네비게이션
const AdaptiveNavigation = () => {
  const [isMobile] = useMediaQuery('(max-width: 768px)');
  
  return isMobile ? <BottomTabNavigation /> : <SidebarNavigation />;
};
```

## 5. 접근성 (A11y) 고려사항

### 5.1 읽기 접근성
```tsx
const AccessibleReadingView = ({ content }: { content: string }) => {
  return (
    <article 
      role="main"
      aria-label="에피소드 본문"
      className="focus:outline-none"
      tabIndex={-1}
    >
      {/* 스킵 링크 */}
      <a 
        href="#episode-end" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 
                   bg-blue-600 text-white p-2 rounded"
      >
        에피소드 끝으로 건너뛰기
      </a>
      
      {/* 본문 */}
      <div 
        className="prose prose-lg max-w-none"
        style={{ 
          fontSize: `${readingSettings.fontSize}px`,
          lineHeight: readingSettings.lineHeight,
        }}
        dangerouslySetInnerHTML={{ __html: content }}
      />
      
      <div id="episode-end" tabIndex={-1} />
    </article>
  );
};
```

### 5.2 키보드 네비게이션
```tsx
const KeyboardNavigationProvider = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'j':
        case 'ArrowDown':
          // 다음 에피소드 또는 스크롤 다운
          break;
        case 'k':
        case 'ArrowUp':
          // 이전 에피소드 또는 스크롤 업
          break;
        case '/':
          // 검색창 포커스
          event.preventDefault();
          document.getElementById('search-input')?.focus();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return <>{children}</>;
};
```

## 6. 상태 관리 및 데이터 플로우

### 6.1 전역 상태 구조
```typescript
// src/stores/useAppStore.ts
interface AppState {
  user: User | null;
  currentSeries: StorySeries | null;
  readingSettings: ReadingSettings;
  notifications: Notification[];
  
  // Actions
  setUser: (user: User | null) => void;
  updateReadingSettings: (settings: Partial<ReadingSettings>) => void;
  addNotification: (notification: Notification) => void;
}

const useAppStore = create<AppState>((set) => ({
  user: null,
  currentSeries: null,
  readingSettings: defaultReadingSettings,
  notifications: [],
  
  setUser: (user) => set({ user }),
  updateReadingSettings: (settings) => 
    set((state) => ({ 
      readingSettings: { ...state.readingSettings, ...settings } 
    })),
  addNotification: (notification) =>
    set((state) => ({ 
      notifications: [...state.notifications, notification] 
    })),
}));
```

이 UX/UI 설계는 사용자 중심의 직관적인 인터페이스를 제공하면서도 기술적으로 구현 가능한 수준으로 설계했어. shadcn/ui 컴포넌트를 기반으로 하여 일관된 디자인 시스템을 유지하고, 접근성과 반응형 디자인도 고려했어.