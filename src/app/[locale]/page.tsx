'use client';
import { BookOpen, Clock, Sparkles,Star, TrendingUp, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { withParamValidation } from 'next-typesafe-url/app/hoc';
import React from 'react';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { HeaderBannerAd, InContentAd } from '@/components/ui/ad-unit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EpisodeCard } from '@/components/ui/episode-card';
import { useAuthContext } from '@/contexts/AuthContext';

import { Route as LayoutRoute, type RouteType } from './routeType';

// Mock data for featured episodes
const FEATURED_EPISODES = [
  {
    id: '1',
    number: 1,
    title: '마법사의 첫 번째 시험',
    summary: '어린 마법사 에일린은 마법학교에서 첫 번째 시험을 치르게 됩니다.',
    genre: '하이 판타지',
    estimatedReadingTime: 8,
    averageRating: 4.7,
    viewCount: 15234,
    commentCount: 89,
    publishedAt: '2024-01-15T09:30:00Z',
    isPublished: true,
    tags: ['마법학교', '모험']
  },
  {
    id: '2',
    number: 2,
    title: '숲에서 만난 신비한 생물',
    summary: '미지의 숲을 탐험하던 에일린은 상상도 못했던 마법 생물을 만나게 됩니다.',
    genre: '하이 판타지',
    estimatedReadingTime: 12,
    averageRating: 4.9,
    viewCount: 12847,
    commentCount: 127,
    publishedAt: '2024-01-15T14:45:00Z',
    isPublished: true,
    tags: ['마법생물', '모험']
  }
];

function Page() {
  const t = useTranslations('HomePage');
  const { user, loading, signOut } = useAuthContext();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('');
    } catch (error) {
      console.error('로그아웃 에러:', error);
    }
  };

  const handleEpisodeClick = (episodeId: string) => {
    router.push(`/episodes/${episodeId}`);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-fantasy-500 to-fantasy-700">
        <div className="text-center text-white">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white mx-auto" />
          <p className="text-lg">마법의 세계로 이동 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 광고 */}
      <div className="no-print">
        <HeaderBannerAd />
      </div>

      {/* 내비게이션 */}
      <nav className="bg-white shadow-sm border-b sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-r from-fantasy-500 to-fantasy-600 rounded-lg flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold bg-gradient-to-r from-fantasy-500 to-fantasy-600 bg-clip-text text-transparent">
                  판타지 다이어리
                </span>
              </div>
              
              <div className="hidden md:flex items-center gap-6">
                <Button 
                  variant="ghost" 
                  onClick={() => router.push('/episodes')}
                  className="text-gray-700 hover:text-fantasy-600"
                >
                  에피소드
                </Button>
                <Button 
                  variant="ghost"
                  className="text-gray-700 hover:text-fantasy-600"
                >
                  커뮤니티
                </Button>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {user ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 hidden sm:block">
                    안녕하세요, {user.email?.split('@')[0] || 'Guest'}님!
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSignOut}
                  >
                    로그아웃
                  </Button>
                </div>
              ) : (
                <Button
                  variant="fantasy"
                  size="sm"
                  onClick={() => router.push('/auth/signin')}
                >
                  로그인
                </Button>
              )}
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      </nav>

      {/* 히어로 섹션 */}
      <section className="relative bg-gradient-to-br from-fantasy-500 via-fantasy-600 to-fantasy-700 text-white overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAwIiBoZWlnaHQ9IjUwMCIgdmlld0JveD0iMCAwIDUwMCA1MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PGZpbHRlciBpZD0ibm9pc2VGaWx0ZXIiPjxmZVR1cmJ1bGVuY2UgYmFzZUZyZXF1ZW5jeT0iMC45IiBudW1PY3RhdmVzPSI0IiByZXN1bHQ9Im5vaXNlIiBzZWVkPSIxIi8+PGZlQ29sb3JNYXRyaXggaW49Im5vaXNlIiB0eXBlPSJzYXR1cmF0ZSIgdmFsdWVzPSIwIi8+PC9maWx0ZXI+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbHRlcj0idXJsKCNub2lzZUZpbHRlcikiIG9wYWNpdHk9IjAuNCIvPjwvc3ZnPg==')] opacity-30" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-6">
              <Sparkles className="w-8 h-8 text-fantasy-200" />
              <Badge variant="outline" className="border-white/30 text-white bg-white/10">
                매일 새로운 모험
              </Badge>
              <Sparkles className="w-8 h-8 text-fantasy-200" />
            </div>
            
            <h1 
              className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight"
              style={{ fontFamily: 'Cinzel, serif' }}
            >
              {t('title')}
            </h1>
            
            <p className="text-xl sm:text-2xl text-fantasy-100 mb-8 max-w-3xl mx-auto leading-relaxed">
              AI가 매일 5회 랜덤 시간에 새로운 판타지 소설을 선사합니다.<br />
              당신의 댓글이 다음 이야기의 방향을 바꿀 수 있어요.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <Button 
                size="lg" 
                className="bg-white text-fantasy-600 hover:bg-gray-100 px-8"
                onClick={() => router.push('/episodes')}
              >
                <BookOpen className="w-5 h-5 mr-2" />
                에피소드 읽기
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-white text-white hover:bg-white hover:text-fantasy-600 px-8"
              >
                <Star className="w-5 h-5 mr-2" />
                오늘의 추천
              </Button>
            </div>
            
            {/* 통계 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 max-w-2xl mx-auto">
              <div className="text-center">
                <div className="text-3xl font-bold mb-2">147</div>
                <div className="text-fantasy-200 text-sm">총 에피소드</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold mb-2">50K+</div>
                <div className="text-fantasy-200 text-sm">월 독자수</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold mb-2">4.8★</div>
                <div className="text-fantasy-200 text-sm">평균 평점</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold mb-2">1.2M</div>
                <div className="text-fantasy-200 text-sm">총 조회수</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 특징 소개 */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">왜 판타지 다이어리인가요?</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              매일 새로운 이야기와 함께하는 특별한 경험을 제공합니다
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="text-center hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-16 h-16 bg-fantasy-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-8 h-8 text-fantasy-600" />
                </div>
                <CardTitle className="text-xl">매일 5회 랜덤 발행</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  예측 불가능한 시간에 새로운 에피소드가 발행되어 매번 새로운 설렘을 선사합니다.
                </p>
              </CardContent>
            </Card>
            
            <Card className="text-center hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-16 h-16 bg-fantasy-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-fantasy-600" />
                </div>
                <CardTitle className="text-xl">독자 참여형 스토리</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  댓글로 남긴 의견과 감정이 AI를 통해 다음 에피소드에 반영됩니다.
                </p>
              </CardContent>
            </Card>
            
            <Card className="text-center hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-16 h-16 bg-fantasy-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="w-8 h-8 text-fantasy-600" />
                </div>
                <CardTitle className="text-xl">완전 무료</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  회원가입 없이도 모든 에피소드를 읽을 수 있습니다. 미리보기만 100원의 소액 결제.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* 중간 광고 */}
      <div className="py-8 no-print">
        <InContentAd />
      </div>

      {/* 최신 에피소드 */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">최신 에피소드</h3>
              <p className="text-gray-600">오늘 새롭게 발행된 이야기들을 만나보세요</p>
            </div>
            <Button 
              variant="outline"
              onClick={() => router.push('/episodes')}
            >
              전체 보기
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {FEATURED_EPISODES.map((episode) => (
              <EpisodeCard
                key={episode.id}
                episode={episode}
                variant="featured"
                onReadClick={() => handleEpisodeClick(episode.id)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 푸터 */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-r from-fantasy-500 to-fantasy-600 rounded-lg flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold">판타지 다이어리</span>
              </div>
              <p className="text-gray-300 mb-4 max-w-md">
                매일 새로운 판타지 모험이 기다리는 곳. AI와 독자가 함께 만들어가는 특별한 이야기의 공간입니다.
              </p>
              <div className="flex items-center gap-4 text-sm text-gray-400">
                <span>© 2024 판타지 다이어리</span>
                <span>|</span>
                <span>서비스 이용약관</span>
                <span>|</span>
                <span>개인정보처리방침</span>
              </div>
            </div>
            
            <div>
              <h4 className="text-lg font-semibold mb-4">서비스</h4>
              <ul className="space-y-2 text-gray-300">
                <li><a href="/episodes" className="hover:text-white transition-colors">에피소드</a></li>
                <li><a href="#" className="hover:text-white transition-colors">커뮤니티</a></li>
                <li><a href="#" className="hover:text-white transition-colors">작가 신청</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-lg font-semibold mb-4">고객지원</h4>
              <ul className="space-y-2 text-gray-300">
                <li><a href="#" className="hover:text-white transition-colors">FAQ</a></li>
                <li><a href="#" className="hover:text-white transition-colors">문의하기</a></li>
                <li><a href="#" className="hover:text-white transition-colors">공지사항</a></li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default withParamValidation(Page, LayoutRoute);
