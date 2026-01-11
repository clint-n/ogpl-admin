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
    type: data.type || 'plugin'
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

  async function handleAction(action: 'build' | 'save' | 'upload_r2') {
    setLoading(true);
    try {
      if (action === 'upload_r2') {
        alert("R2 Upload Coming Next!"); 
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/item/${data.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          forceBuild: action === 'build'
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      // Whether we 'build' or 'save', we simply need to refresh the data.
      // We check if onRefresh exists first to avoid the crash.
      if (onRefresh) {
        onRefresh();       // Fast: Use the Dashboard's local refresher
      } else {
        router.refresh();  // Slow: Use Next.js to reload the page (fallback)
      }

      // --- REPLACEMENT BLOCK END ---

    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      // If building, keep loading true to prevent double-clicks until the refresh happens
      if (action !== 'build') {
        setLoading(false);
      }
    }
  }

  // Determine State
  const isBuilt = data.status === 'built' || data.status === 'media_ready' || data.status === 'ready_to_upload';
  const isPending = data.status === 'pending';

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
        
        {isBuilt ? (
          <button 
            onClick={() => handleAction('upload_r2')}
            className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-bold py-4 rounded-lg transition-all shadow-lg shadow-purple-900/20 flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
            Upload to Cloud
          </button>
        ) : (
          <button 
            onClick={() => handleAction('build')}
            disabled={loading || !canBuild}
            className={`flex-1 font-bold py-4 rounded-lg transition-all shadow-lg flex items-center justify-center gap-2
              ${canBuild 
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20' 
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'}
              ${loading ? 'opacity-70 cursor-wait' : ''}
            `}
          >
            {loading ? 'Working...' : '🛠️ Manual Build & Process'}
          </button>
        )}

        <button 
          onClick={() => handleAction('save')}
          disabled={loading}
          className="px-8 py-4 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors"
        >
          Save Data
        </button>
      </div>

    </div>
  );
}