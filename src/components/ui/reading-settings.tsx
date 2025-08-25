'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { BookOpen, Eye,Moon, Settings, Sun, Type } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

import { Badge } from './badge';
import { Button } from './button';
import { Card, CardContent, CardHeader, CardTitle } from './card';

export interface ReadingSettings {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  theme: 'light' | 'dark' | 'sepia';
  maxWidth: number;
  autoScroll: boolean;
  showProgress: boolean;
}

const DEFAULT_READING_SETTINGS: ReadingSettings = {
  fontSize: 18,
  lineHeight: 1.8,
  fontFamily: 'Noto Serif KR',
  theme: 'light',
  maxWidth: 65, // characters
  autoScroll: false,
  showProgress: true,
};

const FONT_FAMILIES = [
  { value: 'Noto Serif KR', label: '본명조 (Noto Serif)', description: '읽기 최적화' },
  { value: 'Pretendard Variable', label: '프리텐다드', description: '모던 산세리프' },
  { value: 'Georgia', label: '조지아', description: '클래식 세리프' },
  { value: 'system-ui', label: '시스템 폰트', description: '기본 폰트' },
];

const THEMES = [
  { 
    value: 'light' as const, 
    label: '라이트 모드', 
    icon: Sun, 
    bg: 'bg-white', 
    text: 'text-gray-900',
    description: '밝은 배경'
  },
  { 
    value: 'dark' as const, 
    label: '다크 모드', 
    icon: Moon, 
    bg: 'bg-gray-900', 
    text: 'text-gray-100',
    description: '어두운 배경'
  },
  { 
    value: 'sepia' as const, 
    label: '세피아 모드', 
    icon: BookOpen, 
    bg: 'bg-amber-50', 
    text: 'text-amber-900',
    description: '눈 보호'
  },
];

export interface ReadingSettingsPanelProps {
  settings: ReadingSettings;
  onChange: (settings: Partial<ReadingSettings>) => void;
  onClose: () => void;
  isOpen: boolean;
}

