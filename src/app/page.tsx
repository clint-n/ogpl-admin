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
  const [publishing, setPublishing] = useState(false);
  
  // RAW RESULT (For validation status/warnings)
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  
  // EDITABLE FORM DATA (What we actually send to the server)
  const [formData, setFormData] = useState({
    slug: '',
    name: '',
    version: '',
    author: '',
    authorUrl: '',
    type: 'plugin' // default
  });

  const onDrop = async (acceptedFiles: File[]) => {
    const uploadedFile = acceptedFiles[0];
    setFile(uploadedFile);
    setAnalyzing(true);
    setAnalysisResult(null);

    const formPayload = new FormData();
    formPayload.append('file', uploadedFile);

    try {
      const res = await fetch('/api/analyze', { method: 'POST', body: formPayload });
      const data = await res.json();
      
      setAnalysisResult(data);

      // PRE-FILL FORM with analyzed data
      if (data.isValid) {
        setFormData({
          slug: data.slug || '',
          name: data.name || '',
          version: data.version || '',
          author: data.author || '',
          authorUrl: data.authorUrl || '',
          type: data.type || 'plugin'
        });
      }
    } catch (e) {
      console.error(e);
      alert("Error analyzing file");
    } finally {
      setAnalyzing(false);
    }
  };

  const onPublish = async () => {
    if (!analysisResult) return;
    setPublishing(true);

    try {
      // Send the EDITED formData, not the raw analysis result
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await res.json();
      if (data.success) {
        alert("✅ Published Successfully!");
        setAnalysisResult(null);
        setFile(null);
      } else {
        alert("❌ Error: " + data.error);
      }
    } catch (e) {
      alert("Publish Failed");
    } finally {
      setPublishing(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 'application/zip': ['.zip'] },
    maxFiles: 1
  });

  // --- RENDER ---

  // 1. INITIAL STATE (No File)
  if (!file && !analysisResult) {
    return (
      <div 
        {...getRootProps()} 
        className={`border-2 border-dashed rounded-xl p-20 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-4">
          <div className="bg-gray-100 p-4 rounded-full">
            <UploadCloud className="w-10 h-10 text-gray-500" />
          </div>
          <div>
            <p className="font-semibold text-xl">Click to upload or drag and drop</p>
            <p className="text-gray-500 mt-2">ZIP files only (Plugin or Theme)</p>
          </div>
        </div>
      </div>
    );
  }

  // 2. LOADING
  if (analyzing) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-blue-600 bg-blue-50 rounded-xl">
        <Loader2 className="w-10 h-10 animate-spin mb-4" />
        <span className="font-medium text-lg">Unzipping and analyzing structure...</span>
      </div>
    );
  }

  // 3. REVIEW & EDIT FORM
  return (
    <div className="space-y-6">
      
      {/* STATUS HEADER */}
      <div className={`p-4 rounded-lg flex justify-between items-center ${analysisResult.isValid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
        <div className="flex items-center gap-3">
          {analysisResult.isValid ? <CheckCircle className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
          <div>
            <p className="font-bold">{analysisResult.isValid ? 'Valid Structure Detected' : 'Invalid Structure'}</p>
            <p className="text-sm opacity-80">{file?.name} (Score: {analysisResult.score}/10)</p>
          </div>
        </div>
        <button onClick={() => { setFile(null); setAnalysisResult(null); }} className="text-sm underline hover:text-black">
          Cancel / Re-upload
        </button>
      </div>

      {/* DUPLICATE WARNING */}
      {analysisResult.dbStatus?.productExists && (
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg flex gap-3">
          <AlertCircle className="text-yellow-600 w-5 h-5 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-yellow-800">Product already exists</h4>
            <p className="text-sm text-yellow-700 mt-1">
              We found <strong>{analysisResult.slug}</strong> in the database.
              {analysisResult.dbStatus.versionExists 
                ? <span className="block font-bold mt-1 text-red-600">This exact version is already uploaded!</span> 
                : <span> You are about to add a new version.</span>
              }
            </p>
          </div>
        </div>
      )}

      {/* EDITABLE FORM */}
      <div className="bg-white border rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-bold mb-6 text-gray-800 border-b pb-2">Review & Edit Details</h3>
        
        <div className="grid grid-cols-2 gap-6">
          <div className="col-span-1">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Product Name</label>
            <input 
              type="text" 
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none font-medium"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div className="col-span-1">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Version</label>
            <input 
              type="text" 
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none font-medium"
              value={formData.version}
              onChange={(e) => setFormData({...formData, version: e.target.value})}
            />
          </div>

          <div className="col-span-1">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Slug (URL Path)</label>
            <div className="flex items-center">
              <span className="bg-gray-100 text-gray-500 border border-r-0 rounded-l p-2 text-sm">/</span>
              <input 
                type="text" 
                className="w-full border p-2 rounded-r focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm text-blue-600"
                value={formData.slug}
                onChange={(e) => setFormData({...formData, slug: e.target.value})}
              />
            </div>
          </div>

          <div className="col-span-1">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Author</label>
            <input 
              type="text" 
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.author}
              onChange={(e) => setFormData({...formData, author: e.target.value})}
            />
          </div>
          
           <div className="col-span-2">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Author URL</label>
            <input 
              type="text" 
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none text-gray-600"
              value={formData.authorUrl}
              onChange={(e) => setFormData({...formData, authorUrl: e.target.value})}
            />
          </div>
        </div>

        {/* ACTIONS */}
        <div className="mt-8 flex justify-end gap-3 border-t pt-4">
          <button 
            onClick={() => { setFile(null); setAnalysisResult(null); }}
            className="px-6 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          
          <button 
            onClick={onPublish}
            disabled={publishing || !analysisResult.isValid || analysisResult.dbStatus?.versionExists}
            className={`px-8 py-2 rounded-lg font-bold flex items-center gap-2 text-white transition-all
              ${(analysisResult.isValid && !analysisResult.dbStatus?.versionExists) 
                ? 'bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl translate-y-0 hover:-translate-y-0.5' 
                : 'bg-gray-400 cursor-not-allowed'
              }`}
          >
            {publishing ? <Loader2 className="animate-spin w-5 h-5" /> : <UploadCloud className="w-5 h-5" />}
            {publishing ? 'Publishing...' : 'Publish Item'}
          </button>
        </div>

      </div>
    </div>
  );
}