import React from 'react';

interface IErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface IErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<IErrorBoundaryProps, IErrorBoundaryState> {
  state: IErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): IErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught render-phase error', error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);

    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-background">
        <h1 className="text-2xl font-semibold text-foreground mb-3">Something went wrong</h1>
        <p className="text-muted-foreground mb-6 max-w-md">
          The PDF viewer hit an unexpected error. Reloading should recover the session; if it
          persists, the file may be malformed.
        </p>
        <pre className="text-xs text-muted-foreground bg-card/50 px-4 py-3 rounded-lg max-w-2xl overflow-auto mb-6">
          {this.state.error.message}
        </pre>
        <button
          onClick={this.reset}
          className="px-5 py-2 bg-primary text-primary-foreground border border-primary-border rounded-lg hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
      </div>
    );
  }
}
