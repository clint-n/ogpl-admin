'use client';

import { useState, useEffect, useCallback } from 'react';
import UploadZone from './upload-zone';
import ReviewItemForm from './forms/review-item-form';

interface Props {
  mode?: 'create' | 'update'; // Default to 'create'
}

export default function DashboardManager({ mode = 'create' }: Props) {
  const [view, setView] = useState<'upload' | 'review'>('upload');
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const [itemData, setItemData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Fetch Data Function
  const fetchData = useCallback(async () => {
    if (!currentItemId) return;
    
    // Don't set global loading on background refreshes to avoid UI flicker
    // only set it on first load if itemData is null
    if (!itemData) setLoading(true); 

    try {
      const res = await fetch(`/api/item/${currentItemId}`);
      const data = await res.json();
      
      const metadata = data.metadata ? JSON.parse(data.metadata) : {};
      
      const formProps = {
        id: data.id,
        originalName: data.originalName,
        slug: data.slug || metadata.slug || '',
        name: metadata.name || '',
        version: data.version || metadata.version || '',
        author: metadata.author || '',        // <--- Added Author
        authorUrl: metadata.authorUrl || '',  // <--- Added URL
        type: (data.type || metadata.type || 'plugin') as 'plugin' | 'theme',
        score: data.score,
        reason: data.analysisLogs || '',
        status: data.status
      };

      setItemData(formProps);
      
      // If we found data, ensure we are in review mode
      setView('review');

    } catch (e) {
      console.error("Failed to fetch item", e);
    } finally {
      setLoading(false);
    }
  }, [currentItemId, itemData]);

  // Initial Load
  useEffect(() => {
    fetchData();
  }, [currentItemId]);

  // POLLING: If status is 'pending' or we just clicked build, keep checking every 2s
  useEffect(() => {
    if (!itemData) return;

    // If we are waiting for something to finish (Analyze or Build)
    if (itemData.status === 'pending' || itemData.status === 'analyzing') {
      const interval = setInterval(fetchData, 2000); // Check every 2s
      return () => clearInterval(interval);
    }
  }, [itemData, fetchData]);

  const handleUploadComplete = (id: string) => {
    setCurrentItemId(id);
    setItemData(null); // Clear old data to trigger loading state
  };

  const handleReset = () => {
    setCurrentItemId(null);
    setItemData(null);
    setView('upload');
  };

  // Allow the form to trigger a refresh manually (e.g. after clicking save)
  const manualRefresh = () => fetchData();

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 min-h-[400px]">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-300">
          {view === 'upload' ? 'Input Source' : 'Review & Build'}
        </h2>
        {view === 'review' && (
          <button onClick={handleReset} className="text-xs text-gray-500 hover:text-white underline">
            Cancel / Upload New
          </button>
        )}
      </div>

      {view === 'upload' && <UploadZone onUploadComplete={handleUploadComplete} mode={mode} />}

      {view === 'review' && (
        loading && !itemData ? (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <div className="animate-pulse">Fetching Analysis...</div>
          </div>
        ) : (
          itemData && <ReviewItemForm data={itemData} onRefresh={manualRefresh} />
        )
      )}
    </div>
  );
}