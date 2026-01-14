# 서비스 개요

이 프로젝트는 AI를 통해 소설을 발행하는 서비스입니다.

# Bun 가이드라인

이 프로젝트는 Node.js 대신 **Bun**을 기본 런타임 및 패키지 매니저로 사용합니다.

## 기본 원칙

- `node <file>` 또는 `ts-node <file>` 대신 `bun <file>`을 사용하세요.
- `jest` 또는 `vitest` 대신 `bun test`를 사용하세요.
- `webpack` 또는 `esbuild` 대신 `bun build <file.html|file.ts|file.css>`를 사용하세요.
- `npm install`, `yarn install`, `pnpm install` 대신 `bun install`을 사용하세요.
- `npm run <script>`, `yarn run <script>`, `pnpm run <script>` 대신 `bun run <script>`를 사용하세요.
- Bun은 `.env`를 자동으로 로드하므로 `dotenv`를 사용하지 마세요.

## API 사용

- `Bun.serve()`는 WebSocket, HTTPS, 라우팅을 지원합니다. `express`를 사용하지 마세요.
- SQLite에는 `bun:sqlite`를 사용하세요. `better-sqlite3`를 사용하지 마세요.
- Redis에는 `Bun.redis`를 사용하세요. `ioredis`를 사용하지 마세요.
- Postgres에는 `Bun.sql`를 사용하세요. `pg` 또는 `postgres.js`를 사용하지 마세요.
- `WebSocket`은 내장되어 있습니다. `ws`를 사용하지 마세요.
- `node:fs`의 `readFile`/`writeFile` 대신 `Bun.file`을 권장합니다.
- execa 대신 `Bun.$`를 사용하세요.

## 테스팅

테스트를 실행하려면 `bun test`를 사용하세요.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## 프론트엔드

`Bun.serve()`와 함께 HTML import를 사용하세요. `vite`를 사용하지 마세요. HTML import는 React, CSS, Tailwind를 완벽하게 지원합니다.

서버:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // 선택적 websocket 지원
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // close 핸들링
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML 파일은 `.tsx`, `.jsx`, `.js` 파일을 직접 로드할 수 있으며 Bun의 번들러가 자동으로 트랜스파일 및 번들링합니다. `<link>` 태그는 스타일시트를 가리킬 수 있으며 Bun의 CSS 번들러가 이를 처리합니다.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

다음과 같은 `frontend.tsx`를 사용하는 경우:

```tsx#frontend.tsx
import React from "react";

// .css 파일을 직접 import하면 작동합니다
import './index.css';

import { createRoot } from "react-dom/client";

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

그 후, index.ts를 실행합니다.

```sh
bun --hot ./index.ts
```

더 자세한 정보는 `node_modules/bun-types/docs/**.md`에 있는 Bun API 문서를 참조하세요.
