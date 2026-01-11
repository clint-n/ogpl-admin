import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { addToQueue } from '@/lib/queue';

const prisma = new PrismaClient();

// GET: Fetch Item Details
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // 1. Await params here
  const { id } = await params;

  const item = await prisma.item.findUnique({
    where: { id }
  });
  
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(item);
}

// POST: Manual Override & Build Trigger
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    
    
    // Destructure new 'action' field and 'forceUpload'
    const { slug, version, type, name, author, authorUrl, forceBuild, action, forceUpload, isNewer } = body; 

    // Determine Status
    let newStatus = 'needs_review';
    if (forceBuild) newStatus = 'pending'; // Build pending
    if (action === 'upload') newStatus = 'processing_upload'; // Upload pending

    const updatedItem = await prisma.item.update({
      where: { id },
      data: {
        slug,
        version,
        type,
        status: newStatus,
        metadata: JSON.stringify({ name, slug, version, type, author, authorUrl, isNewer }) 
      }
    });

    // 1. Handle Build Trigger
    if (forceBuild) {
       await addToQueue({
         jobId: updatedItem.id,
         action: 'build',
         payload: {
           slug, version, type, name,
           inputPath: updatedItem.extractPath,
           id: updatedItem.id,
           isNewer: isNewer
         }
       });
       return NextResponse.json({ success: true, message: 'Build Started' });
    }

    // 2. Handle Upload Trigger (NEW)
    if (action === 'upload') {
        await addToQueue({
            jobId: updatedItem.id,
            action: 'upload', // Trigger the new worker section
            payload: {
                slug, version, type, name, author, authorUrl,
                forceUpload: !!forceUpload, // Pass the flag
                isNewer: isNewer,
                id: updatedItem.id
            }
        });
        return NextResponse.json({ success: true, message: 'Upload Started' });
    }

    return NextResponse.json({ success: true, message: 'Item updated' });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}