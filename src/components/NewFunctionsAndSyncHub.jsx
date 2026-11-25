import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Smartphone,
  Cpu,
  Database,
  ShoppingBag,
  Sparkles,
  CalendarCheck2,
  Briefcase,
  SearchCheck,
  ShieldAlert,
  Brain,
  FileSpreadsheet,
  Warehouse,
  TrendingUp,
  LifeBuoy,
  HardDrive,
  Search,
  ChevronUp,
  ChevronDown,
  Wifi,
} from 'lucide-react';
import PageHeader from './PageHeader';
import EnterpriseAiHub from './EnterpriseAiHub';
import {
  getAllBills,
  getAllPurchases,
  getAllExpenses,
  getAllProducts,
  getProfile,
  DATA_SAVED_EVENT,
} from '../store';

export const NEW_FUNCTIONS_CATALOG = [
  {
    id: 'p2p',
    category: 'SYNC',
    badge: '5G P2P',
    title: '5G WebRTC Mobile ↔ Counter PC Sync',
    subtitle: 'मोबाइल से काउंटर PC पर लाइव ऑर्डर व कैटलॉग सिंक (6-अंकीय PIN + QR + ऑफ़लाइन क्यू)',
    icon: Smartphone,
    accent: '#2563eb',
  },
  {
    id: 'hardware',
    category: 'SYNC',
    badge: 'Hardware',
    title: 'WebSerial Weighing Scale & Silent POS',
    subtitle: 'डिजिटल कांटा मशीन से सीधा वज़न और बिना डायलॉग बॉक्स के साइलेंट USB थर्मल प्रिंटिंग',
    icon: Cpu,
    accent: '#0891b2',
  },
  {
    id: 'migrate',
    category: 'SYNC',
    badge: 'Migration',
    title: '1-Click Tally XML & Vyapar Importer',
    subtitle: 'TallyPrime XML व Vyapar Excel से पार्टी, HSN स्टॉक और वाउचर का सुरक्षित माइग्रेशन',
    icon: Database,
    accent: '#7c3aed',
  },
  {
    id: 'fifo',
    category: 'SYNC',
    badge: 'Catalog & FIFO',
    title: 'B2B HTML Catalog & Smart FIFO Settlement',
    subtitle: 'WhatsApp ऑर्डर पार्सर, शेयर करने योग्य B2B कैटलॉग और पुराने बिलों का ऑटो-FIFO निपटान',
    icon: ShoppingBag,
    accent: '#0d9488',
  },
  {
    id: 'rollover',
    category: 'CA_GST',
    badge: 'v5.3 New',
    title: 'Year-End FY Rollover (31 Mar → 1 Apr)',
    subtitle: 'AS-2 क्लोज़िंग स्टॉक, पार्टी बकाया और 1 अप्रैल बैलेंस्ड ओपनिंग वाउचर व Period Lock विज़ार्ड',
    icon: CalendarCheck2,
    accent: '#ea580c',
  },
  {
    id: 'cahub',
    category: 'CA_GST',
    badge: 'v5.3 New',
    title: 'CA Multi-Client .bharatca Reviewer Hub',
    subtitle: '20–50+ क्लाइंट्स की एन्क्रिप्टेड .bharatca फ़ाइलों का SHA-256 ऑडिट व रिस्क डैशबोर्ड',
    icon: Briefcase,
    accent: '#4f46e5',
  },
  {
    id: 'fuzzy2b',
    category: 'CA_GST',
    badge: 'v5.3 New',
    title: 'GSTR-2B ITC Action Sheet (Sec 16(2)(aa))',
    subtitle: 'Accept / Keep Pending / Defer / Reject निर्णय और लाइव GSTR-3B Table 4 की गणना',
    icon: SearchCheck,
    accent: '#16a34a',
  },
  {
    id: 'notice',
    category: 'CA_GST',
    badge: 'GST Shield',
    title: 'AI GST Notice Shield & GSTR-9 / CMP-08',
    subtitle: 'Sec 17(5) Blocked ITC, Rule 37 (180-दिन अनपेड) रिवर्सल व GSTR-9 वर्किंग पेपर्स',
    icon: ShieldAlert,
    accent: '#dc2626',
  },
  {
    id: 'munim',
    category: 'AI_ERP',
    badge: 'AI Munim',
    title: 'AI Munim, Sec 43B(h) MSME & #b2b-catalog=',
    subtitle: 'MSME 15/45-दिन टैक्स बचाव अलर्ट, मार्जिन आर्बिट्राज सलाहकार व कंप्रेस्ड WhatsApp स्टोरफ्रंट',
    icon: Brain,
    accent: '#9333ea',
  },
  {
    id: 'itr',
    category: 'AI_ERP',
    badge: 'ITR & 26Q',
    title: 'ITR-3/4, AIS/26AS, Form 26Q & Portal Bridge',
    subtitle: 'Sec 44AD/44ADA (5% कैश नियम), Sec 87A मार्जिनल रिलीफ़, TDS 26Q व Zero-GSP पोर्टल ऑटो-फ़िल',
    icon: FileSpreadsheet,
    accent: '#0284c7',
  },
  {
    id: 'supplychain',
    category: 'AI_ERP',
    badge: 'ERP & BOM',
    title: 'Multi-Godown, Live FEFO & Manufacturing BOM',
    subtitle: 'गोदाम ट्रांसफ़र चालान, एक्सपायरी-आधारित FEFO बैच चयन व Raw-to-Finished BOM कॉस्टिंग',
    icon: Warehouse,
    accent: '#b45309',
  },
  {
    id: 'forecast',
    category: 'AI_ERP',
    badge: 'Forecast AI',
    title: '30-Day Cash-Flow & Dead-Stock Forecaster',
    subtitle: 'अगले 30 दिन की नकदी स्थिति, 90+ दिन से रुका डेड-स्टॉक व स्टॉक-आउट काउंटडाउन',
    icon: TrendingUp,
    accent: '#059669',
  },
  {
    id: 'action:sos',
    category: 'SUPPORT',
    badge: 'Zero-Login SOS',
    title: 'SOS Help, Direct Review & GST Dictionary',
    subtitle: 'बिना किसी लॉग-इन के सीधा एरर/रिव्यू सबमिट, Hinglish GST शब्दकोश व 1-Click Demo Store',
    icon: LifeBuoy,
    accent: '#e11d48',
  },
  {
    id: 'action:health',
    category: 'SUPPORT',
    badge: 'Settings',
    title: 'PC Folder Mirror, Backups & Hygiene Status',
    subtitle: 'Settings → Data & Backups में लाइव हार्ड-ड्राइव मिरर, .fgsb बैकअप व 8-पॉइंट सिस्टम हेल्थ',
    icon: HardDrive,
    accent: '#334155',
  },
];

