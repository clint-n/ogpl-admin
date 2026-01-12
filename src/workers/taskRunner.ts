import { parentPort } from 'worker_threads';
import { analyze } from '../core/analyzer/index.ts';
import { buildItem } from '../core/builder/index.ts';
import { generateImages } from '../core/image-gen/index.ts';
import { PrismaClient } from '@prisma/client';
import semver from 'semver';
import path from 'path';
import AdmZip from 'adm-zip';
import fs from 'fs-extra';
import { PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, r2Config, getApiConfig, checkRemoteItem } from '../lib/r2.ts';
import mime from 'mime-types';
import pLimit from 'p-limit';
import axios from 'axios';

function cleanVersion(v: string | null): string {
  if (!v) return '0.0.0';
  // Remove 'v' prefix if present
  let clean = v.replace(/^v/i, '').trim();
  // Count dots to see if we have x.y or x
  const parts = clean.split('.');
  
  // Pad with .0 until we have at least 3 parts
  while (parts.length < 3) {
    parts.push('0');
  }
  
  // Return clean string (e.g. "2.28" -> "2.28.0")
  return parts.join('.');
}

const prisma = new PrismaClient();

// --- LOGGING HELPER ---
function log(jobId: string, message: string) {
  if (parentPort) {
    parentPort.postMessage({ type: 'log', jobId, message });
  }
}

// --- FILE HELPERS ---
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
  let attempts = 3;
  while (attempts > 0) {
    try {
      await r2Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }));
      return; 
    } catch (e) {
      attempts--;
      if (attempts === 0) throw e;
      await new Promise(r => setTimeout(r, 1000)); 
    }
  }
}

