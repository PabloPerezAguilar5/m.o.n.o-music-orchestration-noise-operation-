# SYNTH (etapa 4)

Secuenciador polifonico: hasta 4 voces, 2 osciladores desafinados por voz,
acordes de hasta 3 notas por paso, duracion por paso, cuatro sonidos y cuatro
modos de DICE. Comparte el motor de voz y la tonalidad con el BASS.

## Motor de voz compartido

El DSP del BASS se extrajo a `src/audio/voice/`. BASS y SYNTH son **dos
configuraciones** del mismo motor; no hay codigo de sonido duplicado.

| Archivo | Que hace |
| --- | --- |
| `voice/dsp-math.ts` | PolyBLEP, tanh rapida, coeficientes de suavizado. |
| `voice/voice.ts` | **Una voz:** osciladores PolyBLEP (uno, o un par desafinado) con sub opcional, filtro escalera de 24 dB con saturacion y envolvente de decay, envolvente de amplitud (ataque, decay a sustain, release), acento y slide. Se configura con un `VoiceDesign`. |
| `voice/engine.ts` | **El motor:** N voces del mismo diseno, suma, drive y limitador. Con 1 voz es mono (slide = portamento legato); con 4 es polifonico (roba la voz mas vieja). Interfaz `VoiceDsp`, lista para Rust/WebAssembly. |
| `voice/voice-processor.ts` | Un solo AudioWorkletProcessor para los dos instrumentos; elige el motor con `processorOptions.instrument`. Se carga una vez por contexto. |
| `voice/voice-module.ts` | El nodo en el grafo de audio (hilo principal). |
| `voice/voice-track.ts` | Lo que el backend hace igual para los dos: crear el modulo, aplicar parametros, esperar al proximo compas, programar los eventos de cada paso. |
| `bass/bass-voice.ts`, `bass/bass-track.ts` | Configuracion del BASS: diseno 303 y como sus perillas se vuelven parametros. |
| `synth/synth-voice.ts`, `synth/synth-track.ts` | Configuracion del SYNTH. |
| `src/core/scales.ts` | Tonalidad compartida (antes `bass-scales.ts`): una octava para el BASS, dos para el SYNTH. |
| `src/core/synth-patterns.ts` | Pasos con acordes, generador de 4 modos, `SynthSequencer`. |
| `src/core/synth-voices.ts` | Caracter de cada sonido (PLUCK, PAD, STAB, GLASS). |
| `src/core/voice-events.ts` | Eventos `on`/`off` comunes a los dos secuenciadores. |

### BASS contra SYNTH

| | BASS | SYNTH |
| --- | --- | --- |
| Voces | 1 (mono) | 4 (polifonico) |
| Osciladores por voz | 1 + sub | 2 desafinados (hasta +/-20 cents) |
| CUTOFF | 40 Hz a ~6,5 kHz | 90 Hz a ~12,5 kHz |
| Envolvente de filtro | hasta 4,5 octavas | hasta 3,5 octavas |
| Resonancia maxima | 3,9 (casi autooscila) | 3,4 (mas suave) |
| Amplitud | puerta abierta, ataque 2 ms | ATAQUE y RELEASE ajustables, decay y sustain del sonido |
| Rango de notas | C2 + 5 grados | C3 a dos octavas (10 notas) |

El SYNTH es mas brillante y abierto: filtro mas alto, menos barrido y
menos resonancia (hay un test que lo mide).

## Sonidos (presets)

Un sonido **no mueve las perillas**: fija lo que ellas no alcanzan
(envolvente de filtro, forma de la amplitud, drive, octava) y escala ATAQUE
y RELEASE. Las seis perillas siguen actuando encima.

| Sonido | Caracter |
| --- | --- |
| **PLUCK** | Corto y brillante: el filtro se cierra rapido, no sostiene. |
| **PAD** | Lento y ancho: ataque x12, release x3, sostiene al 85 %, el filtro casi no se mueve. |
| **STAB** | Golpes de acorde cortos y con mordida (mas drive). |
| **GLASS** | Una octava arriba, abierto y con cola. |

