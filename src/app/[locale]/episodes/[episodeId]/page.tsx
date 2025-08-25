'use client';

import { ArrowLeft, BookOpen,Clock, Eye, MessageCircle, Settings, Share2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';

import { AdUnit, InContentAd } from '@/components/ui/ad-unit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Episode } from '@/components/ui/episode-card';
import { ReadingSettingsPanel, useReadingSettings } from '@/components/ui/reading-settings';

// Mock data - 실제 구현시 API에서 가져올 데이터
const MOCK_EPISODE: Episode = {
  id: '1',
  number: 1,
  title: '마법사의 첫 번째 시험',
  summary: '어린 마법사 에일린은 마법학교에서 첫 번째 시험을 치르게 됩니다. 하지만 예상치 못한 일들이 벌어지는데...',
  content: `
    <div class="reading-content">
      <p>새벽 첫 햇살이 마법학교 첨탑을 비추자, 에일린은 침대에서 벌떡 일어났다.</p>
      
      <p>"오늘이 바로 그 날이구나." 그녀가 중얼거렸다.</p>
      
      <p>마법학교에 입학한 지 석 달. 드디어 첫 번째 실전 시험을 치르는 날이었다. 창밖으로 보이는 안개 낀 숲은 평소보다 더욱 음침해 보였고, 까마귀들의 울음소리가 불길한 전조처럼 들려왔다.</p>
      
      <p>에일린은 서둘러 마법사 로브를 입고 지팡이를 집어들었다. 어머니가 물려준 이 지팡이는 오래된 참나무로 만들어졌고, 끝부분에는 신비로운 푸른 보석이 박혀있었다.</p>
      
      <p>"에일린아, 준비됐니?" 룸메이트인 루나가 문을 두드렸다.</p>
      
      <p>"응, 거의 다 됐어!" 에일린이 대답하며 마지막으로 거울을 확인했다. 갈색 머리는 단정히 묶여있었고, 초록색 눈동자에는 긴장과 설렘이 뒤섞여 있었다.</p>
      
      <p>두 소녀는 함께 대강당으로 향했다. 강당에는 이미 1학년 학생들이 모여있었고, 모두들 초조해하고 있었다.</p>
      
      <p>"좋아, 여러분." 맥그래곤 교수가 나타났다. "오늘의 시험은 '미지의 숲 탐험'입니다. 여러분은 각자 숲에서 마법 재료를 수집하고, 주어진 시간 내에 돌아와야 합니다."</p>
      
      <p>학생들 사이에서 웅성거리는 소리가 들려왔다. 미지의 숲은 위험한 마법 생물들이 사는 곳으로 유명했다.</p>
      
      <p>"하지만 주의하세요." 교수가 계속 말했다. "숲에는 예측할 수 없는 위험이 도사리고 있습니다. 여러분의 마법 실력뿐만 아니라 지혜와 용기도 시험받게 될 것입니다."</p>
      
      <p>에일린은 심호흡을 했다. 이것이 바로 그녀가 그토록 기다려온 순간이었다.</p>
    </div>
  `,
  genre: '하이 판타지',
  estimatedReadingTime: 8,
  wordCount: 1247,
  averageRating: 4.7,
  viewCount: 15234,
  commentCount: 89,
  publishedAt: '2024-01-15T09:30:00Z',
  isPublished: true,
  isPremium: false,
  readingProgress: 0,
  tags: ['마법학교', '모험', '성장', '우정']
};

interface ReadingProgress {
  progress: number;
  timeSpent: number;
}

export default function EpisodeViewerPage() {
  const params = useParams();
  const router = useRouter();
  const { settings, updateSettings } = useReadingSettings();
  
  const [showSettings, setShowSettings] = React.useState(false);
  const [readingProgress, setReadingProgress] = React.useState<ReadingProgress>({
    progress: 0,
    timeSpent: 0
  });
  
  const contentRef = React.useRef<HTMLDivElement>(null);

  // 스크롤 진행도 추적
  React.useEffect(() => {
    const handleScroll = () => {
      if (!contentRef.current) return;
      
      const element = contentRef.current;
      const totalHeight = element.scrollHeight - element.clientHeight;
      const progress = Math.min(100, Math.max(0, (window.scrollY / totalHeight) * 100));
      
      setReadingProgress(prev => ({
        ...prev,
        progress: Math.round(progress)
      }));
    };

    window.addEventListener('scroll', handleScroll);

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 읽기 시간 추적
  React.useEffect(() => {
    const interval = setInterval(() => {
      setReadingProgress(prev => ({
        ...prev,
        timeSpent: prev.timeSpent + 1
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleBack = () => {
    router.back();
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: MOCK_EPISODE.title,
          text: MOCK_EPISODE.summary,
          url: window.location.href,
        });
      } catch (err) {
        console.log('공유 취소됨');
      }
    } else {
      // 폴백: 클립보드에 복사
      await navigator.clipboard.writeText(window.location.href);
      alert('링크가 클립보드에 복사되었습니다!');
    }
  };

  const scrollToComments = () => {
    const commentsSection = document.getElementById('comments');
    if (commentsSection) {
      commentsSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // 읽기 테마 적용
  const themeClasses = React.useMemo(() => {
    switch (settings.theme) {
      case 'dark':
        return 'bg-gray-900 text-gray-100';
      case 'sepia':
        return 'bg-amber-50 text-amber-900';
      default:
        return 'bg-white text-gray-900';
    }
  }, [settings.theme]);

  return (
    <div className={`min-h-screen transition-colors duration-300 ${themeClasses}`}>
      {/* 읽기 헤더 - 고정 */}
      <header className={`sticky top-0 z-20 border-b backdrop-blur-sm ${themeClasses}/90`}>
        <div className="flex items-center justify-between p-4 max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleBack}
              className="hover:bg-fantasy-100"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            
            <div className="min-w-0">
              <h1 className="font-semibold text-sm truncate max-w-[200px] sm:max-w-none">
                {MOCK_EPISODE.title}
              </h1>
              <p className="text-xs text-muted-foreground">
                에피소드 {MOCK_EPISODE.number}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleShare}
              className="hover:bg-fantasy-100"
            >
              <Share2 className="w-5 h-5" />
            </Button>
            
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setShowSettings(true)}
              className="hover:bg-fantasy-100"
            >
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>
        
        {/* 진행도 바 */}
        {settings.showProgress && (
          <div className="h-1 bg-gray-200">
            <div 
              className="h-full bg-fantasy-500 transition-all duration-300 ease-out"
              style={{ width: `${readingProgress.progress}%` }}
            />
          </div>
        )}
      </header>

      {/* 메인 콘텐츠 */}
      <main className="max-w-4xl mx-auto" ref={contentRef}>
        {/* 상단 광고 */}
        <div className="p-4 no-print">
          <InContentAd className="mb-6" />
        </div>

        {/* 에피소드 헤더 */}
        <article className="px-4 sm:px-6">
          <header className="py-8 border-b border-gray-200">
            <div className="text-center max-w-2xl mx-auto">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Badge variant="fantasy">
                  에피소드 {MOCK_EPISODE.number}
                </Badge>
                <Badge variant="outline">
                  {MOCK_EPISODE.genre}
                </Badge>
              </div>
              
              <h1 
                className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4 leading-tight"
                style={{ fontFamily: 'Cinzel, serif' }}
              >
                {MOCK_EPISODE.title}
              </h1>
              
              <p className="text-muted-foreground text-base sm:text-lg mb-6 leading-relaxed">
                {MOCK_EPISODE.summary}
              </p>
              
              <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {MOCK_EPISODE.estimatedReadingTime}분
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  {MOCK_EPISODE.viewCount.toLocaleString()}회
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle className="w-4 h-4" />
                  {MOCK_EPISODE.commentCount}개
                </span>
              </div>
            </div>
          </header>

          {/* 본문 */}
          <section 
            className="py-8 max-w-2xl mx-auto"
            style={{
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
              fontFamily: settings.fontFamily,
            }}
          >
            <div 
              className="prose prose-lg max-w-none"
              dangerouslySetInnerHTML={{ __html: MOCK_EPISODE.content || '' }}
            />
            
            {/* 중간 광고 - 본문 중간 */}
            <div className="my-12 no-print">
              <InContentAd />
            </div>
            
            {/* 에피소드 마무리 */}
            <div className="mt-12 pt-8 border-t border-gray-200 text-center">
              <p className="text-muted-foreground mb-6">
                - 에피소드 {MOCK_EPISODE.number} 끝 -
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button variant="fantasy" className="min-w-[120px]">
                  다음 에피소드
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={scrollToComments}
                  className="min-w-[120px]"
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  댓글 보기
                </Button>
              </div>
            </div>
            
            {/* 태그 */}
            {MOCK_EPISODE.tags && MOCK_EPISODE.tags.length > 0 && (
              <div className="mt-8 pt-6 border-t border-gray-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">태그:</span>
                  {MOCK_EPISODE.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </section>
        </article>

        {/* 하단 광고 */}
        <div className="p-4 no-print">
          <InContentAd className="mt-8" />
        </div>

        {/* 댓글 섹션 */}
        <section id="comments" className="px-4 sm:px-6 py-12 border-t border-gray-200">
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardContent className="p-8 text-center">
                <MessageCircle className="w-12 h-12 text-fantasy-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">댓글 섹션</h3>
                <p className="text-muted-foreground mb-6">
                  이 기능은 회원 전용입니다. 로그인하시면 다른 독자들과 이야기를 나누실 수 있어요.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button variant="fantasy">
                    로그인하기
                  </Button>
                  <Button variant="outline">
                    회원가입
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* 관련 에피소드 추천 */}
        <section className="px-4 sm:px-6 py-12 bg-muted/30">
          <div className="max-w-4xl mx-auto">
            <h3 className="text-xl font-bold mb-6 text-center">다른 에피소드도 읽어보세요</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-fantasy-100 rounded-lg flex items-center justify-center">
                      <BookOpen className="w-6 h-6 text-fantasy-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-sm mb-1">이전 에피소드</h4>
                      <p className="text-xs text-muted-foreground">프롤로그: 마법학교에 오다</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-fantasy-100 rounded-lg flex items-center justify-center">
                      <BookOpen className="w-6 h-6 text-fantasy-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-sm mb-1">다음 에피소드</h4>
                      <p className="text-xs text-muted-foreground">숲에서 만난 신비한 생물</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      {/* 읽기 설정 패널 */}
      <ReadingSettingsPanel
        settings={settings}
        onChange={updateSettings}
        onClose={() => setShowSettings(false)}
        isOpen={showSettings}
      />

      {/* 읽기 통계 - 개발 모드에서만 표시 */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 left-4 bg-black/80 text-white text-xs p-2 rounded no-print">
          진행도: {readingProgress.progress}% | 읽은 시간: {Math.floor(readingProgress.timeSpent / 60)}:{readingProgress.timeSpent % 60 < 10 ? '0' : ''}{readingProgress.timeSpent % 60}
        </div>
      )}
    </div>
  );
}