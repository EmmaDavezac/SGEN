import { computeCombinedSplit } from '../src/paymentSplit.js';

let failures = 0;
const t = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failures += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` -> got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

t('reparto 50/50 sin fiado',
    computeCombinedSplit({ neto: 20000, efectivo: 10000, transferencia: 10000 }),
    { efectivo: 10000, transferencia: 10000, pendiente: 0, cobrado: 20000, error: null });

t('reparto con porción fiada',
    computeCombinedSplit({ neto: 20000, efectivo: 5000, transferencia: 5000, allowFiado: true }),
    { efectivo: 5000, transferencia: 5000, pendiente: 10000, cobrado: 10000, error: null });

t('la suma no puede superar el neto',
    computeCombinedSplit({ neto: 10000, efectivo: 8000, transferencia: 5000 }).error !== null, true);

t('sin allowFiado no queda saldo',
    computeCombinedSplit({ neto: 10000, efectivo: 4000, allowFiado: false }).error !== null, true);

t('todo pendiente debe usar el botón Fiado',
    computeCombinedSplit({ neto: 10000, efectivo: 0, transferencia: 0 }).error !== null, true);

t('campos vacíos',
    computeCombinedSplit({ neto: 10000, efectivo: '', transferencia: '' }),
    { efectivo: 0, transferencia: 0, pendiente: 10000, cobrado: 0,
      error: 'Cargá cuánto se cobra en efectivo o en transferencia. Si todo queda pendiente, usá "Pendiente de pago".' });

t('texto no numérico se ignora',
    computeCombinedSplit({ neto: 10000, efectivo: 'abc', transferencia: 2000 }),
    { efectivo: 0, transferencia: 2000, pendiente: 8000, cobrado: 2000, error: null });

t('neto 0 (cubierto por seña) no valida reparto',
    computeCombinedSplit({ neto: 0, efectivo: 0, transferencia: 0 }),
    { efectivo: 0, transferencia: 0, pendiente: 0, cobrado: 0, error: null });

t('montos negativos se tratan como 0',
    computeCombinedSplit({ neto: 10000, efectivo: -500 }),
    { efectivo: 0, transferencia: 0, pendiente: 10000, cobrado: 0,
      error: 'Cargá cuánto se cobra en efectivo o en transferencia. Si todo queda pendiente, usá "Pendiente de pago".' });

t('decimales se redondean',
    computeCombinedSplit({ neto: 9999.6, efectivo: 5000.4 }),
    { efectivo: 5000, transferencia: 0, pendiente: 5000, cobrado: 5000, error: null });

process.exit(failures === 0 ? 0 : 1);
