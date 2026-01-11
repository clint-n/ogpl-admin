import { parentPort } from 'worker_threads';
import { analyze } from '../core/analyzer/index.ts';
import { buildItem } from '../core/builder/index.ts';
import { generateImages } from '../core/image-gen/index.ts';
import { PrismaClient } from '@prisma/client';
import semver from 'semver';
import path from 'path';
import AdmZip from 'adm-zip';
import fs from 'fs-extra';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, r2Config, getApiConfig } from '../lib/r2.ts';
import mime from 'mime-types';
import pLimit from 'p-limit';
import crypto from 'crypto';
import axios from 'axios';
import { checkRemoteItem } from '../lib/r2.ts';

const prisma = new PrismaClient();

// --- LOGGING HELPER ---
function log(jobId: string, message: string) {
  if (parentPort) {
    parentPort.postMessage({ type: 'log', jobId, message });
  }
}

// --- FILE HELPERS (From your CLI script) ---
const IGNORED_DIRS = ['node_modules', 'vendor', '.git', '__macosx', '.svn', '.hg'];
const ALLOWED_EXTS = ['.php', '.js', '.css', '.html', '.json', '.xml', '.txt', '.md', '.scss', '.less', '.woff', '.woff2', '.png', '.jpg', '.svg'];

function getAllFiles(dir: string, fileList: { fullPath: string; relativeKey: string }[] = [], rootDir: string | null = null) {
  if (!rootDir) rootDir = dir;
  if (!fs.existsSync(dir)) return [];
  
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!IGNORED_DIRS.includes(file.toLowerCase())) {
        getAllFiles(fullPath, fileList, rootDir);
      }
    } else {
      const ext = path.extname(file).toLowerCase();
      // Allow all files in source, or filter? Your CLI filtered, so we keep filtering.
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

function generateTree(dir: string, rootDir: string | null = null): any[] {
  if (!rootDir) rootDir = dir;
  const tree = [];
  if (!fs.existsSync(dir)) return [];
  
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
    
    if (stat.isDirectory()) {
      if (IGNORED_DIRS.includes(file.toLowerCase())) continue;
      const children = generateTree(fullPath, rootDir);
      if (children.length > 0) {
        tree.push({ name: file, path: relativePath, type: 'folder', children });
      }
    } else {
      const ext = path.extname(file).toLowerCase();
      if (ALLOWED_EXTS.includes(ext)) {
        tree.push({ name: file, path: relativePath, type: 'file', size: stat.size });
      }
    }
  }
  return tree;
}

// --- UPLOAD HELPER ---
async function uploadBuffer(bucket: string, key: string, buffer: Buffer, contentType: string) {
  // Simple retry loop (3 attempts)
  let attempts = 3;
  while (attempts > 0) {
    try {
      await r2Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        // Optional: Add MD5
      }));
      return; // Success
    } catch (e) {
      attempts--;
      if (attempts === 0) throw e;
      await new Promise(r => setTimeout(r, 1000)); // Backoff
    }
  }
}

