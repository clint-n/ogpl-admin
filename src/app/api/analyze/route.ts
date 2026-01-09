// src/app/api/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { analyzeZip } from '@/lib/analyzer';
import { getProductBySlug, getVersion } from '@/lib/db';
import { buildArtifacts } from '@/lib/builder';
import { generateBanner } from '@/lib/image-gen';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. ANALYZE
    const result = await analyzeZip(buffer, file.name);

    if (!result.isValid || !result.slug) {
      return NextResponse.json(result);
    }

    // 2. DB CHECK
    let dbStatus = {
      productExists: false,
      versionExists: false,
      existingProduct: null as any
    };

    const existingProduct = await getProductBySlug(result.slug!);
    if (existingProduct) {
      dbStatus.productExists = true;
      dbStatus.existingProduct = existingProduct;
      if (result.version) {
        const existingVersion = await getVersion(existingProduct.id, result.version);
        if (existingVersion) dbStatus.versionExists = true;
      }
    }

    // 3. AUTO-PROCESS IF SCORE IS 10 (AND NOT DUPLICATE VERSION)
    let buildStatus = null;
    
    if (result.score === 10 && !dbStatus.versionExists) {
      console.log(`🚀 Perfect Score (10)! Auto-building staging artifacts...`);
      
      try {
        // A. Build Zip & Tree
        const build = await buildArtifacts(result);
        
        // B. Generate Image
        await generateBanner(
            result.type!, 
            result.name || result.slug, 
            result.version!, 
            result.slug
        );

        buildStatus = {
            staged: true,
            zipPath: build.zipPath,
            bannerGenerated: true
        };
      } catch (e: any) {
          console.error("Auto-build failed:", e);
          buildStatus = { error: e.message };
      }
    }

    // 4. RETURN RESPONSE
    return NextResponse.json({
      ...result,
      dbStatus,
      buildStatus // Frontend can use this to show "Ready to Upload"
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}