// --- MAIN TASK RUNNER ---
async function runTask(task: any) {
  const { jobId, action, payload } = task;

  try {
    // -----------------------------------------------------------------------
    // ACTION: UPLOAD
    // -----------------------------------------------------------------------
    if (action === 'upload') {
      log(jobId, `Starting Upload Sequence (${process.env.APP_ENV || 'staging'})...`);

      const typeFolder = payload.type === 'plugin' ? (process.env.R2_PATH_PLUGIN || 'plugins') : (process.env.R2_PATH_THEME || 'themes');
      const remoteBase = `${typeFolder}/${payload.slug}/${payload.version}`;
      const stagingDir = path.join(process.cwd(), 'staging', payload.type, payload.slug, payload.version);
      
      if (!fs.existsSync(stagingDir)) {
        throw new Error(`Staging directory not found: ${stagingDir}`);
      }

      // Check Version Status (Default to TRUE if undefined)
      const isNewer = payload.isNewer !== false;
      const isForce = payload.forceUpload;

      // 1. Upload Zip (ALWAYS REQUIRED)
      log(jobId, `Uploading Download Zip...`);
      const zipPath = path.join(stagingDir, 'download.zip');
      if (fs.existsSync(zipPath)) {
        const zipBuffer = await fs.readFile(zipPath);
        await uploadBuffer(r2Config.privateBucket, `${remoteBase}/download.zip`, zipBuffer, 'application/zip');
      } else {
        throw new Error("download.zip missing!");
      }

      // 2. Upload Assets (ONLY IF NEW or FORCED)
      if (isNewer || isForce) {
          // Banner
          const bannerPath = path.join(stagingDir, 'banner.png');
          if (fs.existsSync(bannerPath)) {
             log(jobId, `Uploading Banner...`);
             const buf = await fs.readFile(bannerPath);
             await uploadBuffer(r2Config.publicBucket, `${remoteBase}/banner.png`, buf, 'image/png');
          }

          // Source Files (Smart Skip)
          const sourceDir = path.join(stagingDir, 'source');
          if (fs.existsSync(sourceDir)) {
              let skipped = false;
              const allFiles = getAllFiles(sourceDir);

              // SMART CHECK: Only if NOT forced and has files
              if (!isForce && allFiles.length > 0) {
                 log(jobId, `Checking R2 for existing source...`);
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
                    skipped = true;
                    log(jobId, `⚡ Source files match on R2. Skipping bulk upload.`);
                 }
              } else if (isForce) {
                 log(jobId, `⚠️ Force Upload: Overwriting source files.`);
              }

              if (!skipped) {
                 log(jobId, `Uploading ${allFiles.length} source files...`);
                 const limit = pLimit(20);
                 const uploads = allFiles.map(file => limit(async () => {
                     const buffer = await fs.readFile(file.fullPath);
                     const key = `${remoteBase}/source/${file.relativeKey}`;
                     const type = mime.lookup(file.fullPath) || 'application/octet-stream';
                     await uploadBuffer(r2Config.privateBucket, key, buffer, type);
                 }));
                 await Promise.all(uploads);
              }

              // Tree JSON
              log(jobId, `Generating & Uploading Tree JSON...`);
              const tree = generateTree(sourceDir);
              await uploadBuffer(r2Config.privateBucket, `${remoteBase}/tree.json`, Buffer.from(JSON.stringify(tree)), 'application/json');
          }
      } else {
          log(jobId, `⏭️ Older Version: Skipping Banner, Source, and Tree upload.`);
      }

      // 3. Update Main API (Publish)
      log(jobId, `Syncing with Main API...`);
      const apiConfig = getApiConfig();
      // Only send image URL if we actually uploaded it (isNewer or Force)
      const publicBannerUrl = (isNewer || isForce) ? `https://assets.opengpl.io/${remoteBase}/banner.png` : undefined;
      
      const publishPayload = {
        slug: payload.slug,
        name: payload.name,
        type: payload.type.toUpperCase(),
        author: payload.author,
        authorUrl: payload.authorUrl,
        version: payload.version,
        downloadUrl: `${remoteBase}/download.zip`,
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
    // ACTION: ANALYZE
    // -----------------------------------------------------------------------
    else if (action === 'analyze') {
      log(jobId, `Starting Analysis on: ${path.basename(payload.zipPath)}`);
      
      log(jobId, `Extracting to temp folder...`);
      await fs.ensureDir(payload.tempDir);
      const zip = new AdmZip(payload.zipPath);
      zip.extractAllTo(payload.tempDir, true);
      
      log(jobId, `Extraction complete. Scanning files...`);
      const result = await analyze(payload.tempDir, (msg) => log(jobId, msg));

      // Default to true (Newer)
      let isNewer = true; 

      // CONDITIONAL REMOTE CHECK (Update Mode)
      if (payload.checkRemote && result.isValid && result.info.slug && result.info.version) {
         
         log(jobId, `🔍 Update Mode: Checking Live DB for ${result.info.slug}...`);
         
         const check = await checkRemoteItem(result.info.slug, result.info.version);
         
         if (check) {
            if (check.productExists && check.product.latestVersion) {

              const uploadedVer = cleanVersion(result.info.version);
              const remoteVer = cleanVersion(check.product.latestVersion);
               // If uploaded version <= remote version, it's NOT newer
               if (semver.lte(uploadedVer, remoteVer)) {
                  isNewer = false;
                  log(jobId, `⚠️ Version is Older/Same (${result.info.version} <= ${check.product.latestVersion}). Optimizing build.`);
               } else {
                  log(jobId, `✅ New Version Detected.`);
               }

            } else if (!check.productExists) {
               log(jobId, `⚠️ Item does not exist on Live DB. Treating as New.`);
            }
         }
         
         // Save status to result so UI can see it
         (result.info as any).isNewer = isNewer; 
         (result.info as any).remoteVersion = check?.product?.latestVersion || null;
         (result.info as any).remoteExists = check?.productExists;
      } else {
         log(jobId, `Skipping Remote Check (Bulk/Create Mode).`);
      }

      if (parentPort) parentPort.postMessage({ type: 'done', jobId, result });
    } 
    
    // -----------------------------------------------------------------------
    // ACTION: BUILD
    // -----------------------------------------------------------------------
    else if (action === 'build') {
      log(jobId, `Starting Build Process for ${payload.slug} v${payload.version}`);

      // Default to TRUE unless explicitly FALSE (Older Version)
      const isNewer = payload.isNewer !== false; 
      const forceBuild = payload.forceBuild; // User clicked "Manual Build" (Force)
      
      // LOGIC: Build Source/Assets only if it's NEW or User Forced it
      const shouldBuildAssets = isNewer || forceBuild;

      const buildResult = await buildItem({
        slug: payload.slug,
        version: payload.version,
        type: payload.type,
        inputPath: payload.inputPath, // specific folder from analysis
        isLatest: shouldBuildAssets // Controls if we extract source
      });

      if (buildResult.success) {
        log(jobId, `Zip created.`);
        
        // LOGIC: Generate Images only if NEW or Forced
        if (shouldBuildAssets && buildResult.sourcePath) {
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
        } else {
          log(jobId, `⏭️ Skipping Banner Generation (Older Version).`);
        }
      }
      
      if (parentPort) parentPort.postMessage({ type: 'done', jobId, result: { success: true } });
    }

  } catch (error: any) {
    let errorMsg = error.message;
    if (axios.isAxiosError(error)) {
      if (error.response) {
        errorMsg = `API Error (${error.response.status}): ${JSON.stringify(error.response.data)}`;
      } else if (error.request) {
        errorMsg = `Network Error: No response from API. Check URL/Connection.`;
      }
    }
    log(jobId, `CRITICAL ERROR: ${errorMsg}`);
    console.error(error);
    if (parentPort) parentPort.postMessage({ type: 'error', jobId, error: errorMsg });
  } finally {
    await prisma.$disconnect();
  }
}

if (parentPort) {
  parentPort.on('message', (task) => {
    runTask(task);
  });
}