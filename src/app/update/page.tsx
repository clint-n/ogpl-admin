import DashboardManager from "@/components/dashboard-manager";
import Terminal from "@/components/terminal"; // Import Terminal
import Link from 'next/link';

export default function UpdatePage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <header className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <div>
             <h1 className="text-3xl font-bold text-blue-400">
               Update Existing Item
             </h1>
             <p className="text-gray-500 text-sm mt-1">
               Upload a newer version. System will check against the Live DB.
             </p>
          </div>
          <Link href="/" className="text-sm text-gray-400 hover:text-white border border-gray-700 px-4 py-2 rounded transition-colors">
            ← Back to Bulk Upload
          </Link>
        </div>
      </header>

      {/* Grid Layout: Manager (Left) + Terminal (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div className="lg:col-span-2">
          {/* Pass 'update' mode */}
          <DashboardManager mode="update" />
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