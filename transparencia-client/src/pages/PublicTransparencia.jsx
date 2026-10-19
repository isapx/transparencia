import React, { useState, useEffect } from 'react';
import { 
  Search, 
  FileDown, 
  ChevronRight, 
  Calendar, 
  BookOpen, 
  FileText, 
  ArrowLeft, 
  Building2,
  Eye,
  X,
  ExternalLink
} from 'lucide-react';

const API_BASE = 'http://localhost:4000';

function romanToInt(str) {
  if (!str) return 0;
  const match = str.match(/\b([IVXLCDM]+)\b/i);
  if (!match) return 0;

  const roman = match[1].toUpperCase();
  const romanMap = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  let prevValue = 0;

  for (let i = roman.length - 1; i >= 0; i--) {
    const current = romanMap[roman[i]] || 0;
    if (current < prevValue) {
      total -= current;
    } else {
      total += current;
      prevValue = current;
    }
  }
  return total;
}

export default function PublicTransparencia() {
  const [years, setYears] = useState([]);
  const [articles, setArticles] = useState([]);
  const [fractions, setFractions] = useState([]);
  const [documents, setDocuments] = useState([]);

  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [selectedFraction, setSelectedFraction] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('Todos');

  // Estado del visor modal
  const [previewDoc, setPreviewDoc] = useState(null);

  // Cerrar modal con la tecla Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setPreviewDoc(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/years`)
      .then(r => r.json())
      .then(data => {
        setYears(data);
        if (data.length > 0) setSelectedYear(data[0]);
      })
      .catch(err => console.error("Error cargando años:", err));
  }, []);

  useEffect(() => {
    if (!selectedYear) return;
    setSelectedArticle(null);
    setSelectedFraction(null);
    setDocuments([]);
    fetch(`${API_BASE}/api/articles/${selectedYear.id}`)
      .then(r => r.json())
      .then(setArticles)
      .catch(err => console.error("Error cargando artículos:", err));
  }, [selectedYear]);

  useEffect(() => {
    if (!selectedArticle) return;
    setSelectedFraction(null);
    setDocuments([]);
    fetch(`${API_BASE}/api/fractions/${selectedArticle.id}`)
      .then(r => r.json())
      .then(setFractions)
      .catch(err => console.error("Error cargando fracciones:", err));
  }, [selectedArticle]);

  useEffect(() => {
    if (!selectedFraction) return;
    fetch(`${API_BASE}/api/documents/${selectedFraction.id}`)
      .then(r => r.json())
      .then(setDocuments)
      .catch(err => console.error("Error cargando documentos:", err));
  }, [selectedFraction]);

  const sortedArticles = [...articles].sort((a, b) => 
    a.number.localeCompare(b.number, undefined, { numeric: true, sensitivity: 'base' })
  );

  const sortedFractions = [...fractions].sort((a, b) => {
    const numA = romanToInt(a.code);
    const numB = romanToInt(b.code);
    if (numA && numB) return numA - numB;
    return a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' });
  });

  const filteredDocs = documents.filter(doc => {
    const matchTitle = doc.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchPeriod = selectedPeriod === 'Todos' || doc.period === selectedPeriod;
    return matchTitle && matchPeriod;
  });

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      {/* Cabecera */}
      <header className="bg-slate-900 text-white py-6 px-6 shadow-md border-b-4 border-emerald-600">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold tracking-wider uppercase">
              <Building2 className="w-4 h-4" /> H. Ayuntamiento de Etchojoa
            </div>
            <h1 className="text-2xl font-black tracking-tight">Portal Ciudadano de Transparencia</h1>
          </div>
          <div className="flex items-center gap-2 bg-white/10 p-2 rounded-xl border border-white/15 backdrop-blur-sm">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-medium text-slate-200">Ejercicio Fiscal:</span>
            <select
              value={selectedYear?.id || ''}
              onChange={(e) => setSelectedYear(years.find(y => y.id === parseInt(e.target.value)))}
              className="bg-slate-800 text-white text-xs font-bold rounded px-2.5 py-1 outline-none border border-slate-700"
            >
              {years.map(y => (
                <option key={y.id} value={y.id}>Año {y.year}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Migas de pan */}
      <nav className="bg-white border-b border-slate-200 px-6 py-3 text-sm text-slate-600 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center gap-2 flex-wrap">
          <button 
            onClick={() => { setSelectedArticle(null); setSelectedFraction(null); }} 
            className="hover:text-emerald-700 font-semibold"
          >
            Año {selectedYear?.year || '—'}
          </button>
          {selectedArticle && (
            <>
              <ChevronRight className="w-4 h-4 text-slate-400" />
              <button 
                onClick={() => setSelectedFraction(null)} 
                className="hover:text-emerald-700 font-semibold"
              >
                {selectedArticle.number}
              </button>
            </>
          )}
          {selectedFraction && (
            <>
              <ChevronRight className="w-4 h-4 text-slate-400" />
              <span className="text-emerald-700 font-bold">{selectedFraction.code}</span>
            </>
          )}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6">
        {/* VISTA 1: Lista de Artículos */}
        {!selectedArticle && (
          <section className="space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
              <BookOpen className="w-5 h-5 text-emerald-700" /> Artículos ({selectedYear?.year})
            </h2>
            {sortedArticles.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No hay artículos disponibles para este año.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sortedArticles.map(art => (
                  <button
                    key={art.id}
                    onClick={() => setSelectedArticle(art)}
                    className="bg-white p-5 rounded-xl border border-slate-200 hover:border-emerald-600 text-left flex justify-between items-center group transition shadow-xs hover:shadow-sm"
                  >
                    <div className="pr-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800">
                        {art.number}
                      </span>
                      <h3 className="font-bold text-slate-900 mt-2 group-hover:text-emerald-800 transition">
                        {art.name}
                      </h3>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* VISTA 2: Lista de Fracciones */}
        {selectedArticle && !selectedFraction && (
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setSelectedArticle(null)} 
                className="flex items-center gap-1 text-xs font-semibold text-slate-600 bg-white px-3 py-1.5 rounded-lg border hover:bg-slate-50"
              >
                <ArrowLeft className="w-4 h-4" /> Volver a Artículos
              </button>
              <h2 className="text-lg font-bold text-slate-800">
                {selectedArticle.number}: {selectedArticle.name}
              </h2>
            </div>

            {sortedFractions.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No hay fracciones registradas en este artículo.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sortedFractions.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFraction(f)}
                    className="bg-white p-4 rounded-xl border border-slate-200 hover:border-emerald-600 text-left flex justify-between items-center transition shadow-xs hover:shadow-sm group"
                  >
                    <div className="pr-3">
                      <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">
                        {f.code}
                      </span>
                      <p className="text-sm font-medium text-slate-800 mt-1 line-clamp-2">
                        {f.name}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* VISTA 3: Documentos de la Fracción */}
        {selectedFraction && (
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
              <div>
                <button 
                  onClick={() => setSelectedFraction(null)} 
                  className="flex items-center gap-1 text-xs font-semibold text-slate-600 mb-2 hover:text-slate-900"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Volver a fracciones
                </button>
                <span className="text-xs font-bold text-emerald-700 uppercase">
                  {selectedFraction.code}
                </span>
                <h2 className="text-xl font-bold text-slate-900">{selectedFraction.name}</h2>
              </div>

              {/* Filtros */}
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar documento..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9 pr-3 py-1.5 text-sm border rounded-lg outline-none focus:ring-1 focus:ring-emerald-500 w-44 md:w-56"
                  />
                </div>
                <select
                  value={selectedPeriod}
                  onChange={e => setSelectedPeriod(e.target.value)}
                  className="text-sm border rounded-lg px-2.5 py-1.5 bg-white outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="Todos">Todos los periodos</option>
                  <option value="Anual">Anual</option>
                  <option value="1er Trimestre">1er Trimestre</option>
                  <option value="2do Trimestre">2do Trimestre</option>
                  <option value="3er Trimestre">3er Trimestre</option>
                  <option value="4to Trimestre">4to Trimestre</option>
                </select>
              </div>
            </div>

            {filteredDocs.length === 0 ? (
              <p className="text-center py-8 text-slate-400">No se encontraron documentos en esta fracción.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredDocs.map(doc => (
                  <div 
                    key={doc.id} 
                    className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50/30 transition gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 bg-white rounded-lg border text-emerald-700 shadow-2xs flex-shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-sm text-slate-900 truncate">{doc.title}</h4>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                          <span className="font-medium text-slate-700 bg-white border px-1.5 py-0.5 rounded">
                            {doc.period}
                          </span>
                          <span>{doc.created_at ? doc.created_at.split('T')[0] : 'Reciente'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Botón Ver PDF */}
                      <button
                        onClick={() => setPreviewDoc(doc)}
                        className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition shadow-2xs"
                        title="Previsualizar"
                      >
                        <Eye className="w-3.5 h-3.5 text-emerald-700" /> Ver
                      </button>

                      {/* Botón Descargar */}
                      <a
                        href={`${API_BASE}${doc.file_path}`}
                        download
                        className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-2xs transition"
                        title="Descargar documento"
                      >
                        <FileDown className="w-3.5 h-3.5" /> Descargar
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* MODAL VISOR DE PDF */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-5xl h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            {/* Barra superior del modal */}
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5 min-w-0 pr-4">
                <FileText className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <h3 className="text-sm font-semibold truncate">{previewDoc.title}</h3>
                <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded hidden sm:inline">
                  {previewDoc.period}
                </span>
              </div>
              
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={`${API_BASE}${previewDoc.file_path}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition"
                  title="Abrir en pestaña nueva"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <a
                  href={`${API_BASE}${previewDoc.file_path}`}
                  download
                  className="flex items-center gap-1 text-xs bg-emerald-700 hover:bg-emerald-600 text-white px-2.5 py-1.5 rounded-md font-semibold transition"
                  title="Descargar archivo"
                >
                  <FileDown className="w-3.5 h-3.5" /> Descargar
                </a>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition ml-1"
                  title="Cerrar (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Contenedor del PDF (Iframe Nativo) */}
            <div className="flex-1 w-full bg-slate-200 relative">
              <iframe
                src={`${API_BASE}${previewDoc.file_path}#toolbar=1&navpanes=0`}
                title={previewDoc.title}
                className="w-full h-full border-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}