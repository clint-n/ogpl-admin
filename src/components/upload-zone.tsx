'use client';

import { useState, useRef } from 'react';

// New Prop Interface
interface UploadZoneProps {
  onUploadComplete: (id: string) => void;
}

interface UploadZoneProps {
  onUploadComplete: (id: string) => void;
  mode?: 'create' | 'update'; // <--- New Prop
}

export default function UploadZone({ onUploadComplete, mode = 'create' }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    if (!file.name.endsWith('.zip')) {
      alert('Only .zip files are allowed');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      
      // CALL PARENT INSTEAD OF REDIRECT
      onUploadComplete(data.jobId);

    } catch (e: any) {
      alert(`Upload failed: ${e.message}`);
    } finally {
      setUploading(false);
      setIsDragging(false);
    }
  }

  // (The Return JSX is exactly the same as before, no changes needed)
  return (
    <div 
      className={`
        relative border-2 border-dashed rounded-lg p-12 text-center transition-all cursor-pointer
        ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 bg-gray-900 hover:border-gray-500'}
        ${uploading ? 'opacity-50 pointer-events-none' : ''}
      `}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => fileInputRef.current?.click()}
    >
      <input 
        type="file" 
        ref={fileInputRef}
        className="hidden" 
        accept=".zip"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {uploading ? (
        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <p className="text-blue-400 font-medium">Uploading & Analyzing...</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="mx-auto h-12 w-12 text-gray-400">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <div className="text-lg font-medium text-gray-300">
            Drop Plugin/Theme Zip Here
          </div>
          <p className="text-sm text-gray-500">or click to browse</p>
        </div>
      )}
    </div>
  );
}