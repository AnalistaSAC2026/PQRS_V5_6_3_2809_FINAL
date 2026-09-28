# Validación — General Summary Visual Refresh V5.6.6

## Resumen General

La copia visible “Datos actuales” fue reemplazada por “Resumen General” en navegación, tooltip y heading, manteniendo los IDs técnicos y la vista `summary`.

## Visualizaciones

- **Evolución mensual:** conserva el gráfico de barras y sus datos, variación mensual, selección y tooltip; ahora reutiliza el tema base, movimiento reducido y colores de ejes/grid corporativos.
- **Distribución por área:** mantiene ranking horizontal descendente y añade cantidad más participación, calculadas sobre el mismo universo filtrado.
- **Clasificación:** conserva donut, total central, valores reales, leyenda y tooltip; se redujo el borde visual y se eliminó el borde blanco rígido.
- **Antigüedad de abiertas:** conserva exactamente los cuatro rangos existentes y adopta la paleta tonal, grid, tooltip y labels del tema corporativo.

## Hallazgos rápidos

La card utiliza cuatro reglas determinísticas sobre `filtered()`: área de mayor volumen, mes de mayor volumen, oportunidad 0–5 y rango abierto dominante. No contiene conclusiones hardcodeadas ni generación libre. El layout es 2×2 en escritorio/tablet y una columna en móvil.

## Filtros y estados vacíos

KPI, gráficos y hallazgos derivan del mismo `rows=filtered()`. El helper gráfico existente reemplaza canvases sin datos por el estado vacío; Hallazgos muestra “No hay datos para los filtros seleccionados.” cuando el universo es cero.

## Integridad y regresión

- Corte: `28/09/2026`.
- SHA-256 `data.js`: `CA4E224D19E3B45D50DC86CB336D5233D075E3CA12D16BFF16F9DCE6E278BD82`.
- SHA-256 `commercial-verbatim.js`: `F655F815A112A5C242A9DAA503129CEF182BCA2746F03BB84010956467821DD5`.
- KPI y drill-down V5.2 permanecen.
- Tracking Area V5.6.4 permanece.
- Commercial Header V5.6.5 permanece.
- B2B continúa oculto.
- Sin gauges ni tacómetros.

Se ejecutan todas las suites disponibles en esta carpeta y las comprobaciones de sintaxis. No se realizó despliegue a Netlify.
