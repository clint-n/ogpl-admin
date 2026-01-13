import fs from 'fs-extra';
import path from 'path';
import archiver from 'archiver';
import extract from 'extract-zip';

const STAGING_DIR = path.join(process.cwd(), 'staging');

interface BuilderOptions {
  slug: string;
  version: string;
  type: string;
  inputPath: string;
  isLatest: boolean;
}

interface BuilderResult {
  success: boolean;
  zipPath: string;
  sourcePath: string | null;
}

// --- Helper: Zip Folder ---
function zipFolder(sourceDir: string, outPath: string, rootName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));

    archive.pipe(output);
    
    // Create structure: download.zip -> {rootName} -> files
    archive.directory(sourceDir, rootName || false); 
    
    archive.finalize();
  });
}

// --- MAIN BUILDER FUNCTION ---
export async function buildItem(options: BuilderOptions): Promise<BuilderResult> {
  let { slug, version, type, inputPath, isLatest } = options;

  // 1. Safety Check
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Builder Error: Missing temp files at ${inputPath}`);
  }

  // --- FIX: FLATTEN INPUT PATH ---
  // If inputPath contains ONLY a folder named {slug}, we assume we are one level too high.
  // We dive into it to avoid 'slug/slug/files' (Double Nesting).
  const files = await fs.readdir(inputPath);
  const visibleFiles = files.filter(f => !f.startsWith('.') && !f.startsWith('__')); // Ignore .DS_Store etc.

  if (visibleFiles.length === 1 && visibleFiles[0] === slug) {
     const nestedPath = path.join(inputPath, slug);
     const stat = await fs.stat(nestedPath);
     if (stat.isDirectory()) {
         console.log(`[Builder] Detected nested folder. Flattening input from ${inputPath} to ${nestedPath}`);
         inputPath = nestedPath; 
     }
  }
  // --------------------------------

  // 2. Define Paths
  const versionDir = path.join(STAGING_DIR, type, slug, version);
  const zipPath = path.join(versionDir, 'download.zip');
  const sourceDir = path.join(versionDir, 'source');

  await fs.ensureDir(versionDir);

  // 3. Create Zip
  // Now that inputPath is flattened, this will create: download.zip -> {slug} -> contents
  await zipFolder(inputPath, zipPath, slug);

  // 4. Extract Source (Only if Latest)
  if (isLatest) {
    await fs.remove(sourceDir);
    await fs.ensureDir(sourceDir);
    
    // Extracting the Clean Zip
    // Result: source/slug/files (Standard WP Structure)
    await extract(zipPath, { dir: sourceDir });
    
    return { success: true, zipPath, sourcePath: sourceDir };
  }

  return { success: true, zipPath, sourcePath: null };
}