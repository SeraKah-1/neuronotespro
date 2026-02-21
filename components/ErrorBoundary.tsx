import React, { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false
    };
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center">
            <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={24} />
            </div>
            
            <h1 className="text-lg font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-sm text-gray-500 mb-6">
              The application encountered an unexpected error.
            </p>

            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw size={16} /> Reload Page
              </button>
              
              <button
                onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
                className="w-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {this.state.showDetails ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                {this.state.showDetails ? 'Hide Details' : 'Show Error Details'}
              </button>
            </div>

            {this.state.showDetails && (
              <div className="mt-6 text-left">
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 overflow-auto max-h-48 text-xs font-mono text-gray-600">
                  <p className="text-red-600 font-bold mb-1">{this.state.error?.toString()}</p>
                  <pre className="whitespace-pre-wrap opacity-75">{this.state.errorInfo?.componentStack}</pre>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100 text-center">
                    <button 
                        onClick={() => { localStorage.clear(); window.location.reload(); }}
                        className="text-xs text-red-500 hover:text-red-700 hover:underline"
                    >
                        Clear Cache & Hard Reset
                    </button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;