'use client';

import { useEffect, useRef, useState } from 'react';
// We will use the socket we initialize in the layout or a hook
import { io, Socket } from 'socket.io-client';

let socket: Socket;

export default function Terminal() {
  const [logs, setLogs] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Connect to the custom server socket
    socket = io();

    socket.on('connect', () => {
      setLogs(prev => [...prev, '⚡ Connected to Admin OS...']);
    });

    socket.on('job-start', (data) => {
      setLogs(prev => [...prev, `\n> STARTING JOB: ${data.action.toUpperCase()}...`]);
    });

    socket.on('job-log', (data) => {
      // Add timestamp
      const time = new Date().toLocaleTimeString().split(' ')[0];
      setLogs(prev => [...prev, `[${time}] ${data.message}`]);
    });

    socket.on('job-complete', (data) => {
      setLogs(prev => [...prev, `> ✅ SUCCESS: Job Finished.`]);
    });
    
    socket.on('job-error', (data) => {
      setLogs(prev => [...prev, `> ❌ ERROR: ${data.error}`]);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="w-full h-96 bg-black rounded-lg border border-gray-800 p-4 font-mono text-xs overflow-y-auto shadow-2xl">
      {logs.map((log, i) => (
        <div key={i} className={`${log.includes('ERROR') ? 'text-red-500' : log.includes('SUCCESS') ? 'text-green-400' : 'text-green-400/80'} mb-1 break-words`}>
          {log}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}