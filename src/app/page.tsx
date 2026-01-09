'use client';

import { useState } from 'react';
import { UploadCloud, File, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'add' | 'update' | 'edit'>('add');
  
  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      {/* --- SIDEBAR --- */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            OGPL Admin
          </h1>
          <p className="text-xs text-gray-500 mt-1">v6.0 Local Host</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <SidebarItem 
            label="Add New Item" 
            active={activeTab === 'add'} 
            onClick={() => setActiveTab('add')} 
          />
          <SidebarItem 
            label="Update Version" 
            active={activeTab === 'update'} 
            onClick={() => setActiveTab('update')} 
          />
          <SidebarItem 
            label="Edit Metadata" 
            active={activeTab === 'edit'} 
            onClick={() => setActiveTab('edit')} 
          />
        </nav>
      </aside>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 p-10 overflow-auto">
        <div className="max-w-4xl mx-auto">
          
          {/* HEADER */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-800">
              {activeTab === 'add' && 'Add New Product'}
              {activeTab === 'update' && 'Update Existing Product'}
              {activeTab === 'edit' && 'Edit Metadata'}
            </h2>
            <p className="text-gray-500 mt-2">
              {activeTab === 'add' && 'Upload a new plugin or theme zip. We will check for duplicates automatically.'}
              {activeTab === 'update' && 'Upload a new version for an existing product.'}
            </p>
          </div>

          {/* DYNAMIC CONTENT */}
          {activeTab === 'add' && <AddNewView />}
          {activeTab === 'update' && <div className="p-10 text-center text-gray-400">Update Flow Coming Soon</div>}
          {activeTab === 'edit' && <div className="p-10 text-center text-gray-400">Edit Flow Coming Soon</div>}
        
        </div>
      </main>
    </div>
  );
}

// --- SUB-COMPONENTS ---

function SidebarItem({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
        active 
          ? 'bg-blue-50 text-blue-700 border border-blue-100' 
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );
}

function AddNewView() {
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);

  const onDrop = async (acceptedFiles: File[]) => {
    const uploadedFile = acceptedFiles[0];
    setFile(uploadedFile);
    setAnalyzing(true);
    setResult(null);

    // CALL THE API
    const formData = new FormData();
    formData.append('file', uploadedFile);

    try {
      const res = await fetch('/api/analyze', { method: 'POST', body: formData });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      console.error(e);
      alert("Error analyzing file");
    } finally {
      setAnalyzing(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 'application/zip': ['.zip'] },
    maxFiles: 1
  });

  return (
    <div className="space-y-6">
      
      {/* 1. DROP ZONE */}
      <div 
        {...getRootProps()} 
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-4">
          <div className="bg-gray-100 p-4 rounded-full">
            <UploadCloud className="w-8 h-8 text-gray-500" />
          </div>
          <div>
            <p className="font-semibold text-lg">Click to upload or drag and drop</p>
            <p className="text-gray-500 text-sm">ZIP files only (Plugin or Theme)</p>
          </div>
        </div>
      </div>

      {/* 2. LOADING STATE */}
      {analyzing && (
        <div className="flex items-center gap-3 text-blue-600 bg-blue-50 p-4 rounded-lg animate-pulse">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="font-medium">Unzipping and analyzing structure...</span>
        </div>
      )}

      {/* 3. RESULTS CARD */}
      {result && (
        <div className={`border rounded-xl overflow-hidden ${result.isValid ? 'border-green-200' : 'border-red-200'}`}>
          {/* Header */}
          <div className={`p-4 border-b flex justify-between items-center ${result.isValid ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="flex items-center gap-2">
              {result.isValid ? <CheckCircle className="text-green-600 w-5 h-5" /> : <AlertCircle className="text-red-600 w-5 h-5" />}
              <span className={`font-bold ${result.isValid ? 'text-green-800' : 'text-red-800'}`}>
                {result.isValid ? 'Valid Structure' : 'Invalid Structure'}
              </span>
            </div>
            <span className="text-sm font-mono text-gray-500">Score: {result.score}/10</span>
          </div>

          {/* Details Body */}
          <div className="p-6 grid grid-cols-2 gap-6 bg-white">
            <div>
              <label className="text-xs uppercase tracking-wider text-gray-500 font-bold">Detected Name</label>
              <p className="text-lg font-medium text-gray-900">{result.name || 'Unknown'}</p>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-gray-500 font-bold">Version</label>
              <p className="text-lg font-medium text-gray-900">{result.version || 'Unknown'}</p>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-gray-500 font-bold">Slug (Folder Name)</label>
              <p className="font-mono text-blue-600 bg-blue-50 inline-block px-2 py-1 rounded mt-1">
                {result.slug || 'N/A'}
              </p>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-gray-500 font-bold">Type</label>
              <p className="capitalize">{result.type || 'Unknown'}</p>
            </div>
          </div>

          {/* DUPLICATE WARNINGS (The Logic You Requested) */}
          {result.dbStatus?.productExists && (
            <div className="bg-yellow-50 border-t border-yellow-200 p-4 flex items-start gap-3">
              <AlertCircle className="text-yellow-600 w-5 h-5 mt-0.5" />
              <div>
                <h4 className="font-bold text-yellow-800">Duplicate Product Detected</h4>
                <p className="text-sm text-yellow-700 mt-1">
                  The slug <strong>{result.slug}</strong> already exists in the database.
                </p>
                {result.dbStatus.versionExists ? (
                   <p className="text-sm font-bold text-red-600 mt-2">
                     CRITICAL: Version {result.version} is ALSO already uploaded.
                   </p>
                ) : (
                   <button className="mt-3 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
                     Switch to "Update Mode"
                   </button>
                )}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}