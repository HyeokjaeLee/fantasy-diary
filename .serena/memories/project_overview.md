# Fantasy Diary 프로젝트 개요

## 프로젝트 목적
매일 정해진 시간에 자동으로 발행되는 연속형 판타지 일기 소설 서비스 개발

## 기술 스택
- **프론트엔드**: Next.js 15 (App Router), React 19, TypeScript
- **스타일링**: Tailwind CSS v4
- **국제화**: next-intl v4 (한국어/영어 지원)
- **백엔드**: tRPC v11 (아직 미구현), Supabase (인증/데이터베이스)
- **검증**: Zod v4
- **패키지 매니저**: bun
- **타입 안전성**: next-typesafe-url

## 현재 구현 상태
- 기본 Next.js 15 설정 완료
- Supabase 인증 시스템 구현 (회원가입/로그인)
- 국제화 설정 (한국어/영어)
- TypeScript strict 모드 설정
- ESLint + Prettier 설정 완료
- 테스트 환경 설정 (Jest)

## 디렉터리 구조
```
src/
├── app/[locale]/          # App Router 기반 페이지
├── components/            # 재사용 컴포넌트
├── contexts/             # React Context (AuthContext)
├── hooks/                # 커스텀 훅
├── lib/                  # 유틸리티 & 라이브러리
├── types/                # TypeScript 타입 정의
├── configs/              # 설정 파일들
└── i18n/                 # 국제화 설정
```