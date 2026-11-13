# DRONE/NOISE (etapa 5)

Texturas en vivo, color naranja. Parte de `reference/fck-synth/src/synthPad.ts`:
un pad X/Y donde cada toque es una **capa**, hasta seis a la vez, con bus de
efectos propio (delay y reverb). Web Audio nativo; la estructura queda lista
para pasar a AudioWorklet.

## Archivos

| Archivo | Que hace |
| --- | --- |
| `src/core/drone.ts` | Nucleo puro: presets y modos, la nota de cada posicion (`droneMidi`), las capas (`DroneLayers`: hasta 6, TOUCH y HOLD). |
| `src/core/drone-sound.ts` | Nucleo puro: el caracter de cada preset y `droneLayerSound`, que pasa preset, perillas y posicion a numeros (frecuencia, cutoff, LFO, deriva, ataque, release, nivel). |
| `src/state/live.ts` | `Live`: dedos del pad a capas; STOP, CLEAR; suelta todo al cortar, sacar o parar; enciende el nodo. |
| `src/audio/drone/drone-module.ts` | El nodo en el grafo. Interfaz `DroneEngine`: lo que una version en worklet tendria que implementar. |
| `src/audio/drone/drone-voice.ts` | Una capa: fuentes, filtro, envolvente, LFO, deriva y envios. |
| `src/audio/drone/drone-fx.ts` | El bus de efectos del nodo: seco, delay y reverb. |
| `src/ui/panel/mono-xy-pad.ts` | El pad: un dedo por puntero, un punto por capa con su nota. |

## Pad

- **Eje X: la nota**, cuantizada a la tonica y escala compartidas con BASS,
  SYNTH y LEAD (seccion ESCALA en el panel). 16 posiciones: tres octavas de la
  escala mas la tonica de arriba, **desde C2, subiendo de izquierda a derecha**.
  *Decision:* en fck-synth cada octava iba hacia abajo (`4 - index % 5`); en un pad
  eso se lee al reves, asi que aca todo sube.
- **Eje Y: filtro y movimiento.** Hacia arriba se abre el filtro (como en
  fck-synth: brillo segun la altura y la perilla FILTRO) y crece el movimiento: un
  LFO por capa que acelera (0,08 a ~6 Hz) y mueve mas la afinacion y el filtro. Abajo
  queda quieto y oscuro.
- Cada capa se dibuja como un punto con el nombre de su nota (sin octava: algunos
  presets suenan una octava arriba). Las sostenidas (HOLD, dedo levantado) se ven
  como un aro.
- *Decision:* si cambia la tonica o la escala, **las capas que suenan se
  reafinan en el acto** (con un glide de 35 ms). Es una textura en vivo; no espera
  el compas.

## Capas, TOUCH y HOLD

- Cada dedo en el pad es una capa (multitoque real). Arrastrar el dedo mueve su
  capa.
- **TOUCH**: la capa suena mientras el dedo esta apoyado.
- **HOLD**: la capa sigue al levantar el dedo.
- **Hasta 6 capas.** *Decision:* con seis sonando, un toque nuevo **reemplaza a
  la capa sostenida mas vieja** (fck-synth lo rechazaba, lo que obligaba a ir a
  CLEAR en medio de una textura). Si las seis tienen un dedo encima, el toque se
  ignora.
- Volver de HOLD a TOUCH suelta las capas sostenidas (si no, quedarian sin forma
  de apagarse salvo STOP).
- El encabezado CAPAS muestra cuantas suenan (por ejemplo 3/6).
- Las capas se reparten el nivel: cada una suena a 1/raiz(n), asi seis capas
  suenan ~2,4 veces una, no seis.
- *Decision (como fck-synth):* **cada capa conserva el preset con el que
  nacio.** Cambiar de SONIDO afecta a las capas nuevas; se pueden mezclar capas de
  presets distintos. Las perillas, la tonalidad y CAOS llegan a todas.

## STOP y CLEAR

*Decision* (el pedido no decia en que se diferencian):

- **STOP**: todas las capas se apagan con su RELEASE; las colas del delay y la
  reverb siguen sonando hasta apagarse.
- **CLEAR**: silencio ya. Las capas caen en 30 ms y las colas de efecto se cortan
  tambien: el bus de efectos se reemplaza por uno nuevo y el viejo se apaga en
  20 ms y se libera.

## Presets

Mezcla de fuentes de fck-synth (principal, sierra desafinada, parcial de campana
x2,76, sub x0,5, ruido filtrado alrededor de la nota):

| Preset | Fuentes | Caracter |
| --- | --- | --- |
| **DRONE** | sierra + sub | Oscuro y pesado, lento. Reverb media. |
| **PAD** | triangulo + algo de sierra y sub, una octava arriba | Suave y ancho; ataque x2, release x1,5. Mas reverb. |
| **GLASS** | campana dominante, una octava arriba | Brillante, con eco (delay alto). |
| **NOISE** | solo ruido, pasabanda alrededor de la nota | Ruido afinado; mucho movimiento de afinacion. |
| **ALIEN** | cuadrada, sierra y campana, filtro resonante | Ondula mucho (LFO de afinacion y filtro mas profundos), delay alto. |

