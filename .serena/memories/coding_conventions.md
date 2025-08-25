# 코딩 컨벤션 및 스타일 가이드

## TypeScript 설정
- **strict 모드** 활성화
- **any 타입** 사용 금지 (ESLint warn 설정)
- **type imports** 필수 (`import type` 사용)
- 화살표 함수 우선 사용

## ESLint 규칙
- **unused variables** 에러 처리
- **console.log** 금지 (warn, error, info만 허용)
- **self-closing components** 강제
- **import sorting** 자동 정렬
- **padding between return** 강제

## React 컨벤션
- 함수형 컴포넌트 사용
- React 19 기능 활용
- `'use client'` 디렉티브 필요 시에만 사용
- PropTypes 사용 안 함 (TypeScript 사용)

## 파일 네이밍
- 컴포넌트: PascalCase (예: `UserProfile.tsx`)
- 훅: camelCase + use 접두사 (예: `useAuth.ts`)
- 유틸리티: camelCase (예: `formatDate.ts`)
- 타입: PascalCase (예: `User.ts`)

## Import 순서 (simple-import-sort)
1. Node.js 내장 모듈
2. 외부 라이브러리
3. 내부 절대 경로 (`@/`)
4. 상대 경로 (`./`, `../`)

## 국제화 (i18n)
- 하드코딩된 텍스트 금지
- `useTranslations` 훅 사용
- 키는 `messages/*.json`에 정의