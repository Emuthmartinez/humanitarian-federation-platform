# Handoff para Terremoto Venezuela

Este documento explica cómo `terremotovenezuela.app` puede usar la plataforma
de federación de forma segura para procesar datos de muchas fuentes y consumir
una salida limpia, normalizada y estable.

## Resumen

La plataforma separa dos cosas:

- **Entrada flexible:** pueden enviar JSON, CSV, texto, enlaces, hojas públicas
  o estructuras mixtas. Esa data entra a revisión restringida.
- **Salida estable:** el frontend consume un snapshot público normalizado con
  personas, grupos, entidades, fuentes, tombstones y metadatos de espejo.

Los campos de máquina se mantienen estables en inglés (`status`, `kind`,
`confidence`, `recommendedAction`) para que no se rompa la integración. Los
textos visibles para usuarios deben venir en el idioma del sitio, por ejemplo
`defaultLocale: "es-VE"` para Venezuela.

## Flujo recomendado

1. Envíen cualquier dato nuevo a `POST /api/v1/public-intake`.
2. La plataforma guarda la entrada en una cola restringida. No publica ni une
   registros automáticamente.
3. Un operador o worker valida, normaliza, deduplica y redacta los registros.
4. La salida pública se publica en `GET /api/v1/public-snapshot.json`.
5. El frontend de ustedes consume `records.personGroups` para tarjetas de
   personas y `records.entities` para hospitales, refugios, centros de acopio,
   organizaciones, canales y necesidades.
6. Si el proveedor principal se cae, un espejo puede servir el último snapshot
   verificado por `contentHash` y `sequence`.

## Garantías de seguridad

- No se exponen teléfonos privados, notas privadas, cédulas, hashes de fotos,
  coordenadas privadas, credenciales ni llaves de partners.
- Las entidades públicas usan coordenadas suavizadas cuando hay ubicación.
- Cada registro conserva `source`, `externalId` y enlace de fuente para que se
  pueda auditar de dónde vino.
- La deduplicación produce candidatos de revisión. Un `candidate_duplicate` no
  es una unión confirmada.
- Un cambio de estado conflictivo queda marcado como conflicto y requiere
  revisión antes de cerrar una búsqueda.
- Si un registro debe salir del feed público, se publica un tombstone para que
  los frontends y espejos lo retiren de la vista actual.

## Contrato de idioma

Usen el idioma que ya usa su frontend. Para Venezuela:

```json
{
  "defaultLocale": "es-VE",
  "locales": ["es-VE"]
}
```

Esto significa:

- nombres de fuentes, notas públicas, badges y advertencias aparecen en español
- los enums siguen iguales para integraciones y filtros
- el frontend no necesita traducir estados internos para saber qué acción tomar

Ejemplo de grupo de persona:

```json
{
  "kind": "candidate_duplicate",
  "confidence": "likely",
  "recommendedAction": "coordinator_review",
  "warnings": [
    {
      "id": "candidate_review_required",
      "severity": "warning",
      "message": "El posible duplicado requiere revision de coordinacion antes de tratarse como una union confirmada."
    }
  ]
}
```

## Espejos y continuidad

Los espejos deben:

- descargar `public-snapshot.json`
- rechazar snapshots cuyo `contentHash` no coincida
- preferir el `sequence` más alto verificado
- guardar copias inmutables por hash
- aplicar `records.tombstones` para no mostrar registros retirados

El frontend debe intentar el proveedor principal primero y caer a un espejo solo
si el proveedor no responde o si el espejo tiene un snapshot verificado más
reciente.

## Qué no deben asumir

- Un grupo candidato no significa que dos reportes sean la misma persona.
- Un badge de partner no significa aprobación gubernamental ni certificación de
  seguridad estructural.
- La ausencia de un registro viejo no basta para ocultarlo; usen tombstones del
  snapshot más reciente.
- La cola de intake no es pública y no debe usarse como fuente de verdad para el
  frontend.
