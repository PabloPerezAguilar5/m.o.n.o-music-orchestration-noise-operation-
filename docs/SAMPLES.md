# Samples de DRUM

Inventario de `public/samples/drums/`, relevado el 2026-11-12 leyendo el
encabezado RIFF de cada archivo. Todavia no estan conectados al audio: eso
es la etapa 2. Solo DRUM usa samples; el resto se sintetiza por codigo.

## Resumen

- **5 kits** en subcarpetas, sin subniveles: `909samples`, `freaksamples`,
  `glitch`, `samples808` y `trip`.
- **55 archivos `.wav`**, unos 9,8 MiB en disco. No hay otros formatos
  (aparte de `public/samples/.gitkeep`).
- **Formato unico en los 55:** WAV PCM, 24 bit, estereo, 48 kHz. Solo
  tienen los chunks `fmt` y `data` (sin metadatos, sin puntos de loop).
- **Duraciones:** de 0,049 s (`samples808/A13_808 woodblock.wav`) a 3,012 s
  (`samples808/A07_808 ride.wav`). Todos son golpes cortos.
- Es el mismo conjunto que `reference/m.o.n.o-studio/public/samples/drums/`
  (mismos 55 nombres). Ese repo tiene un mapeo previo archivo -> instrumento
  en `kits.json`; las columnas "Instrumento" de abajo lo siguen.

| Kit | Archivos | En disco | Audio total | Decodificado (float32 estereo) |
| --- | ---: | ---: | ---: | ---: |
| 909samples | 15 | 2,18 MiB | 7,9 s | 2,9 MiB |
| freaksamples | 16 | 3,61 MiB | 13,2 s | 4,8 MiB |
| glitch | 4 | 0,36 MiB | 1,3 s | 0,5 MiB |
| samples808 | 12 | 2,48 MiB | 9,0 s | 3,3 MiB |
| trip | 8 | 1,15 MiB | 4,2 s | 1,5 MiB |
| **Total** | **55** | **9,8 MiB** | **35,6 s** | **13,0 MiB** |

"Decodificado" es lo que ocupa cada kit en memoria como `AudioBuffer`
(Web Audio decodifica a float32), a 48 kHz. Cargar los cinco kits a la vez
entra holgado.

## Nombres de archivo

- `909samples`, `freaksamples` y `samples808`: prefijo `Ann_` que fija el
  orden (`A01_909 clap.wav`), seguido del nombre del sonido. Hay espacios
  en los nombres de 909 y 808, y guiones en freak.
- `glitch`: nombres de instrumento sin prefijo (`kick.wav`, `snare.wav`,
  `hat.wav`, `perc.wav`).
- `trip`: mezcla las dos formas: 4 con prefijo (`A01_06 Kick#2.wav`...) y 4
  sin prefijo (`kick.wav`...). Son las mismas 4 grabaciones (ver Problemas).

## Contenido por kit

### 909samples (15)

| Archivo | Instrumento | Duracion |
| --- | --- | ---: |
| A01_909 clap.wav | clap | 1,46 s |
| A02_909 crash.wav | crash | 0,98 s |
| A03_909 hat 2.wav | hat | 0,33 s |
| A04_909 hat 3.wav | hat | 0,20 s |
| A05_909 hat.wav | hat | 0,08 s |
| A06_909 hi tom.wav | tom | 0,39 s |
| A07_909 kick 1.wav | kick | 0,35 s |
| A08_909 kick 2.wav | kick | 0,55 s |
| A09_909 kick.wav | kick | 0,43 s |
| A10_909 mid tom.wav | tom | 0,72 s |
| A11_909 open hat.wav | open hat | 0,41 s |
| A12_909 ride.wav | ride | 0,86 s |
| A13_909 snare long.wav | snare | 0,43 s |
| A14_909 snare low.wav | snare | 0,25 s |
| A15_909 snare.wav | snare | 0,48 s |

### freaksamples (16)

| Archivo | Instrumento | Duracion |
| --- | --- | ---: |
| A01_kick-gnarl-5.wav | kick | 1,48 s |
| A02_fm-kick-1.wav | kick | 1,34 s |
| A03_fm-kick-5.wav | kick | 1,41 s |
| A04_fm-kick-6.wav | kick | 0,49 s |
| A05_snare-spring.wav | snare | 1,69 s |
| A06_snare-elektro-2.wav | snare | 0,22 s |
| A07_snare-fm-3.wav | snare | 2,00 s |
| A08_snare-love.wav | snare | 0,08 s |
| A09_fm-hat-2.wav | hat | 1,82 s |
| A10_fm-hat-9.wav | hat | 0,07 s |
| A11_hat-close.wav | hat | 0,29 s |
| A12_hat-elektro-1.wav | hat | 0,12 s |
| A13_hat-elektro-3.wav | hat | 0,28 s |
| A14_hat-elektro-4.wav | hat | 0,10 s |
| A15_perc-fm-3.wav | perc | 0,18 s |
| A16_wood-block-hi-spring.wav | woodblock | 1,60 s |

