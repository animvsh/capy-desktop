import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = "/";
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
              <i className="fa-solid fa-triangle-exclamation h-10 w-10 text-destructive" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl font-extrabold text-foreground">
                Something went wrong
              </h1>
              <p className="text-muted-foreground">
                We're sorry, but something unexpected happened. Please try refreshing the page or go back to the homepage.
              </p>
            </div>

            {process.env.NODE_ENV === "development" && this.state.error && (
              <div className="rounded-xl border-2 border-destructive/20 bg-destructive/5 p-4 text-left">
                <p className="font-mono text-sm text-destructive break-all">
                  {this.state.error.message}
                </p>
                {this.state.errorInfo && (
                  <pre className="mt-2 text-xs text-muted-foreground overflow-auto max-h-32">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <Button
                variant="outline"
                onClick={this.handleGoHome}
                className="rounded-full font-bold gap-2"
              >
                <i className="fa-solid fa-house h-4 w-4" />
                Go Home
              </Button>
              <Button
                onClick={this.handleReload}
                className="rounded-full font-bold gap-2"
              >
                <i className="fa-solid fa-rotate h-4 w-4" />
                Refresh Page
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
