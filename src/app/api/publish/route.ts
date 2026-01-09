// src/app/api/publish/route.ts
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import { supabase } from '@/lib/db'; // Your direct DB client
import { uploadFileToR2, uploadSourceDirectory, buckets } from '@/lib/r2';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, version, type, name, author, authorUrl } = body;

    if (!slug || !version || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. LOCATE FILES (Staging Folder)
    const stagingBase = path.join(process.cwd(), 'staging', type, slug, version);
    const zipPath = path.join(stagingBase, 'download.zip');
    const bannerPath = path.join(stagingBase, 'banner.png');
    const treePath = path.join(stagingBase, 'tree.json');
    const sourceDir = path.join(stagingBase, 'source');

    if (!fs.existsSync(zipPath)) {
      return NextResponse.json({ error: 'Staging artifacts not found. Analyze first.' }, { status: 404 });
    }

    console.log(`🚀 PUBLISHING: ${slug} v${version} to ${process.env.TARGET_ENV}`);

    // 2. UPLOAD TO R2 (Parallel Uploads)
    // Remote Paths
    const remoteBase = `${type}s/${slug}/${version}`; // plugins/slug/1.0.0
    
    // Upload Tasks
    const uploadTasks = [
      // A. ZIP (Private Bucket)
      uploadFileToR2(zipPath, buckets.private, `${remoteBase}/download.zip`, 'application/zip'),
      
      // B. TREE JSON (Private Bucket)
      uploadFileToR2(treePath, buckets.private, `${remoteBase}/tree.json`, 'application/json'),
      
      // C. BANNER (Public Bucket)
      uploadFileToR2(bannerPath, buckets.public, `${remoteBase}/banner.png`, 'image/png'),
    ];

    // Wait for main files
    const [zipKey, treeKey, bannerUrl] = await Promise.all(uploadTasks);

    // D. SOURCE DIRECTORY (Background / Recursive)
    // We upload this, but we don't necessarily block the DB update if it takes too long, 
    // BUT for consistency, let's await it.
    if (fs.existsSync(sourceDir)) {
      await uploadSourceDirectory(sourceDir, `${remoteBase}/source`);
    }

    // 3. UPDATE DATABASE / API
    const targetEnv = process.env.TARGET_ENV || 'staging';
    
    // Construct final URLs
    const r2Data = {
      downloadUrl: zipKey,       // stored as relative key usually
      image: bannerUrl,          // stored as full public URL
      sourceUrl: `${remoteBase}/source`
    };

    if (targetEnv === 'production') {
      // --- PRODUCTION: CALL API ---
      const apiPayload = {
        slug,
        name,
        type: type.toUpperCase(), // API expects 'PLUGIN' or 'THEME'
        author,
        authorUrl,
        version,
        downloadUrl: r2Data.downloadUrl,
        image: r2Data.image,
      };

      await axios.post(process.env.PROD_API_URL!, apiPayload, {
        headers: {
          'x-admin-secret': process.env.PROD_API_SECRET,
          'Content-Type': 'application/json'
        }
      });

    } else {
      // --- STAGING: DIRECT DB WRITE ---
      // 1. Upsert Product
      const { data: product, error: prodError } = await supabase
        .from('Product')
        .upsert({
          slug,
          name,
          type: type.toUpperCase(),
          author: author || 'Unknown',
          authorUrl: authorUrl,
          latestVersion: version,
          image: r2Data.image,
          lastUpdatedAt: new Date().toISOString(),
        }, { onConflict: 'slug' })
        .select('id')
        .single();

      if (prodError) throw new Error(`DB Product Error: ${prodError.message}`);

      // 2. Insert Version
      const { error: verError } = await supabase
        .from('ProductVersion')
        .insert({
          productId: product.id,
          versionNumber: version,
          downloadUrl: r2Data.downloadUrl,
          updatedOn: new Date().toISOString()
        });
        
      if (verError) throw new Error(`DB Version Error: ${verError.message}`);
    }

    // 4. CLEANUP (Optional)
    // fs.removeSync(stagingBase); // Uncomment to save space

    return NextResponse.json({ success: true, env: targetEnv });

  } catch (error: any) {
    console.error('PUBLISH ERROR:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}