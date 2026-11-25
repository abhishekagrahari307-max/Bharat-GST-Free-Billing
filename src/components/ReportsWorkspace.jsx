import { BookOpen, Users, Calculator, ShieldCheck } from 'lucide-react';

/**
 * 4-Pillar Segmented Reports & CA Desk Workspace Header (v5.4.0).
 * Replaces 12 crowded flat buttons with 4 organized commercial report pillars:
 * 1. Financial Statements (P&L, Trial Balance & JV, Balance Sheet)
 * 2. Party, Stock & Aging (Outstanding Aging, Party Ledger, Client/Product Analytics, Stock, Cost Centres)
 * 3. Income Tax, 2B & GST Shield (GSTR-2B Action Sheet, ITR-3/4 & 26Q, Sec 43B(h) Munim, Notice Shield, TDS/TCS)
 * 4. CA Audit & Year-End (SHA-256 Audit Chain, CA Multi-Client .bharatca Hub, 31-Mar Year-End Rollover, Godown/BOM)
 */
export const REPORT_PILLARS = [
  {
    id: 'FINANCIAL',
    label: 'Financial Statements',
    Icon: BookOpen,
    tabs: [
      { id: 'pl', label: 'Profit & Loss' },
      { id: 'doubleentry', label: 'Trial Balance & JV (F4–F7)' },
      { id: 'balancesheet', label: 'Schedule III Balance Sheet' },
    ],
  },
  {
    id: 'PARTY_STOCK',
    label: 'Party, Stock & Aging',
    Icon: Users,
    tabs: [
      { id: 'aging', label: 'Outstanding & Aging' },
      { id: 'party', label: 'Party Outstanding' },
      { id: 'clients', label: 'Client Analytics' },
      { id: 'products', label: 'Product Performance' },
      { id: 'stock', label: 'Stock Valuation' },
      { id: 'costcentres', label: 'By Cost Centre', requiresCostCentre: true },
    ],
  },
  {
    id: 'TAX',
    label: 'Income Tax & 2B',
    Icon: Calculator,
    tabs: [
      { id: 'ent:fuzzy2b', label: 'GSTR-2B ITC Action Sheet' },
      { id: 'ent:itr', label: 'ITR-3/4, AIS & Form 26Q' },
      { id: 'ent:munim', label: 'Sec 43B(h) MSME & AI Munim' },
      { id: 'ent:notice', label: 'GST Notice Shield & GSTR-9' },
      { id: 'tds', label: 'TDS & TCS Register' },
    ],
  },
  {
    id: 'CA_AUDIT',
    label: 'CA Audit & Year-End',
    Icon: ShieldCheck,
    tabs: [
      { id: 'cadesk', label: 'SHA-256 Audit Chain & .bharatca' },
      { id: 'ent:cahub', label: 'CA Multi-Client Hub' },
      { id: 'ent:rollover', label: '31 March Year-End Rollover' },
      { id: 'ent:supplychain', label: 'Multi-Godown, FEFO & BOM' },
      { id: 'ent:forecast', label: '30-Day Cash & Dead-Stock AI' },
    ],
  },
];

export default function ReportsWorkspace({
  activePillar = 'FINANCIAL',
  activeSubTab = 'pl',
  costCentresEnabled = false,
  helpSlot = null,
  onSelectPillar,
  onSelectSubTab,
}) {
  const currentPillar =
    REPORT_PILLARS.find((p) => p.id === activePillar) || REPORT_PILLARS[0];

  const visibleSubTabs = currentPillar.tabs.filter(
    (t) => !t.requiresCostCentre || costCentresEnabled
  );

  return (
    <div
      className="pro-card"
      style={{
        padding: '14px 16px',
        marginBottom: '18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Top Row: Title + 4 Segmented Pillars */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.96rem', color: 'var(--text-primary)' }}>
            Reports, Accounting &amp; CA Desk
          </div>
          <div style={{ fontSize: '0.77rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Financial statements, party aging, ITR-3/4, GSTR-2B Action Sheet &amp; tamper-proof CA audit tools
          </div>
        </div>

        <div className="segmented-tabs" role="tablist" aria-label="Report categories">
          {REPORT_PILLARS.map((pillar) => {
            const PillarIcon = pillar.Icon;
            const isActive = currentPillar.id === pillar.id;
            return (
              <button
                key={pillar.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelectPillar?.(pillar.id, pillar.tabs[0].id)}
                className={`segmented-tab${isActive ? ' active' : ''}`}
              >
                <PillarIcon size={15} /> {pillar.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Second Row: Clean Contextual Sub-Tabs for the Selected Pillar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          flexWrap: 'wrap',
          paddingTop: '10px',
          borderTop: '1px solid var(--border-subtle, #e2e8f0)',
        }}
      >
        {visibleSubTabs.map((sub) => {
          const active = activeSubTab === sub.id;
          return (
            <button
              key={sub.id}
              type="button"
              onClick={() => onSelectSubTab?.(sub.id)}
              className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontWeight: active ? 700 : 600 }}
            >
              {sub.label}
            </button>
          );
        })}
        {helpSlot && <div style={{ marginLeft: 'auto' }}>{helpSlot}</div>}
      </div>
    </div>
  );
}
