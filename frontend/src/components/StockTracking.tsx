import React, { useState } from 'react';
import { Material, UserRole, MaterialCategory } from '../types';
import { ICONS } from '../constants';

interface StockTrackingProps {
    materials: Material[];
    role: UserRole;
    activeFilter: string;
    onAdd: (m: any) => void;
    onEdit: (m: any) => void;
    onDelete: (ids: string[]) => void;
}

const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: '#f8fafc', border: '1px solid #e2e8f0',
    borderRadius: 10, padding: '0.625rem 0.875rem',
    fontSize: '0.875rem', color: '#0f172a', outline: 'none',
    transition: 'all 0.2s', fontFamily: "'Inter',sans-serif",
};
const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.75rem', fontWeight: 600,
    color: '#64748b', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em',
};

const getPrefixByFilter = (filter: string): string => {
    if (filter === 'raw') return 'RM';
    if (filter === 'products') return 'PR';
    return 'SI';
};

const getNextMaterialId = (materials: Material[], prefix: string): string => {
    const pattern = new RegExp(`^${prefix}-(\\d+)$`);
    let maxNo = 0;
    materials.forEach((m) => {
        const match = m.id.match(pattern);
        if (match) {
            const n = Number(match[1]);
            if (!Number.isNaN(n) && n > maxNo) maxNo = n;
        }
    });
    return `${prefix}-${String(maxNo + 1).padStart(3, '0')}`;
};

