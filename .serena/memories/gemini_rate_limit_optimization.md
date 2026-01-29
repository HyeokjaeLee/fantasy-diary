# Gemini API 429 Rate Limit 최적화 방법

## 문제 분석
- 현재 프로젝트에서 순차적 에피소드 생성 시 429 에러频繁 발생
- Free tier 제한: 5-15 RPM, 125,000 TPM, 250 RPD
- Episode 생성 시 여러 Gemini API 호출이 필요 (embed, extract entities, generate content)

## 최적화 방법

### 1. Context Caching
- **목적**: 반복적으로 사용되는 system instruction과 context를 cache로 저장
- **구현**: client.caches.create()를 사용하여 1시간 TTL cache 생성
- **효과**: cached_content_token_count가 billing에서 제외되어 실제 비용 절감
- **적용 대상**: story bible, character data, recurring system instructions

### 2. Batch API 활용
- **목적**: 여러 개별 API 호출을 하나의 batch로 묶어서 처리
- **장점**: 별도의 rate limit 적용, 최대 100개 concurrent batch
- **구현**: batch.generateContent()에 여러 requests를 한 번에 전송
- **적용 대상**: episode chunks, multiple generation requests

### 3. Exponential Backoff with Jitter 개선
- **현재**: baseDelayMs = 3000, jitter = Math.floor(Math.random() * 500)
- **개선**: 
  - Jitter 범위 확대 (0-1000ms)
  - Base delay 조정 (5s로 증가)
  - Server-side retry-after header 처리
- **최대 지연**: 120초 (2분)

### 4. Session 재사용
- **목적**: Chat session을 유지하여 매번 초기화 비용 제거
- **구현**: chats.create() session 재사용
- **효과**: System instruction 전송 비용 절감

### 5. Request 병렬 처리 제어
- **현재**: 순차 처리로 인한 효율 저하
- **개선**: 적절한 병렬 처리 도입 (rate limit에 맞춰)
- **고려사항**: TPM 제한에 따른 동시성 조절

### 6. Token 사용 최적화
- **목적**: 불필요한 token 사용 줄이기
- **방법**:
  - Compact system instruction 사용
  - Response schema로 불필요한 출력 제한
  - JSON-only 모드 활용
  - Metadata와 content 분리

## 구현 우선순위
1. **고정도**: Context caching 적용 (가장 큰 효과)
2. **중간도**: Batch API 도입
3. **단기도**: Backoff 전략 개선 및 session 재사용

## 측정 지표
- API call frequency (calls/minute)
- Token usage rate (tokens/minute) 
- 429 error rate (errors/hour)
- Cache hit ratio (%)
- Batch job success rate (%)