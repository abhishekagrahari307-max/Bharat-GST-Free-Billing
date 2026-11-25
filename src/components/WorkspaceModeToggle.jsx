const MODE_KEY = 'bharatgst_ui_mode'; // 'SHOP' | 'PRO'

export const SHOP_POS_ALLOWED_IDS = ['dashboard', 'new', 'inventory', 'clients'];

export function getSavedWorkspaceMode() {
  try {
    const v = globalThis.localStorage?.getItem(MODE_KEY);
    return v === 'SHOP' ? 'SHOP' : 'PRO';
  } catch {
    return 'PRO';
  }
}

export default function WorkspaceModeToggle({ mode, onChange }) {
  const handleSelect = (nextMode) => {
    try {
      globalThis.localStorage?.setItem(MODE_KEY, nextMode);
    } catch { /* ignore */ }
    onChange?.(nextMode);
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0.25rem',
        margin: '0 0.65rem 0.55rem',
        padding: '0.22rem',
        borderRadius: 9,
        background: 'rgba(15, 23, 42, 0.35)',
        border: '1px solid rgba(148, 163, 184, 0.2)',
      }}
      title="Switch between Simple 5-Tab Shop POS Mode and Full CA / Enterprise ERP"
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handleSelect('SHOP'); }}
        style={{
          padding: '0.32rem 0.45rem',
          borderRadius: 6,
          border: 'none',
          fontSize: '0.7rem',
          fontWeight: 700,
          cursor: 'pointer',
          background: mode === 'SHOP' ? '#059669' : 'transparent',
          color: mode === 'SHOP' ? '#ffffff' : '#cbd5e1',
        }}
      >
        🏪 Shop POS
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handleSelect('PRO'); }}
        style={{
          padding: '0.32rem 0.45rem',
          borderRadius: 6,
          border: 'none',
          fontSize: '0.7rem',
          fontWeight: 700,
          cursor: 'pointer',
          background: mode === 'PRO' ? '#4f46e5' : 'transparent',
          color: mode === 'PRO' ? '#ffffff' : '#cbd5e1',
        }}
      >
        📊 CA &amp; Pro ERP
      </button>
    </div>
  );
}
