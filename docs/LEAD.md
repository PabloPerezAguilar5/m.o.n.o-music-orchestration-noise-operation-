# LEAD (etapa 5)

Instrumento para tocar en vivo, color celeste. Es la voz del SYNTH en modo
**monofonico**, con portamento ajustable (GLIDE), un teclado de dos octavas
con multitoque y SCALE LOCK sobre la tonalidad compartida.

## Archivos

| Archivo | Que hace |
| --- | --- |
| `src/core/lead.ts` | Nucleo puro: que nota toca cada tecla (octava, SCALE LOCK), los dedos apoyados (`LeadNotes`), las perillas (`leadAttackTime`, `leadReleaseTime`, `leadGlideTime`) y CAOS (`leadVariation`). |
| `src/core/live-events.ts` | Eventos en vivo (`LiveEvent`): notas del LEAD y capas del DRONE. |
| `src/state/live.ts` | `Live`: recibe los dedos del panel, arma las notas con los ajustes del store y las pasa al audio. Suelta todo al cortar el cable, sacar el nodo o parar. Enciende el nodo mientras suena. |
| `src/audio/lead/lead-voice.ts` | Diseno de la voz y como las perillas se vuelven parametros del motor. |
| `src/audio/lead/lead-track.ts` | El modulo en el grafo; toca cada evento apenas llega. |
| `src/ui/panel/mono-keys.ts` | El teclado: un dedo por puntero, deslizar entre teclas, teclas encendidas mientras se tocan. |

## Voz

El motor de voz compartido (`src/audio/voice/`) con **una voz**:

- dos osciladores a pocos cents (cuerpo, no coro), morph sierra a cuadrada (ONDA);
- filtro escalera de 110 Hz a ~14 kHz (CUTOFF, RESO) con un barrido corto de la
  envolvente en cada nota;
- amplitud con ATAQUE (2 ms a ~2 s), sustain al 80 % y RELEASE (10 ms a ~2,5 s).

Lo que se agrego al motor (sirve a cualquier instrumento mono):

- **GLIDE (`EngineParams.glide`)**: constante de tiempo del portamento. En 0 se usa
  el slide del diseno (BASS: 25 ms; LEAD: 4 ms, casi instantaneo) y solo se
  deslizan las notas ligadas. Arriba de 0, **toda** nota nueva se desliza desde la
  anterior, aunque se redispare la envolvente (como el portamento de un mono
  clasico). Rango: 8 ms a ~1 s; el primer 2 % de la perilla es "apagado".
- **Liberacion dura (`allOff(true)`)**: la amplitud cae en ~3 ms sin importar el
  RELEASE. Se usa al cortar el cable (ver Liberacion).

## Teclado

- **Dos octavas desde DO**, mas el DO de arriba: 15 teclas blancas y 10 negras
  (25 notas). *Decision:* "2 octavas que empieza en DO" se tomo como un teclado
  de 25 notas, el formato clasico (C a C). En OCT 0 va de **C4 a C6**.
- **OCT − y +**: de C1-C3 a C6-C8. Las teclas C muestran su octava (C4, C5, C6).
  Las teclas OCT se apagan en los topes.
- **Multitoque en una voz mono**: cada dedo apoyado se recuerda; suena el ultimo.
  Apretar otra tecla con un dedo abajo cambia la nota **sin redisparar** (legato,
  con GLIDE si esta arriba). Levantar el dedo que suena vuelve a la nota del dedo
  anterior que siga apoyado; levantar el ultimo suelta la nota. Cada nota tiene su
  id, asi un note-off nunca corta una nota mas nueva.
- **Deslizar**: un dedo que se arrastra a otra tecla cambia la nota en legato
  (glissando con GLIDE). Fuera del teclado la nota se queda.
- Las teclas quedan encendidas **mientras se tocan** (antes era un destello de
  220 ms).
- Se puede tocar con el transporte detenido: es en vivo.

## SCALE LOCK

