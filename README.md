# m.o.n.o
music orchestration & noise operation. App web de musica en vivo,
electronica y experimental. Ver CLAUDE.md para las decisiones del proyecto
y docs/PROMPT-ETAPA-1.md para arrancar la construccion.

## Desarrollo

Requiere Node 22.12 o superior.

```
npm install
npx playwright install chromium   # una sola vez, para los tests de navegador
npm run dev                       # sirve la app en http://localhost:5173
```

| Comando | Que hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` | Chequeo de tipos y build de produccion en `dist/`. |
| `npm run typecheck` | Solo chequeo de tipos. |
| `npm test` | Tests unitarios (Vitest): `src/core` y `src/state`. |
| `npm run test:e2e` | Tests en navegador (Playwright): interaccion y paridad visual con `reference/prototype/mono.html`. |

## Estructura

- `src/core`: nucleo musical en TypeScript puro (sin DOM ni Web Audio).
- `src/audio`: interfaz `AudioBackend` y sus implementaciones. Por ahora solo `SilentBackend`, que mueve el cabezal sin sonar.
- `src/state`: estado de la aplicacion y sus acciones.
- `src/ui`: componentes Lit. `stage/` es el lienzo, `panel/` el panel del nodo seleccionado.
