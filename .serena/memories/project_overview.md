# 프로젝트 목적 및 개요
- AI를 통해 소설을 발행하는 판타지 컨셉의 일기 서비스 (Fantasy Diary)
- Bun 런타임을 기반으로 한 TypeScript 모노레포 구조

# 기술 스택
- **Runtime**: Bun
- **Frontend (apps/web)**: Next.js 16, React 19, Tailwind CSS, tRPC, TanStack Query, Radix UI (Vercel 배포)
- **Backend (apps/agent-server)**: Bun (Native API 사용 지향)
- **Shared (packages/shared)**: 애플리케이션 공통 로직, 유틸리티, Supabase 클라이언트, Zod 스키마, 공통 타입 관리 (Google Generative AI, Ky 등 활용)
- **Database**: Supabase

# 개발 규칙 및 컨벤션
- **Package Manager**: 반드시 `bun`을 사용한다.
- **Node.js API 지양**: `node:fs` 대신 `Bun.file`, `express` 대신 `Bun.serve` 등을 사용한다.
- **Next.js**: `--turbopack` 옵션을 사용하여 개발한다.
- **린트 및 타입 체킹**: 코드 수정 완료 후 `bun run lint:fix`를 실행하며, `any` 타입을 지양하고 가독성을 우선한다.

# 주요 명령어
- `bun install`: 의존성 설치
- `bun dev`: 개발 서버 실행 (apps/web, apps/agent-server 등)
- `bun run lint:fix`: 린트 수정
- `bun test`: 테스트 실행
- `bun run gen:types`: Supabase 타입 생성 (shared 패키지)
