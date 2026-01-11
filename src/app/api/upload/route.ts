import { NextResponse } from 'next/server';
import { addToQueue } from '@/lib/queue';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs-extra';
import { pipeline } from 'stream';
import { promisify } from 'util';

const pump = promisify(pipeline);
const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const mode = formData.get('mode') as string || 'create';

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // 1. Prepare Save Location
    // We save the uploaded zip to a specific "uploads" folder first
    const uploadId = Math.random().toString(36).substring(7);
    const fileName = file.name; // e.g. "elementor.zip"
    const uploadDir = path.join(process.cwd(), 'temp', 'uploads');
    const savePath = path.join(uploadDir, `${uploadId}-${fileName}`);
    
    // Create temp/uploads if it doesn't exist
    await fs.ensureDir(uploadDir);

    // 2. Write File to Disk (Stream)
    // We convert the Web File stream to a Node.js WriteStream
    // @ts-ignore
    const stream = file.stream();
    // @ts-ignore
    await pump(stream, fs.createWriteStream(savePath));

    // 3. Define where to Extract later
    const extractDir = path.resolve(process.cwd(), 'temp', `${uploadId}-extracted`);

    // 4. Create DB Entry
    const item = await prisma.item.create({
      data: {
        originalName: fileName,
        zipPath: savePath, // We point to the new saved file
        extractPath: extractDir,
        status: 'pending',
        score: 0,
        metadata: JSON.stringify({ mode })
      }
    });

    // 5. Add to Queue
    await addToQueue({
      jobId: item.id,
      action: 'analyze',
      payload: {
        zipPath: savePath,
        tempDir: extractDir,
        id: item.id,
        checkRemote: mode === 'update'
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Upload successful, Analysis started', 
      jobId: item.id 
    });

  } catch (error: any) {
    console.error("Upload Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}