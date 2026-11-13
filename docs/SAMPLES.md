# Samples de DRUM

Samples propios en `public/samples/drums/`, versionados en git. Todavia no
estan conectados al audio: eso es la etapa 2. Solo DRUM usa samples; el
resto se sintetiza por codigo.

## Resumen

- **5 kits**, una carpeta cada uno: `909samples`, `freaksamples`, `glitch`,
  `samples808` y `trip`.
- **51 archivos `.wav`**, unos 9,2 MiB, mas `manifest.json`.
- **Formato unico:** WAV PCM, 24 bit, estereo, 48 kHz, solo chunks `fmt` y
  `data` (sin metadatos ni loops). Duraciones de 0,05 s a 3 s.
- `manifest.json` dice que archivos tiene cada kit y a que fila de DRUM va
  cada uno. `tests/unit/samples-manifest.test.ts` comprueba que coincida con
  las carpetas.

| Kit | Archivos | En disco | Audio total | Decodificado (float32 estereo) |
| --- | ---: | ---: | ---: | ---: |
| 909samples | 15 | 2,18 MiB | 7,9 s | 2,9 MiB |
| freaksamples | 16 | 3,61 MiB | 13,2 s | 4,8 MiB |
| glitch | 4 | 0,36 MiB | 1,3 s | 0,5 MiB |
| samples808 | 12 | 2,48 MiB | 9,0 s | 3,3 MiB |
| trip | 4 | 0,58 MiB | 2,1 s | 0,8 MiB |
| **Total** | **51** | **9,2 MiB** | **33,5 s** | **12,3 MiB** |

"Decodificado" es lo que ocupa cada kit en memoria como `AudioBuffer`
(Web Audio decodifica a float32) a 48 kHz. Los cinco kits a la vez entran
holgados.

## Nombres de archivo

- Minusculas y palabras separadas por guion: `kick-1.wav`, `open-hat.wav`.
  Sin espacios, sin prefijos de orden (`A01_`), sin la marca del kit y sin
  otros caracteres. Patron: `^[a-z0-9]+(-[a-z0-9]+)*\.wav$`.
- Primero el instrumento, despues el descriptor: `tom-hi`, `kick-fm-1`,
  `snare-grain`. `open-hat` cuenta como un instrumento en si.
- Si el original traia un numero, se conserva (`hat-fm-9`). Si varias
  variantes sin descriptor comparten nombre, todas llevan numero
  (`kick-1`, `kick-2`, `kick-3`).

Para agregar un sample: copiar el WAV con un nombre que cumpla el patron y
sumarlo al manifiesto. El test falla si un archivo no esta listado o si el
nombre no cumple.

## manifest.json

```json
{
  "version": 1,
  "rows": ["kick", "snare", "hat", "perc"],
  "kits": [
    {
      "id": "909samples",
      "files": [
        { "file": "kick-1.wav", "row": "kick" },
        { "file": "clap.wav", "row": "perc" },
        { "file": "crash.wav", "row": null }
      ]
    }
  ]
}
```

- `id` es el nombre de la carpeta del kit; `file`, el nombre dentro de ella.
  La ruta servida es `/samples/drums/<id>/<file>`.
- `row` es la fila de DRUM: `kick` (KCK), `snare` (SNR), `hat` (HAT), `perc`
  (PRC), o `null` si el archivo no va en ninguna fila por ahora. Los
  archivos sin fila quedan listados para usos futuros.
- Varios archivos en la misma fila son variantes de ese sonido. Como se
  elige entre ellas se decide en la etapa 2.
- Cada kit debe tener al menos un archivo por fila (lo comprueba el test).

**Cambiar el sonido de PRC** (o de cualquier fila) es editar `row`. Ejemplo:
para usar el tom agudo en el 909 en lugar del clap, poner `"row": null` en
`clap.wav` y `"row": "perc"` en `tom-hi.wav`. El test tiene fijado el
default (clap en 909, woodblock en 808); si se cambia a proposito, hay que
actualizar esa linea del test.

## Contenido por kit

La columna "Original" es el nombre que tenia el archivo antes del
renombrado; git conserva el historial con `git log --follow`.

### 909samples (15)

| Archivo | Fila | Duracion | Original |
| --- | --- | ---: | --- |
| kick-1.wav | kick | 0,35 s | A07_909 kick 1.wav |
| kick-2.wav | kick | 0,55 s | A08_909 kick 2.wav |
| kick-3.wav | kick | 0,43 s | A09_909 kick.wav |
| snare-long.wav | snare | 0,43 s | A13_909 snare long.wav |
| snare-low.wav | snare | 0,25 s | A14_909 snare low.wav |
| snare.wav | snare | 0,48 s | A15_909 snare.wav |
| hat-1.wav | hat | 0,08 s | A05_909 hat.wav |
| hat-2.wav | hat | 0,33 s | A03_909 hat 2.wav |
| hat-3.wav | hat | 0,20 s | A04_909 hat 3.wav |
| clap.wav | perc | 1,46 s | A01_909 clap.wav |
| open-hat.wav | — | 0,41 s | A11_909 open hat.wav |
| crash.wav | — | 0,98 s | A02_909 crash.wav |
| ride.wav | — | 0,86 s | A12_909 ride.wav |
| tom-hi.wav | — | 0,39 s | A06_909 hi tom.wav |
| tom-mid.wav | — | 0,72 s | A10_909 mid tom.wav |

### freaksamples (16)

