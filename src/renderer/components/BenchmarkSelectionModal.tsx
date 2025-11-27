import { X, Play, CheckCircle2, Loader2, Clock } from 'lucide-react';

interface Benchmark {
  id: string;
  name: string;
  description: string;
  controlCount: number;
}

interface BenchmarkAnalysisStatus {
  analyzed: boolean;
  analyzing: boolean;
  analyzedAt?: string;
  fileId?: number;
}

interface BenchmarkSelectionModalProps {
  modName: string;
  modId: string;
  benchmarks: Benchmark[];
  analysisStatus: Record<string, BenchmarkAnalysisStatus>;
  onClose: () => void;
  onStartAnalysis: (modId: string, benchmarkId: string) => void;
  onViewReport: (fileId: number) => void;
}

export default function BenchmarkSelectionModal({
  modName,
  modId,
  benchmarks,
  analysisStatus,
  onClose,
  onStartAnalysis,
  onViewReport,
}: BenchmarkSelectionModalProps) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div>
            <h2 className="text-2xl font-bold text-white">{modName}</h2>
            <p className="text-sm text-gray-400 mt-1">Select a benchmark to analyze</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Benchmarks List */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid gap-4">
            {benchmarks.map((benchmark) => {
              const status = analysisStatus[benchmark.id] || { analyzed: false, analyzing: false };
              
              return (
                <div
                  key={benchmark.id}
                  className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 hover:border-gray-600 transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-white">{benchmark.name}</h3>
                        {status.analyzed && (
                          <span className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            Analyzed
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mb-3">{benchmark.description}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{benchmark.controlCount} controls</span>
                        {status.analyzedAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(status.analyzedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('[BenchmarkModal] Button clicked!', modId, benchmark.id);
                          if (!status.analyzing) {
                            console.log('[BenchmarkModal] Calling onStartAnalysis');
                            onStartAnalysis(modId, benchmark.id);
                          } else {
                            console.log('[BenchmarkModal] Already analyzing, ignoring click');
                          }
                        }}
                        disabled={status.analyzing}
                        className={`px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                          status.analyzing
                            ? 'bg-gray-700 text-gray-400 cursor-not-allowed opacity-60'
                            : status.analyzed
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white'
                        }`}
                      >
                        {status.analyzing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Analyzing...
                          </>
                        ) : status.analyzed ? (
                          <>
                            <Play className="w-4 h-4" />
                            Re-analyze
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" />
                            Start Analysis
                          </>
                        )}
                      </button>
                      
                      {status.analyzed && status.fileId && (
                        <button
                          onClick={() => onViewReport(status.fileId!)}
                          className="px-6 py-2 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-white transition-all text-sm"
                        >
                          View Report
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

