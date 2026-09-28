# Validación — Commercial Semantic Header Cleanup V5.6.5

## Header de análisis complementario

Se preservaron el eyebrow “Análisis complementario”, el título “Causa raíz comercial” y los chips dinámicos de corte, Colombia disponible y casos fuera de cobertura. Se retiró completamente el párrafo ejecutivo inferior, sin reemplazarlo por otro contenido.

## Elementos retirados

- Párrafo descriptivo del encabezado.
- Card visual “Alcance metodológico”.
- Texto interno, botón, chevron, panel plegable y atributos ARIA asociados.
- Listener JavaScript exclusivo del disclosure.
- Selectores CSS exclusivos del párrafo y la card metodológica.

Las reglas metodológicas del motor no cambiaron: país elegible, unión País + Radicado, clasificación, cobertura y privacidad permanecen intactas.

## Principal grupo

El resumen conserva nombre, cantidad y porcentaje dinámicos. En escritorio presenta label superior y una fila horizontal alineada a la izquierda con nombre y métrica. En anchos de hasta 560 px la fila se apila, conservando lectura completa sin ancho rígido ni overflow.

## Componentes preservados

- Chips superiores dinámicos.
- Grupos de causa y Top 10 de submotivos.
- Detalle semántico, sorting, auditoría y CSV.
- Detalle mensual.
- Contraste V5.6.2 y Dark Mode.
- Filtro local Área de Seguimiento V5.6.4.
- B2B oculto.

## Integridad y QA

- Corte efectivo: `28/09/2026`.
- SHA-256 `data.js`: `CA4E224D19E3B45D50DC86CB336D5233D075E3CA12D16BFF16F9DCE6E278BD82`.
- SHA-256 `commercial-verbatim.js`: `F655F815A112A5C242A9DAA503129CEF182BCA2746F03BB84010956467821DD5`.
- No se publica `DESCDETALLE` desde la aplicación.
- Se ejecutaron todas las suites disponibles en esta carpeta: V5.6.4 y V5.6.5.

La validación visual automatizada depende de que `http-server` y un navegador integrado estén disponibles en el entorno. No se realizó despliegue a Netlify.