function useWorkspaceData(activeProfileProp = null) {
  const [bills, setBills] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [products, setProducts] = useState([]);
  const [ownerProfile, setOwnerProfile] = useState(activeProfileProp);

  const reload = useCallback(async () => {
    try {
      const [b, pur, exp, prod, prof] = await Promise.all([
        getAllBills(),
        getAllPurchases(),
        getAllExpenses(),
        getAllProducts(),
        activeProfileProp ? Promise.resolve(activeProfileProp) : getProfile(),
      ]);
      setBills(Array.isArray(b) ? b : []);
      setPurchases(Array.isArray(pur) ? pur : []);
      setExpenses(Array.isArray(exp) ? exp : []);
      setProducts(Array.isArray(prod) ? prod : []);
      if (prof) setOwnerProfile(prof);
    } catch { /* ignore transient read */ }
  }, [activeProfileProp]);

  useEffect(() => {
    reload();
    const onSaved = () => reload();
    window.addEventListener(DATA_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(DATA_SAVED_EVENT, onSaved);
  }, [reload]);

  return { bills, purchases, expenses, products, ownerProfile, reload };
}

/**
 * Dedicated Top-Level View 1:
 * "5G WebRTC P2P Sync & Smart Connectivity Section" (`currentView === 'p2psync'`)
 */
export function P2pSyncDedicatedView({
  activeProfile = null,
  onOpenSettingsData,
  onOpenAllNewFunctions,
  onOpenHelpDesk,
}) {
  const { bills, purchases, expenses, products, ownerProfile, reload } =
    useWorkspaceData(activeProfile);
  const [syncTab, setSyncTab] = useState('p2p');

  const SYNC_TABS = [
    {
      id: 'p2p',
      label: '📡 5G WebRTC Mobile ↔ PC Sync',
      desc: 'Counter PC QR + 6-Digit PIN + Offline Queue',
      Icon: Smartphone,
    },
    {
      id: 'hardware',
      label: '⚖️ Weighing Scale & Silent POS',
      desc: 'WebSerial Scale + WebUSB Thermal Printer',
      Icon: Cpu,
    },
    {
      id: 'migrate',
      label: '📥 Tally XML & Vyapar Import',
      desc: '1-Click Party, HSN Stock & Voucher Import',
      Icon: Database,
    },
    {
      id: 'fifo',
      label: '🛍️ B2B Catalog & WhatsApp Sync',
      desc: 'Shareable Offline Catalog + FIFO Settlement',
      Icon: ShoppingBag,
    },
  ];

  return (
    <div className="page-container">
      <PageHeader
        title="5G WebRTC P2P Sync & Smart Devices"
        subtitle="Connect 5G mobile staff phones to Counter PC, pair WebSerial weighing scales & thermal printers, or import Tally/Vyapar books"
        meta="Zero-Server · 6-Digit PIN"
        primary={
          onOpenAllNewFunctions ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onOpenAllNewFunctions}
            >
              <Sparkles size={15} /> All New Functions Hub
            </button>
          ) : null
        }
      />

      {/* Dedicated Connectivity & Sync Section Selector */}
      <div
        className="glass-panel"
        style={{
          padding: '1rem',
          marginBottom: '1.15rem',
          borderLeft: '4px solid #2563eb',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
            marginBottom: '0.85rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <Wifi size={20} style={{ color: '#2563eb', flexShrink: 0 }} />
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>
                Dedicated 5G Sync, Hardware &amp; Migration Center
              </h3>
              <p className="text-muted" style={{ margin: '0.15rem 0 0', fontSize: '0.8rem' }}>
                मोबाइल स्टाफ और काउंटर PC को 5G/हॉटस्पॉट पर जोड़ें, कांटा मशीन व थर्मल प्रिंटर चलाएँ, या पुराना डेटा इम्पोर्ट करें।
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            {onOpenSettingsData && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onOpenSettingsData}
              >
                <HardDrive size={14} /> PC Folder Mirror &amp; System Health
              </button>
            )}
            {onOpenHelpDesk && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onOpenHelpDesk('HELP')}
              >
                <LifeBuoy size={14} /> Sync Troubleshooting (SOS)
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))',
            gap: '0.6rem',
          }}
        >
          {SYNC_TABS.map((t) => {
            const TabIcon = t.Icon;
            const active = syncTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSyncTab(t.id)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.6rem',
                  padding: '0.7rem 0.8rem',
                  borderRadius: '10px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: active
                    ? '2px solid #2563eb'
                    : '1px solid var(--border-color, #cbd5e1)',
                  background: active
                    ? 'rgba(37, 99, 235, 0.10)'
                    : 'var(--bg-secondary, #f8fafc)',
                  color: 'var(--text-primary, #0f172a)',
                }}
              >
                <TabIcon
                  size={18}
                  style={{
                    color: active ? '#2563eb' : 'var(--text-secondary, #475569)',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.83rem' }}>{t.label}</div>
                  <div
                    style={{
                      fontSize: '0.73rem',
                      color: 'var(--text-secondary, #64748b)',
                      marginTop: '0.12rem',
                    }}
                  >
                    {t.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <EnterpriseAiHub
        bills={bills}
        purchases={purchases}
        expenses={expenses}
        products={products}
        ownerProfile={ownerProfile}
        activeSection={syncTab}
        onSectionChange={setSyncTab}
        hideTopPills
        onBillsUpdated={reload}
        onProductsUpdated={reload}
      />
    </div>
  );
}

/**
 * Dedicated Top-Level View 2:
 * "All New Functions Hub" (`currentView === 'newfeatures'`)
 * Organizes every new function into clear categorized cards + live interactive workspace below.
 */
export function AllNewFunctionsHubView({
  activeProfile = null,
  initialFunctionId = 'p2p',
  onOpenHelpDesk,
  onOpenSettingsData,
  onOpenDedicatedP2p,
}) {
  const { bills, purchases, expenses, products, ownerProfile, reload } =
    useWorkspaceData(activeProfile);
  const [selectedFn, setSelectedFn] = useState(initialFunctionId || 'p2p');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [cardsExpanded, setCardsExpanded] = useState(true);

  const CATEGORIES = [
    { id: 'ALL', label: '🌟 सभी नए फ़ंक्शन (All 14)' },
    { id: 'SYNC', label: '📡 5G Sync, Hardware & Import (4)' },
    { id: 'CA_GST', label: '🏛️ CA Hub, Year-End & GST (4)' },
    { id: 'AI_ERP', label: '🧠 AI Munim, ITR & Godown ERP (4)' },
    { id: 'SUPPORT', label: '🛟 SOS Support & Backup Health (2)' },
  ];

  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return NEW_FUNCTIONS_CATALOG.filter((item) => {
      const catOk = categoryFilter === 'ALL' || item.category === categoryFilter;
      const queryOk =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.badge.toLowerCase().includes(q);
      return catOk && queryOk;
    });
  }, [categoryFilter, searchQuery]);

  const activeMeta =
    NEW_FUNCTIONS_CATALOG.find((x) => x.id === selectedFn) || NEW_FUNCTIONS_CATALOG[0];

  const handleSelectCard = (card) => {
    if (card.id === 'action:sos') {
      if (typeof onOpenHelpDesk === 'function') onOpenHelpDesk('REVIEW');
      return;
    }
    if (card.id === 'action:health') {
      if (typeof onOpenSettingsData === 'function') onOpenSettingsData();
      return;
    }
    setSelectedFn(card.id);
    const workspaceEl = document.getElementById('new-functions-live-workspace');
    if (workspaceEl && window.innerWidth < 900) {
      workspaceEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        title="All New Functions Hub"
        subtitle="All 14 new 5G Sync, Year-End Rollover, CA Multi-Client Hub, GSTR-2B Action Sheet, ITR-3/4, AI Munim & ERP modules in one tab"
        meta="14 Pro Modules"
        primary={
          onOpenDedicatedP2p ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onOpenDedicatedP2p}
            >
              <Smartphone size={15} /> Dedicated 5G Sync Screen
            </button>
          ) : null
        }
      />

      {/* Categorized Launchpad Header & Cards */}
      <div className="glass-panel" style={{ padding: '1.05rem', marginBottom: '1.2rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
            marginBottom: cardsExpanded ? '0.85rem' : 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={20} style={{ color: '#4f46e5', flexShrink: 0 }} />
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>
                सभी नए फ़ंक्शन एक ही जगह (All New Functions Directory)
              </h3>
              <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                सक्रिय मॉड्यूल: <strong>{activeMeta.title}</strong> — किसी भी कार्ड पर क्लिक करके तुरंत नीचे इस्तेमाल करें
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
            {cardsExpanded && (
              <div style={{ position: 'relative' }}>
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: '9px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    opacity: 0.6,
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="फ़ंक्शन खोजें (5G, 2B, Rollover, ITR)…"
                  aria-label="Search all new functions"
                  style={{
                    padding: '0.36rem 0.65rem 0.36rem 28px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    background: 'var(--bg-secondary, #f8fafc)',
                    color: 'var(--text-primary, #0f172a)',
                    fontSize: '0.79rem',
                    width: '230px',
                  }}
                />
              </div>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setCardsExpanded((v) => !v)}
            >
              {cardsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{' '}
              {cardsExpanded ? 'कार्ड ग्रिड छोटा करें' : 'सभी 14 कार्ड दिखाएँ'}
            </button>
          </div>
        </div>

        {cardsExpanded && (
          <>
            {/* Category Filter Pills */}
            <div
              style={{
                display: 'flex',
                gap: '0.4rem',
                flexWrap: 'wrap',
                marginBottom: '0.85rem',
              }}
            >
              {CATEGORIES.map((cat) => {
                const active = categoryFilter === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.76rem' }}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* Cards Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: '0.65rem',
              }}
            >
              {filteredCards.map((card) => {
                const CardIcon = card.icon;
                const isSelected = selectedFn === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => handleSelectCard(card)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: '0.4rem',
                      padding: '0.8rem',
                      borderRadius: '11px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      border: isSelected
                        ? `2px solid ${card.accent}`
                        : '1px solid var(--border-color, #cbd5e1)',
                      background: isSelected
                        ? 'rgba(79, 70, 229, 0.09)'
                        : 'var(--bg-secondary, #f8fafc)',
                      color: 'var(--text-primary, #0f172a)',
                      transition: 'transform 0.12s ease',
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 30,
                          height: 30,
                          borderRadius: '8px',
                          background: `${card.accent}1a`,
                          color: card.accent,
                        }}
                      >
                        <CardIcon size={16} />
                      </span>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '0.12rem 0.48rem',
                          borderRadius: '999px',
                          background: isSelected ? card.accent : 'rgba(100, 116, 139, 0.14)',
                          color: isSelected ? '#ffffff' : 'var(--text-secondary, #475569)',
                        }}
                      >
                        {isSelected ? '✓ खुला है (Active)' : card.badge}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.28 }}>
                      {card.title}
                    </div>
                    <div
                      style={{
                        fontSize: '0.74rem',
                        color: 'var(--text-secondary, #64748b)',
                        lineHeight: 1.38,
                      }}
                    >
                      {card.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Live Interactive Module Workspace */}
      <div id="new-functions-live-workspace">
        <EnterpriseAiHub
          bills={bills}
          purchases={purchases}
          expenses={expenses}
          products={products}
          ownerProfile={ownerProfile}
          activeSection={selectedFn}
          onSectionChange={setSelectedFn}
          hideTopPills
          onBillsUpdated={reload}
          onProductsUpdated={reload}
        />
      </div>
    </div>
  );
}

export default AllNewFunctionsHubView;
