# Planning Phase

이전 에피소드들을 분석하여 스토리 맥락을 파악하세요.

## 작업

1. episodes.list 도구로 최근 5개 에피소드 조회
2. characters.list, places.list로 기존 캐릭터와 장소 목록 조회
3. 이전 에피소드들의 주요 내용, 등장인물, 장소, 진행 상황을 요약하여 작성
4. 응답 형식:

```json
{
  "previousStory": "지금까지의 이야기 요약 (300-500자)",
  "keyCharacters": ["캐릭터1", "캐릭터2", ...],
  "keyPlaces": ["장소1", "장소2", ...]
}
```
