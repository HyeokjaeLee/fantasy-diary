# Agent Server 개요

이 워크스페이스는 **Google Gemini**를 활용하여 소설을 생성하고 발행하는 핵심 에이전트 서버입니다.

## 역할 및 목적

- **소설 생성**: 사용자의 입력이나 테마를 바탕으로 Gemini AI 모델을 사용하여 소설의 시놉시스, 본문, 등장인물 등을 생성합니다.
- **콘텐츠 정제**: 생성된 텍스트를 서비스 규격에 맞게 가공하고 검수합니다.
- **발행 관리**: 완성된 소설을 데이터베이스(Supabase 등)에 저장하고 외부에 제공합니다.

## 인프라 및 배포

- **Runtime**: Bun
- **Cloud Platform**: Google Cloud Run Jobs + Cloud Scheduler

### 배포 방식

- 이 워크로드는 "정해진 시간에 실행 → 종료" 형태이므로 **Cloud Run Jobs**를 사용합니다.
- 정기 실행은 **Cloud Scheduler**가 Cloud Run Jobs 실행 API를 호출하여 트리거합니다.

### 전제 조건 (로컬)

- `brew install python@3.13` (google-cloud-sdk 의존)
- `brew install --cask google-cloud-sdk`
- `gcloud auth login`
- `gcloud config set project fantasy-diary`

### 배포/운영 (서울: `asia-northeast3`)

1. Artifact Registry 리포지토리 생성(1회)

- `gcloud artifacts repositories create agent-server --repository-format=docker --location=asia-northeast3 --project=fantasy-diary`

2. Cloud Build API 활성화(1회)

- `gcloud services enable cloudbuild.googleapis.com --project=fantasy-diary`

3. 빌드/푸시

- `gcloud builds submit . --project=fantasy-diary --tag=asia-northeast3-docker.pkg.dev/fantasy-diary/agent-server/agent-server:latest`

4. Cloud Run Job 생성/업데이트

- 최초 생성:
  - `gcloud run jobs create agent-server --project=fantasy-diary --region=asia-northeast3 --image=asia-northeast3-docker.pkg.dev/fantasy-diary/agent-server/agent-server:latest`
- 이미지 업데이트:
  - `gcloud run jobs update agent-server --project=fantasy-diary --region=asia-northeast3 --image=asia-northeast3-docker.pkg.dev/fantasy-diary/agent-server/agent-server:latest`

5. 수동 실행(파라미터 전달)

- `gcloud run jobs execute agent-server --project=fantasy-diary --region=asia-northeast3 --args=--kind=romance`
- JSON payload 전달 예시:
  - `gcloud run jobs execute agent-server --project=fantasy-diary --region=asia-northeast3 --args=--payload={\"seed\":123,\"length\":4000}`

6. 스케줄러(매일 22:00 KST)

- Scheduler는 `agent-server-daily`로 구성하며, 시간대는 `Asia/Seoul`을 사용합니다.
- 변경/재생성 시에는 Cloud Scheduler Job 설정을 수정합니다.

### 런타임 규칙

- 서버를 띄우지 않고( `Bun.serve()` 없음 ) 단발 실행으로 종료합니다.
- 파라미터는 `--kind` / `--payload` 같은 CLI 인자로 받습니다.
