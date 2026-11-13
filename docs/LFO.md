# LFO (etapa 6)

Nodo de modulación, gris claro. No suena: su cable (punteado) **mueve la perilla
principal** del nodo al que llega. Puede modular varios destinos a la vez. Nunca modula
el MASTER.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `src/core/lfo.ts` | Núcleo puro: formas, velocidad libre y SYNC, qué perilla mueve en cada nodo (`MOD_TARGETS`). |
| `src/audio/lfo/lfo-dsp.ts` | La onda en TypeScript puro (worklet y tests). |
| `src/audio/lfo/lfo-processor.ts` | El procesador AudioWorklet; manda una copia de la onda al hilo principal. |
| `src/audio/lfo/lfo-module.ts` | El nodo en el grafo: la onda por CANTIDAD es su salida. |
| `src/audio/modulation.ts` | Cómo cae el cable en cada módulo y a qué escala. |
| `src/state/lfo-monitor.ts` | La onda reciente, para dibujar (no se guarda). |
| `src/ui/panel/mono-lfo-scope.ts` | El visualizador (Canvas). |

## Panel

- Botones de forma **SENO**, **TRIÁNGULO**, **CUADRADA** y **RANDOM** (sample and hold).
  *Decisión:* FORMA pasó de perilla (prototipo) a cuatro teclas, como pide la etapa.
- Perillas **VELOCIDAD** y **CANTIDAD**, y la macro **CAOS**.
- **SYNC**: VELOCIDAD elige una división del tempo del MASTER: **1/1, 1/2, 1/4, 1/8,
  1/16** (cinco zonas iguales de la perilla, de la más lenta a la más rápida; un ciclo
  por redonda … por semicorchea). Con SYNC la onda **arranca su ciclo en cada compás**.
- Sin SYNC: de **0,05 a 20 Hz** (exponencial).
- El display muestra forma y velocidad («LFO · SENO · 0.55 Hz», «LFO · SENO · 1/4»);
  al girar VELOCIDAD se lee la velocidad o la división.
- **Visualizador grande** (Canvas): la onda tal como corre en el hilo de audio, en
  tiempo real, desplazándose (lo nuevo a la derecha), unos dos ciclos y medio (entre
  0,4 y 4 s), tan alta como CANTIDAD. Plana mientras no hay audio.

## Qué mueve

| Destino | Perilla | Rango con CANTIDAD al máximo |
| --- | --- | --- |
| SYNTH, BASS, LEAD | CUTOFF | ±0,5 de la perilla |
| DRONE | FILTRO | ±0,5 (±1,6 octavas de filtro) |
| DISTORSIÓN | DRIVE | ±0,5 |
| DRUM | TONO (las cuatro filas juntas) | ±0,25 (±6 semitonos) |

*Decisión:* en DRUM, «TONO» son cuatro perillas (una por fila): el LFO las mueve
juntas, y cada golpe sigue la onda mientras suena. El rango es más chico para que el
kit siga sonando a kit.

## Modulación suave, sin tocar las perillas

- La onda corre **a frecuencia de audio** en un AudioWorklet y entra al destino como
  **AudioParam a-rate** (CUTOFF del motor de voz, DRIVE de la DISTORSIÓN) o sumada al
  `detune` del filtro (DRONE) y de cada golpe (DRUM): sin escalones.
- *Decisión:* la salida pasa por un **suavizado de 4 ms**: CUADRADA y RANDOM no saltan
  (sus bordes se redondean), y un cambio de forma tampoco. Los cambios de VELOCIDAD se
  deslizan (50 ms) y CANTIDAD también (20 ms).
- **Los valores guardados de las perillas no cambian.** La perilla muestra su valor; un
  **LED en el aro** (del color del nodo) muestra dónde la tiene el LFO en cada momento.
  Solo aparece en la perilla movida y mientras el cable está enchufado.
- En el lienzo, el LFO y sus cables **brillan con la onda** mientras modulan algo (el
  nodo ya no destella cada dos pasos como en la simulación de la etapa 1).

## CAOS

*Decisión:* CAOS vuelve la onda irregular: en cada ciclo sortea una **altura** (hasta
60 % más baja) y, sin SYNC, una **velocidad** (hasta ±50 %). Con SYNC la velocidad no
cambia, para no perder el compás. En 0 la onda es exacta. Arranca en 0.

## Cables

- El LFO llega **sin cables**: se arrastra su puerto hasta los nodos que debe mover.
- Soltarlo sobre el MASTER muestra «El LFO no modula el MASTER».
- Tocar un cable del LFO lo corta (queda punteado y tenue) y el aro de la perilla
  desaparece.
- Como todo cable, hacerlo o cortarlo entra en el próximo compás, con un fundido de
  20 ms.

## Pendiente

- En el teléfono apaisado el visualizador queda bajo (unos 45 px), como las demás zonas.
- Solo probado en Chromium.