*Decision:* ALIEN era un pasabanda angosto en fck-synth; aca, con el filtro lejos
de sus armonicos, casi no se oia (RMS 0,009). Se cambio por un **pasabajos
resonante** (Q 7). Cada preset tiene un ajuste de nivel para que los cinco suenen
parecido (RMS de 0,08 a 0,10 con una capa).

## Perillas

| Perilla | Que hace |
| --- | --- |
| FILTRO | Brillo base del filtro (se suma a la altura en el pad). |
| ATAQUE | 10 ms a ~4 s (cuadratica), por el factor del preset. |
| RELEASE | 60 ms a ~6 s (cuadratica), por el factor del preset. |
| DESAF. | La sierra desafinada: 2 a 40 cents. |
| VOL | Nivel de las capas (cuadratico). |
| CAOS | Deriva de las capas que suenan (ver abajo). |

*Decision:* la perilla **TONO** del prototipo se quito: el timbre lo dan los
presets, y el pedido no la lista.

## CAOS: deriva

CAOS hace **derivar** las capas que suenan: cada capa tiene dos osciladores muy
lentos propios (0,05 a 0,5 Hz, nunca al mismo ritmo que los de otra capa) que
mueven su afinacion (hasta 45 cents) y su filtro (hasta 2 octavas). Al ser
osciladores de audio no hace falta ningun temporizador: la deriva corre en el
hilo de audio. En 0 no hay deriva.

## Bus de efectos

Propio del nodo (`DroneFx`), con Web Audio nativo:

- **Seco**, mas un **envio por capa** a cada efecto (cantidad segun el preset).
- **Delay**: un corchea con puntillo del tempo (sigue al BPM), realimentacion 0,38
  con un pasabajos de 2,8 kHz en el lazo (cada repeticion mas oscura).
- **Reverb**: convolucion con una respuesta generada (ruido que decae en 2,8 s,
  distinto en cada canal, con semilla fija: suena igual siempre). Escalada por
  1/raiz(largo) como en fck-synth; sin esa escala la reverb sumaba +30 dB (se
  midio un bus de 1,6 con una sola capa).
- Sin compresor propio: el limitador del MASTER es el unico.

### Hacia AudioWorklet

`DroneEngine` (en `drone-module.ts`) es el borde: `setScene`, `play` (eventos del
pad, STOP, CLEAR), `stop`, `clear`. El mapeo de perillas y posicion a numeros
(`droneLayerSound`) ya esta en el nucleo, sin Web Audio. Un `WorkletDroneModule`
implementaria `DroneEngine` y usaria las mismas funciones; los tres puntos de
entrada del bus de efectos (seco, envio a delay, envio a reverb) se mantienen.

## Liberacion (nada queda colgado)

| Que pasa | Que hace el DRONE |
| --- | --- |
| Se levanta el dedo (TOUCH) | La capa cae con su RELEASE. |
| STOP | Todas caen con su RELEASE; las colas de efecto siguen. |
| CLEAR | Silencio ya, colas incluidas. |
| Se para el transporte | Como STOP. |
| Se corta el cable | Como CLEAR: silencio en el acto, para que al reconectar no vuelva ninguna cola. |
| Se saca el nodo | Silencio en el acto; el modulo se libera. |
| Se cambia de panel con un dedo apoyado | El dedo se levanta (en TOUCH su capa termina). |

Se puede tocar con el transporte detenido.

## Encendido en el lienzo

Antes el DRONE destellaba en cada tiempo (simulacion de la etapa 1). Ahora se
enciende **mientras tiene capas sonando** y el cable conectado; al apagarse la
ultima queda encendido lo que dura su RELEASE (hasta 3 s).

## Reloj

Como el LEAD: entra, sale y corta su cable **en el acto** (ver docs/LEAD.md).

## MASTER

La perilla DRONE del MASTER (que ya existia) ahora controla el nivel del canal.

## Mezcla medida (Chromium)

| Escena | Bus (pico) | Salida | Limitador |
| --- | --- | --- | --- |
| Una capa, cada preset | 0,12 a 0,24 | | 0 dB |
| Seis capas arriba del pad (DRONE) | 0,28 | 0,34 | 0 dB |
| DRUM + BASS + SYNTH + LEAD (una tecla) + seis capas arriba | 0,86 | 0,88 | -1,3 dB |

Hay un test de Playwright para la ultima fila (bus y salida < 1, limitador
> -6 dB).

## Pendiente

- En el telefono apaisado (844 x 390) el pad queda muy bajo (~28 px), como las
  grillas de los otros paneles.
- Sin probar en Safari ni Firefox. Safari no tiene `cancelAndHoldAtTime`; hay
  un respaldo (`cancelScheduledValues` + valor actual).
- La perilla ESPACIO del MASTER sigue sin funcion (no se pidio; podria mandar al
  bus de efectos del DRONE mas adelante).
