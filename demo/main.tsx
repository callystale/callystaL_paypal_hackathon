import React from "react";
import { createRoot } from "react-dom/client";
import { Dashboard } from "../src/components/Dashboard";
import { installDemoTransport } from "./transport";
import snapshot from "./snapshot.json";
import "../src/app/globals.css";

installDemoTransport();
createRoot(document.getElementById("root")!).render(<>
  <a className="skip-link" href="#main-content">Skip to content</a>
  <div className="border-b border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-center text-xs text-cyan-100" role="note">
    <strong>DEMO MODE · Preloaded AI responses · Live AI is off</strong>
    <span className="mt-1 block text-ink-soft">This is BudgetPal’s actual interface with sample data. AI responses were saved from a local {snapshot.model} run. Suggestions use the original sample inputs. No payments are processed; changes last only in this tab.</span>
    <button className="mt-2 underline" onClick={() => window.location.reload()}>Reset demo data</button>
  </div>
  <Dashboard />
</>);
