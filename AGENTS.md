# Repository AGENTS Guide

이 문서는 이 저장소에서 자동화 에이전트가 작업할 때 지켜야 할 기준을 정리한 것입니다.
프로젝트 전반 규칙이며, 각 앱/패키지의 AGENTS.md와 함께 참고하세요.

## 기본 원칙

- 런타임/패키지 매니저는 Bun을 기본으로 사용합니다.
- `.env`는 Bun이 자동 로드하므로 `dotenv`를 추가하지 않습니다.
- 작업은 최소 변경 원칙을 따릅니다.

## 주요 패키지/앱 개요

- `apps/agent-server`: Gemini 기반 소설 생성/발행 서버, Cloud Run Job 대상
- `apps/web`: Next.js 16 프론트엔드
- `packages/shared`: 공통 유틸/타입/Supabase 클라이언트
- `packages/configs`: ESLint/Prettier/TS 설정 모음

## 빌드/린트/테스트 명령어

루트 기준:

- 전체 빌드: `bun run build`
- 전체 린트: `bun run lint`
- 전체 린트 자동수정: `bun run lint:fix`
- 전체 테스트: `bun test`
- 단일 테스트: `bun test path/to/file.test.ts`

agent-server (`apps/agent-server`):

- 개발: `bun --hot src/index.ts`
- 린트: `bun run lint`
- 린트 자동수정: `bun run lint:fix`
- 타입체크: `bun run typecheck`

web (`apps/web`):

- 개발: `bun run dev`
- 빌드: `bun run build`
- 시작: `bun run start`
- 린트: `bun run lint`
- 타입체크: `bun run typecheck`

shared (`packages/shared`):

- 린트: `bun run lint`
- 타입체크: `bun run typecheck`
- Supabase 타입/Zod 생성: `bun run supabase:types`

## 단일 테스트 실행

- 기본: `bun test path/to/specific.test.ts`
- 파일명이 `.test` 또는 `.spec` 패턴이어야 인식됩니다.

## 코드 스타일 및 포맷

Prettier 설정 (`packages/configs/prettier.config.js`):

- `singleQuote: true`, `semi: true`
- `tabWidth: 2`, `trailingComma: 'all'`, `printWidth: 100`

ESLint 설정 (`packages/configs/eslint.config.mjs`) 주요 규칙:

- 타입 임포트는 `import type` 사용 (`@typescript-eslint/consistent-type-imports`)
- `no-unused-vars`는 TS 규칙 사용, 미사용 인자는 `_` prefix 허용
- `no-console`은 `warn/error/info`만 허용
- `eqeqeq` 강제
- `simple-import-sort`로 import/export 정렬 필수
- `padding-line-between-statements`: `return` 앞에 빈 줄 강제

## 네이밍/구조 가이드

- 파일/폴더: `kebab-case` 또는 기존 구조 유지
- 변수/함수: `camelCase`
- 타입/클래스/enum: `PascalCase`
- 상수: `SCREAMING_SNAKE_CASE` (필요한 경우)
- 테이블/컬럼: `snake_case`

## 타입스크립트 정책

- `strict: true`, `moduleResolution: bundler`
- `any` 사용은 최소화 (ESLint 경고)
- 타입은 `packages/shared`의 `Supabase` 타입을 우선 사용

## 에러 처리

- `apps/agent-server`는 `AgentError` 기반 에러 타입을 사용
- 외부 API/DB 실패는 `AgentError.fromUnknown()`로 래핑
- LLM 파싱 실패는 `PARSE_ERROR.INVALID_JSON/INVALID_SHAPE`로 처리

## import 스타일

- 절대 경로가 있으면 `@fantasy-diary/*` 경로를 우선 사용
- type-only는 `import type`로 분리
- import 정렬은 `simple-import-sort` 규칙을 따름

## 데이터베이스(Supabase)

- 클라이언트 생성은 `@fantasy-diary/shared/supabase` 사용
- 스키마 변경 후 `packages/shared`에서 `bun run supabase:types` 실행
- `__generated__/`는 자동 생성 결과이므로 수동 편집 금지

## 환경 변수

- `SUPABASE_PROJECT_ID`, `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY` (또는 `GOOGLE_API_KEY`), 필요 시 `GEMINI_MODEL`
- Doppler 사용 (`env:pull` 스크립트 참고)

## 금지 사항

- `node`, `npm`, `yarn`, `pnpm` 사용 금지 (Bun 사용)
- `dotenv` 추가 금지
- 자동 생성 파일 수동 수정 금지 (`__generated__`)

## 참고 파일

- `apps/agent-server/AGENTS.md`
- `apps/web/AGENTS.md`
- `packages/shared/AGENTS.md`
- `packages/configs/AGENTS.md`
