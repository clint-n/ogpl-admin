import { PrismaClient } from '@prisma/client';
import ReviewItemForm from '@/components/forms/review-item-form';
import Link from 'next/link';

const prisma = new PrismaClient();

// TYPE DEFINITION CHANGE: params is a Promise now
export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const item = await prisma.item.findUnique({ where: { id } });

  if (!item) {
    return <div className="text-white p-10">Item not found</div>;
  }

  // Parse the metadata (this is where the Analyzer saved the Author info)
  const metadata = item.metadata ? JSON.parse(item.metadata) : {};

  // ADD THE MISSING FIELDS HERE
  const formProps = {
    id: item.id,
    originalName: item.originalName,
    slug: item.slug || metadata.slug || '',
    name: metadata.name || '',
    version: item.version || metadata.version || '',
    
    // --- NEW FIELDS ---
    author: metadata.author || '',        // <--- Add this
    authorUrl: metadata.authorUrl || '',  // <--- Add this
    // ------------------

    type: (item.type || metadata.type || 'plugin') as 'plugin' | 'theme',
    score: item.score,
    reason: item.analysisLogs || '',
    status: item.status
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
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