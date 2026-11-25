import { useState, useMemo } from 'react';
import { BookOpen, Search } from 'lucide-react';
import {
  HELP_DICTIONARY_TERMS,
  HELP_DICTIONARY_CATEGORIES,
} from '../data/helpDictionary';

export default function HelpDictionaryPanel() {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return HELP_DICTIONARY_TERMS.filter((item) => {
      const matchCat = selectedCategory === 'ALL' || item.category === selectedCategory;
      const matchQuery =
        !q ||
        item.term.toLowerCase().includes(q) ||
        item.shortDesc.toLowerCase().includes(q) ||
        item.example.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [query, selectedCategory]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', color: '#0f172a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <BookOpen size={20} style={{ color: '#2563eb', flexShrink: 0 }} />
        <div>
          <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: '#0f172a' }}>
            व्यापार और GST शब्दकोश (Hinglish Help Dictionary)
          </h3>
          <span style={{ fontSize: '0.75rem', color: '#475569' }}>
            किसी भी टैक्स, रिटर्न या अकाउंटिंग शब्द का सरल अर्थ और उदाहरण खोजें
          </span>
        </div>
      </div>

      {/* Search Box */}
      <div style={{ position: 'relative' }}>
        <Search
          size={15}
          style={{
            position: 'absolute',
            left: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#64748b',
            pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="शब्द खोजें (जैसे: 43B, ITC, HSN, 44AD, 87A, Rollover, 2B, FEFO)…"
          aria-label="Search GST and business dictionary"
          style={{
            width: '100%',
            padding: '0.5rem 0.65rem 0.5rem 34px',
            background: '#ffffff',
            color: '#0f172a',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            fontSize: '0.84rem',
          }}
        />
      </div>

      {/* Category Filter Pills */}
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
        {HELP_DICTIONARY_CATEGORIES.map((cat) => {
          const active = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: '0.24rem 0.62rem',
                fontSize: '0.74rem',
                fontWeight: 700,
                borderRadius: '999px',
                cursor: 'pointer',
                border: active ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
                background: active ? '#2563eb' : '#f8fafc',
                color: active ? '#ffffff' : '#1e293b',
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Dictionary Cards */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.55rem',
          maxHeight: '340px',
          overflowY: 'auto',
          paddingRight: '0.15rem',
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              padding: '1rem',
              textAlign: 'center',
              fontSize: '0.82rem',
              color: '#475569',
            }}
          >
            &ldquo;{query}&rdquo; से मिलता कोई शब्द नहीं मिला।
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.term}
              style={{
                padding: '0.75rem',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.28rem',
                  flexWrap: 'wrap',
                }}
              >
                <strong style={{ fontSize: '0.87rem', color: '#0f172a' }}>
                  {item.term}
                </strong>
                <span
                  style={{
                    fontSize: '0.68rem',
                    padding: '0.1rem 0.5rem',
                    borderRadius: '999px',
                    background: '#dbeafe',
                    color: '#1e40af',
                    fontWeight: 700,
                  }}
                >
                  {item.category}
                </span>
              </div>
              <p
                style={{
                  margin: '0 0 0.4rem 0',
                  fontSize: '0.8rem',
                  color: '#1e293b',
                  lineHeight: 1.45,
                }}
              >
                {item.shortDesc}
              </p>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: '#334155',
                  background: '#ffffff',
                  padding: '0.4rem 0.55rem',
                  borderRadius: '6px',
                  borderLeft: '3px solid #2563eb',
                }}
              >
                <strong>उदाहरण:</strong> {item.example}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
