
import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { FileUp, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Download, RefreshCw, ChevronRight, Files, Trash2, Clock, Building2, Calendar, Linkedin } from 'lucide-react';
import { FileStatus, FileItem, ExtractionResult } from './types';
import { extractDataFromPdf } from './services/geminiService';

const App: React.FC = () => {
  const [fileList, setFileList] = useState<FileItem[]>([]);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const processingRef = useRef(false);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newItems: FileItem[] = (Array.from(files) as File[])
      .filter(f => f.type === 'application/pdf')
      .map(f => ({
        id: Math.random().toString(36).substr(2, 9),
        file: f,
        status: FileStatus.PENDING
      }));

    if (newItems.length === 0) {
      alert("Please upload PDF files.");
      return;
    }

    setFileList(prev => [...prev, ...newItems]);
  };

  useEffect(() => {
    const processQueue = async () => {
      if (processingRef.current) return;
      
      const nextPending = fileList.find(item => item.status === FileStatus.PENDING);
      if (!nextPending) {
        setIsProcessingBatch(false);
        return;
      }

      processingRef.current = true;
      setIsProcessingBatch(true);

      setFileList(prev => prev.map(item => 
        item.id === nextPending.id ? { ...item, status: FileStatus.PROCESSING } : item
      ));

      try {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(nextPending.file);
        });

        const base64 = await base64Promise;
        const result = await extractDataFromPdf(base64);

        setFileList(prev => prev.map(item => 
          item.id === nextPending.id ? { ...item, status: FileStatus.SUCCESS, result } : item
        ));
      } catch (err: any) {
        console.error(err);
        setFileList(prev => prev.map(item => 
          item.id === nextPending.id ? { ...item, status: FileStatus.ERROR, error: err.message || 'Processing failed' } : item
        ));
      } finally {
        processingRef.current = false;
      }
    };

    processQueue();
  }, [fileList]);

  const generateExcelBlob = (result: ExtractionResult): Blob => {
    const workbook = XLSX.utils.book_new();
    result.tables.forEach((table) => {
      // Add document info at the top of each sheet
      const infoRows = [
        ["Société:", result.companyName || "N/A"],
        ["Date du document:", result.documentDate || "N/A"],
        [], // Spacer
      ];
      const data = [...infoRows, table.headers, ...table.rows];
      const worksheet = XLSX.utils.aoa_to_sheet(data);
      
      // Basic styling for the info section if supported (XLSX basic doesn't do much style, but we can set widths)
      const maxCol = table.headers.length;
      worksheet['!cols'] = Array(maxCol).fill({ wch: 20 });
      
      XLSX.utils.book_append_sheet(workbook, worksheet, table.sheetName.substring(0, 31));
    });
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  const downloadSingleExcel = (item: FileItem) => {
    if (!item.result) return;
    const blob = generateExcelBlob(item.result);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.file.name.replace(/\.[^/.]+$/, "") + ".xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAllAsZip = async () => {
    const successItems = fileList.filter(item => item.status === FileStatus.SUCCESS && item.result);
    if (successItems.length === 0) return;

    const zip = new JSZip();
    successItems.forEach(item => {
      const blob = generateExcelBlob(item.result!);
      zip.file(item.file.name.replace(/\.[^/.]+$/, "") + ".xlsx", blob);
    });

    const zipContent = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipContent);
    const a = document.createElement('a');
    a.href = url;
    a.download = "batch_converted_files.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const removeFile = (id: string) => {
    setFileList(prev => prev.filter(item => item.id !== id));
  };

  const clearAll = () => {
    if (confirm("Effacer tous les fichiers ?")) {
      setFileList([]);
    }
  };

  const completedCount = fileList.filter(f => f.status === FileStatus.SUCCESS).length;
  const errorCount = fileList.filter(f => f.status === FileStatus.ERROR).length;
  const pendingCount = fileList.filter(f => f.status === FileStatus.PENDING || f.status === FileStatus.PROCESSING).length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="max-w-4xl w-full text-center mb-10">
        <div className="inline-flex items-center justify-center p-3 bg-indigo-600 rounded-2xl shadow-lg mb-6">
          <FileSpreadsheet className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl mb-4">
          PDF to Excel <span className="text-indigo-600">Smart Batch</span>
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Conversion intelligente avec détection automatique de la <strong>société</strong> et de la <strong>date</strong>.
        </p>
      </div>

      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 border border-slate-100">
            <label className="group relative block w-full cursor-pointer">
              <input
                type="file"
                className="sr-only"
                accept=".pdf"
                multiple
                onChange={handleFileUpload}
              />
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl p-6 bg-slate-50/50 group-hover:border-indigo-400 group-hover:bg-indigo-50/30 transition-all duration-300">
                <FileUp className="w-10 h-10 text-indigo-600 mb-3" />
                <span className="text-sm font-semibold text-slate-900">Ajouter des PDFs</span>
              </div>
            </label>

            <div className="mt-6 space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Terminés</span>
                <span className="font-bold text-green-600">{completedCount}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Erreurs</span>
                <span className="font-bold text-red-500">{errorCount}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">En cours</span>
                <span className="font-bold text-indigo-600">{pendingCount}</span>
              </div>
              
              <div className="pt-4 border-t border-slate-100 flex gap-2">
                <button
                  disabled={completedCount === 0}
                  onClick={downloadAllAsZip}
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white py-3 px-4 rounded-xl text-sm font-bold transition-all shadow-md"
                >
                  <Download className="w-4 h-4" />
                  Télécharger ZIP
                </button>
                <button
                  onClick={clearAll}
                  className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-slate-100"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl">
            <h4 className="font-bold mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-indigo-400" />
              Extraction Intelligente
            </h4>
            <ul className="text-xs space-y-2 text-slate-400">
              <li className="flex gap-2">
                <span className="text-indigo-400">•</span>
                Détection automatique de l'émetteur (société).
              </li>
              <li className="flex gap-2">
                <span className="text-indigo-400">•</span>
                Extraction de la date du document.
              </li>
              <li className="flex gap-2">
                <span className="text-indigo-400">•</span>
                Support multi-tableaux et multi-pages.
              </li>
            </ul>
          </div>
        </div>

        {/* Main List */}
        <div className="lg:col-span-8">
          <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden min-h-[500px] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">File d'attente</h3>
              <span className="text-xs font-medium bg-white px-2.5 py-1 rounded-full border border-slate-200 text-slate-500 shadow-sm">
                {fileList.length} fichiers
              </span>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[700px] p-6 space-y-4">
              {fileList.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-32">
                  <Files className="w-20 h-20 mb-4 opacity-10" />
                  <p className="text-lg font-medium">Glissez-déposez vos fichiers PDF ici</p>
                  <p className="text-sm">Ils seront convertis automatiquement</p>
                </div>
              ) : (
                fileList.map((item) => (
                  <div 
                    key={item.id} 
                    className={`group relative flex flex-col p-5 rounded-2xl border transition-all duration-300 ${
                      item.status === FileStatus.PROCESSING ? 'bg-indigo-50 border-indigo-200 ring-4 ring-indigo-50' : 
                      item.status === FileStatus.SUCCESS ? 'bg-white border-green-100 shadow-sm' : 
                      item.status === FileStatus.ERROR ? 'bg-red-50 border-red-100' :
                      'bg-white border-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className={`p-2.5 rounded-xl ${
                          item.status === FileStatus.PROCESSING ? 'bg-indigo-600 text-white animate-pulse shadow-indigo-200 shadow-lg' :
                          item.status === FileStatus.SUCCESS ? 'bg-green-100 text-green-600' :
                          item.status === FileStatus.ERROR ? 'bg-red-100 text-red-600' :
                          'bg-slate-100 text-slate-400'
                        }`}>
                          {item.status === FileStatus.PROCESSING ? <Loader2 className="w-6 h-6 animate-spin" /> :
                           item.status === FileStatus.SUCCESS ? <CheckCircle2 className="w-6 h-6" /> :
                           item.status === FileStatus.ERROR ? <AlertCircle className="w-6 h-6" /> :
                           <Clock className="w-6 h-6" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-900 truncate">{item.file.name}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                             <span className="text-xs text-slate-500 flex items-center gap-1">
                               {(item.file.size / 1024 / 1024).toFixed(2)} MB
                             </span>
                             {item.result && (
                               <>
                                 <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                                   <Building2 className="w-3 h-3 text-indigo-500" />
                                   {item.result.companyName || "Société inconnue"}
                                 </span>
                                 <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                                   <Calendar className="w-3 h-3 text-indigo-500" />
                                   {item.result.documentDate || "Date inconnue"}
                                 </span>
                               </>
                             )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        {item.status === FileStatus.SUCCESS && (
                          <button
                            onClick={() => downloadSingleExcel(item)}
                            className="p-3 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl transition-all shadow-sm"
                            title="Télécharger Excel"
                          >
                            <Download className="w-5 h-5" />
                          </button>
                        )}
                        <button
                          onClick={() => removeFile(item.id)}
                          className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    
                    {item.status === FileStatus.ERROR && (
                      <div className="mt-3 p-2 bg-red-100/50 rounded-lg text-xs text-red-700 border border-red-100">
                        {item.error || 'Erreur lors de l\'extraction'}
                      </div>
                    )}

                    {item.status === FileStatus.PROCESSING && (
                      <div className="mt-4 h-1.5 w-full bg-indigo-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600 animate-[progress_1.5s_ease-in-out_infinite] rounded-full" />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes progress {
          0% { width: 0%; transform: translateX(-100%); }
          50% { width: 30%; }
          100% { width: 0%; transform: translateX(400%); }
        }
      `}</style>
      <footer className="mt-12 text-center text-slate-400 text-sm pb-8">
        <p className="mb-2">Made by <span className="font-semibold text-slate-600">Maissine</span></p>
        <a 
          href="https://www.linkedin.com/in/mohammed-maissine-15b654100/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-indigo-500 hover:text-indigo-600 transition-colors font-medium"
        >
          <Linkedin className="w-4 h-4" />
          Visite my LinkedIn page
        </a>
      </footer>
    </div>
  );
};

export default App;
