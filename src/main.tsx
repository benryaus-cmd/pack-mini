import React, { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/app.css";
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="fatal-error">
          <h1>Your universe is safe.</h1>
          <p>
            Something interrupted the display. Reload to return to your saved
            collection.
          </p>
          <button onClick={() => location.reload()}>RELOAD PACK MINI</button>
        </div>
      );
    return this.props.children;
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
