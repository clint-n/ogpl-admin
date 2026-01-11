import DashboardManager from "@/components/dashboard-manager";
import Terminal from "@/components/terminal";
import Link from "next/link"; // Import Link

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            OGPL Admin OS
          </h1>
          <p className="text-gray-500 text-sm mt-1">Local Plugin Factory v1.0</p>
        </div>

        {/* NEW: Navigation Button */}
        <Link 
          href="/update"
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm text-gray-200 transition-all shadow-sm hover:shadow-md"
        >
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Switch to Update Mode
        </Link>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div className="lg:col-span-2 space-y-6">
          <DashboardManager /> 
          
          {/* Helpful Tip */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-900/50 border border-gray-800 p-4 rounded text-sm text-gray-400">
              <strong className="text-white block mb-1">Analyzer Logic</strong>
              Checks headers, validates structure, and scores items (0-10).
            </div>
            <div className="bg-gray-900/50 border border-gray-800 p-4 rounded text-sm text-gray-400">
              <strong className="text-white block mb-1">Auto-Build</strong>
              Items with score 10/10 are automatically built and processed.
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
           <div className="sticky top-8">
             <h2 className="text-sm font-semibold mb-2 text-gray-400 uppercase tracking-wider">Live System Logs</h2>
             <Terminal />
           </div>
        </div>

      </div>
    </main>
  );
}