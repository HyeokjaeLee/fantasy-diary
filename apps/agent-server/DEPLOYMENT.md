# Agent Server Cloud Run Jobs Deployment Guide

이 문서는 `apps/agent-server`를 Google Cloud Run Jobs에 배포하기 위한 설정 가이드입니다.

## 사전 요구사항

- Google Cloud 프로젝트
- GitHub Repository
- gcloud CLI 설치 및 설정

---

## 1. Google Cloud 설정

### 1.1 필수 API 활성화

```bash
# 프로젝트 ID 설정
export PROJECT_ID="your-project-id"
gcloud config set project $PROJECT_ID

# 필수 API 활성화
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com
```

### 1.2 Artifact Registry 생성

Docker 이미지를 저장할 Artifact Registry를 생성합니다:

```bash
# Docker 리포지토리 생성
gcloud artifacts repositories create agent-server \
  --repository-format=docker \
  --location=asia-northeast3 \
  --description="Agent Server Docker images"
```

### 1.3 서비스 계정 생성

```bash
# 서비스 계정 생성
gcloud iam service-accounts create agent-server-sa \
  --display-name="Agent Server Cloud Run Job Service Account"

# 서비스 계정 이메일 저장
SERVICE_ACCOUNT_EMAIL="agent-server-sa@${PROJECT_ID}.iam.gserviceaccount.com"
```

### 1.4 IAM 권한 부여

서비스 계정에 필요한 권한을 부여합니다:

```bash
 # Cloud Run 관리자 권한
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/run.admin"

# Artifact Registry 읽기/쓰기 권한
gcloud artifacts repositories add-iam-policy-binding agent-server \
  --location=asia-northeast3 \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/artifactregistry.writer"

# Cloud Storage 접근 권한 (로그 등)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/storage.objectAdmin"

# Secret Manager 접근 권한 (선택 - 환경변수를 Secret Manager에서 관리할 경우)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/secretmanager.secretAccessor"
```

### 1.5 Workload Identity Federation 설정

GitHub Actions가 서비스 계정 키 없이 인증할 수 있도록 Workload Identity Federation을 설정합니다:

```bash
# Workload Identity Pool 생성
gcloud iam workload-identity-pools create github-actions-pool \
  --project=$PROJECT_ID \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Workload Identity Pool Provider 생성
# 주의: GITHUB_REPOSITORY를 실제 저장소로 변경하세요 (예: username/fantasy-diary)
export GITHUB_REPOSITORY="your-username/fantasy-diary"

gcloud iam workload-identity-pools providers create github-provider \
  --project=$PROJECT_ID \
  --location="global" \
  --workload-identity-pool="github-actions-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# 서비스 계정과 Workload Identity 연결
gcloud iam service-accounts add-iam-policy-binding $SERVICE_ACCOUNT_EMAIL \
  --project=$PROJECT_ID \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_ID/locations/global/workloadIdentityPools/github-actions-pool/attribute.repository/${GITHUB_REPOSITORY}"

# Workload Identity Provider 정보 저장 (나중에 GitHub Secrets에 추가)
WORKLOAD_IDENTITY_PROVIDER="projects/$PROJECT_ID/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider"
echo "Workload Identity Provider: $WORKLOAD_IDENTITY_PROVIDER"
echo "Service Account Email: $SERVICE_ACCOUNT_EMAIL"
```

---

## 2. GitHub 설정

### 2.1 GitHub Secrets 추가

GitHub Repository → Settings → Secrets and variables → Actions에서 다음 시크릿을 추가하세요:

#### 필수 Secrets (Secrets)

