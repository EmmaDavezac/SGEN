import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase.js';
import Button from './Button.jsx';

const moneyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 2,
});

const formatMoney = (value) => moneyFormatter.format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const sectionStyle = {
  display: 'grid',
  gap: '16px',
  marginTop: '24px',
};

const cardStyle = {
  background: '#fff',
  border: '1px solid rgba(11, 17, 35, 0.08)',
  borderRadius: '18px',
  boxShadow: '0 12px 28px rgba(90, 62, 88, 0.08)',
  padding: '20px',
};

function Phase3Modules({ session }) {
  const [services, setServices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [prices, setPrices] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [expenseForm, setExpenseForm] = useState({
    concepto: '',
    monto: '',
    fecha: new Date().toISOString().slice(0, 10),
    categoria: 'Otro',
    metodoPago: 'Efectivo',
  });
  const [movementForm, setMovementForm] = useState({
    tipo: 'deposito',
    monto: '',
    fecha: new Date().toISOString().slice(0, 10),
    concepto: '',
  });
  const [priceDraft, setPriceDraft] = useState({});
  const [savingPrices, setSavingPrices] = useState(false);

  const loadData = async () => {
    if (!session?.authId) return;

    setLoading(true);
    setError('');

    try {
      const [servicesRes, expensesRes, pricesRes, movementsRes] = await Promise.all([
        supabase.from('servicios').select('id, legacy_id, fecha, servicio, categoria, precio, sena, metodo_pago, completado, vuelto, clientes(nombre)').order('fecha', { ascending: false }),
        supabase.from('gastos').select('id, legacy_id, fecha, concepto, monto, metodo_pago, categoria').order('fecha', { ascending: false }),
        supabase.from('precios').select('categoria, nombre, precio').order('categoria', { ascending: true }),
        supabase.from('movimientos_caja').select('id, legacy_id, fecha, tipo, monto, concepto, origen, destino').order('fecha', { ascending: false }),
      ]);

      if (servicesRes.error) throw servicesRes.error;
      if (expensesRes.error) throw expensesRes.error;
      if (pricesRes.error) throw pricesRes.error;
      if (movementsRes.error) throw movementsRes.error;

      const nextServices = (servicesRes.data || []).map((item) => ({
        id: item.legacy_id || item.id,
        fecha: item.fecha,
        servicio: item.servicio,
        categoria: item.categoria,
        precio: Number(item.precio) || 0,
        sena: Number(item.sena) || 0,
        metodoPago: item.metodo_pago,
        completado: Boolean(item.completado),
        cliente: item.clientes?.nombre || 'Cliente',
      }));

      const nextExpenses = (expensesRes.data || []).map((item) => ({
        id: item.legacy_id || item.id,
        fecha: item.fecha,
        concepto: item.concepto,
        monto: Number(item.monto) || 0,
        metodoPago: item.metodo_pago,
        categoria: item.categoria,
      }));

      const nextPrices = (pricesRes.data || []).map((item) => ({
        categoria: item.categoria,
        nombre: item.nombre,
        precio: Number(item.precio) || 0,
      }));

      const nextMovements = (movementsRes.data || []).map((item) => ({
        id: item.legacy_id || item.id,
        fecha: item.fecha,
        tipo: item.tipo,
        monto: Number(item.monto) || 0,
        concepto: item.concepto,
        origen: item.origen,
        destino: item.destino,
      }));

      setServices(nextServices);
      setExpenses(nextExpenses);
      setPrices(nextPrices);
      setMovements(nextMovements);

      const initialDraft = {};
      nextPrices.forEach((price) => {
        initialDraft[`${price.categoria}::${price.nombre}`] = String(price.precio);
      });
      setPriceDraft(initialDraft);
    } catch (error) {
      console.error('Error cargando módulos de Fase 3:', error);
      setError('No se pudieron cargar los datos del módulo. Revisá la conexión o la configuración de Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.authId) {
      loadData();
    }
  }, [session]);

  const stats = useMemo(() => {
    const income = services.reduce((sum, item) => {
      if ((item.metodoPago || '').toLowerCase() === 'fiado') return sum;
      return sum + (Number(item.precio) || 0);
    }, 0);

    const fiados = services.filter((item) => (item.metodoPago || '').toLowerCase() === 'fiado');
    const debtTotal = fiados.reduce((sum, item) => sum + (Number(item.precio) || 0), 0);
    const expenseTotal = expenses.reduce((sum, item) => sum + (Number(item.monto) || 0), 0);
    const cashIn = movements.filter((item) => item.tipo === 'deposito').reduce((sum, item) => sum + (Number(item.monto) || 0), 0);
    const cashOut = movements.filter((item) => item.tipo === 'retiro').reduce((sum, item) => sum + (Number(item.monto) || 0), 0);

    return {
      income,
      expenses: expenseTotal,
      fiados: debtTotal,
      caja: cashIn - cashOut,
      revenueNet: income - expenseTotal,
    };
  }, [services, expenses, movements]);

  const filteredServices = useMemo(() => {
    if (serviceFilter === 'fiados') {
      return services.filter((item) => (item.metodoPago || '').toLowerCase() === 'fiado');
    }

    if (serviceFilter === 'pagados') {
      return services.filter((item) => (item.metodoPago || '').toLowerCase() !== 'fiado');
    }

    return services;
  }, [services, serviceFilter]);

  const handleExpenseSubmit = async (event) => {
    event.preventDefault();
    if (!session?.authId) return;

    const payload = {
      usuario_id: session.authId,
      fecha: expenseForm.fecha,
      concepto: expenseForm.concepto.trim(),
      monto: Number(expenseForm.monto) || 0,
      metodo_pago: (expenseForm.metodoPago || 'Efectivo').toLowerCase(),
      categoria: expenseForm.categoria || 'Otro',
    };

    if (!payload.concepto || payload.monto <= 0) {
      setError('Completá concepto y monto válido para registrar el gasto.');
      return;
    }

    try {
      const { error } = await supabase.from('gastos').insert(payload);
      if (error) throw error;
      setExpenseForm({
        concepto: '',
        monto: '',
        fecha: new Date().toISOString().slice(0, 10),
        categoria: 'Otro',
        metodoPago: 'Efectivo',
      });
      await loadData();
    } catch (error) {
      console.error('Error guardando gasto:', error);
      setError('No se pudo guardar el gasto en Supabase.');
    }
  };

  const handleMovementSubmit = async (event) => {
    event.preventDefault();
    if (!session?.authId) return;

    const payload = {
      usuario_id: session.authId,
      fecha: movementForm.fecha,
      tipo: movementForm.tipo,
      monto: Number(movementForm.monto) || 0,
      concepto: movementForm.concepto.trim(),
      origen: movementForm.tipo === 'deposito' ? 'Efectivo' : 'MP',
      destino: movementForm.tipo === 'deposito' ? 'MP' : 'Efectivo',
    };

    if (!payload.concepto || payload.monto <= 0) {
      setError('Completá concepto y monto válido para registrar el movimiento.');
      return;
    }

    try {
      const { error } = await supabase.from('movimientos_caja').insert(payload);
      if (error) throw error;
      setMovementForm({
        tipo: 'deposito',
        monto: '',
        fecha: new Date().toISOString().slice(0, 10),
        concepto: '',
      });
      await loadData();
    } catch (error) {
      console.error('Error guardando movimiento de caja:', error);
      setError('No se pudo registrar el movimiento entre cajas.');
    }
  };

  const handlePriceChange = (key, value) => {
    setPriceDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handlePriceSave = async () => {
    if (!session?.authId) return;

    const payload = Object.entries(priceDraft).map(([key, value]) => {
      const [categoria, nombre] = key.split('::');
      return {
        categoria,
        nombre,
        precio: Number(value) || 0,
      };
    });

    setSavingPrices(true);

    try {
      const { error } = await supabase.from('precios').upsert(payload, { onConflict: 'categoria,nombre' });
      if (error) throw error;
      await loadData();
    } catch (error) {
      console.error('Error guardando precios:', error);
      setError('No se pudieron guardar los precios de la agenda.');
    } finally {
      setSavingPrices(false);
    }
  };

  const groupedPrices = useMemo(() => {
    const groups = {};
    prices.forEach((price) => {
      if (!groups[price.categoria]) groups[price.categoria] = [];
      groups[price.categoria].push(price);
    });
    return groups;
  }, [prices]);

  if (!session) return null;

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#7b5e6b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Ingresos</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#118a65' }}>{formatMoney(stats.income)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#7b5e6b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Gastos</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#d63384' }}>{formatMoney(stats.expenses)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#7b5e6b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Fiados</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#9c27b0' }}>{formatMoney(stats.fiados)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: '#7b5e6b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Caja</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#0d6efd' }}>{formatMoney(stats.caja)}</div>
        </div>
      </div>

      {error && (
        <div style={{ ...cardStyle, borderColor: '#f5c2c7', background: '#fff5f6', color: '#842029' }}>
          {error}
        </div>
      )}

      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <div>
            <h3 style={{ margin: 0 }}>Servicios y cobro de fiados</h3>
            <p style={{ margin: '6px 0 0', color: '#6b7280' }}>Historial de servicios, pagos y cobros pendientes.</p>
          </div>
          <div style={{ display: 'inline-flex', background: '#f4f2f6', borderRadius: '999px', padding: '4px' }}>
            {['all', 'fiados', 'pagados'].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setServiceFilter(value)}
                style={{
                  border: 'none',
                  background: serviceFilter === value ? '#fff' : 'transparent',
                  color: '#2f2f2f',
                  borderRadius: '999px',
                  padding: '8px 12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {value === 'all' ? 'Todos' : value === 'fiados' ? 'Fiados' : 'Pagados'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ color: '#6b7280' }}>Cargando servicios…</div>
        ) : filteredServices.length === 0 ? (
          <div style={{ color: '#6b7280' }}>No hay servicios para esta vista.</div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {filteredServices.slice(0, 12).map((item) => (
              <div key={`${item.id}-${item.fecha}`} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr 1fr 1fr', gap: '10px', padding: '12px', borderRadius: '12px', background: '#faf6f9', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{item.cliente}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{formatDate(item.fecha)}</div>
                </div>
                <div>{item.servicio}</div>
                <div style={{ fontWeight: 700 }}>{formatMoney(item.precio)}</div>
                <div>{(item.metodoPago || 'Transferencia').toUpperCase()}</div>
                <div style={{ textAlign: 'right', color: item.metodoPago === 'fiado' ? '#9c27b0' : '#118a65', fontWeight: 700 }}>
                  {item.metodoPago === 'fiado' ? 'Fiado' : 'Cobrado'}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        <form onSubmit={handleExpenseSubmit} style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Gastos</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            <div className="form-group">
              <label>Concepto</label>
              <input value={expenseForm.concepto} onChange={(event) => setExpenseForm((current) => ({ ...current, concepto: event.target.value }))} placeholder="Compra de insumos" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label>Monto</label>
                <input type="number" min="0" step="0.01" value={expenseForm.monto} onChange={(event) => setExpenseForm((current) => ({ ...current, monto: event.target.value }))} placeholder="2500" />
              </div>
              <div className="form-group">
                <label>Fecha</label>
                <input type="date" value={expenseForm.fecha} onChange={(event) => setExpenseForm((current) => ({ ...current, fecha: event.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label>Método</label>
                <select value={expenseForm.metodoPago} onChange={(event) => setExpenseForm((current) => ({ ...current, metodoPago: event.target.value }))}>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                </select>
              </div>
              <div className="form-group">
                <label>Categoría</label>
                <select value={expenseForm.categoria} onChange={(event) => setExpenseForm((current) => ({ ...current, categoria: event.target.value }))}>
                  <option value="Otro">Otro</option>
                  <option value="Insumos">Insumos</option>
                  <option value="Servicios">Servicios</option>
                  <option value="Alquiler">Alquiler</option>
                </select>
              </div>
            </div>
            <Button type="submit">Guardar gasto</Button>
          </div>
        </form>

        <form onSubmit={handleMovementSubmit} style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Movimientos de caja</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            <div className="form-group">
              <label>Tipo</label>
              <select value={movementForm.tipo} onChange={(event) => setMovementForm((current) => ({ ...current, tipo: event.target.value }))}>
                <option value="deposito">Depósito</option>
                <option value="retiro">Extracción</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label>Monto</label>
                <input type="number" min="0" step="0.01" value={movementForm.monto} onChange={(event) => setMovementForm((current) => ({ ...current, monto: event.target.value }))} />
              </div>
              <div className="form-group">
                <label>Fecha</label>
                <input type="date" value={movementForm.fecha} onChange={(event) => setMovementForm((current) => ({ ...current, fecha: event.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label>Concepto</label>
              <input value={movementForm.concepto} onChange={(event) => setMovementForm((current) => ({ ...current, concepto: event.target.value }))} placeholder="Pago de caja" />
            </div>
            <Button type="submit">Guardar movimiento</Button>
          </div>
        </form>
      </section>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Estadísticas</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Ingresos netos</div>
            <div style={{ fontWeight: 800, fontSize: 24, marginTop: 6 }}>{formatMoney(stats.revenueNet)}</div>
          </div>
          <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Total caja</div>
            <div style={{ fontWeight: 800, fontSize: 24, marginTop: 6 }}>{formatMoney(stats.caja)}</div>
          </div>
          <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Servicios pagados</div>
            <div style={{ fontWeight: 800, fontSize: 24, marginTop: 6 }}>{services.length}</div>
          </div>
          <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Gastos</div>
            <div style={{ fontWeight: 800, fontSize: 24, marginTop: 6 }}>{formatMoney(stats.expenses)}</div>
          </div>
        </div>
      </section>

      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0 }}>Precios y configuración</h3>
            <p style={{ margin: '6px 0 0', color: '#6b7280' }}>Sincronización de precios desde la tabla de Supabase.</p>
          </div>
          <Button variant="secondary" onClick={handlePriceSave} disabled={savingPrices}>
            {savingPrices ? 'Guardando…' : 'Guardar precios'}
          </Button>
        </div>

        <div style={{ display: 'grid', gap: '16px', marginTop: '16px' }}>
          {Object.entries(groupedPrices).map(([category, items]) => (
            <div key={category} style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: '12px', padding: '12px' }}>
              <div style={{ fontWeight: 800, marginBottom: '12px', textTransform: 'capitalize' }}>{category}</div>
              <div style={{ display: 'grid', gap: '10px' }}>
                {items.map((item) => {
                  const key = `${item.categoria}::${item.nombre}`;
                  return (
                    <div key={key} style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.7fr', gap: '12px', alignItems: 'center' }}>
                      <div style={{ fontWeight: 600 }}>{item.nombre}</div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={priceDraft[key] ?? String(item.precio)}
                          onChange={(event) => handlePriceChange(key, event.target.value)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Últimos movimientos de caja</h3>
        {movements.length === 0 ? (
          <div style={{ color: '#6b7280' }}>Todavía no hay movimientos registrados.</div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {movements.slice(0, 8).map((item) => (
              <div key={`${item.id}-${item.fecha}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', padding: '12px', borderRadius: '12px', background: '#faf6f9', alignItems: 'center' }}>
                <div><strong>{item.tipo === 'deposito' ? 'Depósito' : 'Extracción'}</strong></div>
                <div>{item.concepto}</div>
                <div style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(item.monto)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default Phase3Modules;
