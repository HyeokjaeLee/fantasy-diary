# 개발 명령어 가이드

## 기본 개발 명령어
```bash
# 개발 서버 실행 (Hot reload + Turbopack)
bun dev

# 프로덕션 빌드
bun build

# 프로덕션 서버 실행
bun start
```

## 코드 품질 도구
```bash
# ESLint 실행
bun lint

# 테스트 실행
bun test

# 테스트 Watch 모드
bun test:watch

# CI용 테스트 실행
bun test:ci
```

## 시스템 명령어 (macOS)
```bash
# 파일 검색
find . -name "*.tsx" -type f

# 패턴 검색 (ripgrep 권장)
rg "pattern" --type tsx

# Git 명령어
git status
git add .
git commit -m "message"
```

## 개발 워크플로우
1. `bun dev` 로 개발 서버 실행
2. 코드 작성
3. `bun lint` 로 코드 품질 검사
4. `bun test` 로 테스트 실행
5. Git commit 전에 모든 검사 통과 확인