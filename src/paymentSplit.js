/**
 * Reparto de un cobro combinado entre efectivo, transferencia y fiado.
 *
 * Puro (sin React ni Supabase) para poder testearlo con Node. El reparto se
 * calcula sobre el NETO a cobrar (precio - seña): la seña ya se cobró antes
 * con su propio método y no se vuelve a dividir.
 *
 * Reglas:
 *  - efectivo + transferencia nunca pueden superar el neto (el sobrante no
 *    tiene dónde registrarse y el residual sería negativo).
 *  - el resto (neto - efectivo - transferencia) queda como porción fiada, pero
 *    solo si los cobros pendientes están habilitados (`allowFiado`).
 *  - si hay neto para cobrar, al menos un medio debe tener monto: si no, el
 *    resultado sería idéntico a marcar "Pendiente de pago" puro y el usuario
 *    probablemente se equivocó de botón.
 *
 * @param {{neto: number, efectivo: any, transferencia: any, allowFiado: boolean}} input
 * @returns {{efectivo: number, transferencia: number, pendiente: number, cobrado: number, error: string|null}}
 */
export function computeCombinedSplit({ neto = 0, efectivo = 0, transferencia = 0, allowFiado = true } = {}) {
    const safeNeto = Math.max(0, Math.round(Number(neto) || 0));
    const safeEfectivo = Math.max(0, Math.round(Number(efectivo) || 0));
    const safeTransferencia = Math.max(0, Math.round(Number(transferencia) || 0));
    const cobrado = safeEfectivo + safeTransferencia;

    if (cobrado > safeNeto) {
        return {
            efectivo: safeEfectivo,
            transferencia: safeTransferencia,
            pendiente: 0,
            cobrado,
            error: `La suma ($${cobrado.toLocaleString('es-AR')}) supera el neto a cobrar ($${safeNeto.toLocaleString('es-AR')}).`
        };
    }

    const pendiente = safeNeto - cobrado;

    if (pendiente > 0 && !allowFiado) {
        return {
            efectivo: safeEfectivo,
            transferencia: safeTransferencia,
            pendiente,
            cobrado,
            error: 'Los cobros pendientes (fiado) están deshabilitados en Ajustes: el reparto debe cubrir el neto completo.'
        };
    }

    if (safeNeto > 0 && cobrado === 0) {
        return {
            efectivo: 0,
            transferencia: 0,
            pendiente,
            cobrado: 0,
            error: 'Cargá cuánto se cobra en efectivo o en transferencia. Si todo queda pendiente, usá "Pendiente de pago".'
        };
    }

    return { efectivo: safeEfectivo, transferencia: safeTransferencia, pendiente, cobrado, error: null };
}
