// The app's only class component: catches render errors under it and shows an illustrated recovery screen
// instead of a blank page. A failed lazy chunk while offline reads as "you're offline" rather than a bug.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { EmptyState, Button } from './ui/primitives';

type Props = { children: ReactNode; /** changing it (the route) clears a caught error */ resetKey?: string; onHome?: () => void };
type State = { error: Error | null; resetKey?: string };

const CHUNK_ERROR = /dynamically imported module|Failed to fetch|Load failed|Importing a module script failed/i;

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const offline = (typeof navigator !== 'undefined' && !navigator.onLine) || CHUNK_ERROR.test(error.message ?? '');
    const retry = () => this.setState({ error: null });
    if (offline) {
      return (
        <EmptyState
          illustration="offline"
          animated
          title="You're offline"
          description="This page could not be loaded. Check the connection and try again — nothing has been lost."
          action={<Button variant="primary" onClick={retry}>Try again</Button>}
        />
      );
    }
    return (
      <EmptyState
        illustration="error"
        animated
        title="Something went wrong"
        description={error.message || 'An unexpected error interrupted this page.'}
        action={
          <>
            <Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>
            {this.props.onHome && <Button variant="secondary" onClick={() => { this.props.onHome?.(); retry(); }}>Go home</Button>}
          </>
        }
      />
    );
  }
}
