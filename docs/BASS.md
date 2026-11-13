# BASS (etapa 3)

Bajo estilo TB-303 generado por codigo: una voz monofonica en un AudioWorklet,
un secuenciador de 16 pasos con nota, slide y acento, y generacion de
patrones con semilla portada de fck-synth. Los loops de
`public/samples/bass` **no** se usan todavia.

## Modulos

> **Etapa 4:** el DSP, el worklet y el modulo se extrajeron a un motor de voz
> compartido con el SYNTH (`src/audio/voice/`), y la tonalidad paso a
> `state.key`, compartida con el SYNTH. El sonido del BASS no cambio. Ver
> `docs/SYNTH.md`.

| Archivo | Que hace |
| --- | --- |
| `src/core/scales.ts` | Tonicas, escalas de 5 grados, nota MIDI de cada grado (de fck-synth). Compartido con el SYNTH. |
| `src/core/bass-patterns.ts` | Pasos (nota, slide, acento, largo), patron inicial, edicion a mano, generador con semilla (5 modos + CAOS) y `BassSequencer` (pasos -> eventos de la voz). |
| `src/core/bass-voices.ts` | Caracter de cada modo para la voz (gate, envolvente, decay, drive). |
| `src/audio/voice/` | Motor de voz compartido: voz, motor, worklet, modulo y pista (ver `docs/SYNTH.md`). |
| `src/audio/bass/bass-voice.ts` | Diseno 303 del motor compartido y como las perillas del BASS se vuelven parametros. |
| `src/audio/bass/bass-track.ts` | El BASS en el backend: secuenciador y gate del modo. |

Todo el nucleo (`src/core`) sigue sin DOM ni Web Audio.

## La voz (DSP)

Camino de la senal, por muestra:

1. **Oscilador:** sierra y cuadrada con **PolyBLEP** (corrige cada salto de la
   forma de onda para que no haya aliasing). La tecla ONDA cambia entre las
   dos con un fundido de ~12 ms. **Sub oscilador** opcional: cuadrada una
   octava abajo, tambien con PolyBLEP.
2. **Filtro escalera de 24 dB** (4 polos), con **saturacion en cada etapa**
   (tanh rapida) y realimentacion para la resonancia. Corre a 2x la
   frecuencia de muestreo para ser estable con resonancia alta. Al maximo la
   resonancia queda justo debajo de la autooscilacion.
3. **Envolvente de filtro:** sube al maximo en cada nota y **decae** con el
   tiempo de DECAY (40 ms a ~2,5 s, exponencial). CUTOFF fija la base (40 Hz a
   ~6,5 kHz).
4. **Acento:** sube el volumen (0,62 -> 1), la resonancia (+0,15) y abre mas
   el filtro (+1,6 octavas con su propia envolvente rapida, 120 ms), como el
   "wow" de la 303.
5. **Slide:** si una nota esta sostenida por un slide, la siguiente no
   redispara las envolventes: la altura se desliza (portamento) con una
   constante de 25 ms (llega en unos 60 ms, como la 303).
6. **Amplificador:** ataque de 1,5 ms y relajacion de 8 ms, para que ni el
   comienzo ni el final de una nota hagan chasquido.
7. **Drive:** saturacion suave con compensacion de volumen.
8. **Limitador de seguridad** (umbral 0,89, relajacion de 80 ms) y un recorte
   suave final: la salida nunca llega a 1.

**Sin chasquidos:** todos los parametros (CUTOFF, RESO, DRIVE, ONDA, SUB y la
envolvente de cada modo) se suavizan con una constante de ~12 ms dentro del
DSP. El nivel del acento tambien se suaviza.

### Interfaz para Rust/WebAssembly

`VoiceDsp` (en `src/audio/voice/engine.ts`, compartido con el SYNTH desde la
etapa 4) es el limite pensado para reemplazar:

```ts
interface VoiceDsp {
  setParams(params: EngineParams): void;  // numeros 0..1 y tiempos en segundos
  noteOn(id: number, midi: number, accent: boolean, legato: boolean): void;
  noteOff(id: number): void;
  allOff(): void;
  render(out: Float32Array, start: number, end: number): void;
}
```

Solo numeros de entrada y un `Float32Array` de salida: se puede exportar desde
Rust con `wasm-bindgen` sobre memoria compartida. El procesador
(`voice-processor.ts`) se encarga de los tiempos y no cambiaria; solo
instanciaria la version WASM en lugar de `VoiceEngine`.

