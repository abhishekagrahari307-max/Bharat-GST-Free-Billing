// Complete Notification Center Modal (Task 4)
import { useState } from 'react';
import {
  Bell, X, Check, Clock, Volume2, Settings, Trash2, BellRing,
} from 'lucide-react';
import HelpButton from './HelpButton';
import {
  saveNotifPrefs,
  snoozeNotifSection,
  markFeedItemRead,
  markAllFeedItemsRead,
  clearSystemNotifFeed,
  requestOsNotificationPermission,
  playSoftAlertChime,
  maybeFireOsNotification,
} from '../utils/notificationSystem';
import { toast } from './Toast';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'payments', label: 'Payments' },
  { id: 'backups', label: 'Backups' },
  { id: 'gst_stock', label: 'Stock & GST' },
  { id: 'activity', label: 'Activity Log' },
  { id: 'settings', label: 'Alert Settings' },
];

export default function NotificationCenter({
  open,
  onClose,
  cards = [],
  feed = [],
  prefs,
  onPrefsChange,
  onDismissKey,
  onSnoozeChanged,
  onFeedChanged,
  onMarkAllRead,
  onNavigate,
  onOpenSettingsSection,
}) {
  const [tab, setTab] = useState('all');

  if (!open) return null;

  const filteredCards = tab === 'all'
    ? cards
    : cards.filter((c) => c.category === tab);

  const showFeedInAll = tab === 'all' || tab === 'activity';
  const unreadFeed = feed.filter((f) => !f.read);

  const handleCardOpen = (card) => {
    onClose();
    if (card.settingsSection && onOpenSettingsSection) {
      onOpenSettingsSection(card.settingsSection);
      return;
    }
    if (card.targetView && onNavigate) {
      onNavigate(card.targetView);
    }
  };

  const handleSnooze = (key, e) => {
    e.stopPropagation();
    const next = snoozeNotifSection(key, 24);
    onSnoozeChanged?.(next);
    toast('Snoozed for 24 hours', 'info');
  };

  const handleEnableBrowserPush = async (checked) => {
    if (!checked) {
      const next = saveNotifPrefs({ browserPushEnabled: false });
      onPrefsChange?.(next);
      return;
    }
    const perm = await requestOsNotificationPermission();
    if (perm === 'granted') {
      const next = saveNotifPrefs({ browserPushEnabled: true });
      onPrefsChange?.(next);
      maybeFireOsNotification('Bharat GST Free Billing', 'Desktop & Mobile Push Notifications are now active!');
      toast('System push notifications enabled!', 'success');
    } else if (perm === 'unsupported') {
      toast('System notifications are not supported on this browser.', 'warning');
    } else {
      toast('Notification permission was blocked by browser settings.', 'warning');
    }
  };

  const togglePref = (key, val) => {
    const next = saveNotifPrefs({ [key]: val });
    onPrefsChange?.(next);
    if (key === 'soundEnabled' && val) playSoftAlertChime();
  };

  const toneClass = (tone) => {
    if (tone === 'danger') return 'notice-danger';
    if (tone === 'warn') return 'notice-warn';
    if (tone === 'note') return 'notice-note';
    return 'notice-info';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 560, padding: '1.15rem 1.25rem' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
          <h3 className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={18} style={{ color: 'var(--primary)' }} />
            Notification Center
            <HelpButton title="Notifications & Reminders" doc="shortcuts#notifications" size={16} />
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {(cards.length > 0 || unreadFeed.length > 0) && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  onMarkAllRead?.();
                  const updatedFeed = markAllFeedItemsRead();
                  onFeedChanged?.(updatedFeed);
                }}
              >
                <Check size={13} /> Mark all as read
              </button>
            )}
            <button type="button" className="icon-btn" onClick={onClose} title="Close"><X size={18} /></button>
          </div>
        </div>

        {/* Category Filter Strip */}
        <div className="industry-preset-strip" style={{ paddingTop: 0, marginBottom: '0.75rem' }}>
          {TABS.map((t) => {
            const count = t.id === 'all'
              ? cards.length + unreadFeed.length
              : t.id === 'activity'
                ? unreadFeed.length
                : cards.filter((c) => c.category === t.id).length;
            return (
              <button
                key={t.id}
                type="button"
                className={`industry-preset-chip${tab === t.id ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.id === 'settings' && <Settings size={12} />}
                <span>{t.label}</span>
                {t.id !== 'settings' && count > 0 && (
                  <span style={{
                    padding: '0 5px', borderRadius: 999, fontSize: '0.66rem',
                    background: tab === t.id ? 'rgba(255,255,255,0.25)' : 'var(--primary-light, rgba(37,99,235,0.12))',
                    color: tab === t.id ? '#fff' : 'var(--primary)',
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ maxHeight: '62vh', overflowY: 'auto', paddingRight: 2 }}>
          {tab === 'settings' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div className="surface-card" style={{ padding: '0.85rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.84rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BellRing size={15} style={{ color: 'var(--primary)' }} /> System &amp; Sound Delivery
                </div>
                <label className="cbx-row" style={{ padding: '0.45rem 0' }}>
                  <input
                    type="checkbox"
                    checked={!!prefs?.browserPushEnabled}
                    onChange={(e) => handleEnableBrowserPush(e.target.checked)}
                  />
                  <span>
                    <span className="cbx-label">Desktop &amp; Mobile OS Push Notifications</span>
                    <span className="cbx-hint">Show native Windows / Mac / Android alerts for backups &amp; due reminders</span>
                  </span>
                </label>
                <label className="cbx-row" style={{ padding: '0.45rem 0' }}>
                  <input
                    type="checkbox"
                    checked={!!prefs?.soundEnabled}
                    onChange={(e) => togglePref('soundEnabled', e.target.checked)}
                  />
                  <span>
                    <span className="cbx-label"><Volume2 size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Soft Notification Chime</span>
                    <span className="cbx-hint">Play a subtle tone when a backup or alert triggers</span>
                  </span>
                </label>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: '0.4rem' }}
                  onClick={() => {
                    playSoftAlertChime();
                    maybeFireOsNotification('Bharat GST Test Alert', 'Notifications are working smoothly!');
                    toast('Test notification triggered!', 'success');
                  }}
                >
                  Send Test Notification
                </button>
              </div>

              <div className="surface-card" style={{ padding: '0.85rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.84rem', marginBottom: '0.45rem' }}>Alert Categories</div>
                {[
                  ['overdueEnabled', 'Overdue Invoices', 'Unpaid sales invoices past their due date'],
                  ['dueSoonEnabled', 'Payments Due Soon', 'Invoices due within the next 3 days'],
                  ['backupReminderEnabled', 'Data Backup Overdue Alerts', 'Warn when no backup was saved in X days'],
                  ['lowStockEnabled', 'Low & Out-of-Stock Products', 'Items at or below your stock threshold'],
                  ['gstFilingEnabled', 'GST Return Deadlines', 'GSTR-1 (11th) & GSTR-3B (20th) countdown'],
                  ['recurringEnabled', 'Recurring Invoices', 'Due & auto-generated recurring templates'],
                ].map(([k, label, hint]) => (
                  <label key={k} className="cbx-row" style={{ padding: '0.38rem 0' }}>
                    <input
                      type="checkbox"
                      checked={prefs?.[k] !== false}
                      onChange={(e) => togglePref(k, e.target.checked)}
                    />
                    <span>
                      <span className="cbx-label">{label}</span>
                      <span className="cbx-hint">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {tab !== 'activity' && filteredCards.map((card) => (
                <div
                  key={card.key}
                  className={`notice ${toneClass(card.tone)}`}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer' }}
                  onClick={() => handleCardOpen(card)}
                >
                  <span className="notice-icon" style={{ fontSize: '1.1rem' }}>{card.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>{card.title}</div>
                    <div style={{ fontSize: '0.74rem', opacity: 0.88, marginTop: 2 }}>{card.subtitle}</div>
                    <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', marginTop: '0.45rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, textDecoration: 'underline' }}>
                        {card.actionLabel} →
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="industry-mini-icon-btn"
                      title="Snooze for 24 hours"
                      onClick={(e) => handleSnooze(card.key, e)}
                    >
                      <Clock size={13} />
                    </button>
                    <button
                      type="button"
                      className="industry-mini-icon-btn"
                      title="Dismiss until changed"
                      onClick={() => onDismissKey?.(card.key)}
                    >
                      <Check size={14} />
                    </button>
                  </div>
                </div>
              ))}

              {/* System & Backup Activity Log */}
              {showFeedInAll && feed.length > 0 && (
                <div style={{ marginTop: filteredCards.length > 0 && tab === 'all' ? '0.4rem' : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Recent Backup &amp; System Events
                    </span>
                    <button
                      type="button"
                      className="btn-link"
                      style={{ fontSize: '0.72rem' }}
                      onClick={() => onFeedChanged?.(clearSystemNotifFeed())}
                    >
                      <Trash2 size={11} style={{ verticalAlign: '-1px', marginRight: 3 }} />Clear log
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {feed.slice(0, tab === 'activity' ? 30 : 6).map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem',
                          padding: '0.5rem 0.7rem', borderRadius: 9,
                          background: item.read ? 'var(--bg-secondary)' : 'var(--primary-light, rgba(37,99,235,0.08))',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: item.read ? 600 : 700 }}>
                            {!item.read && <span style={{ color: 'var(--primary)', marginRight: 5 }}>●</span>}
                            {item.title}
                          </div>
                          {item.body && <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 1 }}>{item.body}</div>}
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {new Date(item.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        {!item.read && (
                          <button
                            type="button"
                            className="industry-mini-icon-btn"
                            title="Mark read"
                            onClick={() => onFeedChanged?.(markFeedItemRead(item.id))}
                          >
                            <Check size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {filteredCards.length === 0 && (!showFeedInAll || feed.length === 0) && (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.75rem 0', margin: 0, fontSize: '0.85rem' }}>
                  All clear ✨ — nothing needs your attention in this tab right now.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
