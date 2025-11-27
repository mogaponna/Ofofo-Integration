import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-black p-4">
          <div className="w-full max-w-2xl">
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
              <h1 className="text-2xl font-semibold text-red-400 mb-4">
                Application Error
              </h1>
              <p className="text-white mb-4">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
              
              {this.state.error?.stack && (
                <details className="mt-4">
                  <summary className="text-gray-400 cursor-pointer mb-2">
                    Error Details
                  </summary>
                  <pre className="bg-[#1a1a1a] p-4 rounded text-xs text-gray-300 overflow-auto max-h-96">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
              
              {this.state.errorInfo?.componentStack && (
                <details className="mt-4">
                  <summary className="text-gray-400 cursor-pointer mb-2">
                    Component Stack
                  </summary>
                  <pre className="bg-[#1a1a1a] p-4 rounded text-xs text-gray-300 overflow-auto max-h-96">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
              
              <button
                onClick={() => window.location.reload()}
                className="mt-6 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

