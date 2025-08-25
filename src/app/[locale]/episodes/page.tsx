'use client';

import { BookOpen,Clock, Eye, Filter, Grid, List, Search, Star, TrendingUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { HeaderBannerAd, InListAd } from '@/components/ui/ad-unit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type Episode,EpisodeCard } from '@/components/ui/episode-card';
import { cn } from '@/lib/utils';

// Mock data - 실제 구현시 API에서 가져올 데이터
const MOCK_EPISODES: Episode[] = [
  {
    id: '1',
    number: 1,
    title: '마법사의 첫 번째 시험',
    summary: '어린 마법사 에일린은 마법학교에서 첫 번째 시험을 치르게 됩니다. 하지만 예상치 못한 일들이 벌어지는데...',
    genre: '하이 판타지',
    estimatedReadingTime: 8,
    wordCount: 1247,
    averageRating: 4.7,
    viewCount: 15234,
    commentCount: 89,
    publishedAt: '2024-01-15T09:30:00Z',
    isPublished: true,
    readingProgress: 100,
    tags: ['마법학교', '모험', '성장', '우정']
  },
  {
    id: '2',
    number: 2,
    title: '숲에서 만난 신비한 생물',
    summary: '미지의 숲을 탐험하던 에일린은 상상도 못했던 마법 생물을 만나게 됩니다. 그 생물이 전하는 메시지란?',
    genre: '하이 판타지',
    estimatedReadingTime: 12,
    wordCount: 1892,
    averageRating: 4.9,
    viewCount: 12847,
    commentCount: 127,
    publishedAt: '2024-01-15T14:45:00Z',
    isPublished: true,
    readingProgress: 65,
    tags: ['마법생물', '모험', '미스터리']
  },
  {
    id: '3',
    number: 3,
    title: '금지된 마법의 비밀',
    summary: '에일린이 우연히 발견한 고대 마법서. 하지만 그 마법서에는 사용이 금지된 어둠의 마법이 기록되어 있었습니다.',
    genre: '다크 판타지',
    estimatedReadingTime: 15,
    wordCount: 2156,
    averageRating: 4.8,
    viewCount: 18392,
    commentCount: 203,
    publishedAt: '2024-01-15T19:20:00Z',
    isPublished: true,
    isPremium: true,
    tags: ['어둠의마법', '비밀', '금지술']
  },
  {
    id: '4',
    number: 4,
    title: '마법사들의 대결',
    summary: '학교에 침입한 어둠의 마법사들. 에일린과 친구들은 학교를 지키기 위해 위험한 싸움에 나서게 됩니다.',
    genre: '액션 판타지',
    estimatedReadingTime: 18,
    wordCount: 2634,
    averageRating: 4.9,
    viewCount: 21567,
    commentCount: 156,
    publishedAt: '2024-01-16T08:15:00Z',
    isPublished: true,
    tags: ['전투', '마법대결', '우정', '용기']
  },
  {
    id: '5',
    number: 5,
    title: '새로운 동맹',
    summary: '위기를 함께 극복한 후, 에일린은 예상치 못한 새로운 친구들을 얻게 됩니다. 하지만 더 큰 위험이 다가오고 있었는데...',
    genre: '하이 판타지',
    estimatedReadingTime: 10,
    wordCount: 1456,
    averageRating: 0,
    viewCount: 0,
    commentCount: 0,
    publishedAt: '2024-01-16T15:30:00Z',
    isPublished: false,
    tags: ['우정', '동료', '예고']
  }
];

const GENRES = ['전체', '하이 판타지', '다크 판타지', '액션 판타지', '로맨스 판타지', '어반 판타지'];
const SORT_OPTIONS = [
  { value: 'latest', label: '최신순' },
  { value: 'popular', label: '인기순' },
  { value: 'rating', label: '평점순' },
  { value: 'oldest', label: '오래된순' },
];

type ViewMode = 'grid' | 'list';
type SortBy = 'latest' | 'popular' | 'rating' | 'oldest';

export default function EpisodesListPage() {
  const router = useRouter();
  const [episodes, setEpisodes] = React.useState<Episode[]>(MOCK_EPISODES);
  const [viewMode, setViewMode] = React.useState<ViewMode>('grid');
  const [sortBy, setSortBy] = React.useState<SortBy>('latest');
  const [selectedGenre, setSelectedGenre] = React.useState('전체');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(true);

  // 에피소드 필터링 및 정렬
  const filteredAndSortedEpisodes = React.useMemo(() => {
    const filtered = episodes.filter(episode => {
      const matchesGenre = selectedGenre === '전체' || episode.genre === selectedGenre;
      const matchesSearch = searchQuery === '' || 
        episode.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        episode.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        episode.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      
      return matchesGenre && matchesSearch;
    });

    // 정렬
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'popular':
          return b.viewCount - a.viewCount;
        case 'rating':
          return b.averageRating - a.averageRating;
        case 'oldest':
          return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
        case 'latest':
        default:
          return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      }
    });

    return filtered;
  }, [episodes, selectedGenre, searchQuery, sortBy]);

  const handleEpisodeClick = (episode: Episode) => {
    router.push(`/episodes/${episode.id}`);
  };

  const handleShare = (episode: Episode) => {
    if (navigator.share) {
      navigator.share({
        title: episode.title,
        text: episode.summary,
        url: `${window.location.origin}/episodes/${episode.id}`,
      });
    } else {
      navigator.clipboard.writeText(`${window.location.origin}/episodes/${episode.id}`);
      alert('링크가 클립보드에 복사되었습니다!');
    }
  };

  const loadMore = () => {
    // Mock 무한 스크롤 구현
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setHasMore(false); // 더 이상 로드할 데이터가 없다고 가정
    }, 1000);
  };

  // 통계 정보
  const stats = React.useMemo(() => {
    const published = episodes.filter(e => e.isPublished);
    const totalViews = published.reduce((sum, e) => sum + e.viewCount, 0);
    const avgRating = published.reduce((sum, e) => sum + e.averageRating, 0) / published.length;
    
    return {
      total: episodes.length,
      published: published.length,
      totalViews,
      avgRating: avgRating || 0
    };
  }, [episodes]);

  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 광고 */}
      <div className="no-print">
        <HeaderBannerAd className="mb-6" />
      </div>

      {/* 헤더 */}
      <header className="bg-gradient-to-r from-fantasy-500 to-fantasy-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4" style={{ fontFamily: 'Cinzel, serif' }}>
              판타지 다이어리
            </h1>
            <p className="text-lg sm:text-xl text-fantasy-100 mb-6 max-w-2xl mx-auto">
              매일 새로운 모험이 기다리고 있습니다
            </p>
            
            {/* 통계 */}
            <div className="flex items-center justify-center gap-8 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-fantasy-200">총 에피소드</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{stats.totalViews.toLocaleString()}</div>
                <div className="text-fantasy-200">총 조회수</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold flex items-center gap-1">
                  {stats.avgRating.toFixed(1)}
                  <Star className="w-4 h-4" />
                </div>
                <div className="text-fantasy-200">평균 평점</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 필터 및 검색 */}
      <section className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* 검색 */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="에피소드 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-fantasy-500 focus:border-transparent"
              />
            </div>
            
            {/* 필터 및 정렬 */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <select
                  value={selectedGenre}
                  onChange={(e) => setSelectedGenre(e.target.value)}
                  className="border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fantasy-500"
                >
                  {GENRES.map(genre => (
                    <option key={genre} value={genre}>{genre}</option>
                  ))}
                </select>
              </div>
              
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fantasy-500"
              >
                {SORT_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              
              {/* 뷰 모드 토글 */}
              <div className="flex items-center gap-1 border border-input rounded-md">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="rounded-r-none"
                >
                  <Grid className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="rounded-l-none"
                >
                  <List className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 메인 콘텐츠 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">
              {selectedGenre === '전체' ? '모든 에피소드' : selectedGenre}
            </h2>
            <Badge variant="secondary">
              {filteredAndSortedEpisodes.length}편
            </Badge>
            {searchQuery && (
              <Badge variant="outline">
                "{searchQuery}" 검색 결과
              </Badge>
            )}
          </div>
          
          <div className="text-sm text-muted-foreground">
            {SORT_OPTIONS.find(option => option.value === sortBy)?.label}으로 정렬
          </div>
        </div>

        {/* 에피소드 목록 */}
        {filteredAndSortedEpisodes.length > 0 ? (
          <div className={cn(
            'gap-6',
            viewMode === 'grid' 
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              : 'flex flex-col'
          )}>
            {filteredAndSortedEpisodes.map((episode, index) => (
              <React.Fragment key={episode.id}>
                <EpisodeCard
                  episode={episode}
                  variant={viewMode === 'list' ? 'compact' : 'default'}
                  showProgress={episode.readingProgress !== undefined && episode.readingProgress > 0}
                  onReadClick={() => handleEpisodeClick(episode)}
                  onShareClick={() => handleShare(episode)}
                />
                
                {/* 리스트 중간 광고 (5개마다) */}
                {(index + 1) % 5 === 0 && (
                  <div className={viewMode === 'grid' ? 'col-span-full' : ''}>
                    <InListAd className="my-6" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <Card className="text-center py-12">
            <CardContent>
              <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">검색 결과가 없습니다</h3>
              <p className="text-muted-foreground mb-4">
                다른 검색어나 필터를 시도해보세요.
              </p>
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchQuery('');
                  setSelectedGenre('전체');
                }}
              >
                필터 초기화
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 무한 스크롤 로더 */}
        {filteredAndSortedEpisodes.length > 0 && (
          <div className="text-center py-8">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-fantasy-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-muted-foreground">로딩 중...</span>
              </div>
            ) : hasMore ? (
              <Button 
                variant="outline" 
                onClick={loadMore}
                className="min-w-[120px]"
              >
                더 보기
              </Button>
            ) : (
              <p className="text-muted-foreground">모든 에피소드를 확인했습니다</p>
            )}
          </div>
        )}
      </main>

      {/* 추천 섹션 */}
      <section className="bg-muted/30 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold mb-2 flex items-center justify-center gap-2">
              <TrendingUp className="w-6 h-6 text-fantasy-500" />
              인기 에피소드
            </h3>
            <p className="text-muted-foreground">
              가장 많이 읽힌 에피소드들을 확인해보세요
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {episodes
              .filter(e => e.isPublished)
              .sort((a, b) => b.viewCount - a.viewCount)
              .slice(0, 3)
              .map((episode, index) => (
                <Card key={episode.id} className="relative overflow-hidden group hover:shadow-lg transition-shadow">
                  <div className="absolute top-4 right-4 z-10">
                    <Badge variant="fantasy" className="text-xs">
                      #{index + 1}
                    </Badge>
                  </div>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg group-hover:text-fantasy-600 transition-colors">
                      {episode.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {episode.summary}
                    </p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {episode.viewCount.toLocaleString()}회
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {episode.estimatedReadingTime}분
                      </span>
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3" />
                        {episode.averageRating.toFixed(1)}
                      </span>
                    </div>
                    <Button 
                      variant="fantasy" 
                      size="sm" 
                      className="w-full mt-4"
                      onClick={() => handleEpisodeClick(episode)}
                    >
                      읽기
                    </Button>
                  </CardContent>
                </Card>
              ))
            }
          </div>
        </div>
      </section>
    </div>
  );
}