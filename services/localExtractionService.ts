import { ExtractionResult } from '../types';

const CANDIDATE_ENDPOINTS = ['/.netlify/functions/extract', '/api/extract'];

const mapExtractionError = (rawMessage: string): string => {
  if (rawMessage.includes('An API Key must be set when running in a browser')) {
    return 'Une ancienne version Gemini est encore chargée dans votre navigateur. Faites un hard refresh (Ctrl/Cmd+Shift+R) et redéployez la dernière version Netlify.';
  }

  return rawMessage;
};

export const extractDataFromPdf = async (base64Pdf: string): Promise<ExtractionResult> => {
  let lastError = 'Local extraction failed';

  for (const endpoint of CANDIDATE_ENDPOINTS) {
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
  }

  throw new Error(mapExtractionError(lastError));
};
