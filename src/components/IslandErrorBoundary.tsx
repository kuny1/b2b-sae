// Island-specific ErrorBoundary wrapper.
// On crash: returns null (empty area), reports to monitoring.
// Recovery: TCC renderer switch to "jquery" + page refresh.
// Note: ErrorBoundary CANNOT restore JSP content — the React branch
//       never received JSP HTML. See plan.md §可用性保障 for details.

import { Component } from 'preact/compat';
import type { ComponentChildren } from 'preact';

interface Props {
  islandName: string;
  children: ComponentChildren;
}

interface State {
  crashed: boolean;
}

export class IslandErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error) {
    console.error(
      `[Island:${this.props.islandName}] crashed:`,
      error.message,
      '\nRecovery: switch TCC island.routes renderer to "jquery"',
    );
    // TODO: integrate with monitoring SDK (e.g., Tingyun, Sentry)
    // monitoring.reportError({
    //   category: 'island-crash',
    //   island: this.props.islandName,
    //   error: error.message,
    // });
  }

  render() {
    if (this.state.crashed) {
      return null; // Empty area — does not affect rest of page
    }
    return this.props.children;
  }
}
