"use client";
import { Component, type ReactNode } from "react";
import { reportClientError } from "@/lib/monitoring/client";

interface Props {
  fallback: (error: Error) => ReactNode;
  children: ReactNode;
  /** Model key, included in the monitoring report. */
  model?: string;
}

export class ViewerErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[VELOX 3D] viewer error:", error);
    reportClientError("3d-load", error.message || error.name, { model: this.props.model });
  }
  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}
