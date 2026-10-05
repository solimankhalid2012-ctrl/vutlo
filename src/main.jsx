import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import AppRoutes from "./routes/AppRoutes.jsx";
import ErrorBoundary from "./components/common/ErrorBoundary.jsx";
import { LangProvider } from "./context/LangContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { MotionProvider } from "./components/common/Reveal.jsx";
import { installErrorReporting } from "./utils/errorReporter.js";
import { installStaleTabGuard } from "./utils/buildStamp.js";
import "./styles/globals.css";
import "./styles/themes.css";
import "./styles/animations.css";
import "./styles/rating.css";
import "./styles/loginCard.css";

installErrorReporting();
// تحديث تلقائي إن كان التبويب قديماً (نشر نسخة جديدة والتّبويب مفتوح)
installStaleTabGuard();

function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <ErrorBoundary>
        <HelmetProvider>
          <LangProvider>
            <ThemeProvider>
              <MotionProvider>
                <AppRoutes />
              </MotionProvider>
            </ThemeProvider>
          </LangProvider>
        </HelmetProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
