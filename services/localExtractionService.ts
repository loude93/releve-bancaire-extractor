import { ExtractionResult } from '../types';

export const extractDataFromPdf = async (base64Pdf: string): Promise<ExtractionResult> => {
  const response = await fetch('/api/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ base64Pdf }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.error || 'Local extraction failed');
  }

  return response.json() as Promise<ExtractionResult>;
};
