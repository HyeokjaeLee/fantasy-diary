import { getFantasyDiaryEntries } from '@supabase-api/sdk.gen';

type PageProps = {
  params: Promise<{ locale: string; title: string; id: string }>;
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function DiaryPage({ params }: PageProps) {
  const { id } = await params;

  const { data, error } = await getFantasyDiaryEntries();

  return <article style={{ display: 'grid', gap: 16 }}>sss</article>;
}
