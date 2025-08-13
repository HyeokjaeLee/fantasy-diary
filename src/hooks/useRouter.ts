import { usePathname, useRouter as useNextRouter } from 'next/navigation';
import type { RouterInputs } from 'next-typesafe-url';
import { useRouteParams, useSearchParams } from 'next-typesafe-url/app';

export const useRouter = () => {
  const router = useNextRouter();

  return router;
};
