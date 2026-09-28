# Validación — Tracking Area Filter V5.6.4

## Arquitectura

Seguimiento continúa usando los filtros globales de Año, Periodo, País, Clasificación y Segmentación. Área utiliza `state.trackingFilters.area`, un estado local explícito, para impedir que su selección altere Resumen, Motivos o las hojas de área. Los helpers `getFilterSet()` y `setFilterSet()` permiten reutilizar sin duplicación el componente multiselección V5.5.

## Comportamiento

- Preset: todas las áreas reales de `data.dicts.area`.
- Vacío: cero resultados; nunca se interpreta como “Todas”.
- Intersección: Área se combina con los demás filtros activos.
- Un único universo de `getTrackingRows()` alimenta KPI, rangos, responsables, matriz y detalle.
- El drawer recibe ese mismo universo antes de aplicar responsable/día/rango.
- Búsqueda y CSV operan únicamente sobre las filas ya guardadas en el drawer.
- Chips, contador, limpieza individual, seleccionar todo, limpiar, Escape, clic exterior y drawer móvil reutilizan la infraestructura vigente.

## Integridad

- Corte: `28/09/2026`.
- SHA-256 `data.js`: `CA4E224D19E3B45D50DC86CB336D5233D075E3CA12D16BFF16F9DCE6E278BD82`.
- `data.js`, registros y diccionarios no fueron modificados.
- Seguimiento conserva: estado distinto de Cerrada, días abiertos mayores que cero y responsable informado.
- Día cero continúa excluido.

## QA

La suite `validate-tracking-area-filter-v564.mjs` valida estructura, estado local, multiselección, vacío, preset, intersección, KPI, rangos, responsables, matriz, drawer, búsqueda, CSV, chips, reset, móvil, Dark Mode, Motivos, Comercial V5.6.3 y B2B oculto. También concilia el total de seguimiento contra la suma de todas las áreas y calcula métricas por cada valor real.

Esta carpeta de entrega no incluía las 19 suites históricas mencionadas; no se reportan como ejecutadas desde otra versión. Se ejecutaron las comprobaciones de sintaxis y la nueva suite incluida aquí.

La validación manual automatizada no pudo realizarse en esta sesión: `npx http-server` no estaba disponible en la caché local y el entorno no tenía navegadores integrados registrados. Queda pendiente abrir localmente los anchos 1440, 1366, 1024, 768, 430, 390 y 360 cuando esos recursos estén disponibles.

No se realizó despliegue a Netlify.
