import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase.js';
import Button from './Button.jsx';

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

function CashBoxesPanel({ session, notify, showLoader }) {
    const [movimientos, setMovimientos] = useState([]);
    const [totalEfectivo, setTotalEfectivo] = useState(0);
    const [totalMP, setTotalMP] = useState(0);

    const [tipo, setTipo] = useState('deposito');
    const [monto, setMonto] = useState('');
    const [fecha, setFecha] = useState(todayISO());
    const [concepto, setConcepto] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        if (!supabase) return;
        showLoader && showLoader(true, 'Cargando caja...');
        try {
            const [servRes, movRes, gasRes] = await Promise.all([
                supabase.from('servicios').select('precio, sena, metodo_pago, completado'),
                supabase.from('movimientos_caja').select('*').order('fecha', { ascending: false }).limit(50),
                supabase.from('gastos').select('monto, metodo_pago')
            ]);

            let cash = 0;
            let mp = 0;

            if (!servRes.error && Array.isArray(servRes.data)) {
                servRes.data.forEach(s => {
                    const metodo = (s.metodo_pago || 'transferencia').toLowerCase();
                    const neto = Math.max(0, Number(s.precio) - Number(s.sena));
                    if (metodo === 'efectivo') cash += neto;
                    else if (metodo === 'transferencia') mp += neto;
                    else if (metodo === 'fiado') {
                    }
                });
            }

            if (!gasRes.error && Array.isArray(gasRes.data)) {
                gasRes.data.forEach(g => {
                    const metodo = (g.metodo_pago || 'efectivo').toLowerCase();
                    const m = Number(g.monto) || 0;
                    if (metodo === 'efectivo') cash -= m;
                    else mp -= m;
                });
            }

            if (!movRes.error && Array.isArray(movRes.data)) {
                movRes.data.forEach(m => {
                    const monto = Number(m.monto) || 0;
                    if (m.tipo === 'deposito') {
                        cash -= monto;
                        mp += monto;
                    } else if (m.tipo === 'retiro') {
                        cash += monto;
                        mp -= monto;
                    }
                });
                setMovimientos(movRes.data);
            }

            setTotalEfectivo(Math.max(0, cash));
            setTotalMP(Math.max(0, mp));
        } catch (err) {
            console.warn('Error loading cashbox data:', err);
        } finally {
            showLoader && showLoader(false);
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;

        const montoNum = Number(monto);
        if (!montoNum || montoNum <= 0) {
            notify && notify('Ingresá un monto mayor a 0.', 'error');
            return;
        }
        if (!concepto.trim()) {
            notify && notify('Ingresá un concepto.', 'error');
            return;
        }

        setSubmitting(true);
        showLoader && showLoader(true, 'Guardando movimiento...');
        try {
            if (!supabase || !session?.authId) {
                throw new Error('Sin conexión a la nube.');
            }

            const origen = tipo === 'deposito' ? 'efectivo' : 'mp';
            const destino = tipo === 'deposito' ? 'mp' : 'efectivo';

            const { error } = await supabase
                .from('movimientos_caja')
                .insert({
                    usuario_id: session.authId,
                    fecha: fecha || todayISO(),
                    tipo,
                    monto: montoNum,
                    concepto: concepto.trim(),
                    origen,
                    destino
                });
            if (error) throw error;

            notify && notify('Movimiento registrado con éxito', 'success');
            setMonto('');
            setConcepto('');
            setFecha(todayISO());
            await loadData();
        } catch (err) {
            console.error('Error inserting movimiento:', err);
            notify && notify(err.message || 'No se pudo registrar el movimiento.', 'error');
        } finally {
            setSubmitting(false);
            showLoader && showLoader(false);
        }
    };

    const total = totalEfectivo + totalMP;

    return (
        <div id="tab-cajas" className="tab-pane active">
            <div className="section-title">
                <div>
                    <h3>Gestión de Caja</h3>
                    <p>Control de efectivo y medios de pago.</p>
                </div>
            </div>

            <div className="stats-cards-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="stat-card pink-glow" style={{ gridColumn: '1 / -1' }}>
                    <div className="stat-icon">
                        <i className="fa-solid fa-piggy-bank" style={{ color: 'var(--barbie-pink)' }}></i>
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Caja Total</span>
                        <h2>${Number(total).toLocaleString("es-AR")}</h2>
                        <span className="stat-label" style={{ marginTop: '4px' }}>
                            <i className="fa-solid fa-money-bill-wave" style={{ color: '#2e7d32', marginRight: '4px' }}></i>
                            Efectivo: ${Number(totalEfectivo).toLocaleString("es-AR")}
                            <span style={{ margin: '0 8px', color: 'var(--text-light)' }}>|</span>
                            <i className="fa-solid fa-mobile-screen-button" style={{ color: '#0284c7', marginRight: '4px' }}></i>
                            MP: ${Number(totalMP).toLocaleString("es-AR")}
                        </span>
                    </div>
                </div>
            </div>

            <div className="chart-section">
                <h4><i className="fa-solid fa-right-left" style={{ color: 'var(--barbie-pink)', marginRight: '6px' }}></i>Nuevo Movimiento</h4>
                <form className="cute-form caja-movement-form" onSubmit={handleSubmit} style={{ marginTop: '10px' }}>
                    <div className="form-row-2">
                        <div className="form-group">
                            <label>Tipo de Movimiento</label>
                            <div className="input-wrapper">
                                <i className="fa-solid fa-arrow-trend-up input-icon"></i>
                                <select
                                    value={tipo}
                                    onChange={(e) => setTipo(e.target.value)}
                                >
                                    <option value="deposito">Depósito (Efectivo → MP)</option>
                                    <option value="retiro">Extracción (MP → Efectivo)</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Fecha</label>
                            <div className="input-wrapper">
                                <i className="fa-solid fa-calendar-day input-icon"></i>
                                <input
                                    type="date"
                                    value={fecha}
                                    onChange={(e) => setFecha(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <div className="form-row-2">
                        <div className="form-group">
                            <label>Monto ($)</label>
                            <div className="input-wrapper">
                                <i className="fa-solid fa-sack-dollar input-icon"></i>
                                <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={monto}
                                    onChange={(e) => setMonto(e.target.value)}
                                    placeholder="Ej. 15000"
                                    required
                                    inputMode="numeric"
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Concepto</label>
                            <div className="input-wrapper">
                                <i className="fa-solid fa-file-lines input-icon"></i>
                                <input
                                    type="text"
                                    value={concepto}
                                    onChange={(e) => setConcepto(e.target.value)}
                                    placeholder="Ej. Depósito banco"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <Button type="submit" className="btn-block" disabled={submitting}>
                        <i className="fa-solid fa-plus"></i> {submitting ? 'Guardando...' : 'Registrar Movimiento'}
                    </Button>
                </form>
            </div>

            <div className="chart-section">
                <h4><i className="fa-solid fa-clock-rotate-left" style={{ color: 'var(--barbie-pink)', marginRight: '6px' }}></i>Movimientos Recientes</h4>
                <div className="day-appointments-container" style={{ marginTop: '10px' }}>
                    {movimientos.length === 0 ? (
                        <div className="no-appointments-placeholder">
                            <i className="fa-solid fa-inbox" style={{ marginRight: '6px' }}></i>
                            No hay movimientos registrados todavía.
                        </div>
                    ) : (
                        movimientos.map((m) => {
                            const isDeposito = m.tipo === 'deposito';
                            const dateObj = m.fecha ? new Date(String(m.fecha).includes('T') ? m.fecha : `${m.fecha}T00:00:00`) : new Date();
                            const fechaStr = isNaN(dateObj.getTime()) ? String(m.fecha) : dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                            return (
                                <div key={m.id || m.legacy_id} className="appointment-card">
                                    <div className="appointment-time-col">
                                        <div className="appointment-time-start" style={{ fontSize: '18px', color: isDeposito ? 'var(--barbie-pink)' : '#D27D2D' }}>
                                            <i className={`fa-solid ${isDeposito ? 'fa-arrow-up-right-dots' : 'fa-arrow-down-wide-short'}`}></i>
                                        </div>
                                        <div className="appointment-time-duration">{fechaStr}</div>
                                    </div>
                                    <div className="appointment-info-col">
                                        <div className="appointment-client-name">
                                            {isDeposito ? 'Depósito a MP' : 'Extracción de MP'}
                                        </div>
                                        <div className="appointment-service-name">
                                            {m.concepto || 'Sin concepto'}
                                            <span style={{ margin: '0 6px' }}>·</span>
                                            <span style={{ textTransform: 'capitalize' }}>{m.origen} → {m.destino}</span>
                                        </div>
                                    </div>
                                    <div className="card-amount-box">
                                        <div className="card-price" style={{ color: isDeposito ? '#0284c7' : '#D27D2D' }}>
                                            ${Number(m.monto).toLocaleString("es-AR")}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}

export default CashBoxesPanel;
