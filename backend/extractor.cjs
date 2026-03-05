const zlib = require('zlib');

const DATE_REGEX = /(\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b|\b\d{4}[\/-]\d{1,2}[\/-]\d{1,2}\b)/;

function readPdfStreams(buffer) {
  const pdfText = buffer.toString('latin1');
  const streamRegex = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const streams = [];

  let match;
  while ((match = streamRegex.exec(pdfText)) !== null) {
    const dict = match[1] || '';
    const raw = Buffer.from(match[2], 'latin1');

    const hasFlate = /\/Filter\s*\/FlateDecode/.test(dict);
    if (hasFlate) {
      try {
        streams.push(zlib.inflateSync(raw).toString('latin1'));
      } catch {
        streams.push(raw.toString('latin1'));
      }
    } else {
      streams.push(raw.toString('latin1'));
    }
  }

  return streams;
}

function decodePdfEscapes(str) {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\([0-7]{1,3})/g, (_m, oct) => String.fromCharCode(parseInt(oct, 8)));
}

function decodeHexPdfString(hex) {
  const normalized = hex.length % 2 ? `${hex}0` : hex;
  const bytes = [];
  for (let i = 0; i < normalized.length; i += 2) {
    bytes.push(parseInt(normalized.slice(i, i + 2), 16));
  }
  return Buffer.from(bytes).toString('latin1');
}

function extractTextFromContentStream(stream) {
  const textParts = [];
  let currentLine = [];

  const flushLine = () => {
    const line = currentLine.join('').replace(/\s+/g, ' ').trim();
    if (line) textParts.push(line);
    currentLine = [];
  };

  const tokenRegex = /(\[(?:.|\n|\r)*?\]\s*TJ|\((?:\\.|[^\\()])*\)\s*Tj|<(?:[0-9A-Fa-f\s]+)>\s*Tj|T\*|Td|TD|Tm)/g;

  let match;
  while ((match = tokenRegex.exec(stream)) !== null) {
    const token = match[0];

    if (token.endsWith('T*') || token.endsWith('Td') || token.endsWith('TD') || token.endsWith('Tm')) {
      flushLine();
      continue;
    }

    if (token.includes(' TJ')) {
      const arrayContent = token.slice(1, token.lastIndexOf(']'));
      const strRegex = /\((?:\\.|[^\\()])*\)|<(?:[0-9A-Fa-f\s]+)>/g;
      let sm;
      while ((sm = strRegex.exec(arrayContent)) !== null) {
        const s = sm[0];
        if (s.startsWith('(')) {
          currentLine.push(decodePdfEscapes(s.slice(1, -1)));
        } else {
          currentLine.push(decodeHexPdfString(s.slice(1, -1).replace(/\s+/g, '')));
        }
      }
      currentLine.push(' ');
      continue;
    }

    const parenMatch = token.match(/^\((.*)\)\s*Tj$/s);
    if (parenMatch) {
      currentLine.push(decodePdfEscapes(parenMatch[1]));
      currentLine.push(' ');
      continue;
    }

    const hexMatch = token.match(/^<([0-9A-Fa-f\s]+)>\s*Tj$/s);
    if (hexMatch) {
      currentLine.push(decodeHexPdfString(hexMatch[1].replace(/\s+/g, '')));
      currentLine.push(' ');
    }
  }

  flushLine();
  return textParts.join('\n');
}

function extractPdfText(buffer) {
  const streams = readPdfStreams(buffer);
  const textBlocks = streams
    .map(extractTextFromContentStream)
    .map((t) => t.trim())
    .filter(Boolean);

  if (textBlocks.length > 0) return textBlocks.join('\n');

  const binary = buffer.toString('latin1');
  const matches = binary.match(/\((?:\\.|[^\\()])*\)/g) || [];
  return matches
    .map((token) => decodePdfEscapes(token.slice(1, -1)))
    .map((x) => x.trim())
    .filter(Boolean)
    .join('\n');
}

function normalizeLine(line) {
  return line.replace(/[|¦]/g, ' | ').replace(/\s+/g, ' ').trim();
}

