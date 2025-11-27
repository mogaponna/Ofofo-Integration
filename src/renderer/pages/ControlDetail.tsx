import { useState, useEffect } from 'react';
import { ArrowLeft, Shield, CheckCircle, XCircle, AlertCircle, Loader2, Sparkles, FileText, Download, ChevronDown, ChevronUp } from 'lucide-react';

interface Control {
  id: string;
  control_id?: string;
  control_data?: any;
  implementation_status?: string;
  dataroom_id?: string;
  organization_id?: string;
  // Static data fields
  control?: string;
  domain?: string;
  grouping?: string;
  weightage?: string;
  details?: string;
  question?: string;
  evidence?: string;
  compliances?: string[];
}

interface Evidence {
  id: string;
  evidence_key?: string;
  availability_status?: string;
  evidence_data?: any;
  dataroom_id?: string;
  organization_id?: string;
}

interface ControlDetailProps {
  control: Control;
  onBack: () => void;
  user?: { email: string; token: string } | null;
}

export default function ControlDetail({ control, onBack, user }: ControlDetailProps) {
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [expandedEvidence, setExpandedEvidence] = useState<string | null>(null);

  const getControlDisplayName = (): string => {
    return control.control || control.control_data?.control || control.control_id || `Control ${control.id}`;
  };

  const getControlId = (): string => {
    return control.control_id || control.control_data?.id || control.id;
  };

  const getStatusInfo = () => {
    const status = control.implementation_status || 'NOT_ASSESSED';
    const statusMap: Record<string, { label: string; color: string; icon: any }> = {
      IMPLEMENTED: {
        label: 'Implemented',
        color: 'bg-green-500/20 text-green-400 border-green-500/30',
        icon: CheckCircle,
      },
      PARTIALLY_IMPLEMENTED: {
        label: 'In Progress',
        color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        icon: AlertCircle,
      },
      NOT_IMPLEMENTED: {
        label: 'Not Started',
        color: 'bg-red-500/20 text-red-400 border-red-500/30',
        icon: XCircle,
      },
      NOT_APPLICABLE: {
        label: 'Not Applicable',
        color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
        icon: AlertCircle,
      },
      NOT_ASSESSED: {
        label: 'Not Assessed',
        color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
        icon: AlertCircle,
      },
    };
    return statusMap[status] || statusMap.NOT_ASSESSED;
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  // Load evidence for this control
  useEffect(() => {
    loadEvidence();
  }, [control, user]);

  const loadEvidence = async () => {
    if (!user?.token) return;

    setLoadingEvidence(true);
    try {
      const result = await window.electron.db.getEvidence({
        userId: user.token,
        dataroomId: control.dataroom_id,
      });

      if (result.success && result.evidence) {
        // Get control ID for filtering
        const controlId = control.control_id || control.id;
        
        console.log('[ControlDetail] Filtering evidence for control:', controlId);
        console.log('[ControlDetail] Total evidence count:', result.evidence.length);
        
        // Filter evidence that matches this control's evidence keys
        const controlEvidenceKeys = (control.evidence || control.control_data?.evidence || '')
          .split('\n')
          .map((key: string) => key.trim())
          .filter((key: string) => key);

        console.log('[ControlDetail] Control evidence keys:', controlEvidenceKeys);

        const relevantEvidence = result.evidence.filter((ev: Evidence) => {
          // First check if evidence_key matches any of the control's evidence keys
          if (controlEvidenceKeys.length > 0) {
            const matchesKey = controlEvidenceKeys.some((key: string) => {
              const evKey = ev.evidence_key || '';
              // Exact match or starts with
              return evKey === key || evKey.startsWith(key) || key.startsWith(evKey);
            });
            if (matchesKey) return true;
          }
          
          // Also check if evidence_data contains control_id reference
          const evidenceData = ev.evidence_data || {};
          if (evidenceData.control_id === controlId || evidenceData.controlId === controlId) {
            return true;
          }
          
          // For Powerpipe controls (which don't have evidence keys), check filename pattern
          // Evidence filenames are like: subprocess-evidence-{controlId}-{timestamp}.json
          if (ev.evidence_key && ev.evidence_key.includes(controlId)) {
            return true;
          }
          
          // If no evidence keys defined and this is a Powerpipe control, don't show evidence
          // (evidence will be collected and linked by control ID)
          return false;
        });

        console.log('[ControlDetail] Filtered evidence count:', relevantEvidence.length);
        setEvidences(relevantEvidence);
      }
    } catch (error) {
      console.error('Failed to load evidence:', error);
    } finally {
      setLoadingEvidence(false);
    }
  };

  const loadAIAnalysis = async () => {
    if (!user?.token || !control.dataroom_id) return;

    setLoadingAnalysis(true);
    try {
      // TODO: Call AI analysis API when available
      // For now, simulate with a delay
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      // Mock AI analysis - replace with actual API call
      const mockAnalysis = `Based on the current implementation status and available evidence, this control requires attention. 

**Current Status:** ${statusInfo.label}

**Recommendations:**
- Review the control requirements and ensure all evidence is properly documented
- Verify that implementation aligns with compliance framework standards
- Consider automated monitoring to maintain compliance status

**Next Steps:**
1. Collect required evidence as specified in the control documentation
2. Document implementation details and procedures
3. Schedule regular reviews to ensure ongoing compliance`;

      // Mock AI score (0-100)
      const mockScore = control.implementation_status === 'IMPLEMENTED' ? 85 : 
                       control.implementation_status === 'PARTIALLY_IMPLEMENTED' ? 65 : 45;

      setAiAnalysis(mockAnalysis);
      setAiScore(mockScore);
    } catch (error) {
      console.error('Failed to load AI analysis:', error);
      setAiAnalysis('Unable to load AI analysis at this time. Please try again later.');
    } finally {
      setLoadingAnalysis(false);
    }
  };

  useEffect(() => {
    loadAIAnalysis();
  }, [control.id]);

  const getEvidenceStatusBadge = (status?: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      AVAILABLE: { label: 'Available', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
      PARTIALLY_AVAILABLE: { label: 'Partially Available', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
      UNAVAILABLE: { label: 'Unavailable', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
      PROCESSING: { label: 'Processing', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    };

    const statusInfo = statusMap[status || 'UNAVAILABLE'] || statusMap.UNAVAILABLE;
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium border ${statusInfo.color}`}>
        {statusInfo.label}
      </span>
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0.0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="p-8 lg:p-12">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>Back to Controls</span>
        </button>

        {/* Control Header Card */}
        <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-blue-400" />
              <div>
                <h1 className="text-2xl font-semibold text-white mb-1">{getControlDisplayName()}</h1>
                <span className="text-sm font-mono text-gray-400">{getControlId()}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusIcon className="w-5 h-5" />
              <span className={`px-3 py-1 rounded text-sm font-medium border ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>
          </div>
        </div>

        {/* Control Data Section */}
        <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Control Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(control.domain || control.control_data?.domain) && (
              <div>
                <span className="text-sm font-medium text-gray-400">Domain</span>
                <p className="text-white mt-1">{control.domain || control.control_data?.domain}</p>
              </div>
            )}
            {(control.grouping || control.control_data?.grouping) && (
              <div>
                <span className="text-sm font-medium text-gray-400">Functional Grouping</span>
                <p className="text-white mt-1">{control.grouping || control.control_data?.grouping}</p>
              </div>
            )}
            {(control.weightage || control.control_data?.weightage) && (
              <div>
                <span className="text-sm font-medium text-gray-400">Weightage</span>
                <p className="text-white mt-1">{control.weightage || control.control_data?.weightage}</p>
              </div>
            )}
            {(control.question || control.control_data?.question) && (
              <div className="md:col-span-2">
                <span className="text-sm font-medium text-gray-400">Assessment Question</span>
                <p className="text-white mt-1">{control.question || control.control_data?.question}</p>
              </div>
            )}
            {(control.details || control.control_data?.details) && (
              <div className="md:col-span-2">
                <span className="text-sm font-medium text-gray-400">Details</span>
                <p className="text-white mt-1">{control.details || control.control_data?.details}</p>
              </div>
            )}
            {(control.evidence || control.control_data?.evidence) && (
              <div className="md:col-span-2">
                <span className="text-sm font-medium text-gray-400">Required Evidence Keys</span>
                <p className="text-white mt-1 font-mono text-sm">{control.evidence || control.control_data?.evidence}</p>
              </div>
            )}
            {(control.compliances || control.control_data?.compliances) && Array.isArray(control.compliances || control.control_data?.compliances) && (
              <div className="md:col-span-2">
                <span className="text-sm font-medium text-gray-400">Compliance Frameworks</span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(control.compliances || control.control_data?.compliances).slice(0, 10).map((compliance: string, idx: number) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs border border-blue-500/30"
                    >
                      {compliance}
                    </span>
                  ))}
                  {(control.compliances || control.control_data?.compliances).length > 10 && (
                    <span className="px-2 py-1 text-gray-400 rounded text-xs">
                      +{(control.compliances || control.control_data?.compliances).length - 10} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Evidence Section */}
        <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-white">Evidence</h2>
            </div>
            {evidences.length > 0 && (
              <span className="text-sm text-gray-400">{evidences.length} evidence item{evidences.length > 1 ? 's' : ''}</span>
            )}
          </div>

          {loadingEvidence ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin mr-2" />
              <span className="text-gray-400">Loading evidence...</span>
            </div>
          ) : evidences.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-600" />
              <p>No evidence found for this control</p>
            </div>
          ) : (
            <div className="space-y-3">
              {evidences.map((evidence) => {
                const evidenceData = evidence.evidence_data || {};
                const sources = evidenceData.sources || [];
                const uploads = evidenceData.uploads || [];
                const isExpanded = expandedEvidence === evidence.id;

                return (
                  <div key={evidence.id} className="bg-black border border-[#333333] rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-blue-400" />
                        <div>
                          <div className="text-white font-medium">{evidence.evidence_key || 'Unknown Evidence'}</div>
                          <div className="text-xs text-gray-400 mt-1">
                            {sources.length} source{sources.length !== 1 ? 's' : ''} • {uploads.length} upload{uploads.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getEvidenceStatusBadge(evidence.availability_status)}
                        <button
                          onClick={() => setExpandedEvidence(isExpanded ? null : evidence.id)}
                          className="p-1 hover:bg-[#1a1a1a] rounded transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-[#333333] space-y-4">
                        {/* Sources */}
                        {sources.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-gray-400 mb-2">Sources</h4>
                            <div className="space-y-2">
                              {sources.map((source: any, idx: number) => (
                                <div key={idx} className="bg-[#0a0a0a] border border-[#333333] rounded p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm text-white font-medium">{source.name || 'Document'}</span>
                                    {source.llm_confidence_score && (
                                      <span className="text-xs text-blue-400">
                                        Score: {Math.round(source.llm_confidence_score * 100)}%
                                      </span>
                                    )}
                                  </div>
                                  {source.evidence_found && (
                                    <p className="text-xs text-gray-400 mb-1">{source.evidence_found}</p>
                                  )}
                                  {source.llm_reasoning && (
                                    <p className="text-xs text-gray-500 italic">{source.llm_reasoning}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Uploads */}
                        {uploads.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-gray-400 mb-2">Uploaded Files</h4>
                            <div className="space-y-2">
                              {uploads.map((upload: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between bg-[#0a0a0a] border border-[#333333] rounded p-3">
                                  <div className="flex items-center gap-3">
                                    <FileText className="w-4 h-4 text-blue-400" />
                                    <div>
                                      <div className="text-sm text-white">{upload.name || 'Unknown file'}</div>
                                      <div className="text-xs text-gray-400">{formatFileSize(upload.size || 0)}</div>
                                    </div>
                                  </div>
                                  <button className="p-1 hover:bg-[#1a1a1a] rounded transition-colors">
                                    <Download className="w-4 h-4 text-gray-400" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* AI Analysis Section */}
        <div className="bg-[#1a1a1a] border border-[#333333] rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-white">AI Analysis</h2>
            </div>
            {aiScore !== null && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">Score:</span>
                <span className={`text-xl font-bold ${
                  aiScore >= 80 ? 'text-green-400' : 
                  aiScore >= 60 ? 'text-yellow-400' : 
                  'text-red-400'
                }`}>
                  {aiScore}%
                </span>
              </div>
            )}
          </div>

          {loadingAnalysis ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin mr-2" />
              <span className="text-gray-400">Analyzing control...</span>
            </div>
          ) : aiAnalysis ? (
            <div className="prose prose-invert max-w-none">
              <div className="text-gray-300 whitespace-pre-line leading-relaxed">{aiAnalysis}</div>
            </div>
          ) : (
            <div className="text-gray-400">No analysis available for this control.</div>
          )}
        </div>
      </div>
    </div>
  );
}