## Panel

```
[ SYNTH: ONDA CUTOFF RESO ATAQUE RELEASE DETUNE ] [ SONIDO: PLUCK PAD / STAB GLASS ]
[ ESCALA: - C +, - PENTA MENOR + ] [ MODO: ARPEGIO ACORDES / MELODIA AMBIENTE ] [ PATRON: DICE ] .. [ CAOS ]
```

- **Secuenciador:** 11 filas x 16 pasos. Las 10 de arriba son las notas de
  dos octavas de la escala, con nombre y octava (`Bb4` ... `C3`); la ultima es
  **DUR**.
- **Acordes:** tocar una nota la agrega al paso; tocarla de nuevo la saca.
  Hasta 3 notas por paso.
- **Duracion:** tocar DUR en un paso pasa por 1, 2, 4, 8 y 16 pasos. El
  numero queda escrito en la tecla; el LED se enciende si dura mas de un paso.
- **ONDA** pasa de sierra (0) a cuadrada (1) de forma continua.
- **DETUNE** separa los dos osciladores de cada voz (0 a 40 cents).
- **ATAQUE:** 2 ms a ~2 s. **RELEASE:** 10 ms a ~2,5 s. Ambos escalados por el
  sonido.
- **Display:** `SYNTH · PLUCK · C PENTA MENOR`.
- Sin la palabra "semilla" en la interfaz.

## Modos de DICE

| Modo | Que genera |
| --- | --- |
| **ARPEGIO** | Una nota por vez recorriendo un acorde (arriba, abajo o ida y vuelta), en semicorcheas o corcheas. |
| **ACORDES** | Acordes de 3 notas en un ritmo, siguiendo una progresion; inversiones de vez en cuando. |
| **MELODIA** | Una linea que se mueve casi siempre por grado conjunto, con silencios y notas largas. |
| **AMBIENTE** | Pocos acordes abiertos y largos (8 o 16 pasos). |

**CAOS** regenera con la misma semilla y agrega notas, saltos y silencios.

## Reloj, grafo y mezcla

- **Mismo reloj** que DRUM y BASS. Cada nota de un acorde es un evento
  propio con su id, asi cada una se suelta por su cuenta.
- **Polifonia:** si se superponen mas de 4 notas (por ejemplo, un acorde
  largo y notas nuevas), el motor roba la voz mas vieja; su envolvente arranca
  de donde estaba, sin chasquido.
- **Cable real al MASTER,** por su canal del mezclador (la perilla SYNTH del
  MASTER). Se corta y reconecta tocando el cable, en el proximo compas, como
  DRUM y BASS.
- **Cabezal y encendido del nodo:** el SYNTH se enciende solo cuando el motor
  toco una nota en ese paso.

### Niveles

Medido en Chromium con los valores por defecto (pico de la suma antes del
limitador del MASTER):

| Sonando | Pico de la suma | Reduccion del limitador |
| --- | --- | --- |
| DRUM | 0,68 | 0 dB |
| BASS | 0,31 | 0 dB |
| SYNTH | 0,25 | 0 dB |
| **DRUM + BASS + SYNTH** | **0,75 (-2,4 dBFS)** | **-0,4 dB como maximo** |

- El SYNTH salia unas 6 veces mas bajo que el BASS: se subio su etapa de
  salida y el nivel de su modulo (1,5). Queda parejo con el BASS.
- El limitador del MASTER no se toco: -3 dB de umbral, relacion 20:1, ataque
  de 2 ms, mas el recorte suave final que deja todo por debajo de 0,99.
- **Prueba:** `tests/e2e/audio.spec.ts`, "mezcla". Con los tres sonando, la
  suma no pasa de 0 dBFS y el limitador reduce menos de 3 dB. Con todas las
  perillas del MASTER al maximo, la salida tampoco pasa de 0 dBFS.

## Decisiones tomadas en lo ambiguo

- **Tonalidad compartida:** paso de `state.bass` a `state.key`. Los paneles de
  BASS y SYNTH muestran la misma seccion ESCALA; cambiarla en uno cambia los
  dos (en el proximo compas).
