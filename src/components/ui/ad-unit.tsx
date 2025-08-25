'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

// AdSense 타입 선언
declare global {
  interface Window {
    adsbygoogle: any[];
  }
}

const adUnitVariants = cva(
  'ad-container bg-ad-bg border border-ad-border rounded-lg overflow-hidden',
  {
    variants: {
      format: {
        auto: 'w-full',
        rectangle: 'w-full max-w-sm mx-auto',
        horizontal: 'w-full max-w-2xl mx-auto',
        vertical: 'w-full max-w-xs',
        native: 'w-full',
        banner: 'w-full',
      },
      size: {
        sm: 'min-h-[100px]',
        md: 'min-h-[200px]',
        lg: 'min-h-[250px]',
        xl: 'min-h-[300px]',
      },
    },
    defaultVariants: {
      format: 'auto',
      size: 'md',
    },
  }
);

// 광고 슬롯 정의
export const AdSlots = {
  HEADER_BANNER: '1234567890',
  SIDEBAR_RECTANGLE: '2345678901',
  IN_CONTENT_TOP: '3456789012',
  IN_CONTENT_BOTTOM: '4567890123',
  IN_LIST: '5678901234',
  IN_COMMENTS: '6789012345',
  FOOTER_BANNER: '7890123456',
} as const;

export interface AdUnitProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof adUnitVariants> {
  slot: string;
  lazy?: boolean;
  showLabel?: boolean;
}

const AdUnit = React.forwardRef<HTMLDivElement, AdUnitProps>(
  ({ 
    className, 
    format, 
    size, 
    slot, 
    lazy = true, 
    showLabel = true,
    ...props 
  }, ref) => {
    const adRef = React.useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = React.useState(!lazy);
    const [isLoaded, setIsLoaded] = React.useState(false);
    const [hasError, setHasError] = React.useState(false);

    // Intersection Observer for lazy loading
    React.useEffect(() => {
      if (!lazy || isVisible) return;
      
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        },
        { 
          threshold: 0.1,
          rootMargin: '100px' // Start loading 100px before entering viewport
        }
      );
      
      if (adRef.current) {
        observer.observe(adRef.current);
      }
      
      return () => observer.disconnect();
    }, [lazy, isVisible]);

    // AdSense 초기화
    React.useEffect(() => {
      if (!isVisible || isLoaded) return;
      
      try {
        // Check if AdSense script is loaded
        if (typeof window !== 'undefined' && window.adsbygoogle) {
          // @ts-ignore
          (window.adsbygoogle = window.adsbygoogle || []).push({});
          setIsLoaded(true);
        } else {
          // Load AdSense script if not present
          const script = document.createElement('script');
          script.async = true;
          script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID}`;
          script.crossOrigin = 'anonymous';
          
          script.onload = () => {
            try {
              // @ts-ignore
              (window.adsbygoogle = window.adsbygoogle || []).push({});
              setIsLoaded(true);
            } catch (err) {
              console.warn('AdSense 초기화 실패:', err);
              setHasError(true);
            }
          };
          
          script.onerror = () => {
            setHasError(true);
          };
          
          document.head.appendChild(script);
        }
      } catch (err) {
        console.warn('AdSense 로드 실패:', err);
        setHasError(true);
      }
    }, [isVisible, isLoaded]);

    // 개발 환경에서는 플레이스홀더 표시
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (!isVisible) {
      return (
        <div 
          ref={adRef}
          className={cn(adUnitVariants({ format, size }), className)}
          {...props}
        >
          <div className="flex items-center justify-center h-full">
            {showLabel && (
              <span className="text-ad-label text-xs uppercase tracking-wide">
                광고 로딩 중...
              </span>
            )}
          </div>
        </div>
      );
    }

    if (isDevelopment || hasError) {
      return (
        <div 
          ref={ref}
          className={cn(adUnitVariants({ format, size }), 'border-dashed', className)}
          {...props}
        >
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            {showLabel && (
              <span className="text-ad-label text-xs uppercase tracking-wide mb-2">
                Advertisement
              </span>
            )}
            <div className="text-ad-label text-sm">
              {isDevelopment ? (
                <>
                  <div>광고 영역 ({format} 형태)</div>
                  <div className="text-xs mt-1">슬롯: {slot}</div>
                </>
              ) : (
                '광고를 불러올 수 없습니다'
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div 
        ref={ref}
        className={cn(adUnitVariants({ format, size }), className)}
        {...props}
      >
        {showLabel && (
          <div className="text-center py-1 bg-ad-bg/50">
            <span className="text-ad-label text-xs uppercase tracking-wide">
              Advertisement
            </span>
          </div>
        )}
        <ins
          className="adsbygoogle block w-full h-full"
          style={{ display: 'block' }}
          data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID}
          data-ad-slot={slot}
          data-ad-format={format}
          data-full-width-responsive="true"
        />
      </div>
    );
  }
);

AdUnit.displayName = 'AdUnit';

// 미리 정의된 광고 컴포넌트들
export const HeaderBannerAd = (props: Omit<AdUnitProps, 'slot' | 'format'>) => (
  <AdUnit slot={AdSlots.HEADER_BANNER} format="banner" {...props} />
);

export const SidebarAd = (props: Omit<AdUnitProps, 'slot' | 'format'>) => (
  <AdUnit slot={AdSlots.SIDEBAR_RECTANGLE} format="rectangle" size="lg" {...props} />
);

export const InContentAd = (props: Omit<AdUnitProps, 'slot' | 'format'>) => (
  <AdUnit slot={AdSlots.IN_CONTENT_TOP} format="native" {...props} />
);

export const InListAd = (props: Omit<AdUnitProps, 'slot' | 'format'>) => (
  <AdUnit slot={AdSlots.IN_LIST} format="native" size="sm" {...props} />
);

export { AdUnit, adUnitVariants };