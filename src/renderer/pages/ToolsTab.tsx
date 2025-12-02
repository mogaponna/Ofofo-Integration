import { useState, useEffect } from 'react';
import { Plus, Cloud, CheckCircle, Loader2, Database } from 'lucide-react';
import { Page } from '../App';

interface ToolsTabProps {
  onSelectSubprocessor: (page: Page, subprocessId?: string) => void;
  user?: { email: string; token: string } | null;
}

interface Subprocess {
  id: string;
  subprocess_name: string;
  subprocess_type: string;
  connection_status: string;
  connection_config?: any;
  tables?: string[];
  created_at: string;
}

interface AzureSubscription {
  id: string;
  name: string;
  tenantId: string;
  state: string;
  isDefault: boolean;
}

export default function ToolsTab({ onSelectSubprocessor, user }: ToolsTabProps) {
  const [subprocesses, setSubprocesses] = useState<Subprocess[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Subprocess setup flow states
  const [showSubprocessModal, setShowSubprocessModal] = useState(false);
  const [showSubprocessTypeSelector, setShowSubprocessTypeSelector] = useState(false);
  const [selectedSubprocessType, setSelectedSubprocessType] = useState<string>('');
  const [setupStep, setSetupStep] = useState<'check' | 'install' | 'auth' | 'subscriptions' | 'setup' | 'complete'>('check');
  const [setupMessage, setSetupMessage] = useState('');
  const [azureSubscriptions, setAzureSubscriptions] = useState<AzureSubscription[]>([]);
  const [selectedSubscription, setSelectedSubscription] = useState<string>('');
  const [settingUp, setSettingUp] = useState(false);

  useEffect(() => {
    loadSubprocesses();
  }, [user]);

  const loadSubprocesses = async () => {
    if (!user?.token) return;
    
    setLoading(true);
    try {
      const result = await window.electron.subprocess.getAll(user.token);
      if (result.success) {
        setSubprocesses(result.subprocesses || []);
      }
    } catch (error) {
      console.error('Failed to load subprocesses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubprocess = () => {
    setShowSubprocessTypeSelector(true);
  };

  const handleSelectSubprocessType = (type: string) => {
    setSelectedSubprocessType(type);
    setShowSubprocessTypeSelector(false);
    
    if (type === 'azure') {
      handleSetupAzure();
    }
    // Future: Add AWS, GCP, etc.
  };

  const handleSetupAzure = async () => {
    setShowSubprocessModal(true);
    setSetupStep('auth');
    setSetupMessage('Authenticating with Azure...');
    
    try {
      // Azure CLI is already installed at startup, just authenticate
      // Step 1: Authenticate with Azure CLI
      const authResult = await window.electron.subprocess.authenticateAzureCLI();
      if (!authResult.success) {
        alert('Azure authentication failed: ' + authResult.error);
        setShowSubprocessModal(false);
        return;
      }
      
      // Step 2: Get subscriptions
      setSetupStep('subscriptions');
      setSetupMessage('Loading your Azure subscriptions...');
      
      const subsResult = await window.electron.subprocess.getAzureSubscriptions();
      if (!subsResult.success || !subsResult.subscriptions) {
        alert('Failed to get subscriptions: ' + subsResult.error);
        setShowSubprocessModal(false);
        return;
      }
      
      setAzureSubscriptions(subsResult.subscriptions);
      
      // Auto-select default subscription
      const defaultSub = subsResult.subscriptions.find((s: any) => s.isDefault);
      if (defaultSub) {
        setSelectedSubscription(defaultSub.id);
      }
      
    } catch (error: any) {
      console.error('Azure setup error:', error);
      alert('Setup failed: ' + error.message);
      setShowSubprocessModal(false);
    }
  };

  const handleCompleteAzureSetup = async () => {
    if (!selectedSubscription) {
      alert('Please select a subscription');
      return;
    }
    
    setSettingUp(true);
    setSetupStep('setup');
    setSetupMessage('Configuring Azure integration...');
    
    try {
      const selectedSub = azureSubscriptions.find(s => s.id === selectedSubscription);
      
      // Simple setup - just configure plugin for this subscription (FAST)
      const setupResult = await window.electron.subprocess.setupAzure({
        subscriptionId: selectedSubscription,
        tenantId: selectedSub?.tenantId
      });
      
      if (!setupResult.success) {
        alert('Setup failed: ' + setupResult.error);
        setSettingUp(false);
        return;
      }
      
      setSetupStep('complete');
      setSetupMessage('Setup complete! Subprocess configured successfully.');
      
      // Save subprocess to database
      const saveResult = await window.electron.subprocess.save({
        userId: user!.token,
        subprocessData: {
          subprocess_name: `Azure - ${selectedSub?.name || 'Subscription'}`,
          subprocess_type: 'azure',
          connection_config: {
            subscriptionId: selectedSubscription,
            tenantId: selectedSub?.tenantId,
          },
          connection_status: 'connected',
        }
      });
      
      if (saveResult.success) {
        await loadSubprocesses();
        setTimeout(() => {
          setShowSubprocessModal(false);
          setSetupStep('auth');
          setAzureSubscriptions([]);
          setSelectedSubscription('');
          setSelectedSubprocessType('');
        }, 2000);
      }
      
    } catch (error: any) {
      console.error('Setup error:', error);
      alert('Setup failed: ' + error.message);
    } finally {
      setSettingUp(false);
    }
  };

  const handleSubprocessClick = (subprocess: Subprocess) => {
    // Navigate immediately - everything is already installed and configured at startup!
    // Plugin configuration happens when adding subprocess, so it's ready to use
    onSelectSubprocessor('subprocess' as Page, subprocess.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Cloud Integrations</h1>
          <p className="text-gray-400">Connect cloud platforms to automate evidence collection</p>
        </div>
        <button
          onClick={handleAddSubprocess}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Subprocess
        </button>
      </div>

      {/* Subprocesses Grid */}
      {subprocesses.length === 0 ? (
        <div className="text-center py-16">
          <Cloud className="w-16 h-16 mx-auto mb-4 text-gray-600" />
          <h3 className="text-xl font-semibold text-gray-400 mb-2">No integrations yet</h3>
          <p className="text-gray-500 mb-6">Add your first cloud integration to get started</p>
          <button
            onClick={handleAddSubprocess}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Add Subprocess
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {subprocesses.map((subprocess) => (
            <div
              key={subprocess.id}
              onClick={() => handleSubprocessClick(subprocess)}
              className="bg-gray-800 rounded-lg p-6 cursor-pointer hover:bg-gray-750 transition-colors border border-gray-700"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-600/20 rounded-lg flex items-center justify-center">
                    <Cloud className="w-6 h-6 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{subprocess.subprocess_name}</h3>
                    <p className="text-sm text-gray-400 capitalize">{subprocess.subprocess_type}</p>
                  </div>
                </div>
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              
              {subprocess.tables && subprocess.tables.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Database className="w-4 h-4" />
                  <span>{subprocess.tables.length} tables available</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Subprocess Type Selector Modal */}
      {showSubprocessTypeSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold text-white mb-6">Select Cloud Platform</h2>
            
            <div className="space-y-3">
              <button
                onClick={() => handleSelectSubprocessType('azure')}
                className="w-full p-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Cloud className="w-6 h-6 text-blue-500" />
                  <div>
                    <h3 className="font-semibold text-white">Microsoft Azure</h3>
                    <p className="text-sm text-gray-400">Connect your Azure subscription</p>
                  </div>
                </div>
              </button>
              
              <button
                disabled
                className="w-full p-4 bg-gray-700/50 rounded-lg text-left opacity-50 cursor-not-allowed"
              >
                <div className="flex items-center gap-3">
                  <Cloud className="w-6 h-6 text-gray-500" />
                  <div>
                    <h3 className="font-semibold text-gray-400">AWS</h3>
                    <p className="text-sm text-gray-500">Coming soon</p>
                  </div>
                </div>
              </button>
              
              <button
                disabled
                className="w-full p-4 bg-gray-700/50 rounded-lg text-left opacity-50 cursor-not-allowed"
              >
                <div className="flex items-center gap-3">
                  <Cloud className="w-6 h-6 text-gray-500" />
                  <div>
                    <h3 className="font-semibold text-gray-400">Google Cloud</h3>
                    <p className="text-sm text-gray-500">Coming soon</p>
                  </div>
                </div>
              </button>
            </div>
            
            <button
              onClick={() => setShowSubprocessTypeSelector(false)}
              className="w-full mt-6 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Subprocess Setup Modal */}
      {showSubprocessModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-8 max-w-2xl w-full mx-4">
            <h2 className="text-2xl font-bold text-white mb-6">
              {selectedSubprocessType === 'azure' ? 'Add Azure Integration' : 'Add Subprocess'}
            </h2>
            
            {setupStep !== 'subscriptions' && setupStep !== 'complete' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                  <p className="text-gray-300">{setupMessage}</p>
                </div>
              </div>
            )}

            {setupStep === 'subscriptions' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Select Azure Subscription
                  </label>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {azureSubscriptions.map((sub) => (
                      <div
                        key={sub.id}
                        onClick={() => setSelectedSubscription(sub.id)}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                          selectedSubscription === sub.id
                            ? 'border-purple-500 bg-purple-500/10'
                            : 'border-gray-700 hover:border-gray-600'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-medium text-white">{sub.name}</h4>
                            <p className="text-sm text-gray-400 mt-1">ID: {sub.id}</p>
                            <p className="text-sm text-gray-400">Tenant: {sub.tenantId}</p>
                          </div>
                          {sub.isDefault && (
                            <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                              Default
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowSubprocessModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                    disabled={settingUp}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCompleteAzureSetup}
                    disabled={!selectedSubscription || settingUp}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {settingUp ? (
                      <span className="flex items-center gap-2 justify-center">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Setting up...
                      </span>
                    ) : (
                      'Continue'
                    )}
                  </button>
                </div>
              </div>
            )}

            {setupStep === 'complete' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 text-green-500">
                  <CheckCircle className="w-6 h-6" />
                  <p className="text-lg">{setupMessage}</p>
                </div>
              </div>
            )}

            {setupStep === 'setup' && (
              <div className="flex items-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                <p className="text-gray-300">{setupMessage}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Initialization Modal */}
    </div>
  );
}

