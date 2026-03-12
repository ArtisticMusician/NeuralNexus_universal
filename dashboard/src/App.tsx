import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Plus, BrainCircuit, RefreshCw } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_KEY = import.meta.env.VITE_NEXUS_API_KEY;

const api = axios.create({
  baseURL: API_URL,
  headers: API_KEY ? { 'X-API-Key': API_KEY } : {}
});

function App() {
  const [query, setQuery] = useState('');
  const [memories, setMemories] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>(['fact', 'preference', 'entity', 'decision', 'other']);
  const [loading, setLoading] = useState(false);
  const [isStoreOpen, setIsStoreOpen] = useState(false);
  const [toasts, setToasts] = useState<{id: number, msg: string, type: 'error' | 'success'}[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState('fact');

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await api.get('/categories');
        if (res.data.categories) setCategories(res.data.categories);
      } catch (err) {
        console.warn('Failed to fetch categories, using defaults');
      }
    };
    fetchCategories();
  }, []);

  const addToast = (msg: string, type: 'error' | 'success' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };

  const handleRecall = async () => {
    if (!query) return;
    setLoading(true);
    try {
      const res = await api.post(`/recall`, { query, limit: 12 });
      setMemories(res.data.memories);
      setLastResponse(res.data);
    } catch (err: any) {
      addToast(err.response?.data?.error || err.message || 'Recall failed', 'error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStore = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post(`/store`, { text: newText, category: newCategory });
      setNewText('');
      setIsStoreOpen(false);
      setQuery(newText);
      addToast('Memory stored successfully', 'success');
      setLastResponse(res.data);
      handleRecall();
    } catch (err: any) {
      addToast(err.response?.data?.error || err.message || 'Store failed', 'error');
      console.error(err);
    }
  };

  return (
    <div className="dashboard-container">
      {/* Toast Container */}
      <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 100, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {toasts.map(t => (
          <div key={t.id} style={{ background: t.type === 'error' ? '#ef4444' : '#10b981', color: 'white', padding: '0.75rem 1.25rem', borderRadius: '0.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            {t.msg}
          </div>
        ))}
      </div>

      <header>
        <div className="title">
          <BrainCircuit size={32} />
          <span>Neural Nexus Universal</span>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={() => setShowDebug(!showDebug)} style={{ background: '#334155' }}>
            {showDebug ? 'Hide Debug' : 'Show Debug'}
          </button>
          <button onClick={() => setIsStoreOpen(!isStoreOpen)}>
            <Plus size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
            Store New Memory
          </button>
        </div>
      </header>

      {showDebug && lastResponse && (
        <div style={{ background: '#0f172a', border: '1px solid #334155', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem', fontSize: '0.8rem', overflow: 'auto', maxHeight: '300px' }}>
          <h4 style={{ marginTop: 0 }}>Recent API Response</h4>
          <pre style={{ margin: 0 }}>{JSON.stringify(lastResponse, null, 2)}</pre>
        </div>
      )}

      {isStoreOpen && (
        <form onSubmit={handleStore} style={{ marginBottom: '2rem', padding: '1.5rem', background: '#1e293b', borderRadius: '1rem', border: '1px solid #334155' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label>Category</label>
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label>Memory Text</label>
            <textarea
              rows={4}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="What should I remember?"
            />
          </div>
          <button type="submit">Save to Neural Nexus</button>
        </form>
      )}

      <div className="search-section">
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={20} style={{ position: 'absolute', left: '12px', top: '14px', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search your memories..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRecall()}
            style={{ paddingLeft: '40px' }}
          />
        </div>
        <button onClick={handleRecall}>
          {loading ? <RefreshCw className="animate-spin" size={20} /> : 'Recall'}
        </button>
      </div>

      <div className="memories-grid">
        {memories.map((m) => (
          <div key={m.id} className="memory-card">
            <span className="badge">{m.category}</span>
            <div className="memory-text">{m.text}</div>
            <div className="memory-footer">
              <span>Score: {m.metadata.decayed_score?.toFixed(4)}</span>
              <span>{new Date(m.metadata.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
        {!loading && memories.length === 0 && query && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
            No relevant memories found for this query.
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
