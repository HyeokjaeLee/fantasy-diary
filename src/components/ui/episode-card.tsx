import { cva, type VariantProps } from 'class-variance-authority';
import { BookOpen,Clock, Eye, Star } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

import { Badge } from './badge';
import { Button } from './button';
import { Card, CardContent, CardHeader, CardTitle } from './card';

const episodeCardVariants = cva(
  'cursor-pointer transition-all duration-200 hover:shadow-lg group',
  {
    variants: {
      variant: {
        default: 'bg-card hover:bg-accent/50',
        compact: 'bg-card hover:bg-accent/30',
        featured: 'bg-gradient-to-r from-fantasy-500 to-fantasy-600 text-white hover:from-fantasy-600 hover:to-fantasy-700',
        reading: 'bg-reading-bg-light border-0 shadow-md hover:shadow-lg',
      },
      size: {
        default: '',
        compact: 'p-4',
        large: 'p-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface Episode {
  id: string;
  number: number;
  title: string;
  summary: string;
  content?: string;
  genre: string;
  estimatedReadingTime: number;
  wordCount?: number;
  averageRating: number;
  viewCount: number;
  commentCount: number;
  publishedAt: string;
  isPublished: boolean;
  isPremium?: boolean;
  readingProgress?: number;
  tags?: string[];
}

export interface EpisodeCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof episodeCardVariants> {
  episode: Episode;
  showProgress?: boolean;
  showActions?: boolean;
  onReadClick?: () => void;
  onShareClick?: () => void;
}

const EpisodeCard = React.forwardRef<HTMLDivElement, EpisodeCardProps>(
  ({ 
    className, 
    variant, 
    size, 
    episode, 
    showProgress = false, 
    showActions = true,
    onReadClick,
    onShareClick,
    ...props 
  }, ref) => {
    const isFeatureVariant = variant === 'featured';
    const textColorClass = isFeatureVariant ? 'text-white' : 'text-card-foreground';
    const mutedTextClass = isFeatureVariant ? 'text-white/80' : 'text-muted-foreground';

    return (
      <Card 
        ref={ref}
        className={cn(episodeCardVariants({ variant, size }), className)}
        {...props}
      >
        {variant === 'compact' ? (
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Badge 
                    variant={episode.isPublished ? (isFeatureVariant ? 'outline' : 'default') : 'secondary'}
                    className={isFeatureVariant ? 'border-white/30 text-white' : ''}
                  >
                    {episode.isPublished ? '읽기 가능' : '준비 중'}
                  </Badge>
                  {episode.isPremium && (
                    <Badge variant="warning" className="text-xs">
                      프리미엄
                    </Badge>
                  )}
                </div>
                
                <h3 className={cn('font-semibold text-base mb-1 truncate', textColorClass)}>
                  {episode.title}
                </h3>
                <p className={cn('text-xs mb-2', mutedTextClass)}>
                  에피소드 {episode.number}
                </p>
                
                <div className="flex items-center gap-3 text-xs">
                  <span className={cn('flex items-center gap-1', mutedTextClass)}>
                    <Clock className="w-3 h-3" />
                    {episode.estimatedReadingTime}분
                  </span>
                  <span className={cn('flex items-center gap-1', mutedTextClass)}>
                    <Star className="w-3 h-3" />
                    {episode.averageRating.toFixed(1)}
                  </span>
                  <span className={cn('flex items-center gap-1', mutedTextClass)}>
                    <Eye className="w-3 h-3" />
                    {episode.viewCount.toLocaleString()}
                  </span>
                </div>
              </div>
              
              {showActions && (
                <Button 
                  size="sm" 
                  variant={isFeatureVariant ? 'outline' : 'fantasy'}
                  onClick={onReadClick}
                  className={isFeatureVariant ? 'border-white text-white hover:bg-white hover:text-fantasy-600' : ''}
                >
                  읽기
                </Button>
              )}
            </div>
            
            {showProgress && episode.readingProgress !== undefined && (
              <div className="flex items-center gap-2 mt-3">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      'h-full transition-all duration-300',
                      isFeatureVariant ? 'bg-white/80' : 'bg-fantasy-500'
                    )}
                    style={{ width: `${episode.readingProgress}%` }}
                  />
                </div>
                <span className={cn('text-xs tabular-nums', mutedTextClass)}>
                  {episode.readingProgress}%
                </span>
              </div>
            )}
          </CardContent>
        ) : (
          <>
            <CardHeader className={size === 'large' ? 'p-8 pb-4' : undefined}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Badge 
                    variant={episode.isPublished ? (isFeatureVariant ? 'outline' : 'default') : 'secondary'}
                    className={isFeatureVariant ? 'border-white/30 text-white' : ''}
                  >
                    {episode.isPublished ? '읽기 가능' : '준비 중'}
                  </Badge>
                  {episode.isPremium && (
                    <Badge variant="warning">
                      프리미엄
                    </Badge>
                  )}
                </div>
                
                <div className={cn('flex items-center gap-1 text-sm', mutedTextClass)}>
                  <Star className="w-4 h-4" />
                  <span className="font-medium">{episode.averageRating.toFixed(1)}</span>
                </div>
              </div>
              
              <CardTitle className={cn(
                'text-xl group-hover:text-fantasy-600 transition-colors',
                isFeatureVariant ? 'text-white group-hover:text-white/90' : 'text-card-foreground'
              )}>
                {episode.title}
              </CardTitle>
              
              <p className={cn('text-sm', mutedTextClass)}>
                에피소드 {episode.number} • {episode.genre}
              </p>
            </CardHeader>
            
            <CardContent className={size === 'large' ? 'p-8 pt-0' : undefined}>
              <p className={cn('text-sm mb-4 line-clamp-2', mutedTextClass)}>
                {episode.summary}
              </p>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm">
                  <span className={cn('flex items-center gap-1', mutedTextClass)}>
                    <Clock className="w-4 h-4" />
                    {episode.estimatedReadingTime}분
                  </span>
                  <span className={cn('flex items-center gap-1', mutedTextClass)}>
                    <Eye className="w-4 h-4" />
                    {episode.viewCount.toLocaleString()}
                  </span>
                  <span className={cn('flex items-center gap-1', mutedTextClass)}>
                    <BookOpen className="w-4 h-4" />
                    {episode.commentCount}
                  </span>
                </div>
                
                {showActions && (
                  <div className="flex items-center gap-2">
                    {onShareClick && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={onShareClick}
                        className={isFeatureVariant ? 'text-white hover:bg-white/20' : ''}
                      >
                        공유
                      </Button>
                    )}
                    <Button 
                      variant={isFeatureVariant ? 'outline' : 'fantasy'}
                      onClick={onReadClick}
                      className={isFeatureVariant ? 'border-white text-white hover:bg-white hover:text-fantasy-600' : ''}
                    >
                      <BookOpen className="w-4 h-4 mr-2" />
                      읽기 시작
                    </Button>
                  </div>
                )}
              </div>
              
              {showProgress && episode.readingProgress !== undefined && (
                <div className="flex items-center gap-2 mt-4">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        'h-full transition-all duration-300',
                        isFeatureVariant ? 'bg-white/80' : 'bg-fantasy-500'
                      )}
                      style={{ width: `${episode.readingProgress}%` }}
                    />
                  </div>
                  <span className={cn('text-sm tabular-nums font-medium', mutedTextClass)}>
                    {episode.readingProgress}%
                  </span>
                </div>
              )}
              
              {episode.tags && episode.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-4">
                  {episode.tags.slice(0, 3).map((tag) => (
                    <Badge 
                      key={tag} 
                      variant="outline" 
                      className={cn(
                        'text-xs',
                        isFeatureVariant ? 'border-white/30 text-white' : ''
                      )}
                    >
                      #{tag}
                    </Badge>
                  ))}
                  {episode.tags.length > 3 && (
                    <Badge 
                      variant="outline"
                      className={cn(
                        'text-xs',
                        isFeatureVariant ? 'border-white/30 text-white' : ''
                      )}
                    >
                      +{episode.tags.length - 3}
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </>
        )}
      </Card>
    );
  }
);

EpisodeCard.displayName = 'EpisodeCard';

export { EpisodeCard, episodeCardVariants };