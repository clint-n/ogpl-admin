import fs from 'fs-extra';
import path from 'path';
import { createCanvas, loadImage, registerFont } from 'canvas';

// --- CONFIG ---
const ASSETS_DIR = path.join(process.cwd(), 'assets');
const FONTS_DIR = path.join(ASSETS_DIR, 'fonts');
const TEMPLATES_DIR = path.join(ASSETS_DIR, 'templates');

// Register Fonts (Run once on import)
try {
  if (fs.existsSync(path.join(FONTS_DIR, 'Poppins-Bold.ttf'))) {
    registerFont(path.join(FONTS_DIR, 'Poppins-Bold.ttf'), { family: 'Poppins', weight: 'bold' });
    registerFont(path.join(FONTS_DIR, 'Poppins-Regular.ttf'), { family: 'Poppins', weight: 'normal' });
  }
} catch (e: any) {
  console.warn(`⚠️ Warning: Fonts error: ${e.message}`);
}

interface ImageGenOptions {
  slug: string;
  name: string;
  version: string;
  type: string; // 'plugin' | 'theme'
}

// --- Helper: Text Wrapper ---
function wrapText(ctx: any, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;

    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, currentY);
      line = words[n] + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
}

// --- MAIN GENERATOR FUNCTION ---
export async function generateImages(options: ImageGenOptions): Promise<string> {
  const { slug, name, version, type } = options;
  
  // Output Path: staging/{type}/{slug}/{version}/banner.png
  const versionDir = path.join(process.cwd(), 'staging', type, slug, version);
  const outputPath = path.join(versionDir, 'banner.png');

  // Ensure dir exists
  await fs.ensureDir(versionDir);

  const width = 1280;
  const height = 720;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1. Draw Background
  const bgFilename = type === 'theme' ? 'theme-bg.png' : 'plugin-bg.png';
  const bgPath = path.join(TEMPLATES_DIR, bgFilename);

  if (fs.existsSync(bgPath)) {
    const bg = await loadImage(bgPath);
    ctx.drawImage(bg, 0, 0, width, height);
  } else {
    // Fallback colors if assets missing
    ctx.fillStyle = type === 'theme' ? '#8e44ad' : '#2980b9';
    ctx.fillRect(0, 0, width, height);
  }

  // 2. Draw Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 56px Poppins';
  wrapText(ctx, name, 66, 201, 1000, 70);

  // 3. Version
  ctx.font = '45px Poppins';
  ctx.fillText(`V${version}`, 1039, 663);

  // 4. Date
  const today = new Date().toISOString().split('T')[0];
  ctx.font = '20px Poppins';
  ctx.fillText(today, 193, 639);

  // 5. Save
  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
  
  return outputPath;
}