import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

function normalizeDateValue(fechaValue) {
    if (!fechaValue) return null;
    if (fechaValue instanceof Date) {
        return isNaN(fechaValue.getTime()) ? null : fechaValue;
    }
    if (typeof fechaValue === 'number') {
        const parsed = new Date(fechaValue);
        return isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof fechaValue === 'string') {
        const trimmed = fechaValue.toString().trim();
        if (!trimmed) return null;
        if (/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(trimmed)) {
            const normalized = trimmed.includes('T') ? trimmed : `${trimmed}T00:00:00`;
            const parsed = new Date(normalized);
            if (!isNaN(parsed.getTime())) return parsed;
        }
        const parsed = new Date(trimmed);
        if (!isNaN(parsed.getTime())) return parsed;
    }
    return null;
}

function capitalizeCategoryLabel(cat) {
    const labels = {
        semi: 'Semipermanente',
        kapping: 'Kapping',
        softgel: 'Soft Gel',
        esculpidas: 'Esculpidas',
        remocion: 'Remoción',
        personalizado: 'Personalizado / Combinado'
    };
    return labels[cat] || (cat || 'Otro');
}

export function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    const lines = [];
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        if (ctx.measureText(testLine).width > maxWidth && n > 0) {
            lines.push(line.trim());
            line = words[n] + ' ';
        } else {
            line = testLine;
        }
    }
    lines.push(line.trim());
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
    return lines.length;
}

export function countWrappedLines(ctx, text, maxWidth) {
    const words = text.toString().split(' ');
    let line = '';
    let lines = 1;
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        if (ctx.measureText(testLine).width > maxWidth && n > 0) {
            lines++;
            line = words[n] + ' ';
        } else {
            line = testLine;
        }
    }
    return lines;
}

