직전 출력(JSON)이 스키마 검증에 실패했다.
아래 에러를 참고해서, 반드시 스키마에 맞는 JSON만 다시 출력해라.
- 코드펜스/마크다운/설명 금지. JSON 객체 1개만 출력.
- story_time은 KST(+09:00) 오프셋이 포함된 ISO 8601 timestamp로 써라.

스키마:
{
  "episode_content": string,
  "story_time": string,
  "resolved_plot_seed_ids"?: string[]
}

{{issues}}
