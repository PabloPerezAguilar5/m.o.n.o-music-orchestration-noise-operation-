# DISTORSIÓN (etapa 6)

Nodo de efecto, amarillo. Recibe sonido por cables (la suma de todos los que le entran)
y lo manda al MASTER por defecto. Sin nada enchufado no suena.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `src/core/dist.ts` | Núcleo puro: de perillas a números (ganancia, compensación, bits, retención, tono, salida). |
| `src/audio/distortion/dist-dsp.ts` | El DSP en TypeScript puro (corre en el worklet y en los tests): el borde a reemplazar por Rust/WebAssembly. |
| `src/audio/distortion/dist-processor.ts` | El procesador AudioWorklet. |
| `src/audio/distortion/dist-module.ts` | El nodo en el grafo: entrada, worklet, salida; el LFO sobre DRIVE. |

## Panel

- Perillas **DRIVE**, **TONO**, **MEZCLA**, **SALIDA** y la macro **CAOS**.
- Tres botones grandes de tipo: **SUAVE**, **DURA** y **CRUSH**.
- El display muestra el tipo («DISTORSIÓN · SUAVE»).

## Cadena

```
entrada ─┬─ 4x arriba ─ ganancia ─ forma ─ 4x abajo ─ bloqueo de continua ─ TONO ─┬─ MEZCLA ─ SALIDA ─ limitador ─ salida
         └──────────── retardo (la misma latencia que el camino húmedo) ──────────┘
```

- **Sobremuestreo 4x**: la forma corre a cuatro veces la frecuencia de muestreo, entre
  dos filtros FIR de 97 coeficientes (seno enventanado Kaiser, polifásico). Lo que la
  forma genera por encima del Nyquist original se filtra en vez de volver como aliasing.
- *Decisión:* además, **antiderivada de primer orden (ADAA)** en SUAVE y DURA. Con DRIVE
  alto la onda queda casi cuadrada y algunos armónicos altísimos se plegaban igual a 4x
  (−31 dB). Con ADAA, medido con un seno de 9 kHz casi cuadrado, lo que cae en 3 kHz
  queda entre −49 y −62 dB de la fundamental (sin sobremuestreo: −17,5 dB).
- **Bloqueo de continua**: un pasaaltos a 10 Hz después de la forma (SUAVE es
  asimétrica a propósito: armónicos pares).
- **TONO**: pasabajos de dos polos (Butterworth), de 600 Hz a 19 kHz.
- **MEZCLA**: seco y húmedo; el seco se retrasa exactamente la latencia de los filtros
  (24 muestras, 0,5 ms) para que mezclar no haga efecto peine. TONO agrega su propia
  pequeña demora al húmedo (una o dos muestras con el tono abierto).
- **SALIDA**: unidad a la mitad, +6 dB arriba (como los niveles del MASTER).
- **Limitador al final**: un limitador de picos (umbral 0,89, liberación 80 ms) y una
  saturación suave: la salida nunca pasa de 0 dBFS, ni con todo al máximo.

## Tipos

| Tipo | Forma | DRIVE |
| --- | --- | --- |
| **SUAVE** | Curva tipo tanh, un poco asimétrica. | Hasta +32 dB de ganancia. |
| **DURA** | Recorte a ±0,8. | Hasta +36 dB. |
| **CRUSH** | Bitcrusher: reduce bits (16 a 3) y frecuencia de muestreo (retiene hasta 24 muestras). | El aliasing es el efecto: sin ADAA. |

*Decisión:* el nivel se compensa después de la forma para que DRIVE cambie más el color
que el volumen: 1/ganancia mientras la señal pasa limpia, fija una vez saturada (una
onda casi cuadrada suena mucho más fuerte que la original con el mismo pico). Medido con
el BASS en Chromium, todos los tipos y DRIVE quedan entre −1,9 y +2,5 dB del BASS directo.

## Sin chasquidos

- Todas las perillas se deslizan (20 ms) dentro del DSP, muestra a muestra.
- *Decisión:* cambiar de tipo **baja el húmedo a cero en 12 ms, cambia, y lo vuelve a
  subir**: un pequeño hueco en vez de un salto.
- El LFO llega a DRIVE como un AudioParam a-rate (muestra a muestra).

## CAOS

*Decisión:* CAOS agrega **inestabilidad**: una caminata aleatoria lenta (cambia de rumbo
cada 70 ms, suavizada en 250 ms) que empuja DRIVE hasta ±0,35 y, en CRUSH, estira y
encoge la retención (el muestreo «tartamudea»). En 0 no hace nada. Arranca en 0.

## LFO

El cable del LFO mueve **DRIVE** (ver docs/LFO.md): hasta ±0,5 de la perilla con
CANTIDAD al máximo.

## Encendido en el lienzo

Antes destellaba en cada tiempo (simulación de la etapa 1). Ahora se enciende **mientras
algo encendido le entra**, y su cable al MASTER con él.

## Pendiente

- Solo probado en Chromium.
- Con TONO cerrado, el húmedo se atrasa más (es un pasabajos) y la MEZCLA intermedia
  puede colorear un poco los medios.
