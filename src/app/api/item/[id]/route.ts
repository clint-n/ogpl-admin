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
    
    // Destructure new fields
    const { slug, version, type, name, author, authorUrl, forceBuild } = body; 

    const updatedItem = await prisma.item.update({
      where: { id },
      data: {
        slug,
        version,
        type,
        status: forceBuild ? 'pending' : 'needs_review', 
        // Save ALL fields to metadata
        metadata: JSON.stringify({ name, slug, version, type, author, authorUrl }) 
      }
    });

    if (forceBuild) {
       await addToQueue({
         jobId: updatedItem.id,
         action: 'build',
         payload: {
           slug,
           version,
           type,
           name,
           inputPath: updatedItem.extractPath,
           id: updatedItem.id
         }
       });
       return NextResponse.json({ success: true, message: 'Manual Build Started' });
    }

    return NextResponse.json({ success: true, message: 'Item updated' });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}