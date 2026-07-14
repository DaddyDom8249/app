import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("BeatVision runtime error", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          data-testid="runtime-error-screen"
          className="min-h-screen p-8 flex flex-col items-start justify-center max-w-3xl mx-auto"
        >
          <div className="overline text-[#FDBA74]">Runtime Error</div>
          <h1 className="font-display text-4xl md:text-5xl mt-3 mb-4 leading-none">
            BeatVision hit a visible error instead of black-screening.
          </h1>
          <p className="font-serif-italic text-2xl text-neutral-400 mb-6">
            Something went sideways. Here&apos;s what happened.
          </p>
          <pre className="font-mono text-sm p-4 bg-[#121212] border border-white/10 w-full whitespace-pre-wrap break-words text-[#F87171]">
            {(this.state.error && (this.state.error.stack || this.state.error.message)) ||
              "Unknown error"}
          </pre>
          <button
            data-testid="runtime-error-reload"
            className="btn-gold mt-6"
            onClick={() => window.location.assign("/")}
          >
            Return Home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
