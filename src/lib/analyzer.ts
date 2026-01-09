// src/lib/analyzer.ts
import fs from 'fs-extra';
import path from 'path';
import AdmZip from 'adm-zip';

export interface AnalyzerResult {
  isValid: boolean;
  score: number;
  slug: string | null;
  type: 'plugin' | 'theme' | null;
  version: string | null;
  name: string | null;
  author: string | null;
  authorUrl: string | null; // Added authorUrl
  reason: string;
  internalPath: string | null;
  tempDir: string;
}

interface HeaderInfo {
  name?: string;
  version?: string;
  textDomain?: string;
  author?: string;
  authorUrl?: string;
}

interface ScannedFile {
  path: string;
  type: 'plugin' | 'theme';
  header: HeaderInfo;
}

// --- HELPERS ---

function parseHeader(fileContent: string, type: 'plugin' | 'theme'): HeaderInfo | null {
  const headers = {
    name: type === 'plugin' ? 'Plugin Name' : 'Theme Name',
    version: 'Version',
    textDomain: 'Text Domain',
    author: 'Author',
    authorUrl: 'Author URI' // Standard WP Header for URL
  };
  
  const headerData: any = {};
  let found = false;

  for (const [key, value] of Object.entries(headers)) {
    const regex = new RegExp(`^\\s*\\*?\\s*${value}:\\s*(.+)`, 'im');
    const match = fileContent.match(regex);
    if (match) {
      headerData[key] = match[1].trim();
      if (key === 'name') found = true;
    }
  }

  return found ? headerData : null;
}

function scanDir(dir: string): { headers: ScannedFile[], zips: string[] } {
  if (!fs.existsSync(dir)) return { headers: [], zips: [] };

  let headers: ScannedFile[] = [];
  let zips: string[] = [];

  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        // Skip common junk folders to speed up scan
        if (['node_modules', '.git', '__macosx'].includes(file.toLowerCase())) continue;

        const sub = scanDir(filePath);
        headers = headers.concat(sub.headers);
        zips = zips.concat(sub.zips);
      } else {
        if (file.toLowerCase().endsWith('.zip')) zips.push(filePath);

        let type: 'plugin' | 'theme' | null = null;
        if (file === 'style.css') type = 'theme';
        else if (file.toLowerCase().endsWith('.php')) type = 'plugin';

        if (type) {
          try {
            const fd = fs.openSync(filePath, 'r');
            const buffer = Buffer.alloc(8192);
            fs.readSync(fd, buffer, 0, 8192, 0);
            fs.closeSync(fd);
            
            const content = buffer.toString('utf-8');
            const header = parseHeader(content, type);
            if (header) headers.push({ path: filePath, type, header });
          } catch (e) { /* Ignore read errors */ }
        }
      }
    }
  } catch (e) {
    console.error("Scan Dir Error:", e);
  }
  return { headers, zips };
}

// --- MAIN FUNCTION ---

export async function analyzeZip(fileBuffer: Buffer, originalName: string): Promise<AnalyzerResult> {
  // 1. Create temp directory inside PROJECT ROOT
  const tempId = Math.random().toString(36).substring(7);
  // process.cwd() is the root of your Next.js project
  const tempDir = path.resolve(process.cwd(), 'temp', tempId);
  
  await fs.ensureDir(tempDir);

  // 2. Unzip
  try {
    const zip = new AdmZip(fileBuffer);
    zip.extractAllTo(tempDir, true);
  } catch (e) {
    await fs.remove(tempDir);
    return {
      isValid: false, score: 0, slug: null, type: null, version: null,
      name: null, author: null, authorUrl: null, 
      reason: 'Invalid Zip File', internalPath: null, tempDir: ''
    };
  }

  // 3. Scan
  const { headers, zips } = scanDir(tempDir);

  let result: AnalyzerResult = {
    isValid: false,
    score: 0,
    slug: null,
    type: null,
    version: null,
    name: null,
    author: null,
    authorUrl: null,
    reason: 'Junk',
    internalPath: null,
    tempDir
  };

  // 4. Logic
  if (headers.length === 0) {
    if (zips.length > 0) {
      result.score = 4;
      result.reason = 'Package (Contains Inner Zips)';
    } else {
      result.score = 0;
      result.reason = 'Junk (No WordPress Headers found)';
    }
  } 
  else if (headers.length > 1) {
    result.score = 3;
    result.reason = 'Ambiguous (Multiple plugins/themes found)';
  } 
  else {
    // Single Header Found - The Happy Path
    const item = headers[0];
    const header = item.header;
    const fileDir = path.dirname(item.path);
    const rootDir = tempDir;
    const relativePath = path.relative(rootDir, fileDir);
    const folderName = path.basename(fileDir);
    const textDomain = header.textDomain;

    result.type = item.type;
    result.name = header.name || null;
    result.version = header.version || null;
    result.author = header.author || null;
    result.authorUrl = header.authorUrl || null; // Explicitly extracted
    result.internalPath = fileDir;

    // Slug Detection Logic
    if (relativePath === '') {
        result.score = 2;
        result.reason = 'No Root Folder';
        result.slug = textDomain || path.basename(originalName, '.zip').toLowerCase();
    } else {
        result.slug = folderName; 
        
        if (textDomain && textDomain === folderName) {
            result.score = 10;
            result.reason = 'Perfect Structure';
        } else if (!textDomain) {
            result.score = 9;
            result.reason = 'Good (No Text Domain)';
        } else {
            result.score = 7;
            result.reason = 'Mismatch (Text Domain != Folder Name)';
        }
    }
    
    if (result.score >= 7) result.isValid = true;
  }

  return result;
}