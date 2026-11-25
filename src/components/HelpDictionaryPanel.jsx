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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <BookOpen size={20} style={{ color: 'var(--primary, #2563eb)', flexShrink: 0 }} />
        <div>
          <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700 }}>
            व्यापार और GST शब्दकोश (Hinglish Help Dictionary)
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>
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
            color: 'var(--text-secondary, #64748b)',
            pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="शब्द खोजें (जैसे: 43B, ITC, HSN, 44AD, 87A, Credit Note, FEFO)…"
          aria-label="Search GST and business dictionary"
          className="form-input"
          style={{ width: '100%', paddingLeft: '34px' }}
        />
      </div>

      {/* Category Filter Pills */}
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
        {HELP_DICTIONARY_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`btn btn-sm ${selectedCategory === cat ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.22rem 0.6rem', fontSize: '0.74rem' }}
          >
            {cat}
          </button>
        ))}
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
              color: 'var(--text-secondary, #64748b)',
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
                border: '1px solid var(--border-color, #e2e8f0)',
                background: 'var(--bg-secondary, #f8fafc)',
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
                <strong style={{ fontSize: '0.86rem', color: 'var(--text-primary, #0f172a)' }}>
                  {item.term}
                </strong>
                <span
                  style={{
                    fontSize: '0.68rem',
                    padding: '0.1rem 0.5rem',
                    borderRadius: '999px',
                    background: 'rgba(37, 99, 235, 0.12)',
                    color: 'var(--primary, #2563eb)',
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
                  color: 'var(--text-primary, #334155)',
                  lineHeight: 1.45,
                }}
              >
                {item.shortDesc}
              </p>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary, #475569)',
                  background: 'var(--bg-card, #ffffff)',
                  padding: '0.4rem 0.55rem',
                  borderRadius: '6px',
                  borderLeft: '3px solid var(--primary, #2563eb)',
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
