import { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, AlertCircle, Cloud } from 'lucide-react';
import ModCard from '../components/ModCard';
import BenchmarkSelectionModal from '../components/BenchmarkSelectionModal';
import ReportViewerModal from '../components/ReportViewerModal';

interface SubprocessPageProps {
  subprocessId: string;
  onBack: () => void;
  user?: { email: string; token: string } | null;
}

interface Subprocess {
  id: string;
  subprocess_name: string;
  subprocess_type: string;
  connection_status: string;
  connection_config?: any;
  results?: Record<string, Record<string, { fileId: string; analyzedAt: string; status: string }>>;
}

// Azure Mods from https://hub.steampipe.io/plugins/turbot/azure/mods
const AZURE_MODS = [
  {
    id: 'azure-compliance',
    name: 'Azure Compliance',
    description: 'Run individual configuration, compliance and security controls or full compliance benchmarks for CIS, HIPAA HITRUST, NIST, PCI DSS',
    repo: 'github.com/turbot/steampipe-mod-azure-compliance',
    icon: 'shield-check',
    color: 'blue',
    benchmarks: [
      { id: 'cis_v200', name: 'CIS v2.0.0', description: 'Center for Internet Security Benchmark v2.0.0', controlCount: 237 },
      { id: 'cis_v210', name: 'CIS v2.1.0', description: 'Center for Internet Security Benchmark v2.1.0', controlCount: 243 },
      { id: 'nist_sp_800_53_rev_5', name: 'NIST SP 800-53 Rev 5', description: 'NIST Special Publication 800-53 Revision 5', controlCount: 389 },
      { id: 'nist_sp_800_171_rev_2', name: 'NIST SP 800-171 Rev 2', description: 'NIST Special Publication 800-171 Revision 2', controlCount: 183 },
      { id: 'pci_dss_v321', name: 'PCI DSS v3.2.1', description: 'Payment Card Industry Data Security Standard v3.2.1', controlCount: 219 },
      { id: 'pci_dss_v4', name: 'PCI DSS v4', description: 'Payment Card Industry Data Security Standard v4', controlCount: 224 },
      { id: 'hipaa_hitrust_v92', name: 'HIPAA HITRUST v9.2', description: 'Health Insurance Portability and Accountability Act HITRUST v9.2', controlCount: 276 },
      { id: 'soc_2', name: 'SOC 2', description: 'Service Organization Control 2', controlCount: 167 }
    ],
  },
  {
    id: 'azure-insights',
    name: 'Azure Insights',
    description: 'Create dashboards and reports for your Azure resources',
    repo: 'github.com/turbot/steampipe-mod-azure-insights',
    icon: 'bar-chart',
    color: 'purple',
    benchmarks: [
      { id: 'insights_dashboard', name: 'Azure Insights Dashboard', description: 'Comprehensive overview of Azure resources', controlCount: 72 }
    ],
  },
  {
    id: 'azure-perimeter',
    name: 'Azure Perimeter',
    description: 'Run security controls to look for resources that are publicly accessible and have insecure network configurations',
    repo: 'github.com/turbot/steampipe-mod-azure-perimeter',
    icon: 'globe',
    color: 'orange',
    benchmarks: [
      { id: 'perimeter_checks', name: 'Perimeter Security Checks', description: 'Identify publicly accessible resources and insecure configurations', controlCount: 85 }
    ],
  },
  {
    id: 'azure-tags',
    name: 'Azure Tags',
    description: 'Run tagging controls across all your Azure subscriptions',
    repo: 'github.com/turbot/steampipe-mod-azure-tags',
    icon: 'tag',
    color: 'green',
    benchmarks: [
      { id: 'tag_compliance', name: 'Tag Compliance', description: 'Verify resource tagging standards and policies', controlCount: 42 }
    ],
  },
  {
    id: 'azure-thrifty',
    name: 'Azure Thrifty',
    description: 'Check your Azure subscription(s) for unused and under utilized resources to optimize costs',
    repo: 'github.com/turbot/steampipe-mod-azure-thrifty',
    icon: 'dollar-sign',
    color: 'teal',
    benchmarks: [
      { id: 'cost_optimization', name: 'Cost Optimization', description: 'Identify unused and under-utilized resources', controlCount: 67 }
    ],
  }
];

type PluginStatus = 'checking' | 'installing' | 'ready' | 'error';

