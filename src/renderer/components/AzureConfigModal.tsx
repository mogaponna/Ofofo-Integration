import { useState } from 'react';
import { X, Info } from 'lucide-react';

interface AzureConfig {
  subscriptionId: string;
  tenantId: string;
  resourceGroup?: string;
}

interface AzureConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: AzureConfig) => void;
  existingConfig?: AzureConfig;
}

export default function AzureConfigModal({ isOpen, onClose, onSave, existingConfig }: AzureConfigModalProps) {
  const [config, setConfig] = useState<AzureConfig>(existingConfig || {
    subscriptionId: '',
    tenantId: '',
    resourceGroup: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!config.subscriptionId.trim()) {
      newErrors.subscriptionId = 'Subscription ID is required';
    }
    
    if (!config.tenantId.trim()) {
      newErrors.tenantId = 'Tenant ID is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validate()) {
      onSave(config);
      onClose();
    }
  };

  const handleGetFromCLI = async () => {
    try {
      const result = await window.electron.azure.checkCLI();
      if (result.success && result.auth?.account) {
        setConfig(prev => ({
          ...prev,
          subscriptionId: result.auth.account.id || prev.subscriptionId,
          tenantId: result.auth.account.tenantId || prev.tenantId,
        }));
      }
    } catch (error) {
      console.error('Failed to get config from CLI:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Azure Configuration</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#0a0a0a] rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-gray-300">
              <p className="mb-2">Azure authentication will open in your browser. No manual setup required!</p>
              <p className="text-xs text-gray-400">Subscription and Tenant ID will be automatically detected after authentication.</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Subscription ID <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={config.subscriptionId}
                onChange={(e) => setConfig(prev => ({ ...prev, subscriptionId: e.target.value }))}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="flex-1 px-3 py-2 bg-black border border-[#333333] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleGetFromCLI}
                className="px-3 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 transition-colors text-sm"
                title="Get from Azure CLI"
              >
                Get from CLI
              </button>
            </div>
            {errors.subscriptionId && (
              <p className="mt-1 text-xs text-red-400">{errors.subscriptionId}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Tenant ID <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={config.tenantId}
                onChange={(e) => setConfig(prev => ({ ...prev, tenantId: e.target.value }))}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="flex-1 px-3 py-2 bg-black border border-[#333333] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleGetFromCLI}
                className="px-3 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 transition-colors text-sm"
                title="Get from Azure CLI"
              >
                Get from CLI
              </button>
            </div>
            {errors.tenantId && (
              <p className="mt-1 text-xs text-red-400">{errors.tenantId}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Resource Group (Optional)
            </label>
            <input
              type="text"
              value={config.resourceGroup}
              onChange={(e) => setConfig(prev => ({ ...prev, resourceGroup: e.target.value }))}
              placeholder="my-resource-group"
              className="w-full px-3 py-2 bg-black border border-[#333333] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">Optional: Specify a resource group to scope evidence collection</p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-[#0a0a0a] border border-[#333333] text-white rounded-lg hover:bg-[#1a1a1a] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}

