import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n/config";
import { initTheme } from "./store/useAppStore";
import { TooltipProvider } from "@/components/ui/tooltip";

initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={200}>
      <App />
    </TooltipProvider>
  </React.StrictMode>,
);
