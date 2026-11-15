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
(envolvente de filtro, forma de la amplitud, drive, octava), escala ATAQUE y
RELEASE, y corre ONDA, RESO y DETUNE desde donde esten las perillas. Las seis
perillas siguen actuando encima.

| Sonido | Caracter |
| --- | --- |
| **PLUCK** | Cuerda pulsada: arranca oscuro, el filtro se abre de golpe y se cierra rapido con algo de resonancia, el volumen se apaga aunque la nota siga (decay de 250 ms, sin sustain). Angosto (menos DETUNE), mas sierra, sin drive. |
| **PAD** | Lento y ancho: ataque x12, release x3, sostiene al 85 %, el filtro casi no se mueve. |
| **STAB** | Golpe de acorde "de metales": filtro abierto y quieto (casi sin barrido), onda hueca tirando a cuadrada, muy ancho (+DETUNE), con drive; volumen pleno mientras dura el paso y corte seco al final. |
| **GLASS** | Una octava arriba, abierto y con cola. |

PLUCK y STAB antes se parecian demasiado (los dos eran cortos con el filtro
barriendo). Ahora son opuestos en cada eje: barrido contra filtro quieto,
volumen que cae contra volumen sostenido, sierra contra cuadrada, angosto
contra ancho, limpio contra saturado. Un test lo mide.

## Panel

```
[ SONIDO ]  [ OSC ]       [ FILTRO ]      [ ENV ]          [ ESCALA ] [ MODO ]  [ PATRON ]  [ MACRO ]
 PLUCK  PAD  ONDA DETUNE   CUTOFF RESO     ATAQUE RELEASE   - C +      ARPEGIO   DICE        CAOS
   (O)       (perillas)                                       - ... +    ACORDES   BORRAR
 GLASS STAB                                                              MELODIA AMBIENTE

[ C3 ][ Eb3 ][ F3 ][ G3 ][ Bb3 ] [ C4 ][ Eb4 ][ F4 ][ G4 ][ Bb4 ]        <- TECLADO: 10 teclas
[ 1 ][ 2 ][ 3 ][ 4 ] ... [ 16 ]                                          <- 16 PASOS
LARGO [1][2][3][4]  [ PASO 3 ]                                  [ AUTO ]
```

El modelo de datos no cambio (hasta 3 notas por paso y un largo en pasos), asi que los
patches y los links viejos cargan igual. Cambio solo como se edita.

- **SONIDO:** una perilla grande de cuatro posiciones con PLUCK, PAD, STAB y GLASS
  alrededor (en el sentido del reloj, desde arriba a la izquierda). Se toca un nombre o
  la perilla, que pasa al siguiente (con el teclado, las flechas). La posicion elegida
  tiene el LED encendido y el puntero de la perilla apunta a ella.
- **Perillas:** OSC (ONDA, DETUNE), FILTRO (CUTOFF, RESO) y ENV (ATAQUE, RELEASE), cada
  una bajo su cabecera oscura. El display, al girarlas, sigue diciendo `SYNTH ONDA 108`.
- **TECLADO:** 10 teclas, una por nota de la escala en dos octavas, la mas grave a la
  izquierda, cada una con su nombre y octava (`C3 Eb3 F3 G3 Bb3 C4 Eb4 F4 G4 Bb4` en
  C penta menor). Un espacio separa las dos octavas. Los nombres siguen a la tonica y a la
  escala (compartidas con el BASS): al cambiarlas cambian las teclas; las notas ya
  cargadas se comportan como siempre (son grados de la escala).
- **16 PASOS:** botones numerados con LED, como los de DRUM. El LED se enciende si el
  paso tiene notas. **Tocar un paso lo elige** para editar: queda oscuro con el numero
  encendido en el color del SYNTH. El cabezal de reproduccion es el mismo contorno que
  en DRUM y no pisa la seleccion.
- **Notas de un paso:** con un paso elegido, sus notas se ven con la tecla encendida en el
  color del SYNTH. Tocar una tecla apagada la agrega; tocar una encendida la quita.
  **Maximo 3 notas**: la cuarta reemplaza a la **mas vieja** (la primera que se toco
  en ese paso). Como el patron guarda las notas ordenadas, no su orden, la antiguedad se
  recuerda solo mientras se edita (no se guarda); en un paso que se genero o se cargo, la
  mas vieja se toma como la mas grave.
- **Sin paso elegido,** la primera tecla que se toca elige el paso 1 y escribe ahi.
- **Audicion:** cada tecla suena con el sonido actual, este o no la reproduccion
  andando, y tambien al apagar una nota. Usa las mismas 4 voces, el mismo filtro y el
  mismo cable al MASTER que el patron (`VoiceTrack.preview`, sin otro camino de audio).
  Suena unos 0,5 s y no toca el patron ni el reloj. El
  nodo se enciende un instante, como al editar un paso.
