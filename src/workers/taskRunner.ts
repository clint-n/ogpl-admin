// src/workers/taskRunner.ts
import { parentPort, workerData } from 'worker_threads';
// Use relative paths pointing directly to the .ts file
import { analyze } from '../core/analyzer/index.ts';
import { buildItem } from '../core/builder/index.ts';
import { generateImages } from '../core/image-gen/index.ts';
import { PrismaClient } from '@prisma/client';
import semver from 'semver';
import path from 'path';
import AdmZip from 'adm-zip';     // <--- ADD THIS
import fs from 'fs-extra';        // <--- ADD THIS

const prisma = new PrismaClient();

function log(jobId: string, message: string) {
  if (parentPort) {
    parentPort.postMessage({ type: 'log', jobId, message });
  }
}

async function checkIsLatest(slug: string, currentVersion: string): Promise<boolean> {
  const items = await prisma.item.findMany({
    where: { 
      slug: slug,
      status: { in: ['ready', 'uploaded'] } 
    },
    select: { version: true }
  });

  if (items.length === 0) return true;

  const clean = (v: string) => v.replace(/^v/i, '').trim();
  
  try {
    const myVer = clean(currentVersion);
    for (const item of items) {
      if (!item.version) continue;
      if (semver.gt(clean(item.version), myVer)) {
        return false;
      }
    }
  } catch (e) {
    return false;
  }

  return true;
}

async function runTask(task: any) {
  const { jobId, action, payload } = task;

  try {
    if (action === 'analyze') {
      log(jobId, `Starting Analysis on: ${path.basename(payload.zipPath)}`);
      
      // --- FIX: EXTRACT ZIP FIRST ---
      log(jobId, `Extracting to temp folder...`);
      await fs.ensureDir(payload.tempDir);
      
      const zip = new AdmZip(payload.zipPath);
      zip.extractAllTo(payload.tempDir, true);
      // -----------------------------

      log(jobId, `Extraction complete. Scanning files...`);

      // 1. Run Analyzer
      const result = await analyze(payload.tempDir, (msg) => log(jobId, msg));
      
      // 2. Send Result
      if (parentPort) parentPort.postMessage({ type: 'done', jobId, result });
    
    } else if (action === 'build') {
      // ... (Rest of the build logic remains the same)
      log(jobId, `Starting Build Process for ${payload.slug} v${payload.version}`);

      const isLatest = await checkIsLatest(payload.slug, payload.version);
      log(jobId, `Version Check: ${isLatest ? 'Is Latest' : 'Older Version'}`);

      const buildResult = await buildItem({
        slug: payload.slug,
        version: payload.version,
        type: payload.type,
        inputPath: payload.inputPath,
        isLatest
      });

      if (buildResult.success) {
        log(jobId, `Build Success. Zip created at: ${buildResult.zipPath}`);
        
        if (buildResult.sourcePath) {
          log(jobId, `Generating Banners...`);
          try {
             await generateImages({
               slug: payload.slug,
               name: payload.name,
               version: payload.version,
               type: payload.type
             });
             log(jobId, `Banners Generated.`);
          } catch (imgErr: any) {
             log(jobId, `Image Gen Warning: ${imgErr.message}`);
          }
        }
      }

      if (parentPort) parentPort.postMessage({ type: 'done', jobId, result: { success: true, isLatest } });
    }

  } catch (error: any) {
    log(jobId, `CRITICAL ERROR: ${error.message}`);
    if (parentPort) parentPort.postMessage({ type: 'error', jobId, error: error.message });
  } finally {
    await prisma.$disconnect();
  }
}

if (parentPort) {
  parentPort.on('message', (task) => {
    runTask(task);
  });
}