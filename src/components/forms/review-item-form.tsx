'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface ItemData {
  id: string;
  originalName: string;
  slug: string;
  name: string;
  version: string;
  author: string;     // <--- New
  authorUrl: string;  // <--- New
  type: 'plugin' | 'theme';
  score: number;
  reason: string;
  status: string;
  isNewer?: boolean;
  remoteVersion?: string;
}

interface Props {
  data: ItemData;
  onRefresh?: () => void; // <--- Changed to optional
}

export default function ReviewItemForm({ data, onRefresh }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [canBuild, setCanBuild] = useState(false);
  
  const [formData, setFormData] = useState({
    slug: data.slug || '',
    name: data.name || '',
    version: data.version || '',
    author: data.author || '',         // <--- New
    authorUrl: data.authorUrl || '',   // <--- New
    type: data.type || 'plugin',
    isNewer: data.isNewer ?? true, // Default to true if unknown
  });

  // Keep form data in sync if parent updates it (e.g. after a poll)
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      slug: data.slug || '',
      name: data.name || '',
      version: data.version || '',
      author: data.author || '',
      authorUrl: data.authorUrl || '',
      type: data.type || 'plugin'
    }));
  }, [data]);

  useEffect(() => {
    const isValid = formData.slug.trim() !== '' && 
                    formData.version.trim() !== '' && 
                    formData.name.trim() !== '';
    setCanBuild(isValid);
  }, [formData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // 1. DETERMINE STATE (Make sure this block is correct)
  // 'pending' = Analyzing
  // 'processing_upload' = Worker is uploading to R2
  const isBuilt = data.status === 'built' || data.status === 'media_ready' || data.status === 'ready_to_upload';
  const isPending = data.status === 'pending';
  const isProcessing = data.status === 'pending' || data.status === 'processing_upload';
  const isPublished = data.status === 'published';

  // Update the function signature to accept the 4 specific action types
  async function handleAction(actionType: 'build' | 'save' | 'upload' | 'force_upload') {
    setLoading(true);
    try {
      const payload: any = { ...formData };

      if (actionType === 'build') payload.forceBuild = true;
      if (actionType === 'upload') payload.action = 'upload';
      if (actionType === 'force_upload') {
        payload.action = 'upload';
        payload.forceUpload = true;
      }

      const res = await fetch(`/api/item/${data.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      // Refresh Data immediately to get the new Status (e.g., 'processing_upload')
      if (onRefresh) onRefresh();
      else router.refresh();

    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      // ✅ FIX: Always stop the local loading state.
      // The UI will now rely on 'isProcessing' (data.status) to lock the buttons.
      setLoading(false);
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 max-w-4xl mx-auto shadow-xl">
      
      {/* HEADER */}
      <div className="flex items-start justify-between mb-8 border-b border-gray-800 pb-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">
            {isPending ? 'Analyzing...' : data.originalName}
          </h2>
          <div className="flex items-center gap-2">
            <span className={`uppercase font-mono text-xs px-2 py-0.5 rounded ${
              isBuilt ? 'bg-green-900 text-green-400' : 'bg-blue-900 text-blue-400'
            }`}>
              {data.status}
            </span>
          </div>
        </div>

        {!isPending && (
          <div className="text-right">
            <div className={`inline-flex items-center px-4 py-1 rounded-full text-sm font-bold text-white ${
              data.score >= 10 ? 'bg-green-600' : data.score >= 5 ? 'bg-yellow-600' : 'bg-red-600'
            }`}>
              Score: {data.score}/10
            </div>
          </div>
        )}
      </div>

      {/* FORM */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Name */}
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 uppercase mb-2">Item Name</label>
          <input 
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="w-full bg-gray-950 border border-gray-800 rounded px-4 py-3 text-white focus:ring-2 focus:ring-blue-600 outline-none"
          />
        </div>

        {/* Slug */}
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase mb-2">Slug</label>
          <input 
            name="slug"
            value={formData.slug}
            onChange={handleChange}
            className="w-full bg-gray-950 border border-gray-800 rounded px-4 py-3 text-white focus:ring-2 focus:ring-blue-600 outline-none font-mono text-sm"
          />
        </div>

        {/* VERSION COMPARISON CARD (Only shows if remoteVersion exists) */}
        {data.remoteVersion && (
          <div className={`col-span-2 mb-6 p-4 rounded-lg border ${
            data.isNewer ? 'bg-green-900/20 border-green-800' : 'bg-orange-900/20 border-orange-800'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`font-bold ${data.isNewer ? 'text-green-400' : 'text-orange-400'}`}>
                  {data.isNewer ? '🚀 Update Available' : '⚠️ Downgrade / Re-upload'}
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  Live Version: <span className="text-white font-mono">{data.remoteVersion}</span> 
                  {' '} vs {' '}
                  Uploaded: <span className="text-white font-mono">{data.version}</span>
                </p>
              </div>
              
              {!data.isNewer && (
                <div className="text-xs text-right text-orange-300">
                  Source & Images will be skipped.<br/>
                  Use "Force Upload" to override.
                </div>
              )}
            </div>
          </div>
        )}

        
        {/* Version */}
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase mb-2">Version</label>
          <input 
            name="version"
            value={formData.version}
            onChange={handleChange}
            className="w-full bg-gray-950 border border-gray-800 rounded px-4 py-3 text-white focus:ring-2 focus:ring-blue-600 outline-none font-mono text-sm"
          />
        </div>

        {/* Author */}
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase mb-2">Author</label>
          <input 
            name="author"
            value={formData.author}
            onChange={handleChange}
            placeholder="e.g. Elementor.com"
            className="w-full bg-gray-950 border border-gray-800 rounded px-4 py-3 text-white focus:ring-2 focus:ring-blue-600 outline-none"
          />
        </div>

        {/* Author URL */}
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase mb-2">Author URL</label>
          <input 
            name="authorUrl"
            value={formData.authorUrl}
            onChange={handleChange}
            placeholder="https://..."
            className="w-full bg-gray-950 border border-gray-800 rounded px-4 py-3 text-white focus:ring-2 focus:ring-blue-600 outline-none text-sm"
          />
        </div>

        {/* Type */}
        <div className="col-span-2 md:col-span-1">
           <label className="block text-xs font-medium text-gray-500 uppercase mb-2">Type</label>
           <select 
            name="type"
            value={formData.type}
            onChange={handleChange}
            className="w-full bg-gray-950 border border-gray-800 rounded px-4 py-3 text-white focus:ring-2 focus:ring-blue-600 outline-none"
           >
             <option value="plugin">Plugin</option>
             <option value="theme">Theme</option>
           </select>
        </div>
      </div>

      {/* ACTIONS */}
      <div className="mt-10 flex gap-4 border-t border-gray-800 pt-6">
        
        {isPublished ? (
           <div className="flex-1 bg-green-900/30 border border-green-800 text-green-400 font-bold py-4 rounded-lg flex items-center justify-center gap-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Published Successfully
           </div>
        ) : isBuilt ? (
          <div className="flex-1 flex gap-2">
            
            {/* PUBLISH BUTTON */}
            <button 
              onClick={() => handleAction('upload')}
              // Disable if network loading OR if Worker is processing
              disabled={loading || isProcessing}
              className={`flex-1 font-bold py-4 rounded-lg transition-all shadow-lg flex items-center justify-center gap-2
                ${isProcessing || loading
                  ? 'bg-purple-900/50 text-purple-200 cursor-wait' 
                  : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/20'}
              `}
            >
              {isProcessing ? (
                // Show this if data.status is 'processing_upload'
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Publishing...
                </>
              ) : (
                // Show this normally
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  Publish to Cloud
                </>
              )}
            </button>

            {/* FORCE BUTTON */}
            <button 
              onClick={() => {
                if(confirm('Are you sure? This will overwrite ALL files on R2.')) handleAction('force_upload');
              }}
              disabled={loading || isProcessing}
              title="Force Re-upload All Files"
              className="px-4 bg-gray-800 hover:bg-red-900/50 hover:text-red-400 border border-gray-700 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          </div>
        ) : (
          /* BUILD BUTTON */
          <button 
            onClick={() => handleAction('build')}
            disabled={loading || !canBuild || isProcessing}
            className={`flex-1 font-bold py-4 rounded-lg transition-all shadow-lg flex items-center justify-center gap-2
              ${canBuild && !isProcessing
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20' 
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'}
            `}
          >
            {isProcessing ? 'Working...' : (loading ? 'Starting...' : '🛠️ Manual Build & Process')}
          </button>
        )}

        <button 
          onClick={() => handleAction('save')}
          disabled={loading || isProcessing}
          className="px-8 py-4 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors"
        >
          Save Data
        </button>
      </div>
    </div>
  );
}