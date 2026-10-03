import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Pencil, Truck, Check, Loader2 } from 'lucide-react';
import { showToast } from './Toast';

export default function TransporterManager({ token, onSelect, onClose }) {
  const [transporters, setTransporters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', gstin: '', vehicleNo: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/eway/transporters', { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.success) setTransporters(d.transporters);
    } catch { showToast('Failed to load', 'error'); }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm({ name: '', gstin: '', vehicleNo: '', phone: '' }); setEditId(null); setShowAdd(true); };
  const openEdit = (t) => { setForm({ name: t.name, gstin: t.gstin || '', vehicleNo: t.vehicle_no || '', phone: t.phone || '' }); setEditId(t.id); setShowAdd(true); };

  const save = async () => {
    if (!form.name.trim()) return showToast('Name is required', 'error');
    setSaving(true);
    try {
      const url = editId ? `/api/eway/transporters/${editId}` : '/api/eway/transporters';
      const method = editId ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: form.name.trim(), gstin: form.gstin.trim(), vehicleNo: form.vehicleNo.trim(), phone: form.phone.trim() }),
      });
      const d = await r.json();
      if (d.success) { showToast(editId ? 'Updated' : 'Transporter saved', 'success'); setShowAdd(false); load(); }
      else showToast(d.error || 'Failed', 'error');
    } catch { showToast('Network error', 'error'); }
    setSaving(false);
  };

  const del = async (id) => {
    if (!window.confirm('Delete this transporter?')) return;
    setDeleting(id);
    try {
      const r = await fetch(`/api/eway/transporters/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.success) { showToast('Deleted', 'success'); load(); }
      else showToast(d.error || 'Failed', 'error');
    } catch { showToast('Network error', 'error'); }
    setDeleting(null);
  };

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: 13, background: '#f9fafb', outline: 'none', boxSizing: 'border-box', color: '#111827' };
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 -4px 40px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Truck size={18} color="#2563eb" />
            <span style={{ fontWeight: 700, fontSize: 16 }}>Saved Transporters</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!showAdd && (
              <button onClick={openAdd} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Plus size={13} /> Add
              </button>
            )}
            <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div style={{ padding: '12px 18px 32px' }}>
          {/* Add / Edit form */}
          {showAdd && (
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px', marginBottom: 14, border: '1.5px solid #e2e8f0' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>{editId ? 'Edit Transporter' : 'New Transporter'}</div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Name <span style={{ color: '#ef4444' }}>*</span></label>
                <input style={inputStyle} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Fast Logistics" />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>GSTIN / Transporter ID</label>
                <input style={inputStyle} value={form.gstin} onChange={e => setForm(p => ({ ...p, gstin: e.target.value.toUpperCase() }))} placeholder="Optional transporter GSTIN" maxLength={15} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Default Vehicle No.</label>
                <input style={inputStyle} value={form.vehicleNo} onChange={e => setForm(p => ({ ...p, vehicleNo: e.target.value.toUpperCase().replace(/[\s-]/g,'') }))} placeholder="e.g. TS09AB1234" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Phone Number <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span></label>
                <input
                  style={inputStyle}
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/[^\d+\s-]/g, '') }))}
                  placeholder="e.g. 9876543210"
                  maxLength={15}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1.5px solid #d1d5db', background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                <button onClick={save} disabled={saving} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {saving ? <Loader2 size={13} className="spin" /> : <Check size={13} />} {editId ? 'Update' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {/* List */}
          {loading && <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}><Loader2 size={24} className="spin" /></div>}
          {!loading && transporters.length === 0 && !showAdd && (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8' }}>
              <Truck size={40} style={{ marginBottom: 8, opacity: 0.4 }} />
              <p style={{ margin: 0, fontSize: 14 }}>No saved transporters yet</p>
              <p style={{ margin: '4px 0 0', fontSize: 12 }}>Tap Add to save a transporter for quick form fill</p>
            </div>
          )}
          {transporters.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 8, background: '#fff', gap: 10 }}>
              <div
                style={{ flex: 1, minWidth: 0, cursor: onSelect ? 'pointer' : 'default' }}
                onClick={() => onSelect && onSelect(t)}
              >
                <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{t.name}</div>
                {t.gstin && <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{t.gstin}</div>}
                {t.vehicle_no && <div style={{ fontSize: 11, color: '#64748b' }}>🚛 {t.vehicle_no}</div>}
                {t.phone && <div style={{ fontSize: 11, color: '#64748b' }}>📞 {t.phone}</div>}
              </div>
              {onSelect && (
                <button onClick={() => onSelect(t)} style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#eff6ff', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Use
                </button>
              )}
              <button onClick={() => openEdit(t)} style={{ padding: 6, borderRadius: 7, border: 'none', background: '#f1f5f9', cursor: 'pointer' }}><Pencil size={13} /></button>
              <button onClick={() => del(t.id)} disabled={deleting === t.id} style={{ padding: 6, borderRadius: 7, border: 'none', background: '#fef2f2', cursor: 'pointer' }}>
                {deleting === t.id ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} color="#dc2626" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
