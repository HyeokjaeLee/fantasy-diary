# Agent Server 개요

이 워크스페이스는 **Google Gemini**를 활용해 소설을 생성하고 발행하는 핵심 에이전트 서버입니다.

## 역할 및 목적

- **소설 생성**: RAG 컨텍스트 + 소설 메타데이터를 이용해 다음 회차 본문 생성
- **콘텐츠 검수**: Reviewer 에이전트가 문체/정합성/중복 표현을 검증
- **발행 관리**: 에피소드/인물/장소를 Supabase에 저장

## 실행 및 진입점

- 진입점: `apps/agent-server/src/index.ts`
- 실행: `bun --hot src/index.ts`
- 단일 회차 생성: `bun run src/index.ts <uuid>`

## 워크플로

- `generateEpisodeWorkflow`가 전체 플로우를 담당
  1. novel/episodes/characters/locations 로드
  2. Writer 에이전트가 초안 생성 (Zod 검증)
  3. Reviewer 에이전트가 승인/피드백
  4. 승인 시 에피소드 저장 + 임베딩 저장
  5. 신규 인물/장소 업서트 및 조인 테이블 저장

## 에이전트 구성

- Writer: `apps/agent-server/src/agents/writerAgent.ts`
- Reviewer: `apps/agent-server/src/agents/reviewerAgent.ts`
- Gemini 호출/백오프: `apps/agent-server/src/lib/genai.ts`, `apps/agent-server/src/lib/backoff.ts`

## 모델 및 환경 변수

- 기본 모델: `gemini-3-flash-preview`
- 기본 임베딩 모델: `text-embedding-004`
- 환경 변수:
  - `GEMINI_API_KEY` 또는 `GOOGLE_API_KEY`
  - `GEMINI_MODEL` (옵션)
  - `GEMINI_EMBEDDING_MODEL` (옵션)
  - `SUPABASE_PROJECT_ID`
  - `SUPABASE_SECRET_KEY` 또는 `SUPABASE_SERVICE_ROLE_KEY`

## 데이터베이스 구조

- 테이블: `novels`, `episodes`, `characters`, `locations`, `episode_characters`, `episode_locations`
- 타입/Zod 갱신: `cd packages/shared && bun run supabase:types`

## 에러 처리

- `AgentError`를 사용해 에러 타입/코드를 통일
- LLM 파싱 실패는 `PARSE_ERROR.INVALID_JSON/INVALID_SHAPE`로 처리
- 외부 API 실패는 `UPSTREAM_API_ERROR.*`로 래핑

## 인프라 및 배포

- **Runtime**: Bun
- **Cloud Platform**: Google Cloud Run Jobs + Cloud Scheduler
- **DB**: Supabase (Postgres)