## Secuencia, slide y acento

- Cada paso tiene una **nota** (uno de los 5 grados de la escala) o silencio,
  y las marcas **SLIDE** y **ACCENT** (acento).
- **Gate:** una nota suena el 55 % del paso (x el largo en pasos, x el gate
  del modo) y se suelta.
- **Slide** (como en la 303): el slide de un paso **mantiene** esa nota y la
  **desliza** hacia la del paso siguiente sin redisparar. Una cadena de
  slides queda ligada hasta la ultima nota. Si el paso siguiente es silencio,
  la nota dura el paso entero y se suelta. El slide del paso 16 liga con el
  paso 1 del compas siguiente.
- `BassSequencer` (nucleo, testeado) convierte cada paso en eventos
  `on` / `off` con hora exacta. Cada `off` lleva el id de su nota, asi una
  nota vieja nunca corta a una nueva.

## Reloj y grafo

- **Mismo reloj que el DRUM:** el `LookaheadScheduler` contra
  `AudioContext.currentTime`. En cada paso, el backend le pide los eventos al
  secuenciador y los manda al worklet por mensaje, 100 ms antes. El worklet
  aplica cada uno en su muestra exacta dentro del bloque de 128.
- **Cabezal y encendido del nodo:** el BASS se enciende solo cuando el motor
  de audio toco una nota en ese paso, y se muestra cuando ese paso se
  escucha (con la latencia de salida descontada), igual que el DRUM.
- **Cable real al MASTER**, por su canal del mezclador (la perilla BASS del
  MASTER ahora controla su nivel; unidad a la mitad, como DRUM).
- **Cortar y reconectar en vivo:** tocar un cable lo corta; tocarlo de nuevo
  lo reconecta. Cada cable tiene una zona de toque invisible de 18 px. El
  cable cortado se dibuja punteado y tenue. Vale para todos los nodos, pero
  solo DRUM y BASS tienen audio todavia.

### Que entra al instante y que en el proximo compas

| Al instante | En el proximo compas |
| --- | --- |
| Perillas CUTOFF, RESO, DECAY, DRIVE; ONDA; SUB | Agregar o quitar el nodo |
| Nivel BASS del MASTER | **Cortar o reconectar el cable** |
| Pasos editados a mano | Patron nuevo (DICE, cambio de MODO, CAOS) |
| | Tonica y escala |

Al detener o cortar el cable, la nota que sonaba se suelta y se descartan los
eventos ya programados.

## Panel

```
[ BASS: CUTOFF RESO DECAY DRIVE ] [ OSC: SIERRA/CUADRADA, SUB ] [ ESCALA: - C +, - PENTA MENOR + ]
[ MODO: PULSE BROKEN DIRTY DRONE CHAOS ] [ PATRON: DICE ] ............ [ MACRO: CAOS ]
```

- **Secuenciador:** 7 filas x 16 pasos. Las 5 de arriba son las notas de la
  escala (la mas aguda arriba), con el nombre de la nota segun tonica y
  escala; despues, separadas por un espacio, **SLIDE** y **ACCENT**. Tocar
  una nota la pone en ese paso (reemplaza la que habia); tocarla de nuevo deja
  el paso en silencio.
- **SLIDE y ACCENT atenuados** en los pasos sin nota (ahi no hacen nada); se
  pueden tocar igual.
- **SLIDE ON/OFF** (tecla con LED en PATRON, junto a DICE): apagado, ningun
  slide suena y la fila SLIDE se ve atenuada entera, pero las marcas quedan;
  al prenderlo vuelven a sonar. Entra al instante, como una perilla. Una nota
  que ya estaba ligada por un slide termina su glide en el paso siguiente.
- **Display:** `BASS · C PENTA MENOR`. Al cambiar tonica, escala o modo
  muestra el cambio (`BASS TONICA C#`, `BASS MODO DRONE`).
- **DICE:** patron nuevo al azar en el modo actual; siempre distinto en la
  grilla del que suena (si una semilla repite la grilla, prueba otra).
- Sin la palabra "semilla" en la interfaz. La semilla vive en
  `state.bass.seed` para poder guardarla.

## Decisiones tomadas en lo ambiguo

