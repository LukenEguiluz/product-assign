import axios, { type AxiosError } from "axios";
import type {
  CatalogItem,
  CatalogImportResult,
  CatalogListResponse,
  Client,
  InventorySession,
  SessionScan,
  User,
} from "./types";

const baseURL =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, "") || "";

export const api = axios.create({
  baseURL: baseURL ? `${baseURL}/api` : "/api",
});

export function setTokens(access: string | null, refresh: string | null) {
  if (access) localStorage.setItem("access", access);
  else localStorage.removeItem("access");
  if (refresh) localStorage.setItem("refresh", refresh);
  else localStorage.removeItem("refresh");
}

export function getAccess() {
  return localStorage.getItem("access");
}

api.interceptors.request.use((config) => {
  const t = getAccess();
  if (t) {
    config.headers.Authorization = `Bearer ${t}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const status = err.response?.status;
    const original = err.config;
    if (
      status === 401 &&
      original &&
      !(original as { _retry?: boolean })._retry
    ) {
      (original as { _retry?: boolean })._retry = true;
      const refresh = localStorage.getItem("refresh");
      if (refresh) {
        try {
          const { data } = await axios.post<{ access: string }>(
            `${api.defaults.baseURL}/auth/refresh/`,
            { refresh },
          );
          setTokens(data.access, refresh);
          original.headers.Authorization = `Bearer ${data.access}`;
          return api(original);
        } catch {
          setTokens(null, null);
        }
      }
    }
    return Promise.reject(err);
  },
);

export async function login(username: string, password: string) {
  const { data } = await api.post<{ access: string; refresh: string }>(
    "/auth/login/",
    { username, password },
  );
  setTokens(data.access, data.refresh);
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<User>("/auth/me/");
  return data;
}

export async function createAppUser(payload: {
  username: string;
  password: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  is_active?: boolean;
}) {
  await api.post("/auth/users/", payload);
}

export async function listAppUsers(): Promise<User[]> {
  const { data } = await api.get<User[]>("/auth/users/list/");
  return data;
}

export async function setAppUserPassword(
  userId: number,
  payload: { password: string; password_confirm: string },
) {
  await api.post(`/auth/users/${userId}/password/`, payload);
}

export async function listClients(): Promise<Client[]> {
  const { data } = await api.get<Client[]>("/clients/");
  return data;
}

export async function createClient(body: {
  name: string;
  client_number: string;
}) {
  const { data } = await api.post<Client>("/clients/", body);
  return data;
}

export async function updateClient(
  id: number,
  body: Partial<{ name: string; client_number: string }>,
) {
  const { data } = await api.patch<Client>(`/clients/${id}/`, body);
  return data;
}

export async function catalogLookup(gtin: string) {
  const { data } = await api.get<{
    exists: boolean;
    gtin?: string;
    item?: CatalogItem;
  }>(`/catalog/lookup/${encodeURIComponent(gtin)}/`);
  return data;
}

export async function createCatalogItem(body: {
  gtin: string;
  reference: string;
  description?: string;
}) {
  const { data } = await api.post<CatalogItem>("/catalog/", body);
  return data;
}

export async function listCatalog(params?: {
  page?: number;
  page_size?: number;
  q?: string;
}): Promise<CatalogListResponse> {
  const { data } = await api.get<CatalogListResponse>("/catalog/", {
    params: {
      page: params?.page,
      page_size: params?.page_size,
      q: params?.q || undefined,
    },
  });
  return data;
}

export async function updateCatalogItem(
  gtin: string,
  body: Partial<{ reference: string; description: string }>,
) {
  const { data } = await api.patch<CatalogItem>(
    `/catalog/${encodeURIComponent(gtin)}/`,
    body,
  );
  return data;
}

export async function importCatalogExcel(
  file: File,
  updateExisting?: boolean,
): Promise<CatalogImportResult> {
  const fd = new FormData();
  fd.append("file", file);
  if (updateExisting) {
    fd.append("update_existing", "true");
  }
  const { data } = await api.post<CatalogImportResult>(
    "/catalog/import-excel/",
    fd,
  );
  return data;
}

export async function downloadCatalogTemplate(filename?: string) {
  const res = await api.get("/catalog/import-template/", {
    responseType: "blob",
  });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "plantilla_catalogo.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

export async function createSession(body: {
  client: number;
  delivery_number: string;
  inventory_date: string;
}) {
  const { data } = await api.post<InventorySession>("/sessions/", body);
  return data;
}

export async function getSession(id: number) {
  const { data } = await api.get<InventorySession>(`/sessions/${id}/`);
  return data;
}

export async function listSessions(params?: {
  status?: string;
  mine?: boolean;
}) {
  const { data } = await api.get<InventorySession[]>("/sessions/", {
    params: {
      status: params?.status,
      mine: params?.mine ? "1" : undefined,
    },
  });
  return data;
}

export async function startSession(id: number) {
  const { data } = await api.post<InventorySession>(`/sessions/${id}/start/`);
  return data;
}

export async function pauseSession(id: number) {
  const { data } = await api.post<InventorySession>(`/sessions/${id}/pause/`);
  return data;
}

export async function completeSession(id: number) {
  const { data } = await api.post<InventorySession>(
    `/sessions/${id}/complete/`,
  );
  return data;
}

export async function resumeSession(id: number) {
  const { data } = await api.post<InventorySession>(`/sessions/${id}/resume/`);
  return data;
}

export async function patchSessionScan(
  sessionId: number,
  scanId: number,
  body: Partial<{
    gtin: string;
    rfid_hex: string;
    expiry_yymmdd: string | null;
    batch_lot: string;
  }>,
) {
  const { data } = await api.patch<SessionScan>(
    `/sessions/${sessionId}/scans/${scanId}/`,
    body,
  );
  return data;
}

export async function excludeSessionScan(sessionId: number, scanId: number) {
  await api.delete(`/sessions/${sessionId}/scans/${scanId}/`);
}

export async function restoreSessionScan(sessionId: number, scanId: number) {
  const { data } = await api.post<SessionScan>(
    `/sessions/${sessionId}/scans/${scanId}/restore/`,
  );
  return data;
}

export async function addScan(
  id: number,
  body: {
    gtin: string;
    rfid_hex: string;
    expiry_yymmdd?: string | null;
    batch_lot?: string;
  },
) {
  const { data } = await api.post(`/sessions/${id}/scans/`, body);
  return data;
}

/** Lee el nombre sugerido por el servidor (p. ej. cliente + fecha de inventario). */
export function parseFilenameFromContentDisposition(
  header: string | undefined,
): string | null {
  if (!header) return null;
  const star = /filename\*=(?:UTF-8''|utf-8'')([^;\s]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].replace(/"/g, ""));
    } catch {
      return star[1].replace(/"/g, "");
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted?.[1]) return quoted[1];
  const plain = /filename=([^;\s]+)/i.exec(header);
  return plain?.[1]?.replace(/"/g, "") ?? null;
}

export async function downloadSessionExcel(id: number, filename?: string) {
  const res = await api.get(`/sessions/${id}/export-excel/`, {
    responseType: "blob",
  });
  const cd =
    res.headers["content-disposition"] ??
    res.headers["Content-Disposition"] ??
    undefined;
  const fromServer = parseFilenameFromContentDisposition(cd);
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? fromServer ?? `inventario_${id}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadMinMaxExcel(payload: {
  clientId: number;
  consumo: File;
  inventario: File;
  meses?: string;
  fecha_referencia?: string;
  lead_time_dias?: string;
  periodo_reabastecimiento_dias?: string;
  z_score?: string;
}) {
  const fd = new FormData();
  fd.append("client", String(payload.clientId));
  fd.append("consumo", payload.consumo);
  fd.append("inventario", payload.inventario);
  if (payload.meses) fd.append("meses", payload.meses);
  if (payload.fecha_referencia) fd.append("fecha_referencia", payload.fecha_referencia);
  if (payload.lead_time_dias) fd.append("lead_time_dias", payload.lead_time_dias);
  if (payload.periodo_reabastecimiento_dias) {
    fd.append("periodo_reabastecimiento_dias", payload.periodo_reabastecimiento_dias);
  }
  if (payload.z_score) fd.append("z_score", payload.z_score);

  const res = await api.post("/min-max/", fd, { responseType: "blob" });
  const cd =
    res.headers["content-disposition"] ??
    res.headers["Content-Disposition"] ??
    undefined;
  const fromServer = parseFilenameFromContentDisposition(cd);
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = fromServer ?? "comparativa_inventario.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
