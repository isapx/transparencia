import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Folder, 
  Layers, 
  FileText, 
  FileUp, 
  Trash2, 
  Edit2, 
  LogOut, 
  Check, 
  X, 
  ExternalLink,
  ArrowUpDown
} from 'lucide-react';

const API_BASE = '';

// Utilidad para convertir números romanos a enteros (soporta hasta el 100)
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

export default function AdminPanel() {
  const { token, logout } = useAuth();
  const [years, setYears] = useState([]);
  const [articles, setArticles] = useState([]);
  const [fractions, setFractions] = useState([]);
  const [documents, setDocuments] = useState([]);

  // Selecciones activas
  const [selectedYearId, setSelectedYearId] = useState('');
  const [selectedArticleId, setSelectedArticleId] = useState('');
  const [selectedFractionId, setSelectedFractionId] = useState('');

  // Formularios de Creación
  const [newYear, setNewYear] = useState('');
  const [newArticle, setNewArticle] = useState({ number: '', name: '' });
  const [newFraction, setNewFraction] = useState({ code: '', name: '' });
  const [docUpload, setDocUpload] = useState({ title: '', period: '1er Trimestre', file: null });

  // Estados de Edición Inline
  const [editingYear, setEditingYear] = useState(null);
  const [editingArticle, setEditingArticle] = useState(null);
  const [editingFraction, setEditingFraction] = useState(null);

  // Estados de Ordenamiento ('name' por defecto o 'date')
  const [articleSort, setArticleSort] = useState('name');
  const [fractionSort, setFractionSort] = useState('name');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // Carga inicial de Años
  useEffect(() => {
    fetch(`${API_BASE}/api/years`)
      .then(r => r.json())
      .then(data => {
        setYears(data);
        if (data.length > 0 && !selectedYearId) {
          setSelectedYearId(data[0].id.toString());
        }
      })
      .catch(err => console.error('Error cargando años:', err));
  }, []);

  // Carga de Artículos al cambiar Año
  useEffect(() => {
    if (!selectedYearId) {
      setArticles([]);
      return;
    }
    setSelectedArticleId('');
    setSelectedFractionId('');
    setDocuments([]);
    fetch(`${API_BASE}/api/articles/${selectedYearId}`)
      .then(r => r.json())
      .then(data => {
        setArticles(data);
        if (data.length > 0) setSelectedArticleId(data[0].id.toString());
      })
      .catch(err => console.error('Error cargando artículos:', err));
  }, [selectedYearId]);

  // Carga de Fracciones al cambiar Artículo
  useEffect(() => {
    if (!selectedArticleId) {
      setFractions([]);
      return;
    }
    setSelectedFractionId('');
    setDocuments([]);
    fetch(`${API_BASE}/api/fractions/${selectedArticleId}`)
      .then(r => r.json())
      .then(data => {
        setFractions(data);
        if (data.length > 0) setSelectedFractionId(data[0].id.toString());
      })
      .catch(err => console.error('Error cargando fracciones:', err));
  }, [selectedArticleId]);

  // Carga de Documentos al cambiar Fracción
  useEffect(() => {
    if (!selectedFractionId) {
      setDocuments([]);
      return;
    }
    fetch(`${API_BASE}/api/documents/${selectedFractionId}`)
      .then(r => r.json())
      .then(setDocuments)
      .catch(err => console.error('Error cargando documentos:', err));
  }, [selectedFractionId]);

  // ===================== LÓGICA DE ORDENADO =====================
  const sortedArticles = [...articles].sort((a, b) => {
    if (articleSort === 'name') {
      return a.number.localeCompare(b.number, undefined, { numeric: true, sensitivity: 'base' });
    }
    return new Date(b.created_at || 0) - new Date(a.created_at || 0) || b.id - a.id;
  });

  const sortedFractions = [...fractions].sort((a, b) => {
    if (fractionSort === 'name') {
      const numA = romanToInt(a.code);
      const numB = romanToInt(b.code);
      if (numA && numB) return numA - numB;
      return a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' });
    }
    return new Date(b.created_at || 0) - new Date(a.created_at || 0) || b.id - a.id;
  });

  // ===================== CRUD AÑOS =====================
  const handleAddYear = async (e) => {
    e.preventDefault();
    if (!newYear) return;
    const res = await fetch(`${API_BASE}/api/years`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ year: parseInt(newYear) })
    });
    if (res.ok) {
      const added = await res.json();
      setYears([added, ...years]);
      setSelectedYearId(added.id.toString());
      setNewYear('');
    } else {
      const err = await res.json();
      alert(err.error || 'No se pudo agregar el año.');
    }
  };

  const handleUpdateYear = async () => {
    const res = await fetch(`${API_BASE}/api/years/${editingYear.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ year: parseInt(editingYear.year) })
    });
    if (res.ok) {
      setYears(years.map(y => (y.id === editingYear.id ? { ...y, year: parseInt(editingYear.year) } : y)));
      setEditingYear(null);
    }
  };

  const handleDeleteYear = async (id, e) => {
    e.stopPropagation();
    if (!confirm('¿Seguro que deseas eliminar este año? Se eliminarán todos sus artículos, fracciones y documentos.')) return;
    const res = await fetch(`${API_BASE}/api/years/${id}`, { method: 'DELETE', headers });
    if (res.ok) {
      const filtered = years.filter(y => y.id !== id);
      setYears(filtered);
      if (selectedYearId === id.toString()) {
        setSelectedYearId(filtered[0]?.id?.toString() || '');
      }
    }
  };

  // ===================== CRUD ARTÍCULOS =====================
  const handleAddArticle = async (e) => {
    e.preventDefault();
    if (!newArticle.number || !selectedYearId) return;
    const res = await fetch(`${API_BASE}/api/articles`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ yearId: selectedYearId, ...newArticle })
    });
    if (res.ok) {
      const added = await res.json();
      setArticles([...articles, added]);
      setSelectedArticleId(added.id.toString());
      setNewArticle({ number: '', name: '' });
    }
  };

  const handleUpdateArticle = async () => {
    const res = await fetch(`${API_BASE}/api/articles/${editingArticle.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(editingArticle)
    });
    if (res.ok) {
      setArticles(articles.map(a => (a.id === editingArticle.id ? { ...a, ...editingArticle } : a)));
      setEditingArticle(null);
    }
  };

  const handleDeleteArticle = async (id, e) => {
    e.stopPropagation();
    if (!confirm('¿Eliminar este artículo y todas sus fracciones?')) return;
    const res = await fetch(`${API_BASE}/api/articles/${id}`, { method: 'DELETE', headers });
    if (res.ok) {
      const filtered = articles.filter(a => a.id !== id);
      setArticles(filtered);
      if (selectedArticleId === id.toString()) {
        setSelectedArticleId(filtered[0]?.id?.toString() || '');
      }
    }
  };

  // ===================== CRUD FRACCIONES =====================
  const handleAddFraction = async (e) => {
    e.preventDefault();
    if (!newFraction.code || !selectedArticleId) return;
    const res = await fetch(`${API_BASE}/api/fractions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ articleId: selectedArticleId, ...newFraction })
    });
    if (res.ok) {
      const added = await res.json();
      setFractions([...fractions, added]);
      setSelectedFractionId(added.id.toString());
      setNewFraction({ code: '', name: '' });
    }
  };

  const handleUpdateFraction = async () => {
    const res = await fetch(`${API_BASE}/api/fractions/${editingFraction.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(editingFraction)
    });
    if (res.ok) {
      setFractions(fractions.map(f => (f.id === editingFraction.id ? { ...f, ...editingFraction } : f)));
      setEditingFraction(null);
    }
  };

  const handleDeleteFraction = async (id, e) => {
    e.stopPropagation();
    if (!confirm('¿Eliminar esta fracción y sus documentos?')) return;
    const res = await fetch(`${API_BASE}/api/fractions/${id}`, { method: 'DELETE', headers });
    if (res.ok) {
      const filtered = fractions.filter(f => f.id !== id);
      setFractions(filtered);
      if (selectedFractionId === id.toString()) {
        setSelectedFractionId(filtered[0]?.id?.toString() || '');
      }
    }
  };

  // ===================== CRUD DOCUMENTOS =====================
  const handleUploadDocument = async (e) => {
    e.preventDefault();
    if (!docUpload.file || !selectedFractionId) return;

    const formData = new FormData();
    formData.append('fractionId', selectedFractionId);
    formData.append('title', docUpload.title);
    formData.append('period', docUpload.period);
    formData.append('file', docUpload.file);

    const res = await fetch(`${API_BASE}/api/documents`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    if (res.ok) {
      const added = await res.json();
      setDocuments([...documents, added]);
      setDocUpload({ title: '', period: '1er Trimestre', file: null });
    }
  };

  const handleDeleteDocument = async (id) => {
    if (!confirm('¿Eliminar este documento?')) return;
    const res = await fetch(`${API_BASE}/api/documents/${id}`, { method: 'DELETE', headers });
    if (res.ok) setDocuments(documents.filter(d => d.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header Administrativo */}
      <header className="bg-slate-900 text-white px-8 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold tracking-tight">Panel de Administración de Transparencia</h1>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs bg-slate-800 hover:bg-slate-700 text-emerald-400 px-3 py-1.5 rounded-md border border-slate-700 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Ver Vista Pública
          </a>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-xs bg-rose-600 hover:bg-rose-700 px-3 py-1.5 rounded font-semibold transition shadow-xs"
        >
          <LogOut className="w-3.5 h-3.5" /> Salir
        </button>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* 1. SECCIÓN AÑOS */}
          <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3 font-bold text-slate-900">
                <Folder className="w-5 h-5 text-indigo-600"/> 1. Años
              </div>
              <div className="space-y-1.5 max-h-60 overflow-y-auto mb-3">
                {years.map(y => (
                  <div 
                    key={y.id} 
                    className={`flex items-center justify-between px-3 py-2 rounded-md border text-sm transition ${
                      selectedYearId === y.id.toString() 
                        ? 'bg-indigo-50 border-indigo-200 font-bold text-indigo-900' 
                        : 'border-transparent hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    {editingYear?.id === y.id ? (
                      <div className="flex items-center gap-1 w-full">
                        <input
                          type="number"
                          value={editingYear.year}
                          onChange={e => setEditingYear({ ...editingYear, year: e.target.value })}
                          className="w-20 px-1.5 py-0.5 border rounded text-xs"
                        />
                        <button onClick={handleUpdateYear} className="text-emerald-600 hover:text-emerald-800 p-1"><Check className="w-4 h-4"/></button>
                        <button onClick={() => setEditingYear(null)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-4 h-4"/></button>
                      </div>
                    ) : (
                      <>
                        <span onClick={() => setSelectedYearId(y.id.toString())} className="cursor-pointer flex-grow">
                          Año {y.year}
                        </span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditingYear({ id: y.id, year: y.year })} className="text-slate-400 hover:text-indigo-600 p-1">
                            <Edit2 className="w-3.5 h-3.5"/>
                          </button>
                          <button onClick={(e) => handleDeleteYear(y.id, e)} className="text-slate-400 hover:text-rose-600 p-1">
                            <Trash2 className="w-3.5 h-3.5"/>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <form onSubmit={handleAddYear} className="flex gap-2 pt-2 border-t border-slate-100">
              <input 
                type="number" 
                placeholder="Ej. 2026" 
                value={newYear} 
                onChange={e => setNewYear(e.target.value)} 
                className="w-full text-sm border p-1.5 rounded outline-none focus:ring-1 focus:ring-indigo-500" 
              />
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-xs font-semibold">
                Crear
              </button>
            </form>
          </section>

          {/* 2. SECCIÓN ARTÍCULOS */}
          <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Layers className="w-5 h-5 text-amber-600"/> 2. Artículos
                </div>
                {/* Selector de Orden */}
                <div className="flex items-center gap-1 text-slate-400">
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <select
                    value={articleSort}
                    onChange={(e) => setArticleSort(e.target.value)}
                    className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-700 outline-none"
                  >
                    <option value="name">Por nombre (A-Z)</option>
                    <option value="date">Más recientes</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5 max-h-60 overflow-y-auto mb-3">
                {sortedArticles.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No hay artículos en este año.</p>
                ) : (
                  sortedArticles.map(a => (
                    <div 
                      key={a.id} 
                      className={`flex items-center justify-between px-3 py-2 rounded-md border text-sm transition ${
                        selectedArticleId === a.id.toString() 
                          ? 'bg-amber-50 border-amber-200 font-bold text-amber-900' 
                          : 'border-transparent hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      {editingArticle?.id === a.id ? (
                        <div className="space-y-1 w-full">
                          <input
                            type="text"
                            value={editingArticle.number}
                            onChange={e => setEditingArticle({ ...editingArticle, number: e.target.value })}
                            className="w-full px-1.5 py-0.5 border rounded text-xs"
                          />
                          <input
                            type="text"
                            value={editingArticle.name}
                            onChange={e => setEditingArticle({ ...editingArticle, name: e.target.value })}
                            className="w-full px-1.5 py-0.5 border rounded text-xs"
                          />
                          <div className="flex justify-end gap-1 mt-1">
                            <button onClick={handleUpdateArticle} className="text-emerald-600 p-0.5"><Check className="w-4 h-4"/></button>
                            <button onClick={() => setEditingArticle(null)} className="text-slate-400 p-0.5"><X className="w-4 h-4"/></button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div onClick={() => setSelectedArticleId(a.id.toString())} className="cursor-pointer flex-grow pr-2">
                            <div>{a.number}</div>
                            <div className="text-xs font-normal text-slate-400 truncate">{a.name}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setEditingArticle({ id: a.id, number: a.number, name: a.name })} className="text-slate-400 hover:text-amber-600 p-1">
                              <Edit2 className="w-3.5 h-3.5"/>
                            </button>
                            <button onClick={(e) => handleDeleteArticle(a.id, e)} className="text-slate-400 hover:text-rose-600 p-1">
                              <Trash2 className="w-3.5 h-3.5"/>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <form onSubmit={handleAddArticle} className="space-y-2 pt-2 border-t border-slate-100">
              <input 
                type="text" 
                placeholder="Número (ej. Artículo 70)" 
                value={newArticle.number} 
                onChange={e => setNewArticle({ ...newArticle, number: e.target.value })} 
                className="w-full text-sm border p-1.5 rounded outline-none focus:ring-1 focus:ring-amber-500" 
              />
              <input 
                type="text" 
                placeholder="Descripción / Nombre" 
                value={newArticle.name} 
                onChange={e => setNewArticle({ ...newArticle, name: e.target.value })} 
                className="w-full text-sm border p-1.5 rounded outline-none focus:ring-1 focus:ring-amber-500" 
              />
              <button 
                type="submit" 
                disabled={!selectedYearId} 
                className="w-full bg-amber-600 hover:bg-amber-700 text-white py-1.5 rounded text-xs font-semibold disabled:opacity-50"
              >
                Agregar Artículo
              </button>
            </form>
          </section>

          {/* 3. SECCIÓN FRACCIONES */}
          <section className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <FileText className="w-5 h-5 text-emerald-600"/> 3. Fracciones
                </div>
                {/* Selector de Orden */}
                <div className="flex items-center gap-1 text-slate-400">
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <select
                    value={fractionSort}
                    onChange={(e) => setFractionSort(e.target.value)}
                    className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-700 outline-none"
                  >
                    <option value="name">Por nombre (A-Z)</option>
                    <option value="date">Más recientes</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5 max-h-60 overflow-y-auto mb-3">
                {sortedFractions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No hay fracciones en este artículo.</p>
                ) : (
                  sortedFractions.map(f => (
                    <div 
                      key={f.id} 
                      className={`flex items-center justify-between px-3 py-2 rounded-md border text-sm transition ${
                        selectedFractionId === f.id.toString() 
                          ? 'bg-emerald-50 border-emerald-200 font-bold text-emerald-900' 
                          : 'border-transparent hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      {editingFraction?.id === f.id ? (
                        <div className="space-y-1 w-full">
                          <input
                            type="text"
                            value={editingFraction.code}
                            onChange={e => setEditingFraction({ ...editingFraction, code: e.target.value })}
                            className="w-full px-1.5 py-0.5 border rounded text-xs"
                          />
                          <input
                            type="text"
                            value={editingFraction.name}
                            onChange={e => setEditingFraction({ ...editingFraction, name: e.target.value })}
                            className="w-full px-1.5 py-0.5 border rounded text-xs"
                          />
                          <div className="flex justify-end gap-1 mt-1">
                            <button onClick={handleUpdateFraction} className="text-emerald-600 p-0.5"><Check className="w-4 h-4"/></button>
                            <button onClick={() => setEditingFraction(null)} className="text-slate-400 p-0.5"><X className="w-4 h-4"/></button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div onClick={() => setSelectedFractionId(f.id.toString())} className="cursor-pointer flex-grow pr-2">
                            <div>{f.code}</div>
                            <div className="text-xs font-normal text-slate-400 truncate">{f.name}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setEditingFraction({ id: f.id, code: f.code, name: f.name })} className="text-slate-400 hover:text-emerald-600 p-1">
                              <Edit2 className="w-3.5 h-3.5"/>
                            </button>
                            <button onClick={(e) => handleDeleteFraction(f.id, e)} className="text-slate-400 hover:text-rose-600 p-1">
                              <Trash2 className="w-3.5 h-3.5"/>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <form onSubmit={handleAddFraction} className="space-y-2 pt-2 border-t border-slate-100">
              <input 
                type="text" 
                placeholder="Código (ej. Fracción I)" 
                value={newFraction.code} 
                onChange={e => setNewFraction({ ...newFraction, code: e.target.value })} 
                className="w-full text-sm border p-1.5 rounded outline-none focus:ring-1 focus:ring-emerald-500" 
              />
              <input 
                type="text" 
                placeholder="Nombre / Descripción" 
                value={newFraction.name} 
                onChange={e => setNewFraction({ ...newFraction, name: e.target.value })} 
                className="w-full text-sm border p-1.5 rounded outline-none focus:ring-1 focus:ring-emerald-500" 
              />
              <button 
                type="submit" 
                disabled={!selectedArticleId} 
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 rounded text-xs font-semibold disabled:opacity-50"
              >
                Agregar Fracción
              </button>
            </form>
          </section>

        </div>

        {/* 4. SUBIDA Y GESTIÓN DE DOCUMENTOS */}
        <section className="bg-white border rounded-lg p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
            <FileUp className="w-5 h-5 text-blue-600"/> Carga y Gestión de Documentos
          </h2>

          <form onSubmit={handleUploadDocument} className="flex flex-wrap items-center gap-3 pb-4 border-b border-slate-200">
            <input 
              type="text" 
              placeholder="Título descriptivo del documento" 
              required 
              value={docUpload.title} 
              onChange={e => setDocUpload({ ...docUpload, title: e.target.value })} 
              className="text-sm border rounded px-3 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 flex-grow md:flex-grow-0 md:w-80" 
            />
            <select 
              value={docUpload.period} 
              onChange={e => setDocUpload({ ...docUpload, period: e.target.value })} 
              className="text-sm border rounded px-3 py-1.5 bg-white outline-none"
            >
              <option>Anual</option>
              <option>1er Trimestre</option>
              <option>2do Trimestre</option>
              <option>3er Trimestre</option>
              <option>4to Trimestre</option>
            </select>
            <input 
              type="file" 
              required 
              onChange={e => setDocUpload({ ...docUpload, file: e.target.files[0] })} 
              className="text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" 
            />
            <button 
              type="submit" 
              disabled={!selectedFractionId} 
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <FileUp className="w-4 h-4"/> Subir Archivo
            </button>
          </form>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
                <tr>
                  <th className="py-2.5 px-3">Título</th>
                  <th className="py-2.5 px-3">Periodo</th>
                  <th className="py-2.5 px-3">Fecha de Carga</th>
                  <th className="py-2.5 px-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center py-6 text-slate-400">
                      No hay documentos cargados en esta fracción.
                    </td>
                  </tr>
                ) : (
                  documents.map(d => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-medium text-slate-800 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-400" />
                        {d.title}
                      </td>
                      <td className="py-2.5 px-3">{d.period}</td>
                      <td className="py-2.5 px-3 text-xs text-slate-400">
                        {d.created_at ? d.created_at.split('T')[0] : 'Hoy'}
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-2">
                        <a
                          href={`${API_BASE}${d.file_path}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-400 hover:text-blue-600 p-1 inline-block"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <button 
                          onClick={() => handleDeleteDocument(d.id)} 
                          className="text-slate-400 hover:text-rose-600 p-1 inline-block"
                        >
                          <Trash2 className="w-4 h-4 inline" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}