import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Loader2, Search, Shield, TrendingUp, AlertCircle, Download, PlayCircle, Settings, List, Moon, Sun, LogOut, User } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import AzureConfigModal from '../components/AzureConfigModal';
import ControlMappingView from '../components/ControlMappingView';
import CustomDropdown from '../components/CustomDropdown';

interface AzureIntegrationProps {
  onBack: () => void;
  darkMode?: boolean;
  toggleDarkMode?: () => void;
  user?: { email: string; token: string } | null;
  onLogout?: () => void;
  onControlClick?: (control: Control) => void;
}

interface Control {
  id: string;
  control_id?: string;
  control_data?: any;
  implementation_status?: string;
  dataroom_id?: string;
  organization_id?: string;
  // Static data fields (from controls.json)
  control?: string;
  domain?: string;
  grouping?: string;
  weightage?: string;
  details?: string;
  question?: string;
  evidence?: string;
  compliances?: string[];
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

interface EvidenceCollectionStatus {
  controlId: string;
  status: 'idle' | 'collecting' | 'uploading' | 'evaluating' | 'completed' | 'error';
  progress: number;
  error?: string;
}

const AZURE_CONNECTION_KEY = 'azure_connection_status';

export default function AzureIntegration({ onBack, darkMode, toggleDarkMode, user, onLogout, onControlClick }: AzureIntegrationProps) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [applicableControls, setApplicableControls] = useState<Control[]>([]);
  const [filteredControls, setFilteredControls] = useState<Control[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [azureCLIStatus, setAzureCLIStatus] = useState<{ installed: boolean; authenticated: boolean; account?: any } | null>(null);
  const [collectionStatuses, setCollectionStatuses] = useState<Map<string, EvidenceCollectionStatus>>(new Map());
  const [bulkCollecting, setBulkCollecting] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showMappingView, setShowMappingView] = useState(false);
  const [showDeviceCodeModal, setShowDeviceCodeModal] = useState(false);
  const [deviceCode, setDeviceCode] = useState<{ message: string; userCode: string; verificationUrl: string } | null>(null);
  const [controlMappings, setControlMappings] = useState<any>(null);
  const [azureConfig, setAzureConfig] = useState<{ subscriptionId: string; tenantId: string; resourceGroup?: string } | null>(null);
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    implemented: 0,
    inProgress: 0,
    notStarted: 0,
    coverage: 0,
  });

  // Load connection status and config from localStorage
  useEffect(() => {
    const savedStatus = localStorage.getItem(AZURE_CONNECTION_KEY);
    if (savedStatus === 'connected') {
      setConnectionStatus('connected');
    }
    
    const savedConfig = localStorage.getItem('azure_config');
    if (savedConfig) {
      try {
        setAzureConfig(JSON.parse(savedConfig));
      } catch (e) {
        console.error('Failed to parse saved Azure config:', e);
      }
    }
  }, []);

  // Check Azure CLI on mount
  useEffect(() => {
    checkAzureCLI();
  }, []);

  // Load Azure-specific controls (even when not connected)
  useEffect(() => {
    loadAzureControls();
    if (connectionStatus === 'connected') {
      loadControlMappings();
    }
  }, [user, connectionStatus]);

  const loadControlMappings = async () => {
    if (!user?.token) return;

    try {
      const result = await window.electron.db.getControls({
        userId: user.token,
      });

      if (result.success && result.controls) {
        const mappingResult = await window.electron.azure.getControlMappings({
          controls: result.controls,
        });

        if (mappingResult.success && mappingResult.mappings) {
          setControlMappings(mappingResult.mappings);
        }
      }
    } catch (error) {
      console.error('Failed to load control mappings:', error);
    }
  };

  const checkAzureCLI = async () => {
    try {
      const result = await window.electron.azure.checkCLI();
      if (result.success) {
        setAzureCLIStatus({
          installed: result.cli?.installed || false,
          authenticated: result.auth?.authenticated || false,
          account: result.auth?.account,
        });
      } else {
        setAzureCLIStatus({
          installed: false,
          authenticated: false,
        });
      }
    } catch (error) {
      console.error('Failed to check Azure CLI:', error);
      setAzureCLIStatus({
        installed: false,
        authenticated: false,
      });
    }
  };

  // Load static controls.json as reference (same as ControlsTab)
  const loadStaticControls = async (): Promise<Control[]> => {
    try {
      const response = await fetch('/data/controls.json');
      const staticData = await response.json();
      return staticData;
    } catch (error) {
      console.error('Failed to load static controls:', error);
      return [];
    }
  };

  const loadAzureControls = async () => {
    if (!user?.token) return;

    setLoading(true);
    try {
      // Load both DB controls and static controls
      const [dbResult, staticControls] = await Promise.all([
        window.electron.db.getControls({ userId: user.token }),
        loadStaticControls()
      ]);

      if (dbResult.success && dbResult.controls) {
        const dbControls = dbResult.controls || [];
        
        // Merge DB controls with static data (same logic as ControlsTab)
        const mergedControls: Control[] = dbControls.map((dbControl: any) => {
          const controlId = dbControl.control_id || dbControl.id;
          const staticControl = staticControls.find((sc: Control) => sc.id === controlId || sc.control_id === controlId);
          
          // Parse control_data if it's a string
          let controlData = dbControl.control_data;
          if (typeof controlData === 'string') {
            try {
              controlData = JSON.parse(controlData);
            } catch (e) {
              console.warn('Failed to parse control_data:', e);
              controlData = {};
            }
          }

          // Merge: DB data takes precedence, but fill in missing fields from static data
          return {
            id: dbControl.id,
            control_id: controlId,
            implementation_status: dbControl.implementation_status,
            dataroom_id: dbControl.dataroom_id,
            organization_id: dbControl.organization_id,
            // Use control_data if available, otherwise use static data
            control: controlData?.control || staticControl?.control || controlId,
            domain: controlData?.domain || staticControl?.domain || 'Unknown Domain',
            grouping: controlData?.grouping || staticControl?.grouping || 'Unknown',
            weightage: controlData?.weightage || staticControl?.weightage || '-',
            details: controlData?.details || staticControl?.details || '',
            question: controlData?.question || staticControl?.question || '',
            evidence: controlData?.evidence || staticControl?.evidence || '',
            compliances: controlData?.compliances || staticControl?.compliances || [],
            // Keep original control_data for reference
            control_data: controlData || staticControl || {},
          };
        });
        
        // Get applicable Azure controls
        const applicableResult = await window.electron.azure.getApplicableControls({ controls: mergedControls });
        let azureControls: Control[];
        if (applicableResult.success && applicableResult.applicable) {
          azureControls = applicableResult.applicable;
        } else {
          // Basic Azure relevance check if API fails
          azureControls = mergedControls.filter((c: Control) => {
            const controlId = (c.control_id || c.id || '').toUpperCase();
            const domain = (c.domain || c.control_data?.domain || '').toLowerCase();
            return domain.includes('azure') || 
                   domain.includes('cloud') || 
                   domain.includes('security') ||
                   controlId.includes('IAM') ||
                   controlId.includes('SEC');
          });
        }
        
        setApplicableControls(azureControls);
        
        // Calculate stats
        const total = azureControls.length;
        const implemented = azureControls.filter((c: Control) => 
          c.implementation_status === 'IMPLEMENTED'
        ).length;
        const inProgress = azureControls.filter((c: Control) => 
          c.implementation_status === 'PARTIALLY_IMPLEMENTED'
        ).length;
        const notStarted = azureControls.filter((c: Control) => 
          c.implementation_status === 'NOT_IMPLEMENTED' || !c.implementation_status
        ).length;
        const coverage = total > 0 ? Math.round((implemented / total) * 100) : 0;

        setStats({ total, implemented, inProgress, notStarted, coverage });
      }
    } catch (error) {
      console.error('Failed to load Azure controls:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let filtered = [...applicableControls]; // Create a copy to avoid mutating the original

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter((c: Control) => {
        const name = c.control || c.control_data?.control || c.control_id || '';
        const domain = c.domain || c.control_data?.domain || '';
        const controlId = c.control_id || c.id || '';
        return (
          name.toLowerCase().includes(searchLower) ||
          domain.toLowerCase().includes(searchLower) ||
          controlId.toLowerCase().includes(searchLower)
        );
      });
    }

    if (selectedDomain !== 'all') {
      filtered = filtered.filter((c: Control) => 
        (c.domain || c.control_data?.domain || 'Unknown Domain') === selectedDomain
      );
    }

    // Sort: Implemented first, then by status priority
    filtered.sort((a, b) => {
      const statusPriority: Record<string, number> = {
        'IMPLEMENTED': 1,
        'PARTIALLY_IMPLEMENTED': 2,
        'NOT_IMPLEMENTED': 3,
        'NOT_ASSESSED': 4,
      };
      
      const aStatus = a.implementation_status || 'NOT_ASSESSED';
      const bStatus = b.implementation_status || 'NOT_ASSESSED';
      
      const aPriority = statusPriority[aStatus] || 5;
      const bPriority = statusPriority[bStatus] || 5;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // If same status, sort by control_id
      const aId = (a.control_id || a.id || '').toLowerCase();
      const bId = (b.control_id || b.id || '').toLowerCase();
      return aId.localeCompare(bId);
    });

    setFilteredControls(filtered);
  }, [searchTerm, selectedDomain, applicableControls]);

  const handleConnect = async () => {
    setConnectionStatus('connecting');
    
    try {
      // Check if already authenticated
      const authResult = await window.electron.azure.checkCLI();
      
      if (authResult.success && authResult.auth?.authenticated) {
        // Already authenticated
        const account = authResult.auth.account;
        if (account) {
          const autoConfig = {
            subscriptionId: account.id,
            tenantId: account.tenantId,
          };
          setAzureConfig(autoConfig);
          localStorage.setItem('azure_config', JSON.stringify(autoConfig));
        }
        
        setConnectionStatus('connected');
        localStorage.setItem(AZURE_CONNECTION_KEY, 'connected');
        loadAzureControls();
        return;
      }

      // Not authenticated - start device code flow
      // Start the auth process (this will trigger device code callback)
      let initResult;
      try {
        initResult = await window.electron.azure.initializeAuth();
      } catch (initError: any) {
        console.error('Init error:', initError);
        // Even if init fails, check for device code
        initResult = { success: false, error: initError.message };
      }
      
      // ALWAYS check for device code after initialization attempt
      // The device code might have been received even if there was an error
      const deviceCodeResult = await window.electron.azure.getDeviceCode();
      if (deviceCodeResult.success && deviceCodeResult.deviceCode) {
        console.log('Device code found, showing modal');
        setDeviceCode(deviceCodeResult.deviceCode);
        setShowDeviceCodeModal(true);
        // Don't set status to disconnected - wait for user to complete
        return;
      }
      
      // If device code is pending or auth succeeded
      if (initResult.success) {
        if (initResult.method === 'device_code_pending') {
          // Device code should have been found above, but if not, try one more time
          const retryCodeResult = await window.electron.azure.getDeviceCode();
          if (retryCodeResult.success && retryCodeResult.deviceCode) {
            setDeviceCode(retryCodeResult.deviceCode);
            setShowDeviceCodeModal(true);
            return;
          }
        } else {
          // Auth succeeded immediately (existing credentials)
          const subResult = await window.electron.azure.getSubscriptionInfo();
          if (subResult.success && subResult.subscription) {
            const autoConfig = {
              subscriptionId: subResult.subscription.id,
              tenantId: subResult.subscription.tenantId || '',
            };
            setAzureConfig(autoConfig);
            localStorage.setItem('azure_config', JSON.stringify(autoConfig));
          }

      setConnectionStatus('connected');
          localStorage.setItem(AZURE_CONNECTION_KEY, 'connected');
          loadAzureControls();
          return;
        }
      }
      
      // If we get here, auth failed and no device code was found
      throw new Error(initResult.error || 'Failed to initialize authentication. Please check your network connection.');
    } catch (error: any) {
      console.error('Connect error:', error);
      // Last chance - check for device code one more time
      try {
        const finalDeviceCodeCheck = await window.electron.azure.getDeviceCode();
        if (finalDeviceCodeCheck.success && finalDeviceCodeCheck.deviceCode) {
          setDeviceCode(finalDeviceCodeCheck.deviceCode);
          setShowDeviceCodeModal(true);
          return;
        }
      } catch (e) {
        // Ignore
      }
      
      alert(`Failed to connect to Azure: ${error.message}`);
      setConnectionStatus('disconnected');
    }
  };


  const handleSaveConfig = (config: { subscriptionId: string; tenantId: string; resourceGroup?: string }) => {
    setAzureConfig(config);
    localStorage.setItem('azure_config', JSON.stringify(config));
    setShowConfigModal(false);
    // Auto-connect after saving config
    handleConnect();
  };

  const handleDisconnect = () => {
    setConnectionStatus('disconnected');
    localStorage.removeItem(AZURE_CONNECTION_KEY);
  };

  const collectControlEvidence = async (control: Control) => {
    const controlId = control.control_id || control.id;
    const controlName = control.control_data?.control || control.control_id || 'Unknown Control';
    
    // Update status
    setCollectionStatuses(prev => new Map(prev).set(controlId, {
      controlId,
      status: 'collecting',
      progress: 0,
    }));

    try {
      // Step 1: Collect evidence
      setCollectionStatuses(prev => new Map(prev).set(controlId, {
        controlId,
        status: 'collecting',
        progress: 25,
      }));

      const collectResult = await window.electron.azure.collectEvidence({
        controlId,
        controlName,
        controlData: control.control_data || control,
        config: azureConfig || {},
      });

      if (!collectResult.success) {
        throw new Error(collectResult.error || 'Failed to collect evidence');
      }

      // Step 2: Upload to Azure Blob
      setCollectionStatuses(prev => new Map(prev).set(controlId, {
        controlId,
        status: 'uploading',
        progress: 50,
      }));

      const fileBuffer = Buffer.from(collectResult.file.buffer, 'base64');
      const uploadResult = await window.electron.uploadToAzure({
        fileBuffer: Array.from(fileBuffer),
        filename: collectResult.file.filename,
        dataRoomId: control.dataroom_id || user?.token || '',
        contentType: 'application/json',
      });

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Failed to upload evidence');
      }

      // Step 3: Add to context
      setCollectionStatuses(prev => new Map(prev).set(controlId, {
        controlId,
        status: 'evaluating',
        progress: 75,
      }));

      await window.electron.addToContext({
        dataRoomId: control.dataroom_id || user?.token || '',
        userId: user?.token || '',
        files: [{ fileId: uploadResult.data.pathname, url: uploadResult.data.url }],
        fileType: 'evidence',
      });
          
      // Step 4: Evaluate evidence
      await window.electron.evaluateEvidence({
        dataRoomId: control.dataroom_id || user?.token || '',
        userId: user?.token || '',
        files: [{ fileId: uploadResult.data.pathname, url: uploadResult.data.url }],
        similarityThreshold: 0.5,
      });

      // Complete
      setCollectionStatuses(prev => new Map(prev).set(controlId, {
        controlId,
        status: 'completed',
        progress: 100,
      }));

      // Reload controls to get updated status
          setTimeout(() => {
        loadAzureControls();
        setCollectionStatuses(prev => {
          const newMap = new Map(prev);
          newMap.delete(controlId);
          return newMap;
        });
          }, 2000);
          
    } catch (error: any) {
      setCollectionStatuses(prev => new Map(prev).set(controlId, {
        controlId,
        status: 'error',
        progress: 0,
        error: error.message || 'Failed to collect evidence',
      }));
        }
  };

  const collectBulkEvidence = async () => {
    if (filteredControls.length === 0) return;

    setBulkCollecting(true);
    
    try {
      // Collect evidence for all filtered controls
      const collectResult = await window.electron.azure.collectBulkEvidence({
        controls: filteredControls,
        config: azureConfig || {},
      });

      if (!collectResult.success) {
        throw new Error(collectResult.error || 'Failed to collect bulk evidence');
      }

      // Upload bulk evidence file
      const fileBuffer = Buffer.from(collectResult.file.buffer, 'base64');
      const uploadResult = await window.electron.uploadToAzure({
        fileBuffer: Array.from(fileBuffer),
        filename: collectResult.file.filename,
        dataRoomId: user?.token || '',
        contentType: 'application/json',
      });

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Failed to upload evidence');
      }

      // Add to context and evaluate
      await window.electron.addToContext({
        dataRoomId: user?.token || '',
        userId: user?.token || '',
        files: [{ fileId: uploadResult.data.pathname, url: uploadResult.data.url }],
        fileType: 'evidence',
      });

      await window.electron.evaluateEvidence({
        dataRoomId: user?.token || '',
        userId: user?.token || '',
        files: [{ fileId: uploadResult.data.pathname, url: uploadResult.data.url }],
        similarityThreshold: 0.5,
      });

      alert(`Successfully collected evidence for ${collectResult.results?.length || 0} controls`);
      
      // Reload controls
      loadAzureControls();
    } catch (error: any) {
      alert(`Failed to collect bulk evidence: ${error.message}`);
    } finally {
      setBulkCollecting(false);
    }
  };

  const getStatusBadge = (status?: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      IMPLEMENTED: { label: 'Implemented', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
      PARTIALLY_IMPLEMENTED: { label: 'In Progress', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
      NOT_IMPLEMENTED: { label: 'Not Started', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
      NOT_APPLICABLE: { label: 'N/A', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
      NOT_ASSESSED: { label: 'Not Assessed', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
    };

    const statusInfo = statusMap[status || 'NOT_ASSESSED'] || statusMap.NOT_ASSESSED;
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium border ${statusInfo.color}`}>
        {statusInfo.label}
      </span>
    );
  };

  const getCollectionStatus = (controlId: string) => {
    return collectionStatuses.get(controlId);
  };

  // Get domains with compliance information (using same logic as ControlsTab)
  const domainOptions = Array.from(new Set(
    applicableControls
      .map((c: Control) => c.domain || c.control_data?.domain)
      .filter((domain): domain is string => domain && domain !== 'Unknown Domain')
  )).sort().map(domain => {
    // Get unique compliances for this domain
    const compliances = Array.from(new Set(
      applicableControls
        .filter((c: Control) => (c.domain || c.control_data?.domain) === domain)
        .flatMap((c: Control) => {
          const compliances = c.compliances || c.control_data?.compliances || c.control_data?.compliance || [];
          return Array.isArray(compliances) ? compliances : (compliances ? [compliances] : []);
        })
        .filter(Boolean)
    )).slice(0, 3); // Limit to 3 for display
    
    return {
      value: domain,
      label: domain,
      compliances: compliances.length > 0 ? compliances : undefined
    };
  });

  const allDomainOption = {
    value: 'all',
    label: 'All Domains',
    compliances: undefined
  };

  const domainDropdownOptions = [allDomainOption, ...domainOptions];

  return (
    <div className="min-h-screen bg-black flex">
      {/* Sidebar */}
      <Sidebar activeTab="tools" onTabChange={() => {}} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col ml-20">
      {/* Header */}
        <header className="sticky top-0 z-40 border-b border-[#333333] bg-black/95 backdrop-blur-sm">
          <div className="px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-4">
                <button
                  onClick={onBack}
                  className="p-2 rounded-lg hover:bg-[#1a1a1a] transition-colors"
                >
                  <span className="text-gray-400 hover:text-white">← Back</span>
                </button>
                  <div>
                  <h1 className="text-lg font-semibold text-white">Azure Integration</h1>
                  <p className="text-xs text-gray-400">Microsoft Azure Cloud Services</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {user && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#333333]">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-300">{user.email}</span>
                  </div>
                )}
                {toggleDarkMode && (
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
                )}
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

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-8 lg:p-12">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Connection Status Card */}
            <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3">
                    {connectionStatus === 'connected' ? (
                      <CheckCircle2 className="w-6 h-6 text-green-400" />
                    ) : connectionStatus === 'connecting' ? (
                      <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                    ) : (
                      <XCircle className="w-6 h-6 text-gray-400" />
                    )}
                    <div>
                      <h3 className="text-lg font-semibold text-white">Connection Status</h3>
                      <p className="text-sm text-gray-400">
                        {connectionStatus === 'connected' 
                          ? 'Connected to Azure' 
                          : connectionStatus === 'connecting'
                          ? 'Connecting...'
                          : 'Not connected to Azure'}
                      </p>
                      {azureCLIStatus && (
                        <div className="mt-2 space-y-1 text-xs">
                          <div className="flex items-center gap-4">
                            <span className="text-green-400">
                              SDK: Ready
                            </span>
                            <span className={azureCLIStatus.authenticated ? 'text-green-400' : 'text-yellow-400'}>
                              Auth: {azureCLIStatus.authenticated ? 'Authenticated' : 'Not Authenticated'}
                            </span>
                  </div>
                          {azureCLIStatus.account && (
                            <div className="text-gray-400">
                              Subscription: {azureCLIStatus.account.name}
                  </div>
                          )}
                          {!azureCLIStatus.authenticated && (
                            <div className="text-blue-400 text-xs mt-1">
                              Click "Connect Azure" to authenticate
                  </div>
                          )}
                </div>
                      )}
                  </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {connectionStatus === 'connected' && (
                    <button
                      onClick={() => setShowConfigModal(true)}
                      className="px-3 py-2 bg-[#1a1a1a] border border-[#333333] text-gray-400 rounded-lg hover:bg-[#0a0a0a] transition-colors flex items-center gap-2"
                      title="Configure Azure"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  )}
                  {connectionStatus === 'connected' ? (
                    <button
                      onClick={handleDisconnect}
                      className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={handleConnect}
                      disabled={connectionStatus === 'connecting'}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect Azure'}
                    </button>
                  )}
                </div>
              </div>
                    </div>

            {/* Stats Cards - Show even when not connected */}
            {stats.total > 0 && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="w-5 h-5 text-blue-400" />
                      <span className="text-sm font-medium text-gray-400">Azure-Relevant Controls</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{stats.total}</div>
                    <div className="text-xs text-gray-500 mt-1">Controls applicable to Azure</div>
                  </div>
                  <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                      <span className="text-sm font-medium text-gray-400">Implemented</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{stats.implemented}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {stats.total > 0 ? Math.round((stats.implemented / stats.total) * 100) : 0}% of Azure controls
                    </div>
                  </div>
                  <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-5 h-5 text-yellow-400" />
                      <span className="text-sm font-medium text-gray-400">In Progress</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{stats.inProgress}</div>
                    <div className="text-xs text-gray-500 mt-1">Partially implemented</div>
                  </div>
                  <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-5 h-5 text-blue-400" />
                      <span className="text-sm font-medium text-gray-400">Coverage</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{stats.coverage}%</div>
                    <div className="text-xs text-gray-500 mt-1">Implementation coverage</div>
                  </div>
                </div>

                {/* Controls List - Show even when not connected */}
                <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-6">
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-white">Azure Compliance Controls</h3>
                        {connectionStatus !== 'connected' && (
                          <p className="text-sm text-gray-400 mt-1">
                            Connect to Azure to collect evidence for these controls
                          </p>
                        )}
                      </div>
                      {connectionStatus === 'connected' && (
                        <div className="flex items-center gap-2">
                  <button
                            onClick={() => setShowMappingView(true)}
                            className="px-4 py-2 bg-[#1a1a1a] border border-[#333333] text-white rounded-lg hover:bg-[#0a0a0a] transition-colors flex items-center gap-2"
                  >
                            <List className="w-4 h-4" />
                            View Mappings
                  </button>
                          <button
                            onClick={collectBulkEvidence}
                            disabled={bulkCollecting || filteredControls.length === 0}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                          >
                            {bulkCollecting ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Collecting...
                              </>
                            ) : (
                              <>
                                <PlayCircle className="w-4 h-4" />
                                Collect Evidence (Bulk)
                              </>
                )}
                          </button>
            </div>
          )}
                    </div>
                  </div>
                    
                  {/* Search and Filters */}
                  <div className="flex flex-col sm:flex-row gap-4 mb-4">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search controls by ID, name, or domain..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-black border border-[#333333] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <CustomDropdown
                      options={domainDropdownOptions}
                      value={selectedDomain}
                      onChange={setSelectedDomain}
                      placeholder="All Domains"
                      searchPlaceholder="Search domains..."
                    />
                  </div>

                  {/* Controls List */}
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 text-blue-400 animate-spin mr-2" />
                      <span className="text-gray-400">Loading controls...</span>
                </div>
                  ) : filteredControls.length === 0 ? (
                    <div className="text-center py-12">
                      <Shield className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400">No controls found</p>
              </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {filteredControls.map((control) => {
                        const controlId = control.control_id || control.id;
                        const collectionStatus = getCollectionStatus(controlId);
                        
                        return (
                          <div
                            key={control.id}
                            onClick={() => onControlClick?.(control)}
                            className="bg-black border border-[#333333] rounded-lg p-4 hover:border-blue-500/50 transition-all cursor-pointer"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <Shield className="w-5 h-5 text-blue-400" />
                                  <h4 className="text-white font-medium">
                                    {control.control_data?.control || control.control_id || `Control ${control.id}`}
                                  </h4>
                                  {getStatusBadge(control.implementation_status)}
                                </div>
                                <div className="flex items-center gap-4 text-sm text-gray-400 ml-8 flex-wrap">
                                  <span>{control.domain || control.control_data?.domain || 'Unknown Domain'}</span>
                                  {control.control_id && (
                                    <>
                                      <span>•</span>
                                      <span className="font-mono">{control.control_id}</span>
                                    </>
                                  )}
                                  {(control.compliances || control.control_data?.compliances || control.control_data?.compliance) && (
                                    <>
                                      <span>•</span>
                                      <div className="flex flex-wrap gap-1">
                                        {(() => {
                                          const compliances = control.compliances || control.control_data?.compliances || control.control_data?.compliance || [];
                                          const complianceArray = Array.isArray(compliances) ? compliances : (compliances ? [compliances] : []);
                                          return complianceArray.slice(0, 3).map((comp: string, idx: number) => (
                                            <span
                                              key={idx}
                                              className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded border border-blue-500/30"
                                            >
                                              {comp}
                                            </span>
                                          ));
                                        })()}
              </div>
                                    </>
                                  )}
                </div>
                                {collectionStatus && (
                                  <div className="mt-2 ml-8">
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className={`${
                                        collectionStatus.status === 'completed' ? 'text-green-400' :
                                        collectionStatus.status === 'error' ? 'text-red-400' :
                                        'text-blue-400'
                                      }`}>
                                        {collectionStatus.status === 'collecting' && 'Collecting evidence...'}
                                        {collectionStatus.status === 'uploading' && 'Uploading to Azure...'}
                                        {collectionStatus.status === 'evaluating' && 'Evaluating evidence...'}
                                        {collectionStatus.status === 'completed' && 'Evidence collected successfully!'}
                                        {collectionStatus.status === 'error' && `Error: ${collectionStatus.error}`}
                                      </span>
                                      {collectionStatus.status !== 'completed' && collectionStatus.status !== 'error' && (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      )}
                </div>
                                    {collectionStatus.progress > 0 && (
                                      <div className="mt-1 w-full bg-[#0a0a0a] rounded-full h-1.5">
                                        <div
                                          className="bg-blue-500 h-1.5 rounded-full transition-all"
                                          style={{ width: `${collectionStatus.progress}%` }}
                                        />
                  </div>
                )}
                  </div>
                )}
              </div>
                              {connectionStatus === 'connected' && (
                    <button
                                  onClick={() => collectControlEvidence(control)}
                                  disabled={!!collectionStatus && collectionStatus.status !== 'completed' && collectionStatus.status !== 'error'}
                                  className="px-3 py-1.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                                  {collectionStatus?.status === 'collecting' || collectionStatus?.status === 'uploading' || collectionStatus?.status === 'evaluating' ? (
                                    <>
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      <span className="text-xs">Collecting</span>
                                    </>
                                  ) : (
                                    <>
                                      <Download className="w-4 h-4" />
                                      <span className="text-xs">Collect Evidence</span>
                                    </>
                                  )}
                    </button>
                              )}
                  </div>
                </div>
                        );
                      })}
            </div>
                  )}
                </div>
              </>
          )}
        </div>
      </main>
      </div>

      {/* Azure Config Modal */}
      <AzureConfigModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        onSave={handleSaveConfig}
        existingConfig={azureConfig ?? undefined}
      />

      {/* Control Mapping View */}
      {showMappingView && controlMappings && (
        <ControlMappingView
          mappings={controlMappings}
          onClose={() => setShowMappingView(false)}
        />
      )}

      {/* Device Code Modal */}
      {/* DeviceCodeModal removed - using Azure CLI authentication in subprocess flow instead */}
      {showDeviceCodeModal && deviceCode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md">
            <h3 className="text-lg font-semibold mb-4">Azure Authentication Required</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              This page uses legacy authentication. Please use the new Azure integration from Tools → Add Azure.
            </p>
            <button
              onClick={() => {
                setShowDeviceCodeModal(false);
                setConnectionStatus('disconnected');
              }}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
