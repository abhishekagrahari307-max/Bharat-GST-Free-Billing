import { useState } from 'react';
import { ChevronDown, Smartphone, Sparkles } from 'lucide-react';
import { menuGroups, closedGroups, toggleGroup } from '../utils/menuGroups';
import { getMenuOrder, getMenuClosed, setMenuClosed } from '../store';
import { rollupDot } from '../utils/attention';

// Commercial SaaS display labels for the canonical menu groups
// (utils/menuGroups.js keeps its canonical ids/labels for saved-order & unit-test compatibility).
const COMMERCIAL_GROUP_LABELS = {
  sales: 'Billing & Khata',
  stock: 'Stock & Purchase',
  money: 'Tax, Accounting & CA',
};

const CONNECT_CLOSED_KEY = 'bharatgst_connect_group_closed';

// The red dot, with a small count when it helps. Its words are read out with
// the button's name and shown on hover. The count is drawn by CSS (data-count),
// so the button's own text stays just its name.
export function NavDot({ dot }) {
  if (!dot) return null;
  return (
    <span className={`nav-dot${dot.count ? ' nav-dot-count' : ''}`} role="img" aria-label={dot.text} title={dot.text}
      data-count={dot.count ? (dot.count > 99 ? '99+' : String(dot.count)) : undefined} />
  );
}

export default function SidebarMenu({ items, currentView, onPick, dots = {} }) {
  const byId = Object.fromEntries(items.map(i => [i.id, i]));
  const closed = closedGroups(getMenuClosed());
  const [connectClosed, setConnectClosed] = useState(() => {
    try { return localStorage.getItem(CONNECT_CLOSED_KEY) === '1'; } catch { return false; }
  });

  // Switched-off and hidden items are left out; a group with none to show is hidden.
  const groups = menuGroups(getMenuOrder())
    .map(g => ({
      ...g,
      displayLabel: COMMERCIAL_GROUP_LABELS[g.id] || g.label,
      visible: g.items.filter(id => byId[id]),
    }))
    .filter(g => g.visible.length);

  const connectItems = [
    {
      id: 'connect-sync',
      label: 'Mobile ↔ PC Sync & B2B',
      icon: Smartphone,
      badge: '5G',
    },
    {
      id: 'newfeatures',
      label: 'All New Functions Hub',
      icon: Sparkles,
      badge: '14',
    },
  ];
  const connectRows = connectClosed
    ? connectItems.filter((it) => it.id === currentView)
    : connectItems;

  const renderConnectSection = () => (
    <div
      key="connect-sync-group"
      data-nav-group="connect"
      className={`nav-group${connectClosed && !connectRows.length ? ' nav-group-shut' : ''}`}
    >
      <div className="nav-group-head">
        <button
          type="button"
          className="nav-group-btn"
          data-keep-open
          aria-expanded={!connectClosed}
          aria-controls="nav-group-connect"
          title={`${connectClosed ? 'Open' : 'Close'} Connect & Sync`}
          onClick={() => {
            const next = !connectClosed;
            setConnectClosed(next);
            try { localStorage.setItem(CONNECT_CLOSED_KEY, next ? '1' : '0'); } catch { /* ignore */ }
          }}
        >
          <span className="nav-group-label">Connect &amp; Sync</span>
          <ChevronDown size={14} className={`nav-group-chevron${connectClosed ? ' closed' : ''}`} aria-hidden="true" />
        </button>
      </div>
      <div id="nav-group-connect" className="nav-group-items">
        {connectRows.map((it) => {
          const Icon = it.icon;
          const active = currentView === it.id;
          return (
            <div key={it.id} data-nav-item={it.id} className="nav-row">
              <button
                type="button"
                className={`nav-btn ${active ? 'nav-btn-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => onPick(it)}
              >
                <Icon size={18} />
                <span style={{ flex: 1, textAlign: 'left' }}>{it.label}</span>
                {it.badge && (
                  <span
                    style={{
                      fontSize: '0.64rem',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '999px',
                      background: active ? 'rgba(255,255,255,0.22)' : 'rgba(56, 189, 248, 0.16)',
                      color: active ? '#ffffff' : '#7dd3fc',
                    }}
                  >
                    {it.badge}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Place Connect & Sync right before Tax, Accounting & CA (or at the end in Shop POS mode)
  const moneyIdx = groups.findIndex((g) => g.id === 'money');
  const insertIdx = moneyIdx === -1 ? groups.length : moneyIdx;

  return (
    <div className="nav-groups">
      {groups.map((g, idx) => {
        const isClosed = closed.includes(g.id);
        const rows = isClosed ? g.visible.filter(id => id === currentView) : g.visible;
        const headDot = rollupDot(g.items.filter(id => !rows.includes(id)), dots);
        const block = (
          <div key={g.id} data-nav-group={g.id} className={`nav-group${isClosed && !rows.length ? ' nav-group-shut' : ''}${headDot ? ' nav-group-has-dot' : ''}`}>
            <div className="nav-group-head">
              <button type="button" className="nav-group-btn" data-keep-open
                aria-expanded={!isClosed} aria-controls={`nav-group-${g.id}`}
                title={`${isClosed ? 'Open' : 'Close'} ${g.displayLabel}${headDot ? ` - ${headDot.text}` : ''}`}
                onClick={() => setMenuClosed(toggleGroup(closed, g.id))}>
                <span className="nav-group-label">{g.displayLabel}</span>
                <NavDot dot={headDot} />
                <ChevronDown size={14} className={`nav-group-chevron${isClosed ? ' closed' : ''}`} aria-hidden="true" />
              </button>
            </div>
            <div id={`nav-group-${g.id}`} className="nav-group-items">
              {rows.map(id => {
                const item = byId[id];
                const Icon = item.icon;
                return (
                  <div key={id} data-nav-item={id} className="nav-row">
                    <button type="button" className={`nav-btn ${currentView === id ? 'nav-btn-active' : ''}`}
                      aria-current={currentView === id ? 'page' : undefined} title={dots[id]?.text} onClick={() => onPick(item)}>
                      <Icon size={18} />
                      <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                      {id === 'new' && (
                        <span
                          style={{
                            fontSize: '0.62rem',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: 'rgba(255,255,255,0.12)',
                            color: '#cbd5e1',
                          }}
                        >
                          F2
                        </span>
                      )}
                      <NavDot dot={dots[id]} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
        if (idx === insertIdx) {
          return [renderConnectSection(), block];
        }
        return block;
      })}
      {insertIdx === groups.length && renderConnectSection()}
    </div>
  );
}