export function generateTicketCanvas(item, targetCanvas, logoImg) {
    const canvas = targetCanvas || document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const W = 640;
    const marginX = 50;
    const contentWidth = W - marginX * 2;

    const precio = Number(item.precio) || 0;
    const sena = Number(item.seña) || 0;
    const hasSena = sena > 0;
    const neto = precio - sena;

    const dateObj = normalizeDateValue(item.fecha) || new Date();
    const fechaStr = dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
        ' - ' + dateObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    // Cobro combinado: el ticket detalla cómo se repartió el cobro.
    const esCombinado = (item.metodoPago || '').toLowerCase() === 'combinado';
    const montoEfectivo = Number(item.montoEfectivo ?? item.monto_efectivo) || 0;
    const montoTransferencia = Number(item.montoTransferencia ?? item.monto_transferencia) || 0;
    const saldoPendiente = Number(item.saldoPendiente ?? item.saldo_pendiente) || 0;

    const rows = [
        { label: 'CLIENTA', value: item.cliente, big: true },
        { label: 'SERVICIO', value: item.servicio },
        { label: 'CATEGORÍA', value: capitalizeCategoryLabel(item.categoria) },
        { label: 'PRECIO TOTAL', value: `$${precio.toLocaleString('es-AR')}` },
        { label: 'MÉTODO DE PAGO', value: esCombinado ? 'Combinado' : item.metodoPago }
    ];
    if (esCombinado) {
        rows.push({ label: '  · Efectivo', value: `$${montoEfectivo.toLocaleString('es-AR')}` });
        rows.push({ label: '  · Transferencia', value: `$${montoTransferencia.toLocaleString('es-AR')}` });
        if (saldoPendiente > 0) {
            rows.push({ label: '  · Pendiente', value: `$${saldoPendiente.toLocaleString('es-AR')}` });
        }
    }
    rows.push(
        { label: 'FECHA Y HORA', value: fechaStr },
        { label: 'ATENDIDO POR', value: item.usuario || '-' }
    );

    const headerHeight = 110;
    const badgeRadius = 44;
    const rowLabelFont = "600 12px 'Outfit', Arial";
    const rowValueFont = "22px 'Outfit', Arial";
    const rowValueBigFont = "bold 24px 'Outfit', Arial";
    const rowLineHeight = 27;

    let y = headerHeight + badgeRadius + 100;
    rows.forEach(row => {
        ctx.font = row.big ? rowValueBigFont : rowValueFont;
        const lines = countWrappedLines(ctx, row.value, contentWidth);
        y += 30 + (lines - 1) * rowLineHeight + 22;
    });

    y += 30;

    if (hasSena) {
        ctx.font = rowValueFont;
        const lines = countWrappedLines(ctx, `-$${sena.toLocaleString('es-AR')}`, contentWidth);
        y += 30 + (lines - 1) * rowLineHeight + 22;
    }

    y += 20;
    const totalBlockHeight = 90;
    y += totalBlockHeight;

    const footerHeight = 90;
    const H = Math.round(y + footerHeight);

    canvas.width = W;
    canvas.height = H;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    const headerGradient = ctx.createLinearGradient(0, 0, W, 0);
    headerGradient.addColorStop(0, '#FF69B4');
    headerGradient.addColorStop(1, '#FF1493');
    ctx.fillStyle = headerGradient;
    ctx.fillRect(0, 0, W, headerHeight);

    const badgeX = W / 2;
    const badgeY = headerHeight;

    ctx.save();
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.clip();

    const resolvedLogo = logoImg || document.getElementById('logo-img');
    if (resolvedLogo && resolvedLogo.complete && resolvedLogo.naturalWidth > 0) {
        ctx.drawImage(resolvedLogo, badgeX - badgeRadius, badgeY - badgeRadius, badgeRadius * 2, badgeRadius * 2);
    } else {
        ctx.fillStyle = '#FFF0F5';
        ctx.fillRect(badgeX - badgeRadius, badgeY - badgeRadius, badgeRadius * 2, badgeRadius * 2);
        ctx.fillStyle = '#FF1493';
        ctx.font = "bold 26px 'Outfit', Arial";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('EN', badgeX, badgeY);
        ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#FF69B4';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#5A3D46';
    ctx.font = "bold 26px 'Outfit', Arial";
    ctx.fillText('EVOLET STUDIO', badgeX, badgeY + badgeRadius + 38);

    ctx.fillStyle = '#9E7D86';
    ctx.font = "13px 'Outfit', Arial";
    ctx.fillText('COMPROBANTE DE SERVICIO', badgeX, badgeY + badgeRadius + 58);

    function drawDivider(yPos) {
        ctx.strokeStyle = '#FFC0CB';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(marginX, yPos);
        ctx.lineTo(W - marginX, yPos);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    let cursorY = badgeY + badgeRadius + 100;
    drawDivider(cursorY - 24);

    ctx.textAlign = 'left';

    function drawRow(label, value, valueColor, big) {
        ctx.fillStyle = '#9E7D86';
        ctx.font = rowLabelFont;
        ctx.fillText(label, marginX, cursorY);

        ctx.fillStyle = valueColor || '#5A3D46';
        ctx.font = big ? rowValueBigFont : rowValueFont;
        const lines = countWrappedLines(ctx, value, contentWidth);
        wrapCanvasText(ctx, value.toString(), marginX, cursorY + 26, contentWidth, rowLineHeight);
        cursorY += 30 + (lines - 1) * rowLineHeight + 22;
    }

    rows.forEach(row => {
        drawRow(row.label, row.value, row.big ? '#FF1493' : '#5A3D46', row.big);
    });

    cursorY += 8;
    drawDivider(cursorY);
    cursorY += 30;

    if (hasSena) {
        drawRow('SEÑA DESCONTADA', `-$${sena.toLocaleString('es-AR')}`, '#FF4D4D', false);
    }

    ctx.fillStyle = '#9E7D86';
    ctx.font = "600 14px 'Outfit', Arial";
    ctx.fillText(hasSena ? 'TOTAL COBRADO (NETO)' : 'TOTAL COBRADO', marginX, cursorY);

    ctx.fillStyle = '#FF1493';
    ctx.font = "bold 46px 'Outfit', Arial";
    ctx.textAlign = 'right';
    ctx.fillText(`$${neto.toLocaleString('es-AR')}`, W - marginX, cursorY + 12);
    ctx.textAlign = 'left';

    cursorY += totalBlockHeight;
    drawDivider(cursorY - 20);

    const footerText = 'Gracias por su confianza';
    const footerY = cursorY + 35;

    ctx.font = "600 15px 'Outfit', Arial";
    const footerTextWidth = ctx.measureText(footerText).width;

    let iconWidth = 0;
    const iconGap = 10;
    try {
        ctx.font = "900 15px 'Font Awesome 6 Free'";
        iconWidth = ctx.measureText('\uf004').width;
    } catch (e) {
        iconWidth = 0;
    }

    const footerBlockWidth = iconWidth + (iconWidth > 0 ? iconGap : 0) + footerTextWidth;
    let footerX = (W - footerBlockWidth) / 2;

    ctx.textAlign = 'left';

    if (iconWidth > 0) {
        try {
            ctx.font = "900 15px 'Font Awesome 6 Free'";
            ctx.fillStyle = '#FF69B4';
            ctx.fillText('\uf004', footerX, footerY);
            footerX += iconWidth + iconGap;
        } catch (e) {
            // ignore
        }
    }

    ctx.fillStyle = '#5A3D46';
    ctx.font = "600 15px 'Outfit', Arial";
    ctx.fillText(footerText, footerX, footerY);

    ctx.fillStyle = '#CBB2B9';
    ctx.font = "11px 'Outfit', Arial";
    ctx.textAlign = 'center';
    ctx.fillText('Comprobante generado automáticamente', W / 2, cursorY + 58);

    ctx.textAlign = 'left';

    return canvas;
}

export function downloadTicketBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function shareServiceTicketAsImage(item, canvasRef, notify) {
    const canvas = generateTicketCanvas(item, canvasRef?.current, document.getElementById('logo-img'));

    return new Promise((resolve) => {
        canvas.toBlob(async (blob) => {
            if (!blob) {
                if (notify) notify('No se pudo generar el ticket.', 'error');
                resolve({ success: false });
                return;
            }

            const fileName = `ticket_${(item.cliente || 'cliente').toString().replace(/\s+/g, '_')}.png`;
            const file = new File([blob], fileName, { type: 'image/png' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'Ticket Evolet Studio',
                        text: `Ticket de ${item.cliente} - ${item.servicio}`
                    });
                    resolve({ success: true });
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        console.error('Error al compartir:', err);
                        if (notify) notify('No se pudo abrir el menú de compartir.', 'error');
                    }
                    resolve({ success: false, cancelled: err.name === 'AbortError' });
                }
            } else {
                downloadTicketBlob(blob, fileName);
                if (notify) notify('Ticket descargado como PNG. Compártelo desde tu galería 💖', 'success');
                resolve({ success: true, downloaded: true });
            }
        }, 'image/png');
    });
}

