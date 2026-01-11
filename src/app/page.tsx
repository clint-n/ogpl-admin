import DashboardManager from "@/components/dashboard-manager"; // Import the new manager
import Terminal from "@/components/terminal";

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
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left: The Smart Manager (Swaps between Upload and Form) */}
        <div className="lg:col-span-2">
          <DashboardManager />
        </div>

        {/* Right: The Terminal (Always Visible) */}
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