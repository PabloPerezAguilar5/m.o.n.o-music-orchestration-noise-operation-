# BASS: modo SLICE (etapa 7)

El BASS tiene dos voces: **SYNTH**, la voz 303 de la etapa 3, y **SLICE**, que
corta un compas de un loop de `public/samples/bass` en 16 pedazos iguales y los
dispara con un secuenciador de 16 pasos. Las dos salen por el mismo nodo: mismo
cable al MASTER, mismo nivel BASS en el MASTER, mismo ruteo a la DISTORSION, y el
LFO modula el filtro de la voz que suena.

## Modulos

| Archivo | Que hace |
| --- | --- |
| `src/core/slice.ts` | Nucleo puro: manifiesto de loops, puntos de corte (por bpm y compases), velocidad con SYNC y PITCH, patron de pedazos, generacion con semilla (4 modos del DICE + CAOS) y `SliceSequencer` (pasos -> pedazos, con AUTO). |
| `src/state/types.ts`, `initial.ts`, `store.ts` | `bass.voice` (SYNTH o SLICE) y `bass.slice` (categoria, loop, compas, SYNC, REVERSE, modo, semilla, patron). Las perillas van en `params.bass` como `sliceVolume`, `sliceFilter`, `sliceDrive`, `slicePitch`, `sliceGate`. Todo es serializable (test de ida y vuelta por JSON). |
| `src/state/scene.ts` | Lleva la voz, el patron, las perillas y el loop resuelto contra el manifiesto a la escena de audio. |
| `src/audio/bass/slice-library.ts` | Carga perezosa: manifiesto de loops y decodificacion de un loop por vez, con cache de los ultimos 4 usados. |
| `src/audio/bass/slice-module.ts` | Reproduccion de pedazos: `AudioBufferSourceNode` por pedazo con microfundidos, pasabajos resonante, drive (tanh) y volumen. El LFO entra al `detune` del filtro. |
| `src/audio/bass/bass-module.ts` | El nodo BASS en el grafo: la voz 303 y el SLICE sumados en una salida; una entrada de modulacion para las dos. |
| `src/audio/bass/bass-track.ts` | `BassTrack`: que voz suena, que espera al compas, previas de loop y de pedazo. La 303 sigue siendo una `VoiceTrack`. |
| `src/audio/bass/waveform.ts` | Picos del loop para la tira de onda (512 columnas por compas). |
| `src/state/slice-monitor.ts` | Guarda la forma de cada loop decodificado para dibujarla (no es estado). |
| `src/ui/panel/mono-slicer.ts` | La zona SLICE: categorias, lista de loops, BAR 1-4 y AUTO, SYNC, REVERSE, tira de onda con los 16 pedazos y la fila de 16 pasos. |
| `src/ui/panel/mono-panel.ts` | Seccion VOZ (SYNTH / SLICE), perillas y secciones segun la voz, display, lecturas. |

## Panel

```
SYNTH: [ BASS: CUTOFF RESO DECAY DRIVE ] [ VOZ: SYNTH/SLICE ] [ OSC ] [ ESCALA ] [ MODO: PULSE … ] [ PATRON: DICE SLIDE BORRAR ] [ MACRO ]
SLICE: [ BASS: VOLUMEN FILTRO DRIVE PITCH GATE ] [ VOZ: SYNTH/SLICE ] [ MODO: ORIGINAL SHUFFLE STUTTER CHAOS ] [ PATRON: DICE BORRAR ] [ MACRO ]
```

Zona SLICE (debajo de las perillas):

- **Izquierda:** cinco teclas de categoria con LED (LINE, LINE FX, ARP, SWEEP,
  SWEEP FX) y debajo una lista con scroll de los loops de esa categoria. Cada
  entrada dice variante y tonica (`A · C`, `DRY · F`). La elegida queda resaltada;
  tocar una la elige (entra en el proximo compas) y suena una preescucha: su
  primer tiempo (4 pedazos) con las perillas actuales.
- **Derecha, arriba:** `BAR 1 2 3 4 AUTO` (las de compases que el loop no tiene,
  apagadas; en loops de 1 compas tambien AUTO), `SYNC` y `REVERSE`.
- **Tira de onda:** el compas elegido (con AUTO, el que esta sonando) con los 16
  pedazos marcados. El pedazo que suena se ilumina con el color del nodo; el
  elegido lleva un marco. Tocar un pedazo lo elige y lo hace sonar.
- **Fila de 16 pasos:** cada tecla tiene su LED (ON/OFF) y el numero del pedazo
  que toca; una `r` al lado marca un pedazo que va al reves. Tocar un paso le
  asigna el pedazo elegido; tocarlo de nuevo con el mismo pedazo lo apaga. El
  paso que toca el pedazo elegido se subraya.
- **Display:** `BASS · SLICE · ARP B · E`. Mientras decodifica: `BASS · CARGANDO
  b-128-e.wav`. Si falla: `BASS · ERROR b-128-e.wav`. Si falta el manifiesto:
  `BASS · FALTA manifest.json`. PITCH se lee en semitonos (`BASS PITCH +3`).
