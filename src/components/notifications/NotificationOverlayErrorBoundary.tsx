/**
 * @fileoverview Isolates in-app notification overlay crashes from the rest of the tree.
 */
import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Swallows render errors in the toast/alert overlay so a missing theme (or similar)
 * cannot take down the vault UI via the root error boundary.
 */
export class NotificationOverlayErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.warn('[NotificationOverlay]', error?.message ?? 'unknown', info.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.error) return null;
    return this.props.children;
  }
}