| Archivo | Fila | Duracion | Original |
| --- | --- | ---: | --- |
| kick-gnarl-5.wav | kick | 1,48 s | A01_kick-gnarl-5.wav |
| kick-fm-1.wav | kick | 1,34 s | A02_fm-kick-1.wav |
| kick-fm-5.wav | kick | 1,41 s | A03_fm-kick-5.wav |
| kick-fm-6.wav | kick | 0,49 s | A04_fm-kick-6.wav |
| snare-spring.wav | snare | 1,69 s | A05_snare-spring.wav |
| snare-elektro-2.wav | snare | 0,22 s | A06_snare-elektro-2.wav |
| snare-fm-3.wav | snare | 2,00 s | A07_snare-fm-3.wav |
| snare-love.wav | snare | 0,08 s | A08_snare-love.wav |
| hat-fm-2.wav | hat | 1,82 s | A09_fm-hat-2.wav |
| hat-fm-9.wav | hat | 0,07 s | A10_fm-hat-9.wav |
| hat-close.wav | hat | 0,29 s | A11_hat-close.wav |
| hat-elektro-1.wav | hat | 0,12 s | A12_hat-elektro-1.wav |
| hat-elektro-3.wav | hat | 0,28 s | A13_hat-elektro-3.wav |
| hat-elektro-4.wav | hat | 0,10 s | A14_hat-elektro-4.wav |
| perc-fm-3.wav | perc | 0,18 s | A15_perc-fm-3.wav |
| woodblock-hi-spring.wav | — | 1,60 s | A16_wood-block-hi-spring.wav |

### glitch (4)

| Archivo | Fila | Duracion |
| --- | --- | ---: |
| kick.wav | kick | 0,46 s |
| snare.wav | snare | 0,21 s |
| hat.wav | hat | 0,28 s |
| perc.wav | perc | 0,38 s |

Nombres sin cambios.

### samples808 (12)

| Archivo | Fila | Duracion | Original |
| --- | --- | ---: | --- |
| kick-long.wav | kick | 2,14 s | A05_808 kick long.wav |
| kick-short.wav | kick | 0,13 s | A06_808 kick short.wav |
| snare-grain.wav | snare | 0,54 s | A08_808 snare grain.wav |
| snare.wav | snare | 0,18 s | A09_808 snare.wav |
| hat.wav | hat | 0,25 s | A04_808 hat.wav |
| woodblock.wav | perc | 0,05 s | A13_808 woodblock.wav |
| open-hat.wav | — | 0,86 s | A03_808 hat open.wav |
| clap.wav | — | 0,51 s | A01_808 clap.wav |
| conga-hi.wav | — | 0,21 s | A02_808 conga hi.wav |
| ride.wav | — | 3,01 s | A07_808 ride.wav |
| tom-hi.wav | — | 0,38 s | A10_808 tom hi.wav |
| rimshot.wav | — | 0,77 s | A12_808 rimshot.wav |

La numeracion original saltaba de A10 a A12; no falta ningun archivo.

### trip (4)

| Archivo | Fila | Duracion |
| --- | --- | ---: |
| kick.wav | kick | 0,30 s |
| snare.wav | snare | 0,84 s |
| hat.wav | hat | 0,31 s |
| perc.wav | perc | 0,65 s |

Nombres sin cambios. `perc.wav` es un rimshot. Tenia 4 copias exactas con
prefijo (`A01_06 Kick#2.wav`, `A02_07 Snare#2.wav`, `A03_09 Hihat#2.wav`,
`A04_13 Rimshot.wav`), que se borraron.

## Cobertura de las filas

Cantidad de archivos por fila en cada kit (las variantes de una fila se
cuentan por separado):

| Kit | KCK | SNR | HAT | PRC |
| --- | :-: | :-: | :-: | --- |
| 909samples | 3 | 3 | 3 | clap |
| freaksamples | 4 | 4 | 6 | perc-fm-3 |
| glitch | 1 | 1 | 1 | perc |
| samples808 | 2 | 2 | 1 | woodblock |
| trip | 1 | 1 | 1 | perc |

Sin fila asignada: los open hats de 909 y 808 (suenan distinto del hat
cerrado, no conviene alternarlos en HAT), el woodblock de freak, y crash,
ride, toms, conga, rimshot y el clap del 808.

## Historial de limpieza

- Se borraron los 4 duplicados de `trip`. Con ellos se fueron los unicos
  nombres con `#`, que el servidor de Vite no servia (devolvia el
  `index.html` aun con `%23`).
- Se renombraron 43 archivos al formato de arriba. Contenido identico,
  verificado por sha256 antes y despues; git los registra como renombres.
- Verificado con el servidor de desarrollo (Vite 8.3.8): `manifest.json` y
  los 51 archivos se sirven como `audio/wav` con su tamano exacto.

## Como los usa la app (etapa 2)

- Al despertar el audio se carga el manifiesto y el kit elegido; los demas
  kits se cargan la primera vez que se eligen con KIT.
- **Variantes:** si una fila tiene varios archivos, la semilla del patron
  elige uno por paso (`pickVariant` en `src/core/drum-kits.ts`). Un paso
  suena siempre con la misma variante hasta que se tira el dado.
- **Si un archivo falla**, esa fila sigue con las demas variantes; si no
  queda ninguna, usa una voz sintetizada de respaldo. El display del DRUM
  muestra `FALTA <archivo>`. Sin manifiesto, las cuatro filas usan el
  respaldo y KIT queda deshabilitado.
- Los archivos sin fila (`"row": null`) todavia no se usan.
