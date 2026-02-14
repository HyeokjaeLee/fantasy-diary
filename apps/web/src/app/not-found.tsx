import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl items-center px-6 py-20">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="font-display text-3xl">페이지를 찾을 수 없습니다</CardTitle>
          <CardDescription>
            요청하신 에피소드가 아직 발행되지 않았거나 이동되었습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center gap-2 border-2 border-black bg-white px-6 text-base font-semibold text-black transition hover:bg-black hover:text-white"
          >
            서재로 돌아가기
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