- **AUTO** (apagado al arrancar): con AUTO prendido, despues de marcar una nota el paso
  elegido pasa al siguiente (del 16 vuelve al 1), para cargar una secuencia rapido. Para
  armar un acorde, apagarlo.
- **LARGO:** cuatro botones, 1, 2, 3 y 4 pasos, para el paso elegido; el valor actual queda
  encendido. Se muestra atenuado en un paso sin notas (y sin paso elegido, donde ademas
  no hace nada). A su lado, un display chico dice el paso elegido (`PASO 3`, o `SIN PASO`).
  Un patron de AMBIENTE puede traer largos de 8 y 16: no tienen boton, no se pierden, y el
  display los escribe (`PASO 1 · LARGO 8`).
- **ESCALA, MODO, DICE, BORRAR y CAOS** conservan su funcion.
- **BORRAR** (en PATRON, tambien en DRUM y BASS): deja todos los pasos en
  blanco. Es como una edicion a mano: suena desde el paso siguiente y no
  cambia la semilla, asi que DICE, un modo o CAOS lo vuelven a llenar. No se
  puede deshacer.
- **Barra espaciadora:** reproduce y detiene desde cualquier lugar, salvo
  mientras se escribe el tempo (y si el display del tempo tiene el foco, el
  espacio lo abre para escribir, como antes).
- El SYNTH no tiene slides, asi que no tiene tecla SLIDE ON/OFF.
- **ONDA** pasa de sierra (0) a cuadrada (1) de forma continua.
- **DETUNE** separa los dos osciladores de cada voz (0 a 40 cents).
- **ATAQUE:** 2 ms a ~2 s. **RELEASE:** 10 ms a ~2,5 s. Ambos escalados por el
  sonido.
- **Display:** `SYNTH · PLUCK · C PENTA MENOR`; al editar, `SYNTH PASO 3 Bb4` o
  `SYNTH PASO 3 LARGO 2`.
- Sin la palabra "semilla" en la interfaz.

### Alturas bajas

El teclado y los pasos entran completos, sin scroll, en las alturas de un telefono de costado:

- **Pantalla alta (1280x720):** todo el panel entra; el teclado se lleva el alto que sobra.
  A 1100 px de ancho o menos, el SYNTH junta un poco sus ocho grupos de perillas para que
  ninguno se aplaste.
- **Pantalla baja (menos de 600 px de alto):** las perillas pasan a la columna de la izquierda
  (con scroll propio, como en todos los nodos) y el teclado, los pasos, LARGO y AUTO ocupan la
  zona entera. Las teclas, LARGO y AUTO miden 44 px o mas, tambien a 740x360. Los 16 pasos
  siguen siendo la excepcion de `LAYOUT.md` (34 px de alto, unos 26 px de ancho).
- No se achico ninguna tecla: para ganar lugar se compactan las perillas (la perilla
  de SONIDO y los nombres, en vez de las teclas).

### Cambios en el codigo

| Archivo | Cambio |
| --- | --- |
| `src/core/synth-patterns.ts` | Sin grilla de 11 filas. `toggleSynthNote` (agregar, quitar, reemplazar a la mas vieja) y `setSynthLength`. `SYNTH_LENGTHS` suma el 3 (los patches viejos con 1, 2, 4, 8 y 16 siguen validos). |
| `src/ui/panel/mono-synth-notes.ts` | La zona: teclado, 16 pasos, LARGO y AUTO. El paso elegido y AUTO viven aca (son la mano sobre el panel, no estado del patron). |
| `src/ui/panel/mono-sound-dial.ts` | La perilla de SONIDO. |
| `src/state/store.ts` | `toggleSynthNote`, `setSynthLength` (reemplazan a `toggleSynthStep`) y la antiguedad de las notas por paso. |
| `src/state/cues.ts`, `audio-link.ts`, `audio/backend.ts` | El cue `synth-preview` y `AudioBackend.previewSynth`. |
| `src/audio/voice/voice-track.ts` | `preview`: una nota a mano en las voces del propio SYNTH. |
| `src/core/nodes.ts` | La zona del SYNTH es `notes` (no `sequencer`), con las secciones OSC, FILTRO y ENV. |

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
| Los tres, SYNTH en STAB (acordes) | 0,88 (-1,1 dBFS) | -1,4 dB |
| Los tres, SYNTH en PAD / GLASS | 0,71 / 0,75 | -0,03 / -0,37 dB |

