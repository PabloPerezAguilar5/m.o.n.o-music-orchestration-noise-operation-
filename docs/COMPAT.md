# Compatibilidad: Safari y Firefox (etapa 9)

Auditoria del codigo contra Safari y Firefox. Solo hubo Chromium para probar: lo que
sigue esta leido en el codigo y en las tablas de compatibilidad, **no probado** en esos
navegadores. Al final, la lista de lo que no se pudo verificar.

## API por API

| API | Donde se usa | Deteccion | Sin soporte |
| --- | --- | --- | --- |
| `AudioContext` | `web-audio-backend.ts` | `detectAudioEnv()` (`src/audio/support.ts`); ademas `unlock()` atrapa el error al crearlo | Display de MASTER: "AUDIO NO DISPONIBLE: ESTE NAVEGADOR NO TIENE WEB AUDIO". La app sigue en pie, sin sonido |
| `AudioWorklet` / `AudioWorkletNode` | voces, DISTORSION, LFO, reloj (`worklets.ts`, `audio-clock.ts`) | `detectAudioEnv()` al cargar, antes de tocar nada | **Fuera de https o localhost** el navegador no lo ofrece: MASTER dice "AUDIO NO DISPONIBLE: ABRI LA APP DESDE HTTPS O LOCALHOST". En un navegador viejo con https: "AUDIO LIMITADO: ESTE NAVEGADOR NO TIENE AUDIOWORKLET". DRUM, DRONE y BASS en SLICE siguen sonando (no usan worklet); SYNTH, LEAD, BASS 303, DISTORSION y LFO quedan en silencio, y su display dice por que. El reloj cae a un temporizador que solo despierta al scheduler (el tiempo musical sigue siendo `currentTime`) |
| `CompressionStream` / `DecompressionStream` (`deflate-raw`) | links `#p=` (`patch-link.ts`) | `canCompress()` prueba construirlos con `deflate-raw` (que existan no basta: versiones viejas los tienen sin ese formato) y que `Blob.stream()` exista | Los links que se generan salen sin comprimir (`#p=1r.`), mas largos; si no entran en 6000 caracteres, "LINK DEMASIADO LARGO · USA EXPORT". Un link comprimido que llega a un navegador sin soporte dice "ESTE NAVEGADOR NO ABRE LINKS COMPRIMIDOS · PEDI EL ARCHIVO Y USA IMPORT" (antes decia "link danado") |
| IndexedDB | patches (`patch-storage.ts`) | `openPatchStorage()` atrapa su ausencia o su rechazo (ventana privada de Firefox viejo) | Los patches quedan en memoria, el display avisa "SIN ALMACENAMIENTO" y la lista muestra "SOLO EN ESTA SESION" |
| `localStorage` | posicion del divisor | `try/catch` en lectura y escritura | Se usa el valor por defecto; no se guarda |
| Pointer events y `setPointerCapture` | perillas, teclado, pad, lienzo, tempo | Todos los navegadores actuales los tienen (Safari 13+, Firefox 59+) | No hay alternativa; un navegador anterior queda fuera |
| Desbloqueo del audio por gesto | `main.ts` | Se llama a `unlock()` en `pointerdown`, `pointerup`, `touchend`, `click` y `keydown` (es idempotente) | iOS Safari solo cuenta un toque como gesto de audio al terminar (`touchend` o `click`); `pointerdown` solo no basta. Si aun asi queda bloqueado, el display dice "AUDIO BLOQUEADO · TOCA ▶" |
| `navigator.clipboard` | SHARE | `try/catch` | El link va a la barra de direcciones ("LINK EN LA BARRA DE DIRECCIONES"). Sin https no hay portapapeles |
| `<input type=file>` + evento `cancel` | IMPORT (`patch-files.ts`) | — | Safari anterior a 16.4 no dispara `cancel`: si se cierra el selector sin elegir, la promesa queda pendiente (no pasa nada visible; el input se queda oculto hasta recargar) |
| `Array.prototype.at` | `lead.ts`, `silent-backend.ts`, `lfo-processor.ts` | — | Safari 15.4+, Firefox 90+ |
| `crypto.getRandomValues` | semillas (`random.ts`) | — | Existe tambien fuera de https (`randomUUID` no, y no se usa) |
| `ResizeObserver` | onda de SLICE | — | Safari 13.1+, Firefox 69+ |
| `decodeAudioData` como promesa | samples | — | Safari 14.1+ |
| `outputLatency` | `web-audio-backend.ts` | Cae a `baseLatency` y a 0 | Firefox y Safari no lo tienen o dan 0: el visual puede adelantarse algunos ms |

