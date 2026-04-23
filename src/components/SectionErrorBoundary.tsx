'use client';
import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[SectionErrorBoundary] Caught error:', error.message, error.stack, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="rounded-xl border border-white/[0.08] bg-[#1E1E1E] p-8 text-center shadow-sm space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-white/[0.06] p-3">
              <AlertTriangle className="w-6 h-6 text-[#C6A664]/80" aria-hidden />
            </div>
          </div>
          <p className="text-sm text-[#FAF6F0]/85 leading-relaxed">
            {this.state.error.message}
          </p>
          <Button type="button" variant="outline" size="sm"
            className="border-white/15 text-[#FAF6F0] hover:bg-white/[0.06]"
            onClick={() => this.setState({ error: null })}>
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
