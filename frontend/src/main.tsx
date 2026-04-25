import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";

import App from "./App";
import { apiFetcher } from "./api/client";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SWRConfig
      value={{
        fetcher: apiFetcher,
        revalidateOnFocus: false,
        dedupingInterval: 4_000,
      }}
    >
      <App />
    </SWRConfig>
  </StrictMode>,
);