export async function downloadServiceTicketAsPng(item, canvasRef, notify) {
    const canvas = generateTicketCanvas(item, canvasRef?.current, document.getElementById('logo-img'));
    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                if (notify) notify('No se pudo generar el ticket PNG.', 'error');
                resolve({ success: false });
                return;
            }
            const fileName = `ticket_${(item.cliente || 'cliente').toString().replace(/\s+/g, '_')}.png`;
            downloadTicketBlob(blob, fileName);
            if (notify) notify('¡Ticket descargado! 💖', 'success');
            resolve({ success: true });
        }, 'image/png');
    });
}

const TicketCanvas = forwardRef(function TicketCanvas(_props, ref) {
    const canvasRef = useRef(null);
    useImperativeHandle(ref, () => ({
        getCanvas: () => canvasRef.current,
        generate: (item) => generateTicketCanvas(item, canvasRef.current, document.getElementById('logo-img'))
    }), []);

    useEffect(() => {
        if (canvasRef.current) {
            canvasRef.current.width = 640;
            canvasRef.current.height = 400;
        }
    }, []);

    return (
        <canvas
            ref={canvasRef}
            id="ticket-canvas"
            className="ticket-canvas-hidden"
            aria-hidden="true"
        />
    );
});

export default TicketCanvas;
