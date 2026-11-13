# m.o.n.o
music orchestration & noise operations. App web de musica en vivo,
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
| `npm test` | Tests unitarios (Vitest): nucleo, estado, reloj, grafo de audio, samples. |
| `npm run test:e2e` | Tests en navegador (Playwright): interaccion, audio real y paridad visual con `reference/prototype/mono.html`. |

## Estructura

- `src/core`: nucleo musical en TypeScript puro (sin DOM ni Web Audio): reloj con lookahead (`scheduler.ts`), generadores con semilla, patrones de DRUM, manifiesto de samples.
- `src/audio`: interfaz `AudioBackend`. `WebAudioBackend` es el motor real (grafo de nodos y cables, master con limitador, DRUM con samples); `SilentBackend` es un doble para tests.
- `src/state`: estado de la aplicacion, sus acciones y el enlace con el backend de audio (`audio-link.ts`).
- `src/ui`: componentes Lit. `stage/` es el lienzo, `panel/` el panel del nodo seleccionado.
