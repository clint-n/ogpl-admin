// src/app/item/[id]/page.tsx

import { PrismaClient } from '@prisma/client';
import ReviewItemForm from '@/components/forms/review-item-form';
import Link from 'next/link';

const prisma = new PrismaClient();

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const item = await prisma.item.findUnique({
    where: { id }
  });

  if (!item) {
    return <div className="text-white p-10">Item not found</div>;
  }

  const metadata = item.metadata ? JSON.parse(item.metadata) : {};

  const formProps = {
    id: item.id,
    originalName: item.originalName,
    slug: item.slug || metadata.slug || '',
    name: metadata.name || '',
    version: item.version || metadata.version || '',
    author: metadata.author || '',
    authorUrl: metadata.authorUrl || '',
    type: (item.type || metadata.type || 'plugin') as 'plugin' | 'theme',
    score: item.score,
    reason: item.analysisLogs || '',
    status: item.status,

    // --- NEW: Pass Version Status ---
    // If 'isNewer' is undefined in metadata, we assume TRUE (safer to upload than skip)
    // But if it is explicitly false (stored by analyzer), we pass false.
    isNewer: metadata.isNewer ?? true, 
    remoteVersion: metadata.remoteVersion || null
    // --------------------------------
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      {/* ... header ... */}
      <div className="max-w-3xl mx-auto mb-6">
        <Link href="/" className="text-gray-500 hover:text-white transition-colors text-sm mb-4 inline-block">
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold">Review Item</h1>
      </div>
      
      <ReviewItemForm data={formProps} />
    </main>
  );
}