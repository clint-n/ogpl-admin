import PQueue from 'p-queue';
import { Worker } from 'worker_threads';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const queue = new PQueue({ concurrency: 2 });
const prisma = new PrismaClient();

const getIO = () => (global as any).io;

interface TaskPayload {
  jobId: string;
  action: 'analyze' | 'build';
  payload: any;
}

export async function addToQueue(task: TaskPayload) {
  return queue.add(async () => {
    return new Promise((resolve, reject) => {
      const io = getIO();
      
      // Notify UI
      if (io) io.emit('job-start', { jobId: task.jobId, action: task.action });

      const workerPath = path.resolve(process.cwd(), 'src/workers/taskRunner.ts');

      const worker = new Worker(workerPath, {
        workerData: task.payload,
        execArgv: ['--import', 'tsx/esm'] 
      });

      worker.on('message', async (msg) => {
        if (msg.type === 'log') {
          if (io) io.emit('job-log', { jobId: task.jobId, message: msg.message });
        } 
        else if (msg.type === 'done') {
          // 1. Job Complete - Notify UI
          if (io) io.emit('job-complete', { jobId: task.jobId, result: msg.result });

          // 2. DATABASE UPDATES
          if (task.action === 'analyze') {
             const { isValid, score, info, reason, status } = msg.result;
             
             // Update DB with what we found
             await prisma.item.update({
               where: { id: task.jobId },
               data: {
                 score: score,
                 status: score === 10 ? 'ready_to_upload' : 'needs_review', // 10/10 = Ready, else Review
                 slug: info.slug,
                 version: info.version,
                 type: info.type,
                 metadata: JSON.stringify(info), // Save full details for the form
                 analysisLogs: reason
               }
             });

             // 3. AUTO-CHAIN LOGIC (The Workflow Fix)
             // If Score is 10/10, automatically trigger Build
             if (score === 10) {
               if (io) io.emit('job-log', { jobId: task.jobId, message: '⚡ Score is 10/10. Auto-starting Builder...' });
               
               // Recursive call to add Build job
               addToQueue({
                 jobId: task.jobId,
                 action: 'build',
                 payload: {
                   slug: info.slug,
                   version: info.version,
                   type: info.type,
                   name: info.name,
                   inputPath: msg.result.internalPath, // The extracted folder
                   // We need to pass the ID and other details again
                   id: task.jobId
                 }
               });
             }
          } 
          else if (task.action === 'build') {
            // Update status after build
            await prisma.item.update({
              where: { id: task.jobId },
              data: { status: 'built' }
            });
          }

          resolve(msg.result);
        } 
        else if (msg.type === 'error') {
          if (io) io.emit('job-error', { jobId: task.jobId, error: msg.error });
          reject(new Error(msg.error));
        }
      });

      worker.on('error', (err) => {
        if (io) io.emit('job-error', { jobId: task.jobId, error: err.message });
        reject(err);
      });

      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
      });

      worker.postMessage(task);
    });
  });
}

export function getQueueStats() {
  return { size: queue.size, pending: queue.pending, isPaused: queue.isPaused };
}