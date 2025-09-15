import { useRouter as useNextRouter } from 'next/navigation';

export const useRouter = () => {
  const router = useNextRouter();

  return router;
};
