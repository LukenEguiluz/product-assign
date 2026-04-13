/**
 * Interpreta lecturas tipo GS1 DataMatrix / GS1-128 sin separadores visibles,
 * p. ej. 0108714729827658172706201036802520 ≡ (01)08714729827658(17)270620(10)36802520
 */

export type Gs1ParseKind =
  | "full_01_17_10"
  | "partial_01_17"
  | "partial_01_10"
  | "gtin_01_only"
  | "plain_numeric"
  | "none";

export type Gs1ParseResult = {
  kind: Gs1ParseKind;
  gtin: string | null;
  expiryYymmdd: string | null;
  lot: string | null;
  normalizedInput: string;
};

function stripDecorators(input: string): string {
  return input
    .trim()
    .replace(/[\(\)\s]/g, "")
    .replace(/\u001d/g, "")
    .replace(/\u001e/g, "");
}

function isSixYymmdd(s: string): boolean {
  return /^\d{6}$/.test(s);
}

/**
 * Intenta extraer GTIN (AI 01, 14 dígitos), caducidad (17, YYMMDD) y lote (10, resto).
 * Sin caracter GS, el lote es todo lo que sigue al 10 hasta el final (caso típico de empaque).
 */
export function parseGs1HealthcareScan(input: string): Gs1ParseResult {
  const t = stripDecorators(input).toUpperCase();
  if (!t) {
    return {
      kind: "none",
      gtin: null,
      expiryYymmdd: null,
      lot: null,
      normalizedInput: t,
    };
  }

  const mFull = /^01(\d{14})17(\d{6})10(.+)$/.exec(t);
  if (mFull && isSixYymmdd(mFull[2])) {
    return {
      kind: "full_01_17_10",
      gtin: mFull[1],
      expiryYymmdd: mFull[2],
      lot: mFull[3],
      normalizedInput: t,
    };
  }

  const m17 = /^01(\d{14})17(\d{6})$/.exec(t);
  if (m17 && isSixYymmdd(m17[2])) {
    return {
      kind: "partial_01_17",
      gtin: m17[1],
      expiryYymmdd: m17[2],
      lot: null,
      normalizedInput: t,
    };
  }

  const m10 = /^01(\d{14})10(.+)$/.exec(t);
  if (m10) {
    return {
      kind: "partial_01_10",
      gtin: m10[1],
      expiryYymmdd: null,
      lot: m10[2],
      normalizedInput: t,
    };
  }

  const m01 = /^01(\d{14})$/.exec(t);
  if (m01) {
    return {
      kind: "gtin_01_only",
      gtin: m01[1],
      expiryYymmdd: null,
      lot: null,
      normalizedInput: t,
    };
  }

  if (/^\d{8,14}$/.test(t)) {
    return {
      kind: "plain_numeric",
      gtin: t,
      expiryYymmdd: null,
      lot: null,
      normalizedInput: t,
    };
  }

  return {
    kind: "none",
    gtin: null,
    expiryYymmdd: null,
    lot: null,
    normalizedInput: t,
  };
}

/** Variantes para buscar en catálogo (EAN-13 vs GTIN-14 con cero inicial). */
export function gtinLookupVariants(gtin: string): string[] {
  const g = (gtin || "").trim().toUpperCase().replace(/\s/g, "");
  if (!g) return [];
  const out: string[] = [];
  const push = (v: string) => {
    if (v && !out.includes(v) && v.length <= 32) out.push(v);
  };
  push(g);
  const noLeading = g.replace(/^0+/, "") || "0";
  push(noLeading);
  if (g.length === 13) push(`0${g}`);
  if (noLeading.length === 13) push(`0${noLeading}`);
  return out;
}

/**
 * AI 17 como fecha local (año 2000+YY). True si el día de caducidad es **estrictamente anterior**
 * al día calendario actual (hora local).
 */
export function isYymmddStrictlyBeforeToday(yymmdd: string): boolean {
  if (!/^\d{6}$/.test(yymmdd)) return false;
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const month = parseInt(yymmdd.slice(2, 4), 10);
  const day = parseInt(yymmdd.slice(4, 6), 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const fullYear = 2000 + yy;
  const exp = new Date(fullYear, month - 1, day);
  if (
    exp.getFullYear() !== fullYear ||
    exp.getMonth() !== month - 1 ||
    exp.getDate() !== day
  ) {
    return false;
  }
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const expStart = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());
  return expStart < todayStart;
}

export function needsGs1Review(parsed: Gs1ParseResult, rawInput: string): boolean {
  const t = rawInput.trim();
  if (parsed.kind === "none") return true;
  if (parsed.kind === "plain_numeric" && t.length <= 14 && /^\d+$/.test(t)) {
    return false;
  }
  return true;
}
