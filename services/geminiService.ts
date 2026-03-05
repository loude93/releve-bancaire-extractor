
import { GoogleGenAI, Type } from "@google/genai";
import { ExtractionResult } from "../types";

export const extractDataFromPdf = async (base64Pdf: string): Promise<ExtractionResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64Pdf,
          },
        },
        {
          text: "Extract all tabular data from this PDF. Additionally, identify the name of the company (société) that issued the document and the date of the document. Return the data as a JSON object containing 'companyName', 'documentDate', and an array of 'tables'. Each table should have a 'sheetName', a 'headers' array (strings), and a 'rows' array (each row is an array of strings or numbers corresponding to the headers). Ensure consistent column counts across all rows. Merge tables that split across pages if they share the same structure.",
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          companyName: { 
            type: Type.STRING, 
            description: "The name of the company (société) mentioned as the issuer or main subject of the document." 
          },
          documentDate: { 
            type: Type.STRING, 
            description: "The date of the document (e.g., invoice date, report date)." 
          },
          tables: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sheetName: { type: Type.STRING },
                headers: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                rows: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                }
              },
              required: ["sheetName", "headers", "rows"]
            }
          }
        },
        required: ["tables"]
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("No data extracted from the PDF.");
  }

  return JSON.parse(text) as ExtractionResult;
};
