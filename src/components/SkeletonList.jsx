import React, { useEffect, useState } from 'react';

/**
 * Skeleton de carga unificado para todos los listados.
 * Imita la estructura base de las cards (avatar + líneas de texto + acciones)
 * para que la transición al contenido real no "salte".
 */
function SkeletonList({ count = 5 }) {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div className="unified-card skeleton-card" key={index}>
          <div className="skeleton-avatar" />
          <div className="skeleton-body">
            <div className="skeleton-line" />
            <div className="skeleton-line skeleton-line--short" />
          </div>
          <div className="skeleton-actions">
            <div className="skeleton-action" />
            <div className="skeleton-action" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Devuelve true mientras se está "buscando": se activa al cambiar el término
 * de búsqueda y se apaga tras un breve margen, dando feedback visual de que
 * el listado se está filtrando (aunque el filtrado sea sincrónico).
 */
function useSearching(searchTerm) {
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!searchTerm) {
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    const timer = setTimeout(() => setSearching(false), 280);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  return searching;
}

export { SkeletonList, useSearching };
export default SkeletonList;