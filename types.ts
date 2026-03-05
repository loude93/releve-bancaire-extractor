
export interface ExtractedTable {
  sheetName: string;
  headers: string[];
  rows: any[][];
}

export interface ExtractionResult {
  tables: ExtractedTable[];
  companyName?: string;
  documentDate?: string;
}

export enum FileStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface FileItem {
  id: string;
  file: File;
  status: FileStatus;
  result?: ExtractionResult;
  error?: string;
}