// --- MAIN TASK RUNNER ---
async function runTask(task: any) {
  const { jobId, action, payload } = task;

  try {
    // -----------------------------------------------------------------------
    // ACTION: UPLOAD (New)
    // -----------------------------------------------------------------------
    if (action === 'upload') {
      log(jobId, `Starting Upload Sequence (${process.env.APP_ENV || 'staging'})...`);

      // 1. Prepare Paths
      const typeFolder = payload.type === 'plugin' ? (process.env.R2_PATH_PLUGIN || 'plugins') : (process.env.R2_PATH_THEME || 'themes');
      const remoteBase = `${typeFolder}/${payload.slug}/${payload.version}`;
      
      // Local Paths (We assume build has finished and files are in 'staging' folder)
      // Note: payload.inputPath from 'build' pointed to the extracted source. 
      // We need to construct the 'staging' output path.
      // Usually: staging/plugin/slug/version/
      const stagingDir = path.join(process.cwd(), 'staging', payload.type, payload.slug, payload.version);
      
      if (!fs.existsSync(stagingDir)) {
        throw new Error(`Staging directory not found: ${stagingDir}. Did you build it?`);
      }

      // 2. Upload Zip
      log(jobId, `Uploading Download Zip...`);
      const zipPath = path.join(stagingDir, 'download.zip');
      if (fs.existsSync(zipPath)) {
        const zipBuffer = await fs.readFile(zipPath);
        await uploadBuffer(r2Config.privateBucket, `${remoteBase}/download.zip`, zipBuffer, 'application/zip');
      } else {
        throw new Error("download.zip missing!");
      }

      // 3. Upload Banner
      log(jobId, `Uploading Banner...`);
      const bannerPath = path.join(stagingDir, 'banner.png');
      const bannerKey = `${remoteBase}/banner.png`;
      if (fs.existsSync(bannerPath)) {
        const bannerBuffer = await fs.readFile(bannerPath);
        await uploadBuffer(r2Config.publicBucket, bannerKey, bannerBuffer, 'image/png');
      }

      // 4. Source Logic (Smart Skip)
      const sourceDir = path.join(stagingDir, 'source');
      let skippedSource = false;

      if (fs.existsSync(sourceDir)) {
        const allFiles = getAllFiles(sourceDir);
        
        // --- MODIFIED CHECK ---
        // Only run Smart Check if forceUpload is FALSE
        if (!payload.forceUpload && allFiles.length > 0) {
          
          log(jobId, `Checking if source exists (Smart Skip)...`);
          const checkCount = Math.min(3, allFiles.length);
          let existsCount = 0;
          
          for (let i = 0; i < checkCount; i++) {
             const randomIdx = Math.floor(Math.random() * allFiles.length);
             const fileToCheck = allFiles[randomIdx];
             const keyToCheck = `${remoteBase}/source/${fileToCheck.relativeKey}`;
             try {
               await r2Client.send(new HeadObjectCommand({ Bucket: r2Config.privateBucket, Key: keyToCheck }));
               existsCount++;
             } catch (e) {}
          }

          if (existsCount === checkCount) {
             skippedSource = true;
             log(jobId, `⚡ Source files match on R2. Skipping bulk upload.`);
          }
        } else if (payload.forceUpload) {
          log(jobId, `⚠️ Force Upload Enabled: Skipping Smart Check. Overwriting files...`);
        }

        // Upload Source (If not skipped)
        if (!skippedSource) {
          log(jobId, `Uploading ${allFiles.length} source files (Concurrency: 20)...`);
          const limit = pLimit(20);
          const uploads = allFiles.map(file => {
             return limit(async () => {
                const buffer = await fs.readFile(file.fullPath);
                const key = `${remoteBase}/source/${file.relativeKey}`;
                const type = mime.lookup(file.fullPath) || 'application/octet-stream';
                await uploadBuffer(r2Config.privateBucket, key, buffer, type);
             });
          });
          await Promise.all(uploads);
        }

        // Upload Tree JSON (Always regenerate to be safe)
        log(jobId, `Generating & Uploading Tree JSON...`);
        const tree = generateTree(sourceDir);
        await uploadBuffer(r2Config.privateBucket, `${remoteBase}/tree.json`, Buffer.from(JSON.stringify(tree)), 'application/json');
      }

      // 5. Update Main API (Publish)
      log(jobId, `Syncing with Main API...`);
      const apiConfig = getApiConfig();
      const publicBannerUrl = `https://assets.opengpl.io/${bannerKey}`; // Adjust domain if needed
      
      const publishPayload = {
        slug: payload.slug,
        name: payload.name,
        type: payload.type.toUpperCase(),
        author: payload.author,
        authorUrl: payload.authorUrl,
        version: payload.version,
        downloadUrl: `${remoteBase}/download.zip`, // Key for private bucket
        image: publicBannerUrl
      };

      await axios.post(apiConfig.url, publishPayload, {
        headers: {
          'x-admin-secret': apiConfig.secret,
          'Content-Type': 'application/json'
        }
      });

      log(jobId, `✅ SUCCESS: Published to ${process.env.APP_ENV || 'staging'}`);
      if (parentPort) parentPort.postMessage({ type: 'done', jobId, result: { success: true } });
    } 
    
    // -----------------------------------------------------------------------
    // ACTION: ANALYZE (Existing)
    // -----------------------------------------------------------------------
    else if (action === 'analyze') {
      log(jobId, `Starting Analysis on: ${path.basename(payload.zipPath)}`);
      
      log(jobId, `Extracting to temp folder...`);
      await fs.ensureDir(payload.tempDir);
      const zip = new AdmZip(payload.zipPath);
      zip.extractAllTo(payload.tempDir, true);
      
      log(jobId, `Extraction complete. Scanning files...`);
      const result = await analyze(payload.tempDir, (msg) => log(jobId, msg));
      if (payload.checkRemote && result.isValid && result.info.slug && result.info.version) {
         
         log(jobId, `🔍 Update Mode: Checking Live DB for ${result.info.slug}...`);
         
         const check = await checkRemoteItem(result.info.slug, result.info.version);
         
         if (check) {
            let isNewer = true;
            if (check.productExists && check.product.latestVersion) {
               // If uploaded version <= remote version, it's NOT newer
               if (semver.lte(result.info.version, check.product.latestVersion)) {
                  isNewer = false;
               }
            } else if (!check.productExists) {
               log(jobId, `⚠️ Item does not exist on Live DB. treating as New.`);
            }

            // Save results to result info
            (result.info as any).isNewer = isNewer; 
            (result.info as any).remoteVersion = check.product?.latestVersion || null;
            (result.info as any).remoteExists = check.productExists;

            if (isNewer) log(jobId, `✅ Version is Newer. Full update enabled.`);
            else log(jobId, `⚠️ Version is Older/Same (${check.product?.latestVersion}). Optimizing build.`);
         }
    } else {
        // If not checking remote, we assume it's new/standard upload
        log(jobId, `Skipping Remote Check (Bulk/Create Mode).`);
    }
      if (parentPort) parentPort.postMessage({ type: 'done', jobId, result });
    } 
    
    // -----------------------------------------------------------------------
    // ACTION: BUILD (Existing)
    // -----------------------------------------------------------------------
    else if (action === 'build') {
      log(jobId, `Starting Build Process for ${payload.slug} v${payload.version}`);

      // We don't really need checkIsLatest here anymore if we trust the Admin's decision
      // but let's keep the builder call simple
      const buildResult = await buildItem({
        slug: payload.slug,
        version: payload.version,
        type: payload.type,
        inputPath: payload.inputPath, // specific folder from analysis
        isLatest: true // Force generate source
      });

      if (buildResult.success) {
        log(jobId, `Build Success. Zip created.`);
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
      
      if (parentPort) parentPort.postMessage({ type: 'done', jobId, result: { success: true } });
    }

  } catch (error: any) {
    log(jobId, `CRITICAL ERROR: ${error.message}`);
    console.error(error);
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