- **Rango:** dos octavas de la escala de 5 notas, desde C3 (una octava sobre
  el BASS). GLASS suena una octava mas arriba.
- **Cuarta nota en un paso lleno:** reemplaza a la nota mas cercana del
  acorde (mueve esa voz del acorde) en lugar de no hacer nada.
- **Duraciones:** 1, 2, 4, 8 y 16 pasos, ciclando con DUR. Las notas se
  sueltan al 90 % de su duracion, para que un acorde repetido se vuelva a
  atacar.
- **El SYNTH no tiene filas de acento ni de slide.** El motor los soporta (los
  usa el BASS), pero el pedido del panel no los incluia.
- **Perillas iniciales:** ONDA queda donde estaba en el prototipo (el test de
  arrastre de perillas la usa); las demas arrancan donde PLUCK suena bien
  (ataque rapido, release medio, algo de DETUNE).
- **Sonido inicial PLUCK; modo inicial ACORDES; el patron inicial son los
  pasos NOTA del prototipo** (1, 3, 6, 8, 11, 13 y 16) con dos acordes.
- **Elegir un modo** genera un patron de ese modo con la misma semilla (igual
  que en el BASS). **Elegir un sonido** no cambia el patron.
- **Nombre de la seccion:** SONIDO en vez de PRESET, por la regla de textos
  en espanol.
- **Nivel del modulo por encima de 1:** compensa que la perilla SYNTH del
  MASTER arranca mas baja que la de BASS (posiciones del prototipo, que el
  test de paridad compara).
- **Metronomo:** va directo a la salida (etapa anterior) y no entra en la
  suma medida. Con CLICK prendido, la salida puede sumarle hasta ~0,25 de pico.

## Pendiente o conocido

- **Telefono horizontal (844x390):** la grilla de 11 filas queda cortada, como
  las del DRUM y el BASS. Es el problema de alto ya anotado; queda para una
  etapa de diseno.
- Probado en Chromium (desarrollo y build de produccion). Safari y Firefox, no.
- Terminos nuevos en la interfaz: PLUCK, PAD, STAB, GLASS (nombres de los
  sonidos, como los pediste), DUR, DETUNE.

## Tests

- `tests/unit/voice.test.ts` (motor compartido): PolyBLEP; BASS y SYNTH son el
  mismo motor; voz 303 (silencio, limites, nota vieja que no corta a la nueva,
  acento, slide, legato, sin chasquidos); SYNTH: **polifonia** (4 voces, la
  quinta roba la mas vieja), acorde mas fuerte pero acotado con 4 voces al
  maximo, DETUNE, ATAQUE y RELEASE, mas brillante que el bajo, cada sonido
  distinto, apagar todo.
- `tests/unit/synth.test.ts`: **escalas** (dos octavas desde C3, toda nota en
  la escala, con cualquier tonica); grilla; **acordes** (agregar, sacar,
  maximo 3, la cuarta reemplaza a la mas cercana); **duracion** (DUR cicla,
  numero en la tecla, release al largo); generacion reproducible y caracter de
  cada modo; CAOS; secuencia de un acorde (notas juntas, ids propios); notas
  largas superpuestas; store (DICE siempre distinto, modo y CAOS con la misma
  semilla, el sonido no cambia el patron).
- `tests/unit/audio-link.test.ts`: el SYNTH toca en el reloj compartido, se
  enciende al sonar y se calla con el cable cortado; DRUM, BASS y SYNTH se
  encienden juntos en un paso comun.
- `tests/unit/state.test.ts`: BASS y SYNTH comparten la tonalidad.
- `tests/e2e/audio.spec.ts`: prueba de humo del SYNTH (suena, cabezal, nodo,
  cable cortado y reconectado; panel: sonidos, modos, DICE, acorde, DUR,
  filas con nombre y octava, tonalidad compartida con el BASS) y la prueba de
  **mezcla**.
- `tests/e2e/parity.spec.ts`: `panel-synth` sale de la comparacion (punto 7,
  con el motivo).
