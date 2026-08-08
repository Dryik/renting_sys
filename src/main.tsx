import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { rendererQueryClient } from "./data/query-client";
import { RendererSessionProvider } from "./data/RendererSessionProvider";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={rendererQueryClient}>
      <RendererSessionProvider>
        <App />
      </RendererSessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
