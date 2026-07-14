import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import ErrorBoundary from "@/components/ErrorBoundary";
import Layout from "@/components/Layout";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import CreateProject from "@/pages/CreateProject";
import ProjectWorkflow from "@/pages/ProjectWorkflow";
import Settings from "@/pages/Settings";
import "@/App.css";

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              background: "#121212",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#F5F5F5",
              fontFamily: "Manrope, sans-serif",
            },
          }}
        />
        <Routes>
          <Route path="/" element={<Layout><Landing /></Layout>} />
          <Route path="/dashboard" element={<Layout><Dashboard /></Layout>} />
          <Route path="/new" element={<Layout><CreateProject /></Layout>} />
          <Route path="/project/:id" element={<Layout><ProjectWorkflow /></Layout>} />
          <Route path="/settings" element={<Layout><Settings /></Layout>} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
