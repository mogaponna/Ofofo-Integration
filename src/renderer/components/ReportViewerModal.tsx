import { X, Download, Upload, Loader2, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface ReportViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: {
    modName: string;
    benchmarkName: string;
    markdown: string;
    jsonResults?: any;
  };
  onUploadToDataroom: (report: any) => Promise<void>;
}

export default function ReportViewerModal({
  isOpen,
  onClose,
  report,
  onUploadToDataroom,
}: ReportViewerModalProps) {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);

  if (!isOpen) return null;

  const handleDownload = () => {
    const blob = new Blob([report.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.modName}-${report.benchmarkName}-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleUpload = async () => {
    setUploading(true);
    try {
      await onUploadToDataroom(report);
      setUploaded(true);
      setTimeout(() => {
        setUploaded(false);
      }, 3000);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl border border-gray-700 w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white">{report.modName} Report</h2>
            <p className="text-sm text-gray-400 mt-1">Benchmark: {report.benchmarkName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{report.markdown}</ReactMarkdown>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700 bg-gray-900/50">
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-white"
          >
            <Download className="w-4 h-4" />
            <span>Download Report</span>
          </button>
          
          <button
            onClick={handleUpload}
            disabled={uploading || uploaded}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all ${
              uploaded
                ? 'bg-green-600 hover:bg-green-700'
                : uploading
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 hover:shadow-lg'
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Uploading...</span>
              </>
            ) : uploaded ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Uploaded!</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>Upload to Dataroom</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

