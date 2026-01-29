직전 출력(JSON)이 스키마 검증에 실패했다.
아래 에러를 참고해서, 반드시 스키마에 맞는 JSON만 다시 출력해라.
- 코드펜스/마크다운/설명 금지. JSON 객체 1개만 출력.
- story_time은 이 단계에서 출력하지 않는다. story_time 메타데이터는 별도 단계에서 추출한다.

스키마:
{
  "episode_content": string,
  "resolved_plot_seed_ids"?: string[],
  "entities"?: {
    "characters": any[],
    "locations": any[],
    "plot_seeds": any[]
  }
}

{{issues}}
