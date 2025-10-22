import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: './__generated__/supabase/openapi.json',
  output: './__generated__/supabase',
  plugins: [
    '@hey-api/client-next',
    'zod',
    {
      name: '@hey-api/sdk',
      validator: 'zod',
    },
  ],
});
