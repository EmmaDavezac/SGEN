/**
 * Pull-to-refresh (deslizar hacia abajo para recargar).
 *
 * En mobile no hay F5, así que este gesto —típico de apps nativas— recarga el
 * panel activo. El scroll de la app vive en un único contenedor (`.app-content`),
 * porque el `body` tiene `overflow: hidden`. Por eso el gesto se detecta sobre
 * ESE scroller y no dentro de cada panel.
 *
 * Sigue el mismo patrón desacoplado que `formGuard.js`: el gesto vive en un
 * lugar (`usePullToRefreshGesture`, usado por el layout) y cada panel se engancha
 * con `usePullToRefreshHandler` para responder con su propio loader. Como solo
 * hay un panel montado a la vez, se guarda el handler activo.
 *
 * No depende de ninguna librería: usa eventos touch nativos.
 */

import { useEffect, useRef, useState } from 'react';

// Umbral de arrastre (px) para disparar la recarga al soltar.
const THRESHOLD_PX = 64;
// Tope del indicador (px) y factor de resistencia: el dedo avanza más rápido que
// el indicador para que se sienta "con goma", como en las apps nativas.
const MAX_PULL_PX = 100;
const RESISTANCE = 0.5;

// Handler de recarga del panel activo. null = ningún panel enganchado.
let activeHandler = null;

/**
 * Registra la función de recarga del panel mientras esté montado. Al montarse
 * otro panel (cambio de pestaña) reemplaza al anterior; al desmontarse libera
 * el slot solo si sigue siendo el dueño.
 *
 * @param {() => (void | Promise<void>)} onRefresh
 */
export function usePullToRefreshHandler(onRefresh) {
    // Guardamos el loader más fresco en un ref y registramos UNA sola vez: así
    // los paneles pueden pasar funciones que se recrean en cada render (la
    // mayoría de los loaders) sin re-enganchar el listener en cada uno.
    const handlerRef = useRef(onRefresh);
    handlerRef.current = onRefresh;

    useEffect(() => {
        activeHandler = () => handlerRef.current?.();
        const registered = activeHandler;
        return () => {
            if (activeHandler === registered) activeHandler = null;
        };
    }, []);
}

/**
 * Engancha el gesto pull-to-refresh al contenedor scrolleable.
 *
 * Solo actúa cuando el scroll ya está en el tope (`scrollTop <= 0`): si no,
 * sería un scroll normal y no debe interferir. Devuelve el estado para dibujar
 * el indicador: `distance` (cuánto se "estiró", en px) y `refreshing` (true
 * mientras corre el loader del panel).
 *
 * @param {React.RefObject<HTMLElement>} scrollRef contenedor con overflow-y
 * @returns {{ distance: number, refreshing: boolean }}
 */
export function usePullToRefreshGesture(scrollRef) {
    const [distance, setDistance] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    // Punto de partida del toque y si el gesto está activo. En refs para no
    // re-enganchar los listeners en cada render.
    const startYRef = useRef(0);
    const pullingRef = useRef(false);
    // Distancia del arrastre en un ref: `finish` (en touchend) necesita leer el
    // valor ACTUAL, no el del closure del efecto (que no se reengancha al
    // arrastrar). El estado `distance` sigue sirviendo para dibujar el indicador.
    const pullDistanceRef = useRef(0);

    useEffect(() => {
        const el = scrollRef?.current;
        if (!el) return undefined;

        const onTouchStart = (e) => {
            // Un solo dedo y desde el tope del scroll.
            if (e.touches.length !== 1 || el.scrollTop > 0 || refreshing) return;
            startYRef.current = e.touches[0].clientY;
            pullingRef.current = false;
        };

        const onTouchMove = (e) => {
            if (e.touches.length !== 1 || refreshing) return;
            const dy = e.touches[0].clientY - startYRef.current;

            // Si scroleó fuera del tope, cancelamos: es scroll normal.
            if (el.scrollTop > 0) {
                pullingRef.current = false;
                pullDistanceRef.current = 0;
                setDistance(0);
                return;
            }
            if (dy <= 0) return;

            // A partir de acá el gesto es pull-to-refresh: evitamos el rebote
            // nativo del navegador y movemos el indicador con resistencia.
            pullingRef.current = true;
            if (e.cancelable) e.preventDefault();
            const dist = Math.min(MAX_PULL_PX, dy * RESISTANCE);
            pullDistanceRef.current = dist;
            setDistance(dist);
        };

        const finish = () => {
            if (!pullingRef.current) {
                setDistance(0);
                return;
            }
            const reached = pullDistanceRef.current >= THRESHOLD_PX;
            pullingRef.current = false;
            pullDistanceRef.current = 0;
            setDistance(0);
            if (!reached || !activeHandler) return;
            setRefreshing(true);
            Promise.resolve()
                .then(() => activeHandler())
                .catch(() => { /* el panel ya avisa del error por su cuenta */ })
                .finally(() => setRefreshing(false));
        };

        const onTouchEnd = () => finish();
        const onTouchCancel = () => finish();

        // passive: false en touchmove para poder prevenir el overscroll nativo.
        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onTouchEnd);
        el.addEventListener('touchcancel', onTouchCancel);
        return () => {
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onTouchEnd);
            el.removeEventListener('touchcancel', onTouchCancel);
        };
    }, [scrollRef, refreshing]);

    return { distance, refreshing };
}
