import fs from 'fs-extra';
import path from 'path';

export interface AnalyzerResult {
  isValid: boolean;
  score: number;
  info: {
    type?: 'plugin' | 'theme';
    slug?: string;
    name?: string;
    version?: string;
    author?: string;
    authorUrl?: string;
    description?: string;
    textDomain?: string;
  };
  reason: string;
  internalPath: string;
  foundInFile?: string;
}

function extractMetadata(content: string, type: 'plugin' | 'theme') {
  const getHeader = (key: string) => {
    const regex = new RegExp(`^[ \t\/*#@]*${key}:\\s*(.*)$`, 'mi');
    const match = content.match(regex);
    return match ? match[1].trim() : null;
  };

  return {
    name: getHeader(type === 'theme' ? 'Theme Name' : 'Plugin Name'),
    version: getHeader('Version'),
    author: getHeader('Author'),
    authorUrl: getHeader('Author URI') || getHeader('Theme URI') || getHeader('Plugin URI'),
    description: getHeader('Description'),
    textDomain: getHeader('Text Domain')
  };
}

function findInnerZip(dir: string): string | null {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.startsWith('.') || file.startsWith('__MACOSX')) continue; 
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        const foundInSub = findInnerZip(fullPath);
        if (foundInSub) return foundInSub;
      } else {
        if (file.endsWith('.zip')) return fullPath;
      }
    }
  } catch (e) {}
  return null;
}

export async function analyze(tempDir: string, log: (msg: string) => void): Promise<AnalyzerResult> {
  log("Starting Detailed Analysis...");

  let candidates: { res: AnalyzerResult; depth: number }[] = [];
  const entries = await fs.readdir(tempDir, { withFileTypes: true });
  
  const checkFile = (filePath: string, depth: number) => {
    const c = tryParseFile(filePath, tempDir, depth);
    if (c && c.isValid) {
      log(`> 🔎 Found Header in: ${c.foundInFile}`);
      candidates.push({ res: c, depth });
    }
  };

  // Pass 1: Root Files
  for (const entry of entries) {
    if (entry.isFile()) checkFile(path.join(tempDir, entry.name), 0);
  }

  // Pass 2: Level 1 Folders
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('__') && !entry.name.startsWith('.')) {
      const subDir = path.join(tempDir, entry.name);
      try {
        const subEntries = await fs.readdir(subDir);
        for (const subFile of subEntries) {
          checkFile(path.join(subDir, subFile), 1);
        }
      } catch (e) {}
    }
  }

  const innerZipPath = findInnerZip(tempDir);
  if (innerZipPath) {
    log(`⚠️ Warning: Found inner ZIP file at: ${path.relative(tempDir, innerZipPath)}`);
  }

  let finalResult: AnalyzerResult;

  // SCENARIO A: No Headers
  if (candidates.length === 0) {
    if (innerZipPath) {
      finalResult = {
        isValid: true,
        score: 4,
        info: {},
        reason: `Bundle Detected: Found inner ZIP '${path.basename(innerZipPath)}' but no installable headers in root.`,
        internalPath: tempDir
      };
    } else {
      finalResult = {
        isValid: false,
        score: 0,
        info: {},
        reason: "Junk: No WordPress headers found in Root or Level 1 folders.",
        internalPath: tempDir
      };
    }
  }
  // SCENARIO B: Multiple Headers
  else if (candidates.length > 1) {
    const names = candidates.map(c => `"${c.res.info.name}"`).join(', ');
    log(`❌ Critical: Multiple installable items found: ${names}`);
    
    const winner = candidates.sort((a, b) => a.depth - b.depth)[0];
    finalResult = {
      ...winner.res,
      score: 3,
      reason: `Ambiguous: Found ${candidates.length} items (${names}). System cannot decide automatically.`
    };
  }
  // SCENARIO C: Single Header
  else {
    const winner = candidates[0];
    finalResult = winner.res;

    // Apply Bundle Penalty logic
    if (innerZipPath) {
      finalResult.score = 4;
      finalResult.reason = `Warning: Valid header found, but ZIP contains another ZIP: ${path.basename(innerZipPath)}`;
    }
  }

  // --- FINAL LOGGING (This was missing!) ---
  log(`Analysis Complete. Score: ${finalResult.score}/10. Reason: ${finalResult.reason}`);
  
  return finalResult;
}

// --- HELPER: Parse Single File ---
function tryParseFile(filePath: string, rootDir: string, depth: number): AnalyzerResult | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.css' && ext !== '.php') return null;
  if (path.basename(filePath) === 'style.css' && ext !== '.css') return null; 

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let meta: any = {};
    let type: 'plugin' | 'theme' | undefined;

    if (filePath.endsWith('style.css')) {
      meta = extractMetadata(content, 'theme');
      if (meta.name) type = 'theme';
    } 
    else if (ext === '.php') {
      meta = extractMetadata(content, 'plugin');
      if (meta.name) type = 'plugin';
    }

    if (type && meta.name) {
      const detectedSlug = getSlug(filePath, rootDir);
      
      // --- DYNAMIC REASON GENERATION ---
      let score = 10;
      let reasons: string[] = [];

      // Check 1: Text Domain Match
      if (meta.textDomain && meta.textDomain !== detectedSlug) {
        score = 7;
        reasons.push(`Slug mismatch (Folder: '${detectedSlug}' vs Domain: '${meta.textDomain}')`);
      } else if (!meta.textDomain) {
        score = 9; // Minor penalty for missing text domain
        reasons.push("Text Domain missing in header");
      }

      // Check 2: Depth (Shouldn't happen often due to pass 1/2 logic, but good safety)
      if (depth > 1) {
        score = Math.min(score, 5);
        reasons.push(`File too deep (Depth ${depth})`);
      }

      // Construct Final Reason
      const finalReason = reasons.length > 0 
        ? reasons.join(", ") + "."
        : "Perfect Match: Structure and Text Domain are correct.";

      return {
        isValid: true,
        score, 
        info: { ...meta, type, slug: detectedSlug },
        reason: finalReason,
        internalPath: path.dirname(filePath),
        foundInFile: path.relative(rootDir, filePath)
      };
    }
  } catch (e) {}
  return null;
}

function getSlug(filePath: string, rootDir: string): string {
  const relPath = path.relative(rootDir, filePath);
  const parts = relPath.split(path.sep);
  if (parts.length > 1) return parts[parts.length - 2];
  return 'unknown-slug'; // Should be editable in UI
}