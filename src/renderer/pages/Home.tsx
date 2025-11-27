import { useState, useEffect } from 'react';
import { Moon, Sun, LogOut, User } from 'lucide-react';
import { Page } from '../App';
import Sidebar, { Tab } from '../components/Sidebar';
import OverviewTab from './OverviewTab';
import ToolsTab from './ToolsTab';
import ControlsTab from './ControlsTab';
import ControlDetail from './ControlDetail';

interface HomeProps {
  onSelectSubprocessor: (page: Page) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  user?: { email: string; token: string } | null;
  onLogout?: () => void;
}

interface Stats {
  totalControls: number;
  implementedControls: number;
  inProgressControls: number;
  notStartedControls: number;
  totalEvidence: number;
  coveredEvidence: number;
  partialEvidence: number;
  domains: number;
  compliances: number;
  lastSynced: Date | null;
}

interface Control {
  id: string;
  control_id?: string;
  control_data?: any;
  implementation_status?: string;
  dataroom_id?: string;
  organization_id?: string;
}

export default function Home({ onSelectSubprocessor, darkMode, toggleDarkMode, user, onLogout }: HomeProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [selectedControl, setSelectedControl] = useState<Control | null>(null);
  const [stats, setStats] = useState<Stats>({
    totalControls: 0,
    implementedControls: 0,
    inProgressControls: 0,
    notStartedControls: 0,
    totalEvidence: 0,
    coveredEvidence: 0,
    partialEvidence: 0,
    domains: 0,
    compliances: 0,
    lastSynced: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
    // Refresh stats every 5 minutes
    const interval = setInterval(loadStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  const loadStats = async () => {
    if (!user?.token) return;

    setLoading(true);
    try {
      // Load static controls.json for total count reference
      let staticControls: any[] = [];
      try {
        const staticResponse = await fetch('/data/controls.json');
        staticControls = await staticResponse.json();
      } catch (e) {
        console.warn('Could not load static controls for reference');
      }

      const [controlsResult, evidenceResult] = await Promise.all([
        window.electron.db.getControls({ userId: user.token }),
        window.electron.db.getEvidence({ userId: user.token }),
      ]);

      const dbControls = controlsResult.success ? controlsResult.controls || [] : [];
      const evidence = evidenceResult.success ? evidenceResult.evidence || [] : [];

      // Use static controls count as total if available, otherwise use DB count
      const totalControls = staticControls.length > 0 ? staticControls.length : dbControls.length;

      // Calculate stats from DB controls
      const implementedControls = dbControls.filter(
        (c: any) => c.implementation_status === 'IMPLEMENTED'
      ).length;
      const inProgressControls = dbControls.filter(
        (c: any) => c.implementation_status === 'PARTIALLY_IMPLEMENTED'
      ).length;
      const notStartedControls = totalControls - implementedControls - inProgressControls;

      // Calculate stats from evidence
      // Use static evidence template for total count if available
      let staticEvidence: any = {};
      try {
        const evidenceResponse = await fetch('/data/evidence-template.json');
        staticEvidence = await evidenceResponse.json();
      } catch (e) {
        console.warn('Could not load static evidence for reference');
      }
      
      const totalEvidence = Object.keys(staticEvidence).length > 0 
        ? Object.keys(staticEvidence).length 
        : evidence.length;
      
      const coveredEvidence = evidence.filter(
        (e: any) => e.availability_status === 'AVAILABLE' || 
                   e.evidence_data?.llm_availability_status === 'AVAILABLE'
      ).length;
      const partialEvidence = evidence.filter(
        (e: any) => e.availability_status === 'PARTIALLY_AVAILABLE' || 
                   e.evidence_data?.llm_availability_status === 'PARTIALLY_AVAILABLE'
      ).length;

      // Extract unique domains and compliances from static controls (more complete)
      const domains = new Set(
        staticControls.length > 0
          ? staticControls.map((c: any) => c.domain).filter((d: any) => d)
          : dbControls.map((c: any) => {
              const controlData = typeof c.control_data === 'string' 
                ? JSON.parse(c.control_data) 
                : c.control_data;
              return controlData?.domain;
            }).filter((d: any) => d)
      ).size;

      const compliances = new Set(
        staticControls.length > 0
          ? staticControls.flatMap((c: any) => c.compliances || [])
          : dbControls.flatMap((c: any) => {
              const controlData = typeof c.control_data === 'string' 
                ? JSON.parse(c.control_data) 
                : c.control_data;
              return controlData?.compliances || [];
            })
      ).size;

      setStats({
        totalControls,
        implementedControls,
        inProgressControls,
        notStartedControls,
        totalEvidence,
        coveredEvidence,
        partialEvidence,
        domains,
        compliances,
        lastSynced: new Date(),
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleControlClick = (control: Control) => {
    setSelectedControl(control);
  };

  const handleBackToControls = () => {
    setSelectedControl(null);
  };

  // If a control is selected, show the detail view
  if (selectedControl) {
    return (
      <div className="min-h-screen bg-black">
        <ControlDetail
          control={selectedControl}
          onBack={handleBackToControls}
          user={user}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex">
      {/* Sidebar */}
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col ml-20">
      {/* Header */}
        <header className="sticky top-0 z-40 border-b border-[#333333] bg-black/95 backdrop-blur-sm">
          <div className="px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
                <div>
                  <h1 className="text-lg font-semibold text-white">Ofofo Integration Agent</h1>
                  <p className="text-xs text-gray-400">Compliance Automation</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {user && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333333]">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-300">{user.email}</span>
            </div>
                )}
          <button
            onClick={toggleDarkMode}
                  className="p-2 rounded-lg hover:bg-[#1a1a1a] transition-colors"
            aria-label="Toggle dark mode"
          >
                  {darkMode ? (
                    <Sun className="w-5 h-5 text-gray-400 hover:text-white" />
                  ) : (
                    <Moon className="w-5 h-5 text-gray-400 hover:text-white" />
                  )}
          </button>
                {onLogout && (
            <button
                    onClick={onLogout}
                    className="p-2 rounded-lg hover:bg-[#1a1a1a] transition-colors"
                    aria-label="Logout"
                  >
                    <LogOut className="w-5 h-5 text-gray-400 hover:text-red-400" />
            </button>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Tab Content */}
        <main className="flex-1 overflow-auto">
          {activeTab === 'overview' && <OverviewTab stats={stats} loading={loading} />}
          {activeTab === 'tools' && <ToolsTab onSelectSubprocessor={onSelectSubprocessor} user={user} />}
          {activeTab === 'controls' && (
            <ControlsTab user={user} onControlClick={handleControlClick} />
          )}
      </main>

      {/* Footer */}
        <footer className="border-t border-[#333333] bg-black">
          <div className="px-6 lg:px-8 py-4">
            <p className="text-center text-sm text-gray-500">
              © 2025 Ofofo.ai • Compliance Automation Platform
            </p>
          </div>
      </footer>
      </div>
    </div>
  );
}
