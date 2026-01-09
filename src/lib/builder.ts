// src/lib/builder.ts
import fs from 'fs-extra';
import path from 'path';
import archiver from 'archiver';
import { AnalyzerResult } from './analyzer';

const STAGING_DIR = path.join(process.cwd(), 'staging');

export interface BuildResult {
  success: boolean;
  zipPath?: string;
  sourceDir?: string;
  tree?: any;
  downloadUrlKey?: string; // Standardized R2 Key
  sourceUrlKey?: string;
}

// --- HELPER: Generate JSON Tree of Source Code ---
function generateTree(dir: string, rootDir: string | null = null): any[] {
  if (!rootDir) rootDir = dir;
  const tree: any[] = [];
  
  if (!fs.existsSync(dir)) return [];
  
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
    
    // Filter junk
    if (['node_modules', '.git', '__macosx'].includes(file.toLowerCase())) continue;

    if (stat.isDirectory()) {
      const children = generateTree(fullPath, rootDir);
      if (children.length > 0) {
        tree.push({ name: file, path: relativePath, type: 'folder', children });
      }
    } else {
      tree.push({ name: file, path: relativePath, type: 'file', size: stat.size });
    }
  }
  return tree;
}

// --- HELPER: Zip Folder ---
function zipFolder(sourceDir: string, outPath: string, rootName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    
    // FIX: Add ': any' to the error parameter
    archive.on('error', (err: any) => reject(err));

    archive.pipe(output);
    // This creates the structure: download.zip/slug/files...
    archive.directory(sourceDir, rootName); 
    archive.finalize();
  });
}

// --- MAIN WORKER ---
export async function buildArtifacts(analysis: AnalyzerResult): Promise<BuildResult> {
  if (!analysis.slug || !analysis.version || !analysis.type || !analysis.internalPath) {
    throw new Error('Analysis incomplete. Cannot build.');
  }

  // 1. Define Paths
  // staging/plugin/slug/version/
  const versionDir = path.join(STAGING_DIR, analysis.type, analysis.slug, analysis.version);
  const zipPath = path.join(versionDir, 'download.zip');
  const sourceDir = path.join(versionDir, 'source');

  // Clean start
  await fs.emptyDir(versionDir);

  // 2. MOVE SOURCE
  // We move the extracted files from "temp" to "staging/source"
  // logic: copy temp/internalPath -> staging/source
  await fs.copy(analysis.internalPath, sourceDir);

  // 3. CREATE ZIP
  // We zip the 'source' folder into 'download.zip'
  // Structure inside zip: slug/files...
  await zipFolder(sourceDir, zipPath, analysis.slug);

  // 4. GENERATE TREE JSON
  const tree = generateTree(sourceDir);
  await fs.writeJson(path.join(versionDir, 'tree.json'), tree);

  // 5. Cleanup Temp
  if (analysis.tempDir) {
    await fs.remove(analysis.tempDir);
  }

  return {
    success: true,
    zipPath,
    sourceDir,
    tree,
    downloadUrlKey: `${analysis.type}s/${analysis.slug}/${analysis.version}/download.zip`,
    sourceUrlKey: `${analysis.type}s/${analysis.slug}/${analysis.version}/source`
  };
}