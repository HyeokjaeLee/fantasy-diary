# 권장 명령어 (Suggested Commands)

## 의존성 관리
```bash
bun install
```

## 개발 서버 실행
- **Web App**: `cd apps/web && bun dev` (Next.js 3019 포트)
- **Agent Server**: `cd apps/agent-server && bun dev`

## 코드 품질 관리
- **전체 린트 수정**: `bun run lint:fix` (각 패키지 내 정의됨)
- **타입 체크**: `bun run typecheck`

## 유틸리티
- **Supabase 타입 생성**: `cd packages/shared && bun run gen:types`
- **API 생성**: `cd packages/shared && bun run gen:api`