- La zona hace scroll interno cuando el panel es bajo (telefono apaisado): la
  lista y la tira de onda tienen altos minimos y el resto se desplaza.

## Corte y sonido

- Un compas se corta en 16 pedazos iguales a partir de `bpm` y `bars` del
  manifiesto: a 128 BPM un compas dura 1,875 s y un pedazo 117,1875 ms. La
  duracion del archivo no se usa.
- **Patron por defecto:** el paso N toca el pedazo N, todo encendido, sin reves.
  Con SYNC y el master a 128 BPM cada pedazo arranca donde arranca su paso y dura
  exactamente un paso a velocidad 1: el loop suena como el archivo (test en
  `slice.test.ts` y `bass-track.test.ts`). Lo unico que se agrega son los
  microfundidos.
- **Microfundidos** de 3 ms al inicio y al final de cada pedazo (minimo un tercio
  del largo si es mas corto). Si un paso arranca mientras otro pedazo suena, el
  anterior se libera con el mismo fundido en ese instante. Un pedazo que todavia
  esta en su ataque o ya en su caida se deja terminar solo (cortar una rampa en
  curso haria chasquido).
- **SYNC:** velocidad = BPM del master / BPM del loop (el tono acompana, como un
  vinilo). Apagado, velocidad 1. **PITCH** suma +/-12 semitonos enteros encima.
- **GATE:** fraccion del pedazo que suena, de 10 % a 100 % (por defecto 100 %).
- **FILTRO:** pasabajos de 40 Hz a ~16 kHz; abierto del todo (por defecto) con Q
  0,7, y mas resonante a medida que cierra (Q hasta ~6,7). El LFO lo mueve en
  cents (el mismo alcance que CUTOFF en la 303).
- **DRIVE:** ganancia hacia una curva tanh con compensacion para que la escala
  completa siga en 1. En 0 es casi lineal.
- **VOLUMEN:** ganancia con curva (knob^1.5), 0,8 por defecto. La salida del
  SLICE lleva 0,7 de margen porque los samples pican a -1 dBFS.
- **REVERSE:** cada pedazo se lee de una copia invertida del buffer (calculada
  una vez por loop), asi el pedazo suena al reves sin cambiar sus limites.

## Que entra al instante y que en el proximo compas

| Al instante | En el proximo compas |
| --- | --- |
| Perillas (VOLUMEN, FILTRO, DRIVE, PITCH, GATE) | Cambiar de voz (SYNTH <-> SLICE) |
| SYNC, REVERSE | Loop nuevo (cuando termino de decodificar; hasta entonces sigue el anterior) |
| Asignar o apagar pasos a mano | BAR (y pasar a AUTO) |
| Elegir categoria (solo cambia la lista) | DICE, modo del DICE, CAOS |

Al cambiar de voz en el compas, la que se va suelta lo que tocaba: la 303
descarta sus notas y el SLICE libera sus pedazos con fundido. Lo mismo al
detener, al cortar el cable o al quitar el nodo. El contador de AUTO vuelve al
compas 1 al cambiar de voz, de loop o de BAR.

## DICE

Cuatro modos, siempre reproducibles por (modo, semilla, CAOS), y nunca el loop
original sin tocar (ese es el patron por defecto). La tecla DICE prueba semillas
hasta que el patron difiera del actual.

- **ORIGINAL:** el orden del loop con pocos cambios (repetir el pedazo anterior,
  saltar, invertir, y con mas CAOS saltos a otro pedazo). Garantiza al menos uno.
- **SHUFFLE:** permutacion de los 16 pedazos; con CAOS apaga y da vuelta algunos.
- **STUTTER:** pedazos repetidos 2 a 4 veces; con CAOS, repeticiones de pedazos
  de otro lugar y algunos al reves.
- **CHAOS:** cualquier pedazo en cualquier paso, con saltos y reveses.

**CAOS** (la macro del nodo) regenera el patron de la voz que suena con la misma
semilla, como en DRUM y SYNTH: en SLICE sube la probabilidad de repetir, saltar
e invertir pedazos. En SYNTH sigue regenerando la linea 303 y no toca los pedazos.

## Carga

- Nada se decodifica hasta entrar a SLICE (o tocar un loop en la lista). Solo se
  pide el loop elegido; un loop pedido dos veces mientras carga comparte la
  carga.
- Cache de los ultimos 4 loops usados (unos 10 MiB como maximo, los de 4
  compases pesan 2,6 MiB decodificados); el mas viejo se descarta.
- Un loop que falla queda marcado `ERROR` y no se reintenta solo (igual que un kit
  de DRUM); el resto de la app sigue. Elegir otro loop funciona. El manifiesto que
  falla se reintenta en la proxima llamada.
- `AudioStatus` lleva `loops` (el manifiesto) y `loopStates` (cargando / listo /
  fallo, por loop). El panel lee de ahi.

## Decisiones tomadas en lo ambiguo