Lleva cada tecla a la **nota mas cercana** de la tonica y escala compartidas
con BASS y SYNTH (seccion ESCALA, la misma en los tres paneles).

- *Decision:* a mitad de camino entre dos notas de la escala, gana la de
  **abajo** (en C penta menor, E va a Eb y B va a Bb).
- Con SCALE LOCK prendido, las teclas fuera de la escala se ven **atenuadas**
  (siguen sonando: tocan la nota cercana). El display muestra la escala.

## CAOS

*Decision:* en un instrumento que se toca en vivo, CAOS cambia cada nota al
tocarla, nunca lo que ya suena:

- **acento** (mas filtro y volumen) con probabilidad hasta 1 de cada 2;
- **salto de octava** (arriba o abajo), solo por encima de la mitad de la
  perilla, hasta 1 de cada 5;
- **desafinacion** de hasta un tercio de semitono, solo sin SCALE LOCK (con
  SCALE LOCK, CAOS nunca saca la nota de la escala).

CAOS arranca en **0** en el LEAD (en los demas nodos arranca en 20 %): el
teclado toca exactamente lo que se aprieta hasta que se sube.

## Perillas

ONDA, CUTOFF, RESO, ATAQUE, RELEASE y **GLIDE** (reemplaza a DETUNE del
prototipo: el ancho lo da el par de osciladores fijo). Mas CAOS.

## Liberacion (nada queda colgado)

| Que pasa | Que hace el LEAD |
| --- | --- |
| Se suelta la ultima tecla | La nota cae con su RELEASE; el nodo queda encendido lo que dura la cola. |
| Se para el transporte | Todas las notas caen con su RELEASE. |
| Se corta el cable | Silencio en el acto (liberacion dura, ~3 ms). Al reconectar no vuelve nada. |
| Se saca el nodo | Silencio en el acto; el modulo se libera. |
| Se cambia de panel con un dedo apoyado | El dedo se suelta. |

Los dedos que siguen apoyados despues de un corte no vuelven a sonar al
levantarse ni al deslizarse: hay que tocar de nuevo.

### Por que el cable cortado no deja colas

Chrome deja de procesar los nodos que no llegan a la salida. Sin cuidado, un
instrumento con el cable cortado quedaba **congelado a mitad del release** y al
reconectar tocaba el resto. Ahora cada modulo del grafo tambien alimenta una via
**muda** (ganancia 0) hacia la salida (`AudioGraph`, `keepAlive`): sigue
procesando sin oirse y sus colas se apagan solas. Aplica a todos los nodos.

## Encendido en el lienzo

El nodo se enciende **solo mientras suena**: con una tecla apretada y el cable
conectado. Al soltar queda encendido lo que dura la cola del RELEASE (entre 80 ms
y 3 s). Con el cable cortado no se enciende.

## Reloj y cambios estructurales

*Decision:* LEAD (y DRONE) **entran, salen y cortan su cable en el acto**, no en
el proximo compas como los nodos secuenciados. Se tocan a mano y no tienen
compas con el que alinearse; esperar dejaba el teclado mudo hasta 2 s despues de
agregar el nodo. Las notas se tocan en `currentTime` (sin lookahead): latencia
minima.

## MASTER

El MASTER suma una perilla **LEAD** (nivel del canal, unidad a la mitad, igual
que los demas) entre DRONE y ESPACIO. Arranca en 0,5. En la prueba de paridad esa
perilla se oculta (nota 9).

## Niveles medidos (Chromium, valores por defecto)

| Fuente | RMS en el master |
| --- | --- |
| DRUM | 0,22 |
| BASS | 0,19 |
| LEAD, una tecla | 0,15 |
| SYNTH | 0,10 |

## Pendiente

- En el telefono apaisado (844 x 390) el teclado queda bajo (~35 px), como
  las grillas de los otros paneles.
- Sin probar en Safari ni Firefox (multitoque real, captura de punteros).
