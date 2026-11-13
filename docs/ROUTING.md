# Ruteo entre nodos (etapa 6)

Cada cable va de la **salida** de un nodo a la **entrada** de otro. Un nodo puede
mandar a varias entradas a la vez (envíos en paralelo) y una entrada oye la suma de
sus cables.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `src/core/routing.ts` | Núcleo puro: qué puede conectarse con qué, bucles, inserción de efectos, qué pasa al sacar un nodo, qué llega al MASTER. |
| `src/state/store.ts` | `connect(from, to)`, `toggleCable(from, to)`, y los cables que trae o se lleva un nodo. |
| `src/state/types.ts` | `cables: Cable[]` en el estado: `{ from, to, cut }`, datos planos. |
| `src/ui/stage/mono-stage.ts`, `node-view.ts` | Puertos, cable en el aire, entradas válidas encendidas, avisos al display. |
| `src/audio/graph.ts` | Cada cable es una conexión real con su propia ganancia y fundido. |
| `src/audio/web-audio-backend.ts` | Lleva el grafo a lo que dice la escena; libera lo que deja de oírse. |
| `src/audio/strip.ts` | El nivel de cada instrumento, a su salida. |
| `src/audio/modulation.ts` | Cómo cae el cable del LFO en cada módulo. |

## Modelo

- El estado de los cables vive en `src/state` como una lista de
  `{ from, to, cut }`: **serializable** tal cual (hay un test de ida y vuelta por JSON),
  listo para guardar y compartir.
- Papeles (`NODE_ROLES`): **generadores** (SYNTH, DRUM, BASS, DRONE, LEAD: salida, sin
  entrada), **efecto** (DISTORSIÓN: entrada y salida), **modulador** (LFO: salida de
  modulación, sin entrada) y **MASTER** (entrada, sin salida: va a los parlantes).
- Dos clases de cable: de **sonido** (a un efecto o al MASTER) y de **modulación**
  (del LFO a cualquier nodo que suena, nunca al MASTER ni a sí mismo).

## Interacción

- Cada nodo, salvo el MASTER, tiene un **puerto de salida**: un círculo chico en el
  borde derecho. Arrastrarlo saca un cable del color del nodo de origen.
- Mientras se arrastra, los nodos donde puede caer **encienden su puerto de entrada**
  (borde izquierdo) con el color del cable, y su aro de selección. Los que no pueden
  recibirlo (un generador, un bucle, el MASTER para el LFO) no se encienden.
- Se suelta sobre el cuerpo del nodo (no hace falta apuntar al puerto chico).
- Arrastrar el **cuerpo** del nodo lo sigue moviendo, con sus cables.
- Tocar el puerto sin arrastrar selecciona el nodo.
- **Tocar un cable lo corta** (queda tenue) y tocarlo de nuevo lo reconecta, como antes.
- El display del panel dice qué pasó: «BASS → DISTORSIÓN», «LFO → BASS CUTOFF», o el
  motivo de un rechazo: «Esa conexión crearía un bucle», «DRUM no tiene entrada»,
  «El LFO no modula el MASTER».

## Reglas

1. **Inserción**: conectar un generador a un efecto **elimina su cable directo al
   MASTER**. Conectarlo de nuevo al MASTER agrega un envío en paralelo (el efecto sigue).
2. **Bucles**: se rechaza cualquier cable de sonido que haría volver el sonido a su
   origen. La búsqueda sigue también los cables cortados, para que reconectar uno con un
   toque nunca cierre un bucle. Hoy hay un solo efecto, así que el único bucle posible
   es la DISTORSIÓN en sí misma; la búsqueda es general (lista para más efectos).
3. **Un nodo con entrada sin cables no suena**: la DISTORSIÓN sin nada enchufado está en
   silencio (y apagada en el lienzo).
4. **Nodos nuevos**: cada generador y la DISTORSIÓN llegan enchufados al MASTER. El LFO
   llega **sin cables** (no puede ir al MASTER) y espera a que lo conecten.
5. **Sacar un nodo** se lleva todos sus cables y libera sus voces.
   *Decisión:* si un generador solo alimentaba a ese nodo (por ejemplo BASS insertado en
   la DISTORSIÓN), **vuelve directo al MASTER**, como quien saca un pedal de la cadena.
   Si no, sacar la DISTORSIÓN dejaría mudo al BASS sin aviso.
6. *Decisión:* un cable que ya existe no cambia nada; arrastrar sobre un par que tiene
   un cable cortado lo vuelve a enchufar.

## Color y dibujo

- El cable toma el **color del nodo de origen**. *Decisión:* en reposo es tenue (30 % del
  color sobre el gris de antes) y se enciende con brillo cuando su origen suena, para no
  romper el lienzo monocromo («nodos grises, se encienden con su color al sonar»).
- Los cables de **sonido** son líneas llenas; los de **modulación**, **punteados**. Un
  cable cortado queda tenue (el de sonido, además, con trazos finos).
- La DISTORSIÓN se enciende mientras algo encendido le entra (y con ella su cable al
  MASTER). El LFO brilla con su propia onda mientras modula algo, y sus cables con él.
- Los cables siguen yendo de centro a centro, por debajo de los nodos (como en el
  prototipo); el puerto es solo la manija para sacarlos.

## Audio

- Cada cable es una conexión real del grafo con su propia ganancia: **fundido de 20 ms**
  al conectar y al cortar (`CABLE_FADE`), así nunca hay chasquidos.
  Se corrigió un detalle: cortar un cable en medio de su fundido de entrada saltaba al
  valor alcanzado (la rampa se cancelaba desde su comienzo); ahora se redibuja la rampa
  hasta ese punto y de ahí baja.
- **Próximo compás**: hacer o cortar cables (de sonido y de modulación) entra en el
  próximo compás, como agregar o sacar nodos. *Decisión (desde la etapa 5):* los cables
  que salen de LEAD y DRONE se aplican en el acto, porque se tocan a mano.
- **Niveles**: las perillas de nivel del MASTER (SYNTH, DRUM, BASS, DRONE, LEAD) se
  aplican **a la salida de cada nodo, antes de sus cables**, así valen igual hacia el
  MASTER y hacia la DISTORSIÓN. La DISTORSIÓN usa su propia perilla SALIDA. Los canales
  del MASTER quedan en unidad.
- **Nada queda colgado**: cuando un instrumento deja de llegar al MASTER (su cable
  cortado, la salida de la DISTORSIÓN cortada o la DISTORSIÓN quitada), suelta lo que
  tocaba: BASS y SYNTH descartan las notas programadas; LEAD y DRONE se callan en el acto
  (como al cortar su cable en la etapa 5). LEAD y DRONE en el estado (`live.ts`) miran lo
  mismo: si su sonido ya no llega al MASTER, se sueltan las notas y capas.
- El reloj solo programa notas de un nodo secuenciado si su sonido llega al MASTER.
- El cable del LFO llega a `inputFor('lfo')` de cada módulo: el parámetro que mueve, no
  su entrada de sonido. Ver docs/LFO.md.

## Pendiente

- En el teléfono apaisado el lienzo es chico: el puerto tiene 20 unidades de radio de
  toque (unos 10 px) y conviene soltar el cable bien sobre el nodo.
- Solo hay un efecto; con más efectos la búsqueda de bucles ya sirve, pero la regla de
  inserción (un generador entra en un efecto) habría que pensarla para cadenas de
  efectos.
