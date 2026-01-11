import fs from 'fs-extra';
import path from 'path';
import archiver from 'archiver';
import extract from 'extract-zip';

const STAGING_DIR = path.join(process.cwd(), 'staging');

interface BuilderOptions {
  slug: string;
  version: string;
  type: string; // 'plugin' | 'theme'
  inputPath: string; // The temp folder path
  isLatest: boolean; // Passed from the Worker
}

interface BuilderResult {
  success: boolean;
  zipPath: string;
  sourcePath: string | null; // Null if not extracted
}

// --- Helper: Zip Folder ---
function zipFolder(sourceDir: string, outPath: string, rootName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));

    archive.pipe(output);
    
    // Create structure: download.zip -> {slug} -> files
    archive.directory(sourceDir, rootName || false); 
    
    archive.finalize();
  });
}

// --- MAIN BUILDER FUNCTION ---
export async function buildItem(options: BuilderOptions): Promise<BuilderResult> {
  const { slug, version, type, inputPath, isLatest } = options;

  // 1. Define Paths
  // staging/{type}/{slug}/{version}/
  const versionDir = path.join(STAGING_DIR, type, slug, version);
  const zipPath = path.join(versionDir, 'download.zip');
  const sourceDir = path.join(versionDir, 'source');

  // Safety Check
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Builder Error: Missing temp files at ${inputPath}`);
  }

  await fs.ensureDir(versionDir);

  // 2. Create Zip
  // We use the slug as the root folder name inside the zip
  await zipFolder(inputPath, zipPath, slug);

  // 3. Extract Source (Only if Latest)
  if (isLatest) {
    // Clean previous source if exists to avoid conflicts
    await fs.remove(sourceDir);
    await fs.ensureDir(sourceDir);
    
    // Extract the zip we just made (ensures consistency)
    await extract(zipPath, { dir: sourceDir });
    
    return { success: true, zipPath, sourcePath: sourceDir };
  }

  // If not latest, we don't extract source
  return { success: true, zipPath, sourcePath: null };
}