- Cada sonido tiene un ajuste de nivel (`level`): STAB sale a la mitad
  porque sostiene acordes saturados todo el paso; sin el ajuste la suma
  llegaba a 1,06 (por encima de 0 dBFS). La prueba de mezcla tambien mide
  STAB.

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
- **Cuarta nota en un paso lleno:** reemplaza a la **mas vieja** del acorde (antes, a la
  mas cercana), en lugar de no hacer nada.
- **Duraciones:** 1, 2, 3 y 4 pasos desde LARGO; 8 y 16 siguen existiendo (los hace
  AMBIENTE y pueden venir en un patch), pero no tienen boton. Las notas se
  sueltan al 90 % de su duracion, para que un acorde repetido se vuelva a
  atacar.
- **El 3 es un largo nuevo:** el modelo de datos no cambio (el largo era y es un numero
  de pasos), pero la lectura de patches aceptaba solo 1, 2, 4, 8 y 16; ahora tambien 3.
  Un patch con largo 3 en una version vieja de la app lo leeria como 1.
- **El paso elegido no se guarda:** es la mano sobre el panel, como el pedazo elegido de
  SLICE. Al recargar o cargar un patch hay que elegir el paso otra vez.
- **AUTO da la vuelta:** del paso 16 pasa al 1.
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

- **Telefono horizontal (844x390 y 740x360):** el teclado, los pasos y LARGO entran sin scroll
  (ya no hay grilla de 11 filas); la columna de perillas scrollea por su cuenta, como en
  todos los nodos.
- Probado en Chromium (desarrollo y build de produccion). Safari y Firefox, no.
- Terminos nuevos en la interfaz: PLUCK, PAD, STAB, GLASS (nombres de los
  sonidos, como los pediste), DETUNE.

## Tests

- `tests/unit/voice.test.ts` (motor compartido): PolyBLEP; BASS y SYNTH son el
  mismo motor; voz 303 (silencio, limites, nota vieja que no corta a la nueva,
  acento, slide, legato, sin chasquidos); SYNTH: **polifonia** (4 voces, la
  quinta roba la mas vieja), acorde mas fuerte pero acotado con 4 voces al
  maximo, DETUNE, ATAQUE y RELEASE, mas brillante que el bajo, cada sonido
  distinto, apagar todo.
- `tests/unit/synth.test.ts`: **escalas** (dos octavas desde C3, toda nota en
  la escala, con cualquier tonica); **acordes** (agregar, sacar, maximo 3, la
  cuarta reemplaza a la mas vieja, orden que se pierde en pasos generados o
  cargados, pasos malos que no cambian nada); **LARGO** (1 a 4, 8 y 16 siguen
  validos, el resto no); el store (editar a mano mantiene la generacion, BORRAR y
  DICE olvidan el orden, un patch con acorde y largo 3 vuelve igual); release al largo; generacion reproducible y caracter de
  cada modo; CAOS; secuencia de un acorde (notas juntas, ids propios); notas
  largas superpuestas; store (DICE siempre distinto, modo y CAOS con la misma
  semilla, el sonido no cambia el patron).
- `tests/unit/audio-link.test.ts`: el SYNTH toca en el reloj compartido, se
  enciende al sonar y se calla con el cable cortado; DRUM, BASS y SYNTH se
  encienden juntos en un paso comun; las teclas llegan al backend con la
  reproduccion parada y sin tocar el patron.
- `tests/unit/patch.test.ts`: los largos 1, 2, 3, 4, 8 y 16 se leen; 5 y 7 no existen.
- `tests/unit/state.test.ts`: BASS y SYNTH comparten la tonalidad.
- `tests/e2e/audio.spec.ts`: prueba de humo del SYNTH (suena, cabezal, nodo,
  cable cortado y reconectado); panel (cabeceras, perilla de SONIDO, modos, DICE,
  teclas con nombre y octava, tonalidad compartida con el BASS); **teclado** (paso 3,
  tres teclas = un acorde, la cuarta reemplaza a la mas vieja, una encendida se
  quita, el patron guardado coincide con lo que se ve, el cabezal no pisa la
  seleccion); primera tecla sin paso elegido y AUTO; LARGO; **audicion** con la
  reproduccion parada; y la prueba de **mezcla**.
- `tests/e2e/patches.spec.ts`: SAVE, recargar, LOAD y las teclas del paso 3 vuelven a
  verse encendidas, con su largo.
- `tests/e2e/short-screen.spec.ts`: a 844x390 y 740x360 el teclado, los pasos, LARGO y
  AUTO se ven completos sin scroll, con teclas de 44 px.
- `tests/e2e/parity.spec.ts`: `panel-synth` sale de la comparacion (punto 7,
  con el motivo). Su imagen de referencia no se toco.
