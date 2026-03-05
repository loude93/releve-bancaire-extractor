import { ExtractionResult } from '../types';

const CANDIDATE_ENDPOINTS = ['/.netlify/functions/extract', '/api/extract'];
const DATE_REGEX = /(\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b|\b\d{4}[\/-]\d{1,2}[\/-]\d{1,2}\b)/;

const mapExtractionError = (rawMessage: string): string => {
  if (rawMessage.includes('An API Key must be set when running in a browser')) {
    return 'Une ancienne version Gemini est encore chargée dans votre navigateur. Faites un hard refresh (Ctrl/Cmd+Shift+R) puis réessayez.';
  }

  return rawMessage;
};

const decodePdfEscapes = (str: string): string =>
  str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\([0-7]{1,3})/g, (_m, oct) => String.fromCharCode(parseInt(oct, 8)));

const decodeBase64ToLatin1 = (base64Pdf: string): string => {
  const binary = atob(base64Pdf);
  let out = '';
  for (let i = 0; i < binary.length; i += 1) {
    out += String.fromCharCode(binary.charCodeAt(i) & 0xff);
  }
  return out;
};

const normalizeLine = (line: string): string => line.replace(/[|¦]/g, ' | ').replace(/\s+/g, ' ').trim();

const detectCompanyName = (lines: string[]): string | null => {
  const priorityPatterns = [/^(banque|bank|credit|crédit|soci[eé]t[eé])/i, /(sa|sarl|sas|spa)\b/i];

  for (const pattern of priorityPatterns) {
    const found = lines.find((line) => pattern.test(line));
    if (found) return found;
  }

  return lines[0] || null;
};

const detectDocumentDate = (lines: string[]): string | null => {
  for (const line of lines) {
    const match = line.match(DATE_REGEX);
    if (match) return match[0];
  }
  return null;
};

const splitColumns = (line: string): string[] => {
  const normalized = normalizeLine(line);
  if (normalized.includes('|')) {
    return normalized.split('|').map((c) => c.trim()).filter(Boolean);
  }

  const ledger = normalized.match(/^(\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?)\s+(.+?)\s+(-?[\d\s.,]+)$/);
  if (ledger) return [ledger[1], ledger[2], ledger[3]];

  return normalized.split(/\s{2,}|\t+/).map((c) => c.trim()).filter(Boolean);
};

const extractTables = (text: string): ExtractionResult['tables'] => {
  const lines = text.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  const rows = lines.map(splitColumns).filter((r) => r.length >= 2);

  if (rows.length < 2) {
    return [{ sheetName: 'Data', headers: ['Contenu'], rows: lines.map((line) => [line]) }];
  }

  const width = rows[0].length;
  const normalizedRows = rows.map((row) => {
    if (row.length === width) return row;
    if (row.length < width) return [...row, ...Array(width - row.length).fill('')];
    return row.slice(0, width);
  });

  const first = normalizedRows[0];
  const hasLetters = first.some((cell) => /[A-Za-zÀ-ÿ]/.test(cell));
  const headers = hasLetters ? first : Array.from({ length: width }, (_, i) => `Colonne ${i + 1}`);
  const dataRows = hasLetters ? normalizedRows.slice(1) : normalizedRows;

  return [{ sheetName: 'Transactions', headers, rows: dataRows }];
};

const extractInBrowser = (base64Pdf: string): ExtractionResult => {
  const binary = decodeBase64ToLatin1(base64Pdf);
  const tokens = binary.match(/\((?:\\.|[^\\()])*\)/g) || [];
  const text = tokens
    .map((token) => decodePdfEscapes(token.slice(1, -1)))
    .map((t) => t.trim())
    .filter(Boolean)
    .join('\n');

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  return {
    companyName: detectCompanyName(lines),
    documentDate: detectDocumentDate(lines),
    tables: extractTables(text),
  };
};

export const extractDataFromPdf = async (base64Pdf: string): Promise<ExtractionResult> => {
  let lastError = 'Local extraction failed';

  for (const endpoint of CANDIDATE_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ base64Pdf }),
      });

      if (response.ok) {
        return response.json() as Promise<ExtractionResult>;
      }

      if (response.status === 404) {
        continue;
      }

      const errorPayload = await response.json().catch(() => ({}));
      lastError = errorPayload.error || lastError;
      break;
    } catch {
      continue;
    }
  }

  const mapped = mapExtractionError(lastError);
  if (mapped.includes('API Key') || mapped === 'Local extraction failed') {
    return extractInBrowser(base64Pdf);
  }

  throw new Error(mapped);
};
