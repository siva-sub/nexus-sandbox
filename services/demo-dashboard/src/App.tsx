import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/code-highlight/styles.css";

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { HashRouter, BrowserRouter, Routes, Route } from "react-router-dom";

import { theme } from "./theme";
import { AppLayout } from "./components/Layout/AppLayout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { MOCK_ENABLED } from "./services/mockData";

const Router = MOCK_ENABLED ? HashRouter : BrowserRouter;
import { LandingPage } from "./pages/LandingPage";
import { PaymentPage } from "./pages/Payment";
import { FXPPage } from "./pages/FXP";
import { SAPPage } from "./pages/SAP";
import { MessagesPage } from "./pages/Messages";
import { SettingsPage } from "./pages/Settings";
import { MeshPage } from "./pages/Mesh";
import { ActorsPage } from "./pages/Actors";
import { PSPPage } from "./pages/PSP";
import { IPSPage } from "./pages/IPS";
import { PDOPage } from "./pages/PDO";
import { PaymentsExplorer } from "./pages/PaymentsExplorer";
import { ServiceDesk } from "./pages/ServiceDesk";
import { InteractiveDemo } from "./pages/InteractiveDemo";


function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications position="top-right" />
      <Router>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<LandingPage />} />
              <Route path="payment" element={<PaymentPage />} />
              <Route path="demo" element={<InteractiveDemo />} />
              <Route path="service-desk" element={<ServiceDesk />} />
              <Route path="fxp" element={<FXPPage />} />
              <Route path="sap" element={<SAPPage />} />
              <Route path="psp" element={<PSPPage />} />
              <Route path="ips" element={<IPSPage />} />
              <Route path="pdo" element={<PDOPage />} />
              <Route path="messages" element={<MessagesPage />} />
              <Route path="mesh" element={<MeshPage />} />
              <Route path="actors" element={<ActorsPage />} />
              <Route path="explorer" element={<PaymentsExplorer />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </ErrorBoundary>
      </Router>
    </MantineProvider>
  );
}

export default App;