export default function SubprocessPage({
  subprocessId,
  onBack,
  user,
}: SubprocessPageProps) {
  const [subprocess, setSubprocess] = useState<Subprocess | null>(null);
  const [pluginStatus, setPluginStatus] = useState<PluginStatus>('checking');
  const [pluginMessage, setPluginMessage] = useState('Checking Azure plugin...');
  
  // Benchmark selection modal state
  const [selectedModId, setSelectedModId] = useState<string | null>(null);
  const [showBenchmarkModal, setShowBenchmarkModal] = useState(false);
  
  // Analysis state
  const [analyzingBenchmarks, setAnalyzingBenchmarks] = useState<Set<string>>(new Set());
  const [currentReport, setCurrentReport] = useState<any | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  useEffect(() => {
    loadSubprocess();
  }, [subprocessId]);

  // Plugin is installed at app startup, no need to check again
  // Just mark as ready after subprocess loads
  useEffect(() => {
    if (subprocess) {
      console.log('[SubprocessPage] Subprocess loaded, marking plugin as ready');
      setPluginStatus('ready');
      setPluginMessage('Azure plugin is ready');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subprocess]);

  const loadSubprocess = async () => {
    try {
      const result = await window.electron.subprocess.getById(subprocessId);
      if (result.success && result.subprocess) {
        // Parse results if it's a string
        let subprocess = result.subprocess;
        if (typeof subprocess.results === 'string') {
          try {
            subprocess.results = JSON.parse(subprocess.results);
          } catch (e) {
            console.warn('Failed to parse results:', e);
            subprocess.results = {};
          }
        }
        setSubprocess(subprocess);
      }
    } catch (error) {
      console.error('Failed to load subprocess:', error);
    }
  };

  // Removed - Plugin is installed at app startup, no need to check/install again

  const handleCheckBenchmarks = (modId: string) => {
    const mod = AZURE_MODS.find(m => m.id === modId);
    if (!mod) return;

    // Use static benchmarks from AZURE_MODS - instant! No query needed
    setSelectedModId(modId);
    setShowBenchmarkModal(true);
    // Benchmarks are already defined in AZURE_MODS, only query when starting analysis
  };

  const handleStartAnalysis = async (modId: string, benchmarkId: string) => {
    console.log('[SubprocessPage] ======= handleStartAnalysis CALLED =======');
    console.log('[SubprocessPage] modId:', modId);
    console.log('[SubprocessPage] benchmarkId:', benchmarkId);
    
    const mod = AZURE_MODS.find(m => m.id === modId);
    const benchmark = mod?.benchmarks.find(b => b.id === benchmarkId);
    
    console.log('[SubprocessPage] Found mod:', mod?.name);
    console.log('[SubprocessPage] Found benchmark:', benchmark?.name);
    
    if (!mod || !benchmark) {
      console.error('[SubprocessPage] ERROR: Mod or benchmark not found!');
      alert('Mod or benchmark not found');
      return;
    }

    const analysisKey = `${modId}:${benchmarkId}`;
    console.log(`[SubprocessPage] Analysis key: ${analysisKey}`);

    // Mark as analyzing - THIS TRIGGERS LOADING STATE
    console.log('[SubprocessPage] Setting analyzing state...');
    setAnalyzingBenchmarks(prev => {
      const newSet = new Set(prev);
      newSet.add(analysisKey);
      console.log('[SubprocessPage] New analyzing set:', Array.from(newSet));
      return newSet;
    });

    try {
      console.log(`[SubprocessPage] Calling window.electron.powerpipe.runModCompliance...`);

      const result = await window.electron.powerpipe.runModCompliance({
        modId: mod.id,
        modRepo: mod.repo,
        benchmarkId: benchmarkId,
      });

      console.log('[SubprocessPage] Got result:', result?.success, 'has markdown:', !!result?.markdownReport);

      if (result.success && result.markdownReport) {
        console.log(`[SubprocessPage] ✓ Analysis SUCCESS!`);
        console.log('[SubprocessPage] Markdown length:', result.markdownReport.length);
        
        // Close the benchmark modal first
        setShowBenchmarkModal(false);
        
        // Show report
        const reportData = {
          modId,
          modName: mod.name,
          benchmarkId,
          benchmarkName: benchmark.name,
          markdown: result.markdownReport,
          jsonResults: result.jsonResults,
        };
        
        console.log('[SubprocessPage] Setting report data and opening modal...');
        setCurrentReport(reportData);
        
        // Force modal to show with a slight delay to ensure state updates
        setTimeout(() => {
          setShowReportModal(true);
          console.log('[SubprocessPage] Report modal state set to TRUE');
        }, 100);
        
        // Reload subprocess to get updated results
        await loadSubprocess();
      } else {
        console.error('[SubprocessPage] Analysis FAILED:', result.error);
        alert(`Analysis failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('[SubprocessPage] EXCEPTION during analysis:', error);
      alert(`Failed to run analysis: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      console.log('[SubprocessPage] Cleaning up analyzing state...');
      // Remove from analyzing set
      setAnalyzingBenchmarks(prev => {
        const newSet = new Set(prev);
        newSet.delete(analysisKey);
        console.log('[SubprocessPage] Final analyzing set:', Array.from(newSet));
        return newSet;
      });
    }
  };

  const handleViewReport = (fileId: number) => {
    // TODO: Implement view saved report
    console.log('View report:', fileId);
    alert('View saved report feature coming soon!');
  };

  const handleUploadToDataroom = async (report: any) => {
    try {
      console.log('[SubprocessPage] Uploading report to dataroom...');

      // Create file content
      const fileContent = report.markdown;
      const fileName = `${report.modName.replace(/\s+/g, '-')}-${report.benchmarkName.replace(/\s+/g, '-')}-${Date.now()}.md`;

      // Save to dataroom
      if (!subprocess?.id) {
        throw new Error('Subprocess ID not found');
      }
      
      const saveResult = await window.electron.dataroom.saveReport({
        fileName,
        content: fileContent,
        userId: user?.token || 'unknown',
        subprocessId: subprocess.id,
        subprocessName: subprocess?.subprocess_name,
        modId: report.modId,
        benchmarkId: report.benchmarkId,
      });

      if (saveResult.success) {
        console.log('[SubprocessPage] Report saved to dataroom:', saveResult.filePath);
        
        // Reload subprocess to get updated results
        await loadSubprocess();
        
        // Close modal
        setShowReportModal(false);
        
        alert('Report uploaded to dataroom successfully!');
      } else {
        throw new Error(saveResult.error || 'Failed to save report');
      }
    } catch (error) {
      console.error('[SubprocessPage] Upload error:', error);
      alert(`Failed to upload report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const selectedMod = selectedModId ? AZURE_MODS.find(m => m.id === selectedModId) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <Cloud className="w-6 h-6 text-blue-400" />
                <div>
                  <h1 className="text-xl font-bold">{subprocess?.subprocess_name || 'Loading...'}</h1>
                  <p className="text-sm text-gray-400">
                    {subprocess?.subprocess_type?.toUpperCase() || ''} Integration
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {pluginStatus === 'ready' && (
                <span className="flex items-center gap-2 px-3 py-1 bg-green-500/20 text-green-400 text-sm rounded-full">
                  <CheckCircle2 className="w-4 h-4" />
                  Ready
                </span>
              )}
              {pluginStatus === 'checking' && (
                <span className="flex items-center gap-2 px-3 py-1 bg-blue-500/20 text-blue-400 text-sm rounded-full">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking...
                </span>
              )}
              {pluginStatus === 'installing' && (
                <span className="flex items-center gap-2 px-3 py-1 bg-yellow-500/20 text-yellow-400 text-sm rounded-full">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Installing...
                </span>
              )}
              {pluginStatus === 'error' && (
                <span className="flex items-center gap-2 px-3 py-1 bg-red-500/20 text-red-400 text-sm rounded-full">
                  <AlertCircle className="w-4 h-4" />
                  Error
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {pluginStatus === 'error' && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-400 mb-1">Plugin Setup Error</h3>
                <p className="text-sm text-gray-300">{pluginMessage}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Reload Page
                </button>
              </div>
            </div>
          </div>
        )}

        {pluginStatus === 'checking' || pluginStatus === 'installing' ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-blue-400 animate-spin mb-4" />
            <p className="text-lg text-gray-300">{pluginMessage}</p>
          </div>
        ) : pluginStatus === 'ready' ? (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-2">Available Compliance Mods</h2>
              <p className="text-gray-400">
                Select a mod to view and run compliance benchmarks
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {AZURE_MODS.map((mod) => (
                <ModCard
                  key={mod.id}
                  mod={mod}
                  onCheckBenchmarks={handleCheckBenchmarks}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      {/* Benchmark Selection Modal */}
      {showBenchmarkModal && selectedMod && (() => {
        // Compute analysis status fresh on every render
        const modResults = subprocess?.results?.[selectedMod.id] || {};
        const analysisStatus: Record<string, any> = {};
        
        // Add saved results
        Object.keys(modResults).forEach(benchmarkId => {
          const result = modResults[benchmarkId];
          analysisStatus[benchmarkId] = {
            analyzed: result.status === 'completed',
            analyzing: analyzingBenchmarks.has(`${selectedMod.id}:${benchmarkId}`),
            analyzedAt: result.analyzedAt,
            fileId: result.fileId,
          };
        });
        
        // Add analyzing state for benchmarks currently being analyzed
        analyzingBenchmarks.forEach(key => {
          const [mod, benchmark] = key.split(':');
          if (mod === selectedMod.id && !analysisStatus[benchmark]) {
            analysisStatus[benchmark] = {
              analyzed: false,
              analyzing: true,
              analyzedAt: undefined,
              fileId: undefined,
            };
          }
        });
        
        console.log('[SubprocessPage] Rendering modal with analysisStatus:', analysisStatus);
        console.log('[SubprocessPage] Current analyzingBenchmarks:', Array.from(analyzingBenchmarks));
        
        return (
          <BenchmarkSelectionModal
            modName={selectedMod.name}
            modId={selectedMod.id}
            benchmarks={selectedMod.benchmarks}
            analysisStatus={analysisStatus}
            onClose={() => setShowBenchmarkModal(false)}
            onStartAnalysis={handleStartAnalysis}
            onViewReport={handleViewReport}
          />
        );
      })()}

      {/* Report Viewer Modal */}
      {showReportModal && currentReport && (
        <ReportViewerModal
          isOpen={showReportModal}
          report={currentReport}
          onClose={() => setShowReportModal(false)}
          onUploadToDataroom={handleUploadToDataroom}
        />
      )}
    </div>
  );
}
