import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, RotateCcw, Settings2 } from 'lucide-react';
import {
  INDUSTRY_PRESETS,
  buildConfigFromPreset,
  addIndustryField,
  updateIndustryField,
  deleteIndustryField,
  normaliseIndustryConfig,
} from '../utils/industryFields';
import { toast } from './Toast';

/**
 * IndustrySpecsEditor
 * - When `configOnly={true}` (in Settings -> Company Details): lets the user pick an
 *   industry preset and Add / Edit / Delete both Invoice-level and Item-level fields.
 * - When `configOnly={false}` (in New Invoice): shows the active invoice-level
 *   specification inputs (e.g. Chassis No, Engine/Motor No, Battery No, Financed By)
 *   PLUS a 1-tap "Presets & Edit Fields" button to customize fields right from the bill!
 */
export default function IndustrySpecsEditor({
  config,
  onConfigChange,
  details,
  setDetails,
  configOnly = false,
  readOnly = false,
}) {
  const safeConfig = normaliseIndustryConfig(config);
  const [manageOpen, setManageOpen] = useState(configOnly);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ label: '', placeholder: '', scope: 'invoice' });
  const [newField, setNewField] = useState({ label: '', placeholder: '', scope: 'invoice' });

  const currentSpec = details?.industrySpecs || {};
  const existingFields = Array.isArray(currentSpec.fields) ? currentSpec.fields : [];
  const valueById = new Map();
  const valueByLabel = new Map();
  for (const f of existingFields) {
    if (f?.id) valueById.set(f.id, f.value || '');
    if (f?.label) valueByLabel.set(String(f.label).toLowerCase(), f.value || '');
  }

  const enabledInvoiceFields = safeConfig.invoiceFields.filter((f) => f.enabled !== false);
  const enabledItemFields = safeConfig.itemFields.filter((f) => f.enabled !== false);

  // Keep any filled historical fields on an older saved invoice visible even if removed from template
  const extraHistoricalFields = existingFields.filter(
    (f) => f?.label && String(f?.value || '').trim() && !enabledInvoiceFields.some((ef) => ef.id === f.id || ef.label.toLowerCase() === String(f.label).toLowerCase())
  );

  const syncDetailsSpec = (nextCfg, overrideId = null, overrideVal = null) => {
    if (!setDetails) return;
    setDetails((prev) => {
      const prevSpec = prev?.industrySpecs || {};
      const prevList = Array.isArray(prevSpec.fields) ? prevSpec.fields : [];
      const prevMap = new Map(prevList.map((f) => [f.id || f.label, f.value || '']));
      const prevLabelMap = new Map(prevList.map((f) => [String(f.label || '').toLowerCase(), f.value || '']));
      const activeDefs = nextCfg.invoiceFields.filter((f) => f.enabled !== false);
      const nextFields = activeDefs.map((f) => {
        const val = f.id === overrideId
          ? overrideVal
          : (prevMap.get(f.id) ?? prevLabelMap.get(f.label.toLowerCase()) ?? '');
        return { id: f.id, label: f.label, value: val };
      });
      // Preserve historical non-empty fields not in activeDefs
      for (const old of prevList) {
        if (!old?.label || !String(old.value || '').trim()) continue;
        if (old.id === overrideId) {
          if (String(overrideVal || '').trim()) nextFields.push({ ...old, value: overrideVal });
          continue;
        }
        if (!activeDefs.some((d) => d.id === old.id || d.label.toLowerCase() === String(old.label).toLowerCase())) {
          nextFields.push(old);
        }
      }
      return {
        ...prev,
        industrySpecs: {
          title: nextCfg.sectionTitle,
          showSpecBox: nextCfg.showSpecBox !== false,
          fields: nextFields,
        },
      };
    });
  };

  const applyConfig = (nextCfg) => {
    const clean = normaliseIndustryConfig(nextCfg);
    onConfigChange?.(clean);
    syncDetailsSpec(clean);
  };

  const handleSelectPreset = (presetId) => {
    if (readOnly) return;
    const nextCfg = buildConfigFromPreset(presetId);
    applyConfig(nextCfg);
    const p = INDUSTRY_PRESETS.find((x) => x.id === presetId);
    toast(`Loaded "${p?.label || presetId}" specification fields`, 'success');
  };

  const handleResetPreset = () => {
    if (readOnly) return;
    const nextCfg = buildConfigFromPreset(safeConfig.presetId || 'general');
    applyConfig(nextCfg);
    setEditingId(null);
    toast('Specification fields reset to preset defaults', 'info');
  };

  const handleValueChange = (field, val) => {
    if (readOnly || !setDetails) return;
    if (extraHistoricalFields.some((h) => (h.id || h.label) === (field.id || field.label))) {
      setDetails((prev) => {
        const prevList = Array.isArray(prev?.industrySpecs?.fields) ? prev.industrySpecs.fields : [];
        return {
          ...prev,
          industrySpecs: {
            ...(prev.industrySpecs || { title: safeConfig.sectionTitle, showSpecBox: safeConfig.showSpecBox }),
            fields: prevList.map((f) => ((f.id || f.label) === (field.id || field.label) ? { ...f, value: val } : f)),
          },
        };
      });
      return;
    }
    syncDetailsSpec(safeConfig, field.id, val);
  };

  const startEditField = (field, scope) => {
    setEditingId(field.id);
    setEditDraft({ label: field.label, placeholder: field.placeholder || '', scope });
  };

  const saveEditField = () => {
    if (!editDraft.label.trim()) {
      toast('Field name cannot be empty', 'error');
      return;
    }
    const nextCfg = updateIndustryField(safeConfig, editingId, {
      label: editDraft.label.trim(),
      placeholder: editDraft.placeholder.trim(),
      scope: editDraft.scope,
    });
    applyConfig(nextCfg);
    setEditingId(null);
    toast('Field updated', 'success');
  };

  const handleDeleteField = (field) => {
    const nextCfg = deleteIndustryField(safeConfig, field.id);
    applyConfig(nextCfg);
    if (editingId === field.id) setEditingId(null);
    toast(`Deleted field "${field.label}"`, 'info');
  };

  const handleToggleField = (field, checked) => {
    const nextCfg = updateIndustryField(safeConfig, field.id, { enabled: checked });
    applyConfig(nextCfg);
  };

  const handleAddField = (e) => {
    if (e) e.preventDefault();
    const label = newField.label.trim();
    if (!label) {
      toast('Enter a field name first (e.g. Chassis No, IMEI, Batch No)', 'warning');
      return;
    }
    const nextCfg = addIndustryField(safeConfig, {
      scope: newField.scope,
      label,
      placeholder: newField.placeholder.trim(),
    });
    applyConfig(nextCfg);
    setNewField({ label: '', placeholder: '', scope: newField.scope });
    toast(`Added "${label}"`, 'success');
  };

  const activePreset = INDUSTRY_PRESETS.find((p) => p.id === safeConfig.presetId) || INDUSTRY_PRESETS[0];
  const filledCount = [...enabledInvoiceFields, ...extraHistoricalFields].filter((f) => {
    const v = valueById.get(f.id) ?? valueByLabel.get(f.label.toLowerCase()) ?? f.value ?? '';
    return String(v).trim().length > 0;
  }).length;

  const renderFieldManagerRow = (f, scope) => {
    const isEditing = editingId === f.id;
    if (isEditing) {
      return (
        <div key={f.id} className="spec-manage-row spec-manage-row-editing">
          <input
            type="text"
            className="form-input"
            value={editDraft.label}
            onChange={(e) => setEditDraft((d) => ({ ...d, label: e.target.value }))}
            placeholder="Field Name *"
            style={{ flex: '1 1 140px', minWidth: 120 }}
          />
          <input
            type="text"
            className="form-input"
            value={editDraft.placeholder}
            onChange={(e) => setEditDraft((d) => ({ ...d, placeholder: e.target.value }))}
            placeholder="Hint / placeholder (optional)"
            style={{ flex: '1 1 150px', minWidth: 120 }}
          />
          <select
            className="form-input"
            value={editDraft.scope}
            onChange={(e) => setEditDraft((d) => ({ ...d, scope: e.target.value }))}
            style={{ flex: '0 1 155px', minWidth: 130 }}
          >
            <option value="invoice">Invoice Spec Box</option>
            <option value="item">Under Each Item</option>
          </select>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="btn btn-primary" onClick={saveEditField} style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }} title="Save field">
              <Check size={14} /> Save
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditingId(null)} style={{ padding: '0.35rem 0.55rem', fontSize: '0.78rem' }} title="Cancel">
              <X size={14} />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div key={f.id} className="spec-manage-row">
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0, cursor: 'pointer', fontSize: '0.83rem' }}>
          <input
            type="checkbox"
            checked={f.enabled !== false}
            onChange={(e) => handleToggleField(f, e.target.checked)}
            style={{ width: 16, height: 16, accentColor: 'var(--primary)', flexShrink: 0 }}
          />
          <span style={{ fontWeight: 600, opacity: f.enabled === false ? 0.5 : 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {f.label}
          </span>
          {f.placeholder && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ({f.placeholder})
            </span>
          )}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            className="icon-btn"
            title={`Edit "${f.label}"`}
            onClick={() => startEditField(f, scope)}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn-red"
            title={`Delete "${f.label}"`}
            onClick={() => handleDeleteField(f)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="industry-specs-box" data-testid="industry-specs-box">
      {/* Header row */}
      <div className="industry-specs-head">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
              {activePreset.emoji} {safeConfig.sectionTitle || 'Business / Product Specifications'}
            </span>
            <span className="spec-preset-badge">{activePreset.label}</span>
            {!configOnly && filledCount > 0 && (
              <span className="spec-filled-badge">{filledCount} filled</span>
            )}
          </div>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            {configOnly
              ? 'Pick your industry template or add, edit, and delete custom fields (Chassis No, IMEI, Batch, HUID, etc.). Blank fields never print.'
              : 'Only filled fields print on the invoice PDF & receipt. Click "Customize Fields" to switch industry, add, edit, or delete fields.'}
          </p>
        </div>
        {!configOnly && !readOnly && (
          <button
            type="button"
            className={`btn ${manageOpen ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setManageOpen((v) => !v)}
            style={{ fontSize: '0.76rem', padding: '0.35rem 0.7rem', flexShrink: 0 }}
          >
            <Settings2 size={14} /> {manageOpen ? 'Done Customizing' : 'Customize Fields'}
          </button>
        )}
      </div>

      {/* Industry Preset Picker + Field CRUD Manager */}
      {(manageOpen || configOnly) && !readOnly && (
        <div className="industry-specs-manager">
          <div style={{ marginBottom: '0.75rem' }}>
            <div className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.35rem' }}>
              1. Choose Business / Industry Template (1-click auto fields)
            </div>
            <div className="spec-preset-chips">
              {INDUSTRY_PRESETS.map((p) => {
                const active = safeConfig.presetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`type-chip ${active ? 'type-chip-active' : ''}`}
                    onClick={() => handleSelectPreset(p.id)}
                    title={p.hint}
                    style={{ fontSize: '0.76rem', padding: '0.35rem 0.65rem' }}
                  >
                    <span>{p.emoji} {p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section Title + Dedicated PDF Box switch */}
          <div className="spec-heading-row">
            <div className="form-group" style={{ flex: '1 1 220px', marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Specification Heading on Invoice PDF</label>
              <input
                type="text"
                className="form-input"
                value={safeConfig.sectionTitle}
                onChange={(e) => applyConfig({ ...safeConfig, sectionTitle: e.target.value })}
                placeholder="e.g. Vehicle / Product Specification"
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', cursor: 'pointer', paddingTop: '0.35rem' }}>
              <input
                type="checkbox"
                checked={safeConfig.showSpecBox !== false}
                onChange={(e) => applyConfig({ ...safeConfig, showSpecBox: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
              />
              <span>Print in highlighted Specification Box</span>
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleResetPreset}
              style={{ fontSize: '0.74rem', padding: '0.32rem 0.6rem' }}
              title="Restore default fields for the selected industry preset"
            >
              <RotateCcw size={13} /> Reset Preset
            </button>
          </div>

          {/* Existing Fields List with Edit & Delete */}
          <div className="spec-lists-grid">
            <div>
              <div className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                Invoice Specification Box Fields ({safeConfig.invoiceFields.length})
              </div>
              {safeConfig.invoiceFields.length === 0 ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0' }}>
                  No invoice-level fields yet. Pick a template above or add a field below.
                </p>
              ) : (
                <div className="spec-manage-list">
                  {safeConfig.invoiceFields.map((f) => renderFieldManagerRow(f, 'invoice'))}
                </div>
              )}
            </div>

            <div>
              <div className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                Per-Item Row Fields ({safeConfig.itemFields.length})
              </div>
              {safeConfig.itemFields.length === 0 ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0' }}>
                  No per-item fields yet. Add fields like IMEI, Batch No, Expiry, Size, or Warranty below.
                </p>
              ) : (
                <div className="spec-manage-list">
                  {safeConfig.itemFields.map((f) => renderFieldManagerRow(f, 'item'))}
                </div>
              )}
            </div>
          </div>

          {/* Add New Field Bar */}
          <div className="spec-add-bar">
            <div className="form-label" style={{ fontSize: '0.75rem', width: '100%', marginBottom: '0.25rem' }}>
              + Add Custom Field
            </div>
            <input
              type="text"
              className="form-input"
              placeholder="Field Name * (e.g. Chassis No, Engine No, IMEI, Batch)"
              value={newField.label}
              onChange={(e) => setNewField((prev) => ({ ...prev, label: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddField(); } }}
              style={{ flex: '1 1 180px', minWidth: 140 }}
            />
            <input
              type="text"
              className="form-input"
              placeholder="Hint / Placeholder (optional)"
              value={newField.placeholder}
              onChange={(e) => setNewField((prev) => ({ ...prev, placeholder: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddField(); } }}
              style={{ flex: '1 1 160px', minWidth: 130 }}
            />
            <select
              className="form-input"
              value={newField.scope}
              onChange={(e) => setNewField((prev) => ({ ...prev, scope: e.target.value }))}
              style={{ flex: '0 1 175px', minWidth: 140 }}
            >
              <option value="invoice">Invoice Spec Box</option>
              <option value="item">Under Each Item</option>
            </select>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleAddField}
              style={{ fontSize: '0.8rem', padding: '0.42rem 0.85rem', flexShrink: 0 }}
            >
              <Plus size={15} /> Add Field
            </button>
          </div>
        </div>
      )}

      {/* Invoice-Level Fill Inputs (shown in New Invoice) */}
      {!configOnly && (
        <>
          {enabledInvoiceFields.length === 0 && extraHistoricalFields.length === 0 ? (
            !manageOpen && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.45rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {enabledItemFields.length > 0
                    ? `${enabledItemFields.length} per-item field(s) active under Line Items (${enabledItemFields.map((f) => f.label).join(', ')}).`
                    : 'Need Chassis/Engine No, IMEI, Batch/Expiry, HUID, or Eye Power on your bills?'}
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setManageOpen(true)}
                    style={{ fontSize: '0.75rem', padding: '0.28rem 0.65rem' }}
                  >
                    <Plus size={13} /> Choose Industry / Add Fields
                  </button>
                )}
              </div>
            )
          ) : (
            <div className="spec-inputs-grid">
              {[...enabledInvoiceFields, ...extraHistoricalFields].map((field) => {
                const val = valueById.get(field.id) ?? valueByLabel.get(field.label.toLowerCase()) ?? field.value ?? '';
                return (
                  <div key={field.id || field.label} className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.76rem' }}>{field.label}</label>
                    <input
                      type="text"
                      className="form-input"
                      value={val}
                      disabled={readOnly}
                      placeholder={field.placeholder || ''}
                      onChange={(e) => handleValueChange(field, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