### glitch (4)

| Archivo | Instrumento | Duracion |
| --- | --- | ---: |
| hat.wav | hat | 0,28 s |
| kick.wav | kick | 0,46 s |
| perc.wav | perc | 0,38 s |
| snare.wav | snare | 0,21 s |

### samples808 (12)

| Archivo | Instrumento | Duracion |
| --- | --- | ---: |
| A01_808 clap.wav | clap | 0,51 s |
| A02_808 conga hi.wav | conga | 0,21 s |
| A03_808 hat open.wav | open hat | 0,86 s |
| A04_808 hat.wav | hat | 0,25 s |
| A05_808 kick long.wav | kick | 2,14 s |
| A06_808 kick short.wav | kick | 0,13 s |
| A07_808 ride.wav | ride | 3,01 s |
| A08_808 snare grain.wav | snare | 0,54 s |
| A09_808 snare.wav | snare | 0,18 s |
| A10_808 tom hi.wav | tom | 0,38 s |
| A12_808 rimshot.wav | rim | 0,77 s |
| A13_808 woodblock.wav | woodblock | 0,05 s |

### trip (8 archivos, 4 sonidos distintos)

| Archivo | Instrumento | Duracion | Identico a |
| --- | --- | ---: | --- |
| kick.wav | kick | 0,30 s | A01_06 Kick#2.wav |
| snare.wav | snare | 0,84 s | A02_07 Snare#2.wav |
| hat.wav | hat | 0,31 s | A03_09 Hihat#2.wav |
| perc.wav | perc (rimshot) | 0,65 s | A04_13 Rimshot.wav |
| A01_06 Kick#2.wav | kick | 0,30 s | kick.wav |
| A02_07 Snare#2.wav | snare | 0,84 s | snare.wav |
| A03_09 Hihat#2.wav | hat | 0,31 s | hat.wav |
| A04_13 Rimshot.wav | rim | 0,65 s | perc.wav |

## Cobertura de las filas de DRUM

El secuenciador de DRUM tiene cuatro filas: KCK, SNR, HAT y PRC. Cantidad de
sonidos distintos que cada kit tiene para cada fila:

| Kit | KCK | SNR | HAT | PRC |
| --- | :-: | :-: | :-: | --- |
| 909samples | 3 | 3 | 3 (+1 abierto) | ninguno con ese nombre; candidatos: clap, 2 toms, ride, crash |
| freaksamples | 4 | 4 | 6 | perc, woodblock |
| glitch | 1 | 1 | 1 | perc |
| samples808 | 2 | 2 | 1 (+1 abierto) | ninguno con ese nombre; candidatos: clap, conga, tom, rimshot, woodblock, ride |
| trip | 1 | 1 | 1 | perc (es un rimshot) |

Los cinco kits cubren KCK, SNR y HAT. Para PRC, 909 y 808 necesitan elegir
un sonido.

## Problemas encontrados

1. **Duplicados en `trip`.** Los 4 archivos con prefijo son copias byte a
   byte de los 4 sin prefijo (mismo hash). El `kits.json` viejo los trataba
   como variantes distintas de hat, kick y snare, asi que "alternar
   variantes" repetia el mismo sonido.
2. **Vite no sirve los nombres con `#`.** En el servidor de desarrollo,
   `A01_06 Kick#2.wav`, `A02_07 Snare#2.wav` y `A03_09 Hihat#2.wav`
   devuelven el `index.html` de la app en lugar del WAV, incluso con el `#`
   codificado como `%23` (probado con Vite 8.3.8). Los nombres con espacios
   si funcionan codificados como `%20`. m.o.n.o-studio lo resolvia con un
   plugin de Vite propio. Como esos tres son duplicados (punto 1), alcanza
   con no usarlos.
3. **Hueco en la numeracion de `samples808`:** salta de `A10` a `A12`. No
   falta ningun archivo referenciado; puede ser un sample que se quito.
4. **Los WAV no estan en git.** `public/samples/drums/` esta sin trackear
   (unos 10 MiB). Hay que decidir si se suben al repo o se mantienen
   locales; no se incluyeron en ningun commit.
5. **Sin licencia documentada.** No hay ningun archivo que indique el
   origen o la licencia de los samples. Conviene anotarlo antes de
   publicarlos.

## Decisiones pendientes para la etapa 2

- Que sonido va en PRC para 909samples y samples808.
- Si las variantes de un instrumento (por ejemplo los 3 kicks del 909) se
  alternan, se eligen por semilla o se expone una perilla para elegirlas.
- Si se borran o ignoran los 4 duplicados de `trip`; recomendacion:
  ignorarlos en el manifiesto y, si se quiere, renombrar o borrar los
  archivos con `#`.
- Si los samples se suben a git (punto 4 de Problemas).
