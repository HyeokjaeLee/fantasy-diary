type PageProps = {
  params: Promise<{ locale: string; title: string; id: string }>;
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function DiaryPage({ params }: PageProps) {
  await params;

  
  return <article style={{ display: 'grid', gap: 16 }}>sss</article>;
}
