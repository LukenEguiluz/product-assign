import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import NewSessionPage from "@/pages/NewSessionPage";
import SessionScanPage from "@/pages/SessionScanPage";
import UsersPage from "@/pages/UsersPage";
import ClientsPage from "@/pages/ClientsPage";
import CatalogPage from "@/pages/CatalogPage";

function Private({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="layout muted">Cargando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Private>
            <DashboardPage />
          </Private>
        }
      />
      <Route
        path="/nueva-lectura"
        element={
          <Private>
            <NewSessionPage />
          </Private>
        }
      />
      <Route
        path="/lectura/:id"
        element={
          <Private>
            <SessionScanPage />
          </Private>
        }
      />
      <Route
        path="/usuarios"
        element={
          <Private>
            <UsersPage />
          </Private>
        }
      />
      <Route
        path="/clientes"
        element={
          <Private>
            <ClientsPage />
          </Private>
        }
      />
      <Route
        path="/catalogo"
        element={
          <Private>
            <CatalogPage />
          </Private>
        }
      />
      <Route path="/clientes-y-gabinetes" element={<Navigate to="/clientes" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