function detectCompanyName(lines) {
  const priorityPatterns = [/^(banque|bank|credit|crédit|soci[eé]t[eé])/i, /(sa|sarl|sas|spa)\b/i];

  for (const pattern of priorityPatterns) {
    const found = lines.find((line) => pattern.test(line));
    if (found) return found;
  }

  return lines[0] || null;
}

function detectDocumentDate(lines) {
  for (const line of lines) {
    const match = line.match(DATE_REGEX);
    if (match) return match[0];
  }
  return null;
}

function splitColumns(line) {
  const normalized = normalizeLine(line);
  if (normalized.includes('|')) {
    return normalized.split('|').map((c) => c.trim()).filter(Boolean);
  }

  const spaced = normalized.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
  if (spaced.length >= 2) return spaced;

  const ledger = normalized.match(/^(\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?)\s+(.+?)\s+(-?[\d\s.,]+)$/);
  if (ledger) return [ledger[1], ledger[2], ledger[3]];

  return normalized.split(/\s+/).map((c) => c.trim()).filter(Boolean);
}

function isNumericLike(value) {
  return /^-?[\d\s.,]+$/.test(value.trim());
}

function isHeaderLikeRow(row) {
  const joined = row.join(' ').toLowerCase();
  return /(date|libell|description|montant|debit|d[ée]bit|credit|cr[ée]dit|solde|réf|reference)/i.test(joined);
}

function trimNonTabularPrefix(rows) {
  let start = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (isHeaderLikeRow(row) || row.some(isNumericLike)) {
      start = i;
      break;
    }
  }
  return rows.slice(start);
}

function buildTableCandidates(lines) {
  const candidates = [];
  let current = [];

  for (const line of lines) {
    const cols = splitColumns(line);
    if (cols.length >= 2) {
      current.push(cols);
    } else if (current.length >= 2) {
      candidates.push(current);
      current = [];
    }
  }

  if (current.length >= 2) candidates.push(current);
  return candidates;
}

function normalizeTableRows(rows) {
  const widthScores = new Map();
  for (const row of rows) widthScores.set(row.length, (widthScores.get(row.length) || 0) + 1);

  const targetWidth = [...widthScores.entries()].sort((a, b) => b[1] - a[1])[0][0];

  return rows
    .filter((row) => row.length >= Math.max(2, targetWidth - 1) && row.length <= targetWidth + 1)
    .map((row) => {
      if (row.length === targetWidth) return row;
      if (row.length < targetWidth) return [...row, ...Array(targetWidth - row.length).fill('')];
      return row.slice(0, targetWidth - 1).concat(row.slice(targetWidth - 1).join(' '));
    });
}

function guessHeaders(rows) {
  const first = rows[0] || [];
  const alphaCount = first.filter((c) => /[A-Za-zÀ-ÿ]/.test(c)).length;
  const digitCount = first.filter((c) => /\d/.test(c)).length;
  const headerLike = alphaCount >= Math.max(1, digitCount);

  if (headerLike) {
    return { headers: first, dataRows: rows.slice(1) };
  }

  return {
    headers: Array.from({ length: first.length }, (_, i) => `Colonne ${i + 1}`),
    dataRows: rows,
  };
}

function extractTables(text) {
  const lines = text.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  const blocks = buildTableCandidates(lines);

  if (blocks.length === 0) {
    return [{ sheetName: 'Data', headers: ['Contenu'], rows: lines.map((line) => [line]) }];
  }

  const tables = blocks
    .map((rows) => trimNonTabularPrefix(rows))
    .filter((rows) => rows.length >= 2)
    .map((rows, index) => {
      const normalizedRows = normalizeTableRows(rows);
      const { headers, dataRows } = guessHeaders(normalizedRows);

      return {
        sheetName: index === 0 ? 'Transactions' : `Table_${index + 1}`,
        headers,
        rows: dataRows,
      };
    });

  if (tables.length === 0) {
    return [{ sheetName: 'Data', headers: ['Contenu'], rows: lines.map((line) => [line]) }];
  }

  return tables;
}

function extractFromBase64(base64Pdf) {
  const pdfBuffer = Buffer.from(base64Pdf, 'base64');
  const text = extractPdfText(pdfBuffer);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  return {
    companyName: detectCompanyName(lines),
    documentDate: detectDocumentDate(lines),
    tables: extractTables(text),
  };
}

module.exports = {
  extractFromBase64,
};
