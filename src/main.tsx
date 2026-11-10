import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { StoreProvider } from "./store";
import { AuthGate } from "./auth";
import { SyncProvider } from "./sync";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthGate>
      <StoreProvider>
        <SyncProvider>
          <App />
        </SyncProvider>
      </StoreProvider>
    </AuthGate>
  </StrictMode>,
);
