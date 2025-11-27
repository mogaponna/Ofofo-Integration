import { Shield, CheckCircle2, AlertCircle, Info } from 'lucide-react';

interface ControlMapping {
  control: any;
  category: string;
  mapping: any;
  confidence: string;
  operations: any[];
}

interface ControlMappingViewProps {
  mappings: {
    mapped: ControlMapping[];
    unmapped: any[];
    summary: {
      total: number;
      mapped: number;
      unmapped: number;
      byCategory: Record<string, number>;
    };
  };
  onClose: () => void;
}

export default function ControlMappingView({ mappings, onClose }: ControlMappingViewProps) {
  const categoryColors: Record<string, string> = {
    IAM: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    STORAGE: 'bg-green-500/20 text-green-400 border-green-500/30',
    KEYVAULT: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    NETWORK: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    MONITORING: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    COMPLIANCE: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  const confidenceColors: Record<string, string> = {
    high: 'text-green-400',
    medium: 'text-yellow-400',
    low: 'text-gray-400',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-6 w-full max-w-5xl mx-4 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-white mb-2">Azure Control Mapping</h2>
            <p className="text-sm text-gray-400">Controls that will be processed with Azure SDK operations</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#0a0a0a] rounded transition-colors"
          >
            <span className="text-gray-400 hover:text-white">✕</span>
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-black border border-[#333333] rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">Total Controls</div>
            <div className="text-2xl font-bold text-white">{mappings.summary.total}</div>
          </div>
          <div className="bg-black border border-[#333333] rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">Mapped</div>
            <div className="text-2xl font-bold text-green-400">{mappings.summary.mapped}</div>
          </div>
          <div className="bg-black border border-[#333333] rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">Unmapped</div>
            <div className="text-2xl font-bold text-gray-400">{mappings.summary.unmapped}</div>
          </div>
          <div className="bg-black border border-[#333333] rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">Coverage</div>
            <div className="text-2xl font-bold text-blue-400">
              {mappings.summary.total > 0 
                ? Math.round((mappings.summary.mapped / mappings.summary.total) * 100) 
                : 0}%
            </div>
          </div>
        </div>

        {/* By Category */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">By Category</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(mappings.summary.byCategory).map(([category, count]) => (
              <span
                key={category}
                className={`px-3 py-1 rounded text-sm font-medium border ${categoryColors[category] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}
              >
                {category}: {count}
              </span>
            ))}
          </div>
        </div>

        {/* Mapped Controls */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">
            Mapped Controls ({mappings.mapped.length})
          </h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {mappings.mapped.map((item, idx) => {
              const controlId = item.control.control_id || item.control.id;
              const controlName = item.control.control_data?.control || item.control.control_id || 'Unknown';
              
              return (
                <div
                  key={idx}
                  className="bg-black border border-[#333333] rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Shield className="w-4 h-4 text-blue-400" />
                        <span className="font-mono text-sm text-gray-400">{controlId}</span>
                        <span className={`px-2 py-0.5 rounded text-xs border ${categoryColors[item.category] || ''}`}>
                          {item.category}
                        </span>
                        <span className={`text-xs ${confidenceColors[item.confidence]}`}>
                          {item.confidence} confidence
                        </span>
                      </div>
                      <div className="text-white font-medium">{controlName}</div>
                    </div>
                  </div>
                  
                  <div className="ml-6 space-y-2">
                    <div className="text-xs text-gray-400">SDK Operations:</div>
                    {item.operations.map((op, opIdx) => (
                      <div key={opIdx} className="bg-[#0a0a0a] border border-[#333333] rounded p-2">
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle2 className="w-3 h-3 text-green-400" />
                          <span className="text-xs font-medium text-white">{op.name}</span>
                        </div>
                        <div className="text-xs text-gray-500 font-mono ml-5">{op.sdk}</div>
                        <div className="text-xs text-gray-400 ml-5 mt-1">{op.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Unmapped Controls */}
        {mappings.unmapped.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-5 h-5 text-yellow-400" />
              <h3 className="text-lg font-semibold text-white">
                Unmapped Controls ({mappings.unmapped.length})
              </h3>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-3">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-gray-300">
                  These controls don't match any Azure SDK operation categories. 
                  They may require manual evidence collection or different cloud providers.
                </div>
              </div>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {mappings.unmapped.slice(0, 10).map((control, idx) => {
                const controlId = control.control_id || control.id;
                const controlName = control.control_data?.control || control.control_id || 'Unknown';
                
                return (
                  <div
                    key={idx}
                    className="bg-black border border-[#333333] rounded-lg p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-gray-600" />
                      <span className="font-mono text-xs text-gray-400">{controlId}</span>
                      <span className="text-sm text-gray-300">{controlName}</span>
                    </div>
                  </div>
                );
              })}
              {mappings.unmapped.length > 10 && (
                <div className="text-xs text-gray-400 text-center py-2">
                  +{mappings.unmapped.length - 10} more unmapped controls
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