## CSS

| Propiedad | Donde | Alternativa |
| --- | --- | --- |
| `color-mix()` | `mono-stage.ts` (nodo encendido) | Declaracion anterior con un gris claro fijo (Safari < 16.2, Firefox < 113); el contorno y el brillo siguen en el color del nodo |
| `scrollbar-width` / `scrollbar-color` | listas, columna de perillas, zonas | `::-webkit-scrollbar` para Safari; ademas las sombras de borde avisan que hay mas |
| `conic-gradient`, `clip-path`, `inset`, `:focus-visible`, `overscroll-behavior` | perillas, marco del panel... | Safari 14.1+ / 15.4+ / 16+, Firefox 83+ o anterior |
| Estilos de Lit | todos los componentes | Lit usa `adoptedStyleSheets` y, donde no existen, etiquetas `<style>` |
| `touch-action: none` en el SVG del lienzo | `mono-stage.ts` | Safari antiguo lo ignora en elementos SVG; no hay alternativa puesta (ver abajo) |

## Lo que no pude verificar sin esos navegadores

1. **Safari/iOS: desbloqueo del audio.** Que `touchend`/`click` alcance y que `resume()` dentro
   del gesto arranque el `AudioContext`; el estado `interrupted` (llamada, bloqueo de
   pantalla) y como vuelve.
2. **Safari: `addModule` con una URL `blob:`** (el reloj de `audio-clock.ts` carga su
   procesador asi) y con los modulos de los otros worklets, que Vite empaqueta aparte, servidos por https.
3. **Safari: `deflate-raw` y `Blob.stream()`.** `canCompress()` los prueba, pero no vi el
   resultado real; ni que un link generado en Chrome abra en Safari y al reves.
4. **Firefox: temporizacion del reloj con lookahead** y la latencia de `AudioWorklet`
   (sin `outputLatency`); si el cabezal visual va desfasado del sonido.
5. **Firefox: IndexedDB en ventana privada** (versiones viejas fallan al abrir; el codigo
   lo cubre, pero no lo vi).
6. **Safari/Firefox: el layout de pantalla baja** (`docs/LAYOUT.md`): barra de scroll, rejillas y
   `min-height: min-content` de la grilla de pasos; las barras de desplazamiento de
   Safari sobre iOS (se ven solo al tocar: por eso las sombras de borde).
7. **Safari: `touch-action`** en el SVG del lienzo (arrastrar nodos y cables con el dedo
   sin que la pagina haga scroll o zoom).
8. **Firefox/Safari: fuentes monoespaciadas** (`ui-monospace`, `SF Mono`, `Menlo`, `Consolas`):
   el ancho de los textos de los displays puede variar y cortarlos.
9. **Safari: pantalla completa y barras del navegador** en iPhone horizontal: `env(safe-area-*)`
   y la altura real de la ventana (el layout bajo usa el alto de la ventana, que ahi cambia
   al mostrar u ocultar las barras).
10. **Teclado fisico en Safari/Firefox**: la barra espaciadora para tocar/parar.

Las pruebas automaticas (Vitest y Playwright) corren en Chromium. Simular lo que falta
con `addInitScript` (sin `AudioWorkletNode`, sin `AudioContext`, `isSecureContext` en falso)
si esta cubierto en `tests/e2e/short-screen.spec.ts`; es la logica de aviso, no el navegador.