const ReadingSettingsPanel = React.forwardRef<HTMLDivElement, ReadingSettingsPanelProps>(
  ({ settings, onChange, onClose, isOpen }, ref) => {
    const [localSettings, setLocalSettings] = React.useState(settings);

    React.useEffect(() => {
      setLocalSettings(settings);
    }, [settings]);

    const handleSettingChange = React.useCallback((key: keyof ReadingSettings, value: any) => {
      const newSettings = { ...localSettings, [key]: value };
      setLocalSettings(newSettings);
      onChange({ [key]: value });
    }, [localSettings, onChange]);

    const resetToDefaults = React.useCallback(() => {
      setLocalSettings(DEFAULT_READING_SETTINGS);
      onChange(DEFAULT_READING_SETTINGS);
    }, [onChange]);

    return (
      <Dialog.Root open={isOpen} onOpenChange={onClose}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content 
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md max-h-[90vh] overflow-y-auto bg-background rounded-lg shadow-xl z-50"
            ref={ref}
          >
            <Card className="border-0 shadow-none">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    읽기 설정
                  </CardTitle>
                  <Button variant="ghost" size="icon" onClick={onClose}>
                    ×
                  </Button>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-6">
                {/* 테마 선택 */}
                <div>
                  <label className="text-sm font-medium mb-3 block">테마</label>
                  <div className="grid grid-cols-1 gap-2">
                    {THEMES.map((theme) => {
                      const Icon = theme.icon;
                      const isSelected = localSettings.theme === theme.value;
                      
                      return (
                        <button
                          key={theme.value}
                          onClick={() => handleSettingChange('theme', theme.value)}
                          className={cn(
                            'flex items-center gap-3 p-3 rounded-lg border transition-all',
                            isSelected 
                              ? 'border-fantasy-500 bg-fantasy-50' 
                              : 'border-border hover:border-fantasy-300 hover:bg-accent'
                          )}
                        >
                          <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', theme.bg)}>
                            <Icon className={cn('w-4 h-4', theme.text)} />
                          </div>
                          <div className="text-left">
                            <div className={cn('font-medium text-sm', isSelected && 'text-fantasy-700')}>
                              {theme.label}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {theme.description}
                            </div>
                          </div>
                          {isSelected && (
                            <Badge variant="fantasy" className="ml-auto text-xs">
                              선택됨
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 폰트 크기 */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Type className="w-4 h-4" />
                      폰트 크기
                    </label>
                    <Badge variant="outline" className="text-xs">
                      {localSettings.fontSize}px
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleSettingChange('fontSize', Math.max(14, localSettings.fontSize - 2))}
                      disabled={localSettings.fontSize <= 14}
                    >
                      작게
                    </Button>
                    <input
                      type="range"
                      min={14}
                      max={24}
                      step={2}
                      value={localSettings.fontSize}
                      onChange={(e) => handleSettingChange('fontSize', Number(e.target.value))}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleSettingChange('fontSize', Math.min(24, localSettings.fontSize + 2))}
                      disabled={localSettings.fontSize >= 24}
                    >
                      크게
                    </Button>
                  </div>
                </div>

                {/* 줄 간격 */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium">줄 간격</label>
                    <Badge variant="outline" className="text-xs">
                      {localSettings.lineHeight}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleSettingChange('lineHeight', Math.max(1.4, localSettings.lineHeight - 0.2))}
                      disabled={localSettings.lineHeight <= 1.4}
                    >
                      좁게
                    </Button>
                    <input
                      type="range"
                      min={1.4}
                      max={2.2}
                      step={0.2}
                      value={localSettings.lineHeight}
                      onChange={(e) => handleSettingChange('lineHeight', Number(e.target.value))}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleSettingChange('lineHeight', Math.min(2.2, localSettings.lineHeight + 0.2))}
                      disabled={localSettings.lineHeight >= 2.2}
                    >
                      넓게
                    </Button>
                  </div>
                </div>

                {/* 폰트 선택 */}
                <div>
                  <label className="text-sm font-medium mb-3 block">폰트</label>
                  <div className="space-y-2">
                    {FONT_FAMILIES.map((font) => {
                      const isSelected = localSettings.fontFamily === font.value;
                      
                      return (
                        <button
                          key={font.value}
                          onClick={() => handleSettingChange('fontFamily', font.value)}
                          className={cn(
                            'w-full text-left p-3 rounded-lg border transition-all',
                            isSelected 
                              ? 'border-fantasy-500 bg-fantasy-50' 
                              : 'border-border hover:border-fantasy-300 hover:bg-accent'
                          )}
                          style={{ fontFamily: font.value }}
                        >
                          <div className={cn('font-medium text-sm mb-1', isSelected && 'text-fantasy-700')}>
                            {font.label}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {font.description}
                          </div>
                          <div className="text-sm mt-2 opacity-75" style={{ fontFamily: font.value }}>
                            가나다라마바사 ABCDEFG 1234567890
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 기타 설정 */}
                <div className="space-y-3">
                  <label className="text-sm font-medium block">기타 설정</label>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <div className="font-medium text-sm">진행도 표시</div>
                      <div className="text-xs text-muted-foreground">읽기 진행률을 하단에 표시</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={localSettings.showProgress}
                      onChange={(e) => handleSettingChange('showProgress', e.target.checked)}
                      className="w-4 h-4 text-fantasy-600 bg-gray-100 border-gray-300 rounded focus:ring-fantasy-500"
                    />
                  </div>
                </div>

                {/* 미리보기 */}
                <div>
                  <label className="text-sm font-medium mb-3 block">미리보기</label>
                  <div 
                    className={cn(
                      'p-4 rounded-lg border-2 border-dashed',
                      localSettings.theme === 'dark' && 'bg-gray-900 text-gray-100 border-gray-700',
                      localSettings.theme === 'sepia' && 'bg-amber-50 text-amber-900 border-amber-200',
                      localSettings.theme === 'light' && 'bg-white text-gray-900 border-gray-200'
                    )}
                    style={{
                      fontSize: `${localSettings.fontSize}px`,
                      lineHeight: localSettings.lineHeight,
                      fontFamily: localSettings.fontFamily,
                    }}
                  >
                    <p className="mb-3">
                      옛날 어느 작은 마을에 용감한 기사가 살고 있었습니다. 그는 마법의 검을 들고 어둠의 성으로 향했습니다.
                    </p>
                    <p>
                      "이 설정으로 소설을 읽으시겠어요?" 라고 마법사가 물었습니다.
                    </p>
                  </div>
                </div>

                {/* 액션 버튼 */}
                <div className="flex gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={resetToDefaults} className="flex-1">
                    기본값으로
                  </Button>
                  <Button variant="fantasy" onClick={onClose} className="flex-1">
                    적용하기
                  </Button>
                </div>
              </CardContent>
            </Card>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }
);

ReadingSettingsPanel.displayName = 'ReadingSettingsPanel';

// 읽기 설정을 위한 커스텀 훅
export const useReadingSettings = () => {
  const [settings, setSettings] = React.useState<ReadingSettings>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('reading-settings');

      return saved ? JSON.parse(saved) : DEFAULT_READING_SETTINGS;
    }

    return DEFAULT_READING_SETTINGS;
  });

  const updateSettings = React.useCallback((updates: Partial<ReadingSettings>) => {
    setSettings(prev => {
      const newSettings = { ...prev, ...updates };
      if (typeof window !== 'undefined') {
        localStorage.setItem('reading-settings', JSON.stringify(newSettings));
      }

      return newSettings;
    });
  }, []);

  return { settings, updateSettings };
};

export { DEFAULT_READING_SETTINGS,ReadingSettingsPanel };