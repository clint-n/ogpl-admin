// src/lib/image-gen.ts
import fs from 'fs-extra';
import path from 'path';
import { createCanvas, loadImage, registerFont } from 'canvas';

// --- CONFIG ---
// process.cwd() is the root of your Next.js project
const ASSETS_DIR = path.join(process.cwd(), 'assets');
const FONTS_DIR = path.join(ASSETS_DIR, 'fonts');
const TEMPLATES_DIR = path.join(ASSETS_DIR, 'templates');

// Register Fonts
try {
  // We check if fonts exist to avoid crashing the whole app if files are missing
  if (fs.existsSync(path.join(FONTS_DIR, 'Poppins-Bold.ttf'))) {
    registerFont(path.join(FONTS_DIR, 'Poppins-Bold.ttf'), { family: 'Poppins', weight: 'bold' });
    registerFont(path.join(FONTS_DIR, 'Poppins-Regular.ttf'), { family: 'Poppins', weight: 'normal' });
  }
} catch (e: any) {
  console.warn(`⚠️ Warning: Fonts error: ${e.message}`);
}

// --- HELPERS ---
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

// --- MAIN FUNCTION ---
// Adapted from your worker logic to be a standalone function
export async function generateBanner(
  type: 'plugin' | 'theme',
  name: string,
  version: string,
  slug: string
): Promise<string> {
  
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
    // Fallback if image is missing
    ctx.fillStyle = type === 'theme' ? '#8e44ad' : '#2980b9';
    ctx.fillRect(0, 0, width, height);
  }

  // 2. Draw Title
  ctx.fillStyle = '#ffffff';
  // Use Arial as fallback if Poppins fails to load
  ctx.font = 'bold 56px "Poppins", "Arial"'; 
  wrapText(ctx, name, 66, 201, 1000, 70); 

  // 3. Version
  ctx.font = '45px "Poppins", "Arial"';
  ctx.fillText(`V${version}`, 1039, 663);

  // 4. Date
  const today = new Date().toISOString().split('T')[0];
  ctx.font = '20px "Poppins", "Arial"';
  ctx.fillText(today, 193, 639);

  // 5. Save
  // Reconstruct path: staging/type/slug/version/banner.png
  const versionDir = path.join(process.cwd(), 'staging', type, slug, version);
  
  // Ensure directory exists (Builder should have made it, but safety first)
  await fs.ensureDir(versionDir);
  
  const outputPath = path.join(versionDir, 'banner.png');
  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));

  return outputPath;
}