const StockTracking: React.FC<StockTrackingProps> = ({ materials, role, activeFilter, onAdd, onEdit, onDelete }) => {
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
    const [editingMat, setEditingMat] = useState<Partial<Material>>({});
    const [search, setSearch] = useState('');
    const [stockAdjustment, setStockAdjustment] = useState({ checkIn: 0, checkOut: 0 });
    const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);

    const canManageInventory = role === UserRole.Manager || role === UserRole.StockManager;
    const canAdd = canManageInventory;
    const canEditProductionStatus = role === UserRole.Manager || role === UserRole.StockManager;
    const isStockManager = role === UserRole.StockManager;
    const canDeleteMaterial = role === UserRole.StockManager;
    const useStockAdjustmentOnly = modalMode === 'edit' && isStockManager;

    const filteredMaterials = materials.filter(m => {
        const isRawByPrefix = m.id.startsWith('RM-');
        const isProductionByPrefix = m.id.startsWith('PR-');
        const isStandardByPrefix = m.id.startsWith('SI-');
        const matchesFilter =
            activeFilter === 'raw'
                ? (isRawByPrefix || (!isProductionByPrefix && m.category !== 'Standard Item' && (m.raw || 0) > 0))
                : activeFilter === 'products'
                    ? (isProductionByPrefix || (m.category !== 'Standard Item' && (m.process || 0) > 0))
                    : activeFilter === 'standard'
                        ? (isStandardByPrefix || m.category === 'Standard Item')
                        : false;
        const matchesSearch = !search
            || m.name.toLowerCase().includes(search.toLowerCase())
            || m.id.toLowerCase().includes(search.toLowerCase())
            || (m.materialType || '').toLowerCase().includes(search.toLowerCase());
        return matchesFilter && matchesSearch;
    });
    const filteredMaterialIds = filteredMaterials.map((m) => m.id);
    const selectedVisibleCount = selectedMaterialIds.filter((id) => filteredMaterialIds.includes(id)).length;
    const selectedVisibleIds = selectedMaterialIds.filter((id) => filteredMaterialIds.includes(id));
    const areAllVisibleSelected = filteredMaterialIds.length > 0 && selectedVisibleCount === filteredMaterialIds.length;

    const isLowStock = (m: Material) =>
        m.category === 'Standard Item' ? m.quantity < m.minStock : (m.raw || 0) < m.minStock || (m.process || 0) < m.minStock;

    const handleOpenAdd = () => {
        const defaultCategory: MaterialCategory =
            activeFilter === 'standard' ? 'Standard Item' : 'Plate';
        const prefix = getPrefixByFilter(activeFilter);
        setEditingMat({
            id: getNextMaterialId(materials, prefix),
            category: defaultCategory,
            materialType: 'MS',
            unit: 'pieces',
            minStock: 0,
            raw: activeFilter === 'raw' ? 0 : undefined,
            process: activeFilter === 'products' ? 0 : undefined,
            productionStatus: activeFilter === 'products' ? 'In Process' : undefined,
            quantity: activeFilter === 'standard' ? 0 : undefined
        });
        setStockAdjustment({ checkIn: 0, checkOut: 0 });
        setModalMode('add'); setShowModal(true);
    };
    const getEditableStockField = (mat: Partial<Material>): 'raw' | 'process' | 'quantity' => {
        if (mat.category === 'Standard Item' || activeFilter === 'standard') return 'quantity';
        return activeFilter === 'products' ? 'process' : 'raw';
    };
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingMat.id || !editingMat.name) return;
        const payload: any = { ...editingMat, unit: 'pieces' };
        if (payload.category === 'Plate') {
            payload.height = payload.breadth ?? payload.height ?? 0;
        }
        if (modalMode === 'edit' && isStockManager) {
            const stockField = getEditableStockField(editingMat);
            const currentStock = Number((editingMat as any)[stockField] || 0);
            const nextStock = Math.max(0, currentStock + stockAdjustment.checkIn - stockAdjustment.checkOut);
            payload[stockField] = nextStock;
        }
        if (modalMode === 'add') onAdd(payload); else onEdit(payload);
        setShowModal(false);
        setStockAdjustment({ checkIn: 0, checkOut: 0 });
    };
    const handleOpenEdit = (material: Material) => {
        const normalizedMaterial = material.category === 'Plate'
            ? { ...material, breadth: (material as any).breadth ?? (material as any).height ?? 0 }
            : material;
        setEditingMat({ ...normalizedMaterial });
        setStockAdjustment({ checkIn: 0, checkOut: 0 });
        setModalMode('edit');
        setShowModal(true);
    };
    const handleToggleMaterialSelection = (materialId: string) => {
        setSelectedMaterialIds((prev) =>
            prev.includes(materialId) ? prev.filter((id) => id !== materialId) : [...prev, materialId]
        );
    };
    const handleToggleSelectAllVisible = () => {
        if (areAllVisibleSelected) {
            setSelectedMaterialIds((prev) => prev.filter((id) => !filteredMaterialIds.includes(id)));
            return;
        }
        setSelectedMaterialIds((prev) => Array.from(new Set([...prev, ...filteredMaterialIds])));
    };
    const handleDeleteSelected = () => {
        if (selectedVisibleIds.length === 0) return;
        onDelete(selectedVisibleIds);
        setSelectedMaterialIds((prev) => prev.filter((id) => !selectedVisibleIds.includes(id)));
    };
    const handleProductionStatusChange = (materialId: string, productionStatus: 'In Process' | 'Done') => {
        onEdit({ id: materialId, productionStatus });
    };
    const categoryColor: Record<string, { bg: string; text: string }> = {
        'Plate': { bg: 'rgba(59,130,246,0.1)', text: '#2563eb' },
        'Pipe': { bg: 'rgba(245,158,11,0.1)', text: '#d97706' },
        'Standard Item': { bg: 'rgba(99,102,241,0.1)', text: '#4f46e5' },
    };
    const showMaterialTypeColumn = activeFilter !== 'standard';
    const showProductionStatusColumn = activeFilter === 'products';
    const tableHeaders = showMaterialTypeColumn
        ? ['Stock Health', 'ID / Name', 'Category', 'Material Type', ...(showProductionStatusColumn ? ['Production Status'] : []), 'Stock Levels', 'Dimensions', 'Modified']
        : ['Stock Health', 'ID / Name', 'Category', ...(showProductionStatusColumn ? ['Production Status'] : []), 'Stock Levels', 'Dimensions', 'Modified'];
    const tableColumnCount = tableHeaders.length + (canDeleteMaterial ? 1 : 0);

    return (
        <div style={{ padding: '0 2rem 2rem', fontFamily: "'Inter',sans-serif" }}>
            {/* Alert Banner */}
            {filteredMaterials.some(isLowStock) && (
                <div style={{
                    background: 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(220,38,38,0.05))',
                    border: '1px solid rgba(239,68,68,0.25)',
                    borderLeft: '4px solid #ef4444',
                    borderRadius: '0 12px 12px 0',
                    padding: '0.875rem 1.25rem',
                    display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.25rem',
                    animation: 'slideDown 0.3s ease',
                }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <ICONS.Alert style={{ width: 16, height: 16, color: '#ef4444' }} />
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.06em' }}>⚠ Critical Stock Alert</div>
                        <div style={{ color: '#7f1d1d', fontSize: '0.8125rem' }}>One or more items are below minimum threshold. Review and reorder immediately.</div>
                    </div>
                </div>
            )}

            {/* Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0, textTransform: 'capitalize' }}>
                        {activeFilter === 'raw' ? 'Raw Materials' : activeFilter === 'products' ? 'Work In Progress' : 'Standard Components'}
                    </h2>
                    <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: 8, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700 }}>
                        {filteredMaterials.length} items
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {/* Search */}
                    <div style={{ position: 'relative' }}>
                        <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                        <input
                            value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search materials..."
                            style={{ ...inputStyle, paddingLeft: 32, width: 200, background: '#fff', border: '1px solid #e2e8f0' }}
                            onFocus={e => { e.target.style.borderColor = '#6366f1'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'; }}
                            onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                        />
                    </div>
                    {canAdd && (
                        <button
                            onClick={handleOpenAdd}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '0.5625rem 1.25rem', borderRadius: 10, border: 'none',
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                color: '#fff', fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer',
                                boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
                                transition: 'all 0.2s',
                            }}
                            onMouseOver={e => (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'}
                            onMouseOut={e => (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'}
                        >
                            <ICONS.Plus style={{ width: 14, height: 14 }} />
                            Add Material
                        </button>
                    )}
                    {canDeleteMaterial && (
                        <button
                            onClick={handleDeleteSelected}
                            disabled={selectedVisibleCount === 0}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '0.5625rem 1.25rem', borderRadius: 10,
                                border: '1px solid rgba(239,68,68,0.25)',
                                background: selectedVisibleCount === 0 ? '#f1f5f9' : 'rgba(239,68,68,0.1)',
                                color: selectedVisibleCount === 0 ? '#94a3b8' : '#dc2626',
                                fontWeight: 700, fontSize: '0.8125rem',
                                cursor: selectedVisibleCount === 0 ? 'not-allowed' : 'pointer',
                            }}
                        >
                            Delete Selected
                            {selectedVisibleCount > 0 && ` (${selectedVisibleCount})`}
                        </button>
                    )}
                </div>
            </div>

            {/* Table */}
            <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 1px 8px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                            {canDeleteMaterial && (
                                <th style={{ padding: '0.875rem 1.25rem', width: 40 }}>
                                    <input
                                        type="checkbox"
                                        checked={areAllVisibleSelected}
                                        onChange={handleToggleSelectAllVisible}
                                    />
                                </th>
                            )}
                            {tableHeaders.map((h, i) => (
                                <th key={i} style={{ padding: '0.875rem 1.25rem', fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredMaterials.length === 0 ? (
                            <tr><td colSpan={tableColumnCount} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                                <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📦</div>
                                <div style={{ fontWeight: 600 }}>No materials found</div>
                                <div style={{ fontSize: '0.8125rem', marginTop: 4 }}>Try adjusting your search or filter</div>
                            </td></tr>
                        ) : filteredMaterials.map((m, idx) => {
                            const low = isLowStock(m);
                            const cat = categoryColor[m.category] || { bg: '#f8fafc', text: '#64748b' };
                            return (
                                <tr key={m.id} style={{ borderBottom: idx < filteredMaterials.length - 1 ? '1px solid #f8fafc' : 'none', background: low ? 'rgba(239,68,68,0.02)' : 'transparent', transition: 'background 0.15s' }}
                                    onMouseOver={e => { (e.currentTarget as HTMLTableRowElement).style.background = low ? 'rgba(239,68,68,0.05)' : '#f8fafc'; }}
                                    onMouseOut={e => { (e.currentTarget as HTMLTableRowElement).style.background = low ? 'rgba(239,68,68,0.02)' : 'transparent'; }}
                                >
                                    {canDeleteMaterial && (
                                        <td style={{ padding: '1rem 1.25rem' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedMaterialIds.includes(m.id)}
                                                onChange={() => handleToggleMaterialSelection(m.id)}
                                            />
                                        </td>
                                    )}
                                    <td style={{ padding: '1rem 1.25rem' }}>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 5,
                                            padding: '4px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700,
                                            background: low ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                                            color: low ? '#ef4444' : '#16a34a',
                                            border: `1px solid ${low ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
                                        }}>
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: low ? '#ef4444' : '#22c55e', display: 'inline-block', ...(low ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}) }} />
                                            {low ? 'Critical' : 'Healthy'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '1rem 1.25rem' }}>
                                        <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6366f1', fontWeight: 700, marginBottom: 2 }}>{m.id}</div>
                                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' }}>{m.name}</div>
                                    </td>
                                    <td style={{ padding: '1rem 1.25rem' }}>
                                        <span style={{ background: cat.bg, color: cat.text, padding: '3px 10px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700 }}>{m.category}</span>
                                    </td>
                                    {showMaterialTypeColumn && (
                                        <td style={{ padding: '1rem 1.25rem', fontSize: '0.8125rem', color: '#334155', fontWeight: 600 }}>
                                            {m.materialType || 'Not set'}
                                        </td>
                                    )}
                                    {showProductionStatusColumn && (
                                        <td style={{ padding: '1rem 1.25rem' }}>
                                            {canEditProductionStatus ? (
                                                <select
                                                    value={m.productionStatus || 'In Process'}
                                                    onChange={e => handleProductionStatusChange(m.id, e.target.value as 'In Process' | 'Done')}
                                                    style={{ ...inputStyle, background: '#fff', minWidth: 140, padding: '0.45rem 0.625rem' }}
                                                >
                                                    <option value="In Process">In Process</option>
                                                    <option value="Done">Done</option>
                                                </select>
                                            ) : (
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '4px 10px',
                                                    borderRadius: 999,
                                                    fontSize: '0.75rem',
                                                    fontWeight: 700,
                                                    color: (m.productionStatus || 'In Process') === 'Done' ? '#166534' : '#92400e',
                                                    background: (m.productionStatus || 'In Process') === 'Done' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.14)'
                                                }}>
                                                    {m.productionStatus || 'In Process'}
                                                </span>
                                            )}
                                        </td>
                                    )}
                                    <td style={{ padding: '1rem 1.25rem' }}>
                                        {m.category === 'Standard Item' ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: (m as any).quantity < m.minStock ? '#ef4444' : '#0f172a' }}>{(m as any).quantity}</span>
                                                <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>/ {m.minStock} min</span>
                                            </div>
                                        ) : activeFilter === 'raw' ? (
                                            /* Show ONLY raw count */
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', marginRight: 2 }} />
                                                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: ((m as any).raw || 0) < m.minStock ? '#ef4444' : '#0f172a' }}>{(m as any).raw || 0}</span>
                                                <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{m.unit || 'pieces'} raw</span>
                                            </div>
                                        ) : activeFilter === 'products' ? (
                                            /* Show ONLY process count */
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', marginRight: 2 }} />
                                                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: ((m as any).process || 0) < m.minStock ? '#ef4444' : '#0f172a' }}>{(m as any).process || 0}</span>
                                                <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{m.unit || 'pieces'} WIP</span>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{(m as any).raw || 0}</span>
                                                <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{m.unit || 'pieces'}</span>
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '1rem 1.25rem', fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                        {m.category === 'Plate' && `${m.length}×${((m as any).breadth ?? (m as any).height ?? 0)}×${m.width}mm`}
                                        {m.category === 'Pipe' && `Ø${m.diameter}×${m.length}mm`}
                                        {m.category === 'Standard Item' && `ID:${m.innerDiameter} OD:${m.outerDiameter}`}
                                    </td>
                                    <td style={{ padding: '1rem 1.25rem', fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                        {m.lastModified ? new Date(m.lastModified).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                        {canManageInventory && (
                                            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                                                {canManageInventory && (
                                                    <button
                                                        onClick={() => handleOpenEdit(m)}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            padding: '0.35rem 0.7rem',
                                                            borderRadius: 8,
                                                            border: '1px solid #cbd5e1',
                                                            background: '#fff',
                                                            color: '#334155',
                                                            fontWeight: 700,
                                                            fontSize: '0.7rem',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        Edit
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {showModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,12,41,0.7)', backdropFilter: 'blur(6px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 640, boxShadow: '0 32px 80px rgba(0,0,0,0.3)', overflow: 'hidden', animation: 'zoomIn 0.2s ease' }}>
                        {/* Modal Header */}
                        <div style={{ padding: '1.5rem 2rem', background: 'linear-gradient(135deg, #0f0c29, #1a1a2e)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ color: '#fff', fontWeight: 800, fontSize: '1.125rem', margin: 0 }}>{modalMode === 'add' ? '+ Add New Material' : '✏️ Edit Material'}</h3>
                                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', margin: '2px 0 0' }}>Inventory Management System</p>
                            </div>
                            <button onClick={() => setShowModal(false)} style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>✕</button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ padding: '1.75rem 2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                            {/* Left column */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>Basic Information</div>
                                {[
                                    { label: 'Stock ID', key: 'id', type: 'text', placeholder: 'Auto generated', disabled: true },
                                    { label: 'Material Name', key: 'name', type: 'text', placeholder: 'Full material description' },
                                    { label: 'Min. Stock Threshold', key: 'minStock', type: 'number', placeholder: '0' },
                                ].map(field => (
                                    <div key={field.key}>
                                        <label style={labelStyle}>{field.label}</label>
                                        <input
                                            type={field.type}
                                            disabled={field.disabled}
                                            placeholder={field.placeholder}
                                            value={(editingMat as any)[field.key] || ''}
                                            onChange={e => setEditingMat({ ...editingMat, [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value })}
                                            style={{ ...inputStyle, background: field.disabled ? '#f8fafc' : '#fff', color: field.disabled ? '#94a3b8' : '#0f172a' }}
                                            onFocus={e => { e.target.style.borderColor = '#6366f1'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'; }}
                                            onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                                        />
                                    </div>
                                ))}
                                <div>
                                    <label style={labelStyle}>Material Type</label>
                                    <select
                                        value={(editingMat as any).materialType || 'MS'}
                                        onChange={e => setEditingMat({ ...editingMat, materialType: e.target.value })}
                                        style={{ ...inputStyle, background: '#fff', cursor: 'pointer' }}
                                    >
                                        {(editingMat as any).materialType && !['MS', 'SS', 'AL'].includes((editingMat as any).materialType) && (
                                            <option value={(editingMat as any).materialType}>{(editingMat as any).materialType}</option>
                                        )}
                                        <option value="MS">MS</option>
                                        <option value="SS">SS</option>
                                        <option value="AL">AL</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={labelStyle}>Category</label>
                                    <select
                                        disabled={modalMode === 'edit'}
                                        value={editingMat.category || 'Plate'}
                                        onChange={e => setEditingMat({ ...editingMat, category: e.target.value as MaterialCategory })}
                                        style={{ ...inputStyle, background: modalMode === 'edit' ? '#f8fafc' : '#fff', cursor: modalMode === 'edit' ? 'not-allowed' : 'pointer' }}
                                    >
                                        <option value="Plate">🔷 Plate</option>
                                        <option value="Pipe">🔶 Pipe</option>
                                        <option value="Standard Item">📦 Standard Item</option>
                                    </select>
                                </div>
                            </div>

                            {/* Right column */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>Technical Specs / Counts</div>

                                {editingMat.category === 'Plate' && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                        {[['Length (mm)', 'length'], ['Breadth (mm)', 'breadth'], ['Width (mm)', 'width']].map(([lbl, k]) => (
                                            <div key={k}>
                                                <label style={{ ...labelStyle, fontSize: '0.65rem' }}>{lbl}</label>
                                                <input type="number" value={(editingMat as any)[k] || 0} onChange={e => setEditingMat({ ...editingMat, [k]: Number(e.target.value) } as any)} style={{ ...inputStyle, background: '#fff', padding: '0.5rem' }} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {editingMat.category === 'Pipe' && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                        {[['Diameter (mm)', 'diameter'], ['Length (mm)', 'length']].map(([lbl, k]) => (
                                            <div key={k}>
                                                <label style={{ ...labelStyle, fontSize: '0.65rem' }}>{lbl}</label>
                                                <input type="number" value={(editingMat as any)[k] || 0} onChange={e => setEditingMat({ ...editingMat, [k]: Number(e.target.value) } as any)} style={{ ...inputStyle, background: '#fff', padding: '0.5rem' }} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {editingMat.category === 'Standard Item' && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                        {[['Inner Ø', 'innerDiameter'], ['Outer Ø', 'outerDiameter'], ['Width', 'width']].map(([lbl, k]) => (
                                            <div key={k}>
                                                <label style={{ ...labelStyle, fontSize: '0.65rem' }}>{lbl}</label>
                                                <input type="number" value={(editingMat as any)[k] || 0} onChange={e => setEditingMat({ ...editingMat, [k]: Number(e.target.value) } as any)} style={{ ...inputStyle, background: '#fff', padding: '0.5rem' }} />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                                    {modalMode === 'edit' && isStockManager && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                            <div>
                                                <label style={labelStyle}>Check In (pieces)</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={stockAdjustment.checkIn}
                                                    onChange={e => setStockAdjustment(prev => ({ ...prev, checkIn: Number(e.target.value) || 0 }))}
                                                    style={{ ...inputStyle, background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.25)' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Check Out (pieces)</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={stockAdjustment.checkOut}
                                                    onChange={e => setStockAdjustment(prev => ({ ...prev, checkOut: Number(e.target.value) || 0 }))}
                                                    style={{ ...inputStyle, background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.25)' }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                    {editingMat.category !== 'Standard Item' ? (
                                        <>
                                            {activeFilter === 'raw' && (
                                                <div>
                                                    <label style={labelStyle}>Raw Stock (pieces)</label>
                                                    <input type="number" disabled={useStockAdjustmentOnly} value={(editingMat as any).raw || 0} onChange={e => setEditingMat({ ...editingMat, raw: Number(e.target.value) } as any)} style={{ ...inputStyle, background: useStockAdjustmentOnly ? '#f1f5f9' : 'rgba(59,130,246,0.04)', border: useStockAdjustmentOnly ? '1px solid #e2e8f0' : '1px solid rgba(59,130,246,0.2)', color: useStockAdjustmentOnly ? '#94a3b8' : '#0f172a' }} onFocus={e => { if (!useStockAdjustmentOnly) { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)'; } }} onBlur={e => { if (!useStockAdjustmentOnly) { e.target.style.borderColor = 'rgba(59,130,246,0.2)'; e.target.style.boxShadow = 'none'; } }} />
                                                </div>
                                            )}
                                            {activeFilter === 'products' && (
                                                <>
                                                    <div>
                                                        <label style={labelStyle}>Production WIP (pieces)</label>
                                                        <input type="number" disabled={useStockAdjustmentOnly} value={(editingMat as any).process || 0} onChange={e => setEditingMat({ ...editingMat, process: Number(e.target.value) } as any)} style={{ ...inputStyle, background: useStockAdjustmentOnly ? '#f1f5f9' : 'rgba(245,158,11,0.04)', border: useStockAdjustmentOnly ? '1px solid #e2e8f0' : '1px solid rgba(245,158,11,0.2)', color: useStockAdjustmentOnly ? '#94a3b8' : '#0f172a' }} onFocus={e => { if (!useStockAdjustmentOnly) { e.target.style.borderColor = '#f59e0b'; e.target.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.1)'; } }} onBlur={e => { if (!useStockAdjustmentOnly) { e.target.style.borderColor = 'rgba(245,158,11,0.2)'; e.target.style.boxShadow = 'none'; } }} />
                                                    </div>
                                                    <div>
                                                        <label style={labelStyle}>Production Status</label>
                                                        <select
                                                            value={(editingMat as any).productionStatus || 'In Process'}
                                                            onChange={e => setEditingMat({ ...editingMat, productionStatus: e.target.value } as any)}
                                                            style={{ ...inputStyle, background: '#fff', cursor: 'pointer' }}
                                                        >
                                                            <option value="In Process">In Process</option>
                                                            <option value="Done">Done</option>
                                                        </select>
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    ) : (
                                        <div>
                                            <label style={labelStyle}>Standard Stocks (pieces)</label>
                                            <input type="number" disabled={useStockAdjustmentOnly} value={(editingMat as any).quantity || 0} onChange={e => setEditingMat({ ...editingMat, quantity: Number(e.target.value) } as any)} style={{ ...inputStyle, background: useStockAdjustmentOnly ? '#f1f5f9' : 'rgba(99,102,241,0.04)', border: useStockAdjustmentOnly ? '1px solid #e2e8f0' : '1px solid rgba(99,102,241,0.2)', color: useStockAdjustmentOnly ? '#94a3b8' : '#0f172a' }} onFocus={e => { if (!useStockAdjustmentOnly) { e.target.style.borderColor = '#6366f1'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'; } }} onBlur={e => { if (!useStockAdjustmentOnly) { e.target.style.borderColor = 'rgba(99,102,241,0.2)'; e.target.style.boxShadow = 'none'; } }} />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Bottom row */}
                            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, marginTop: 4 }}>
                                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: '0.875rem', borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.875rem' }}>Cancel</button>
                                <button type="submit" style={{ flex: 2, padding: '0.875rem', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 20px rgba(99,102,241,0.4)', transition: 'all 0.2s', fontSize: '0.875rem' }}>
                                    {modalMode === 'add' ? '+ Add Material' : '✓ Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.85)}} @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}} @keyframes zoomIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}`}</style>
        </div>
    );
};

export default StockTracking;


