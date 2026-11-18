"use client";
import { Component, type ReactNode } from "react";

interface Props {
  fallback: (error: Error) => ReactNode;
  children: ReactNode;
}

export class ViewerErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[VELOX 3D] viewer error:", error);
  }
  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}