- **Nombre del selector:** la seccion se llama **VOZ** (SYNTH / SLICE), no MODO,
  porque el BASS ya tiene una seccion MODO (los estilos PULSE, BROKEN, …) y el
  SYNTH otra igual. En SLICE, MODO son los cuatro estilos del DICE.
- **CAOS regenera el patron** (con la misma semilla) en lugar de meter azar en
  vivo: asi el patron por defecto suena identico al archivo aunque CAOS no este
  en 0, y lo que se guarda es lo que suena.
- **REVERSE** invierte la lectura de cada pedazo (no el orden del patron). Un
  pedazo marcado al reves por el DICE y REVERSE encendido suenan al derecho (se
  combinan con XOR).
- **Preescucha de loop:** el primer tiempo (4 pedazos) del loop, con SYNC, PITCH y
  las perillas actuales, sin reves. Si todavia no esta decodificado, suena cuando
  llega.
- **Loop inicial:** `line/a-128-c.wav` (variante A, tonica C, como la tonica
  inicial de la app). SYNC encendido de entrada. Cambiar la tonica de ESCALA no
  cambia el loop: los loops tienen su tonica fija y se eligen a mano.
- **BAR cambia en el proximo compas**, como el kit del DRUM, para no partir el
  compas que esta sonando. En loops de 1 compas BAR queda en 1 y AUTO apagado.
- **La voz que no suena recibe igual las escenas** (perillas, patron), asi al
  volver a ella arranca con lo ultimo. Solo una se programa en el reloj.
- **Sin AudioWorklet** (la voz 303 no carga), el nodo BASS entra igual al grafo:
  SLICE no necesita el worklet y suena; la 303 queda en silencio como antes.
- **El pedazo elegido** para asignar no es estado (vive en el panel): es una mano
  sobre el panel, no algo para guardar.
- **`transport.sliceBar`** lleva el compas del loop que esta sonando (para
  dibujar la onda con AUTO), como `transport.step` lleva el paso.
- **El estado guarda solo `{ set, file }` del loop**; bpm, compases, variante y
  tonica salen del manifiesto al tocar y al mostrar.
- `MOD_TARGETS.bass` ahora lista `cutoff` y `sliceFilter`: el anillo del LFO se
  dibuja en la perilla visible de la voz activa.

## Pendiente o conocido

- La preescucha de un pedazo o de un loop solo suena si el nodo BASS ya esta en
  el grafo (siempre, cuando se ve su panel) y si el loop esta decodificado.
- Las perillas de SLICE no tienen todavia un ajuste fino por oido (niveles de
  VOLUMEN, cuanto satura DRIVE al maximo). Estan en valores razonables.
- Probado en Chromium (desarrollo y build). Safari y Firefox, no.
- `docs/LAYOUT.md` no existe; la regla aplicada fue la del enunciado: la zona
  SLICE se ve completa o hace scroll interno.

## Tests

- `tests/unit/slice.test.ts`: puntos de corte de loops de 1 y 4 compases a 128
  BPM; patron por defecto igual al original (paso a paso, con SYNC); velocidad con
  SYNC, PITCH y GATE; edicion; los cuatro modos del DICE (reproducibles, nunca el
  original, caracter de cada uno, efecto de CAOS); BAR y AUTO en el secuenciador;
  lectura del manifiesto real.
- `tests/unit/slice-library.test.ts`: carga perezosa, una decodificacion por
  loop, cargas simultaneas compartidas, cache con desalojo del mas viejo, fallos
  que rechazan y se reintentan, pagina HTML en lugar del archivo.
- `tests/unit/bass-track.test.ts`: la 303 suena en SYNTH; el cambio de voz espera
  al compas y suelta la voz que se va (sin voces colgadas), ida y vuelta; el
  patron por defecto con SYNC a 128 BPM reproduce el archivo pedazo a pedazo;
  SYNC, PITCH, GATE y REVERSE al instante; loop sin decodificar (se pide, no
  suena, entra en el compas cuando llega); BAR y AUTO; flush; preescuchas.
- `tests/unit/slice-state.test.ts`: estado inicial, patrones independientes por
  voz, categoria y loop, BAR, SYNC, REVERSE, edicion a mano, DICE siempre distinto,
  modo y CAOS con la misma semilla (y solo en la voz activa), BORRAR, escena, ida y
  vuelta por JSON.
- `tests/unit/audio-link.test.ts`: SLICE toca sus pedazos en el reloj compartido,
  enciende el nodo y reporta el compas de AUTO; las preescuchas llegan al backend.
- `tests/e2e/audio.spec.ts` (`BASS SLICE`): entrar a SLICE, lista y categorias,
  elegir un loop, audio por el MASTER, nodo encendido, BAR/AUTO, asignar pedazos,
  DICE y modos, REVERSE, SYNC, volver a SYNTH; un loop que falla avisa en el
  display y el resto sigue.
- `tests/e2e/parity.spec.ts`: sin cambios. `panel-bass` ya estaba excluido (punto
  6); la seccion VOZ nueva cae ahi. En modo SYNTH nada mas se movio.