| Name | Description | Example |
|------|-------------|---------|
| `WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Provider 전체 경로 | `projects/123456789/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider` |
| `SERVICE_ACCOUNT_EMAIL` | 서비스 계정 이메일 | `agent-server-sa@your-project.iam.gserviceaccount.com` |
| `GEMINI_API_KEY` | Google Gemini API 키 | `AIzaSy...` |
| `GOOGLE_API_KEY` | Google API 키 (Gemini API와 동일) | `AIzaSy...` |
| `SUPABASE_PROJECT_ID` | Supabase 프로젝트 ID | `abcdefgh` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key | `eyJhbGci...` |

#### 선택적 Secrets

| Name | Description |
|------|-------------|
| `SUPABASE_SECRET_KEY` | Supabase Secret Key (SERVICE_ROLE_KEY와 둘 중 하나만 필요) |

### 2.2 GitHub Variables 추가

GitHub Repository → Settings → Secrets and variables → Actions → Variables에서 다음 변수를 추가하세요:

| Name | Description | Default |
|------|-------------|---------|
| `GCP_PROJECT_ID` | Google Cloud 프로젝트 ID | `your-project-id` |
| `GCP_REGION` | Cloud Run 리전 | `asia-northeast3` |
| `ARTIFACT_REGISTRY` | Artifact Registry 경로 | `your-project-id-docker.pkg.dev` |
| `GEMINI_MODEL` | Gemini 모델명 (선택) | `gemini-3-flash-preview` |
| `GEMINI_EMBEDDING_MODEL` | Gemini 임베딩 모델 (선택) | `text-embedding-004` |

---

## 3. 배포 실행

### 3.1 자동 배포

`main` 브랜치에 코드를 푸시하면 자동으로 배포가 시작됩니다:

```bash
git add .
git commit -m "Deploy agent server"
git push origin main
```

### 3.2 수동 배포

GitHub Actions 탭에서 `Deploy Agent Server to Cloud Run Jobs` 워크플로우를 수동으로 실행할 수 있습니다.

### 3.3 배포 확인

GitHub Actions 실행이 완료되면:
1. Workflow 실행 페이지의 Summary에서 Job URL을 확인
2. Google Cloud Console → Cloud Run Jobs에서 Job 상태 확인

---

## 4. Cloud Run Job 실행

### 4.1 Console에서 실행

```bash
# Job 실행
gcloud run jobs execute agent-server --region=asia-northeast3

# 실행 내역 확인
gcloud run jobs executions list agent-server --region=asia-northeast3

# 특정 실행 로그 확인
gcloud run jobs executions logs <EXECUTION_ID> \
  --region=asia-northeast3 \
  --job=agent-server
```

### 4.2 NOVEL_ID 환경변수 전달

Job 실행 시 novel ID를 전달하려면:

```bash
gcloud run jobs execute agent-server \
  --region=asia-northeast3 \
  --args="--novel-id=your-novel-uuid"
```

또는 환경변수로 전달:

```bash
gcloud run jobs execute agent-server \
  --region=asia-northeast3 \
  --set-env-vars=NOVEL_ID=your-novel-uuid
```

---

## 5. Cloud Scheduler 설정 (선택)

정기적으로 Job을 실행하려면 Cloud Scheduler를 설정하세요:

```bash
# Scheduler 생성 (매일 오전 9시 실행)
gcloud scheduler jobs create http agent-server-scheduler \
  --schedule="0 9 * * *" \
  --time-zone="Asia/Seoul" \
  --location=asia-northeast3 \
  --uri=$(gcloud run jobs describe agent-server --region=asia-northeast3 --format="value(url)")/run \
  --http-method=POST \
  --oauth-service-account-email=$SERVICE_ACCOUNT_EMAIL
```

---

## 6. 문제 해결

### 6.1 권한 관련 오류

```
ERROR: (gcloud.run.jobs.update) Permission 'run.services.update' denied
```

**해결:** 서비스 계정에 `roles/run.admin` 역할이 부여되었는지 확인하세요.

### 6.2 인증 오류

```
Error: Could not authenticate with Google Cloud
```

**해결:**
1. Workload Identity Provider 경로가 올바른지 확인
2. GitHub Repository 이름이 정확한지 확인
3. 서비스 계정에 `roles/iam.workloadIdentityUser` 역할이 있는지 확인

### 6.3 Docker 푸시 실패

```
Error: failed to push image
```

**해결:**
1. Artifact Registry가 생성되었는지 확인
2. 서비스 계정에 `roles/artifactregistry.writer` 역할이 있는지 확인
3. 이미지 태그가 올바른지 확인

---

## 7. 참고 자료

- [Cloud Run Jobs 문서](https://cloud.google.com/run/docs/create-jobs)
- [Workload Identity Federation 가이드](https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
- [Google GitHub Actions Auth](https://github.com/google-github-actions/auth)
