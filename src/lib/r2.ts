// src/lib/r2.ts
import fs from 'fs-extra';
import path from 'path';
import mime from 'mime-types';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// --- LAZY INITIALIZATION ---
// We don't initialize R2 immediately. We do it inside a function.
let R2_CLIENT: S3Client | null = null;

function getR2Client() {
  if (R2_CLIENT) return R2_CLIENT;

  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('❌ Missing R2 Environment Variables');
  }

  R2_CLIENT = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  return R2_CLIENT;
}

// --- HELPERS ---

function getAllFiles(dir: string, fileList: { fullPath: string, relativeKey: string }[] = [], rootDir: string | null = null) {
  if (!rootDir) rootDir = dir;
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (['node_modules', '.git', '__macosx', '.DS_Store'].includes(file)) continue;

    if (stat.isDirectory()) {
      getAllFiles(fullPath, fileList, rootDir);
    } else {
      const ext = path.extname(file).toLowerCase();
      // Expanded allowed list
      const ALLOWED_EXTS = ['.php', '.js', '.css', '.html', '.json', '.xml', '.txt', '.md', '.scss', '.less', '.woff', '.woff2', '.png', '.jpg', '.svg', '.zip'];
      
      if (ALLOWED_EXTS.includes(ext)) {
        fileList.push({
          fullPath,
          relativeKey: path.relative(rootDir, fullPath).replace(/\\/g, '/')
        });
      }
    }
  }
  return fileList;
}

// --- EXPORTED FUNCTIONS ---

export async function uploadFileToR2(
  localPath: string, 
  bucket: string, 
  key: string, 
  contentType?: string
): Promise<string> {
  if (!fs.existsSync(localPath)) throw new Error(`File missing: ${localPath}`);

  const R2 = getR2Client(); // <--- Initialize here, at runtime
  const fileBuffer = await fs.readFile(localPath);
  const type = contentType || mime.lookup(localPath) || 'application/octet-stream';

  await R2.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileBuffer,
    ContentType: type,
  }));

  if (bucket === process.env.R2_PUBLIC_BUCKET) {
    // Ensure you have a domain set, or fallback to R2 dev URL
    return `https://assets.opengpl.io/${key}`; 
  }
  return key;
}

export async function uploadSourceDirectory(sourceDir: string, remotePrefix: string): Promise<void> {
  console.log(`📂 Uploading source directory from: ${sourceDir}`);
  const R2 = getR2Client(); // <--- Initialize here
  
  const allFiles = getAllFiles(sourceDir);
  console.log(`   Found ${allFiles.length} files to upload.`);

  const CHUNK_SIZE = 20;
  for (let i = 0; i < allFiles.length; i += CHUNK_SIZE) {
    const chunk = allFiles.slice(i, i + CHUNK_SIZE);
    
    await Promise.all(chunk.map(async (file) => {
      const key = `${remotePrefix}/${file.relativeKey}`;
      try {
        const buffer = await fs.readFile(file.fullPath);
        await R2.send(new PutObjectCommand({
            Bucket: process.env.R2_PRIVATE_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: mime.lookup(file.fullPath) || 'application/octet-stream'
        }));
      } catch (err) {
        console.error(`Failed to upload ${file.relativeKey}`, err);
      }
    }));
  }
}

// Safe Export for buckets
export const buckets = {
  get public() { return process.env.R2_PUBLIC_BUCKET || '' },
  get private() { return process.env.R2_PRIVATE_BUCKET || '' }
};