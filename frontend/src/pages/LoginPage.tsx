import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password);
    } catch {
      setError("Usuario o contraseña incorrectos.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="layout layout--narrow layout--centered">
      <div>
        <h1>Inventario GTIN ↔ RFID</h1>
        <p className="muted">Inicie sesión para continuar.</p>
        <form className="card stack" onSubmit={onSubmit}>
          <label>
            Usuario
            <input
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button type="submit" className="btn btn--block" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