- **Modo = estilo del patron + caracter de la voz.** En fck-synth el modo
  elegia patron y timbre. Aca cada modo tiene su gate, profundidad de
  envolvente, escala del DECAY y drive extra (`bass-voices.ts`); las perillas
  actuan encima. La onda la elige la tecla ONDA, no el modo (la 303 solo
  tiene sierra y cuadrada; el triangulo de PULSE en fck-synth paso a sierra).
- **Elegir un modo genera un patron de ese modo** con la misma semilla (como
  CAOS), para que se escuche el cambio. DICE cambia la semilla.
- **CAOS en el BASS:** regenera con la misma semilla. A mas CAOS, mas notas en
  los silencios, saltos de nota mas amplios y mas acentos y slides.
- **Slides en la generacion:** fck-synth no generaba slides; se agregaron con
  una probabilidad por modo (DIRTY y CHAOS mas) que sube con CAOS.
- **Escalas:** las 4 de fck-synth, de 5 grados (PENTA MENOR, MENOR, MAYOR,
  DORICA). MENOR y MAYOR son recortes de 5 notas, como alla. Rango: la octava
  que empieza en C2 (36 MIDI) mas la tonica.
- **Nombres de nota** como en fck-synth, en ASCII: `C#`, `Eb`, `F#`, `Ab`,
  `Bb` (sin los simbolos tipograficos de sostenido y bemol, por la fuente).
- **Patron inicial:** los pasos del prototipo (notas en 1, 4, 7, 9, 12 y 14;
  slides en 4 y 14; acentos en 1 y 7) con una linea simple de grados.
- **Tonica y escala entran en el proximo compas** porque cambian todas las
  notas: lo trate como cambio estructural.
- **Cortar un cable entra en el proximo compas** por la regla del proyecto
  ("cambios estructurales entran en el proximo compas"). El dibujo cambia al
  instante.
- **Sub:** apagado de entrada.
- **Etiqueta DICE** como pediste, aunque en el DRUM el boton equivalente dice
  RNDM.

## Pendiente o conocido

- **Telefono horizontal (844x390):** la grilla de 7 filas queda cortada; se
  ven menos de dos filas. Es el mismo problema de alto que ya tenia el DRUM
  (4 filas), aca mas grave. Arreglarlo cambia el reparto entre lienzo y panel,
  que es lo que compara el test de paridad en telefono; queda para una etapa
  de diseno.
- **Sin AudioWorklet** (pagina sin https ni localhost) el BASS queda en
  silencio, con un aviso en la consola; no hay mensaje en el display.
- Probado en Chromium (desarrollo y build de produccion). Safari y Firefox,
  no.
- Terminos tecnicos nuevos en la interfaz: OSC, SUB, DICE y los nombres de los
  modos en ingles (PULSE, BROKEN, DIRTY, DRONE, CHAOS).

## Tests

- `tests/unit/bass.test.ts`: escalas y notas; patron inicial; grilla (filas,
  notas, SLIDE, ACCENT); generacion reproducible por modo y caracter de cada modo;
  efecto de CAOS; **secuencia** (tiempos, gate, acento, slide, cadena de
  slides, slide a silencio, slide del ultimo paso al primero, largo y gate
  del modo, reset); store (DICE siempre distinto, modo y CAOS con la misma
  semilla, tonica, escala, onda, sub); **DSP** (PolyBLEP, silencio inicial,
  limites con todo al maximo, relajacion, acento mas fuerte y brillante,
  slide con portamento contra salto, legato sin redisparo, saltos de
  parametros sin chasquido).
- `tests/unit/audio-link.test.ts`: el BASS toca en el reloj compartido y se
  enciende al sonar; con el cable cortado se calla y no se enciende; al
  reconectar vuelve; la escena lleva tonica, perillas y teclas.
- `tests/unit/state.test.ts`: cortar y reconectar cables; un nodo quitado
  vuelve conectado.
- `tests/e2e/audio.spec.ts` (Playwright, prueba de humo): el BASS suena por el
  MASTER, el cabezal avanza, el nodo se enciende; cortar el cable lo calla en
  el proximo compas y reconectarlo lo devuelve sin detener la reproduccion;
  el panel (DICE, modos, tonica, escala, filas con nombres de nota, onda, sub,
  pasos) funciona sin errores de consola.
- `tests/e2e/parity.spec.ts`: `panel-bass` sale de la comparacion (punto 6,
  con el motivo). El resto de los estados se sigue comparando.
