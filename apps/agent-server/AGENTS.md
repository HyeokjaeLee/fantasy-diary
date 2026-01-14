# Agent Server 개요

이 워크스페이스는 **Google Gemini**를 활용하여 소설을 생성하고 발행하는 핵심 에이전트 서버입니다.

## 역할 및 목적

- **소설 생성**: 사용자의 입력이나 테마를 바탕으로 Gemini AI 모델을 사용하여 소설의 시놉시스, 본문, 등장인물 등을 생성합니다.
- **콘텐츠 정제**: 생성된 텍스트를 서비스 규격에 맞게 가공하고 검수합니다.
- **발행 관리**: 완성된 소설을 데이터베이스(Supabase 등)에 저장하고 외부에 제공합니다.

## 인프라 및 배포

- **Runtime**: Bun
- **Cloud Platform**: Google Cloud Run Jobs + Cloud Scheduler
- **DB**: Supabase (Postgres)
