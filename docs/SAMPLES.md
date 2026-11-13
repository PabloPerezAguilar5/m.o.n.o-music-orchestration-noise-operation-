# Samples de DRUM

Samples propios en `public/samples/drums/`, versionados en git. Solo DRUM
usa samples; el resto se sintetiza por codigo.

## Resumen

- **8 kits**, una carpeta cada uno: `freaksamples`, `glitch`, `samples808`,
  `trip`, `acid`, `house`, `lab` y `linnrock`. El kit inicial es `samples808`.
- **52 archivos `.wav`**, unos 7,8 MiB, mas `manifest.json`.
- **Formato:** WAV PCM. `freaksamples`, `glitch` y `samples808` son 24 bit,
  estereo, 48 kHz. `trip`, `acid`, `house`, `lab` y `linnrock` son 16 bit,
  44,1 kHz, mono o estereo, algunos con chunks `smpl`, `LIST` o `fact`. Web
  Audio los decodifica y remuestrea igual. Duraciones de 0,05 s a 3 s.
- `manifest.json` dice que archivos tiene cada kit y a que fila de DRUM va
  cada uno. `tests/unit/samples-manifest.test.ts` comprueba que coincida con
  las carpetas.

| Kit | Archivos | En disco | Audio total | Decodificado (float32 estereo) |
| --- | ---: | ---: | ---: | ---: |
| freaksamples | 16 | 3,61 MiB | 13,2 s | 4,8 MiB |
| glitch | 4 | 0,36 MiB | 1,3 s | 0,5 MiB |
| samples808 | 12 | 2,48 MiB | 9,0 s | 3,3 MiB |
| trip | 4 | 0,22 MiB | 2,6 s | 0,9 MiB |
| acid | 4 | 0,20 MiB | 2,4 s | 0,9 MiB |
| house | 4 | 0,25 MiB | 1,5 s | 0,6 MiB |
| lab | 4 | 0,24 MiB | 2,4 s | 0,9 MiB |
| linnrock | 4 | 0,41 MiB | 3,3 s | 1,2 MiB |
| **Total** | **52** | **7,8 MiB** | **35,7 s** | **13,1 MiB** |

"Decodificado" es lo que ocupa cada kit en memoria como `AudioBuffer`
(Web Audio decodifica a float32) a 48 kHz. Los ocho kits a la vez entran
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
      "id": "samples808",
      "files": [
        { "file": "kick-long.wav", "row": "kick" },
        { "file": "woodblock.wav", "row": "perc" },
        { "file": "clap.wav", "row": null }
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
- Varios archivos en la misma fila son variantes de ese sonido (ver abajo
  como se elige entre ellas).
- Cada kit debe tener al menos un archivo por fila (lo comprueba el test).

**Cambiar el sonido de PRC** (o de cualquier fila) es editar `row`. Ejemplo:
para usar el clap en el 808 en lugar del woodblock, poner `"row": null` en
`woodblock.wav` y `"row": "perc"` en `clap.wav`. El test tiene fijado el
default (woodblock en 808, hat de pedal en house); si se cambia a proposito,
hay que actualizar esa linea del test.

## Contenido por kit

La columna "Original" es el nombre que tenia el archivo antes del
renombrado; git conserva el historial con `git log --follow`.

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

Reemplaza al trip anterior: mismo nombre, samples nuevos.

| Archivo | Fila | Duracion | Original |
| --- | --- | ---: | --- |
| kick.wav | kick | 0,27 s | Kick Vinyl.wav |
| snare.wav | snare | 0,75 s | Snare Hi.wav |
| hat.wav | hat | 0,16 s | hh.wav |
| perc.wav | perc | 1,39 s | perc.wav |

### acid (4)

| Archivo | Fila | Duracion | Original |
| --- | --- | ---: | --- |
| kick.wav | kick | 0,58 s | kick.wav |
| snare.wav | snare | 0,45 s | Snare3.wav |
| hat.wav | hat | 0,95 s | Ohh2.wav (hat abierto) |
| perc.wav | perc | 0,39 s | perc.wav |

Carpeta original: `Acid`.

### house (4)

| Archivo | Fila | Duracion | Original |
| --- | --- | ---: | --- |
| kick.wav | kick | 0,30 s | Kick_club.wav |
| snare.wav | snare | 0,51 s | SnareDrum_fat.wav |
| hat.wav | hat | 0,50 s | HighHat_c_2.wav |
| hat-pedal.wav | perc | 0,20 s | HighHat_p_3.wav |

Carpeta original: `House`. No trae perc: el hat de pedal va en PRC.

### lab (4)

| Archivo | Fila | Duracion | Original |
| --- | --- | ---: | --- |
| kick.wav | kick | 0,61 s | Kick-018.wav |
| snare.wav | snare | 0,32 s | Snare-032.wav |
| hat.wav | hat | 0,38 s | Hat Semicl1.wav |
| perc.wav | perc | 1,11 s | perc.wav |

Carpeta original: `Lab`.

### linnrock (4)

| Archivo | Fila | Duracion | Original |
| --- | --- | ---: | --- |
| kick.wav | kick | 0,60 s | Kick_reverb.wav |
| snare.wav | snare | 0,51 s | SnareDrum_grab.wav |
| hat.wav | hat | 0,50 s | HighHat_c_1.wav |
| perc.wav | perc | 1,69 s | perc.wav |

Carpeta original: `Linnrock`.

## Cobertura de las filas

Cantidad de archivos por fila en cada kit (las variantes de una fila se
cuentan por separado):

| Kit | KCK | SNR | HAT | PRC |
| --- | :-: | :-: | :-: | --- |
| freaksamples | 4 | 4 | 6 | perc-fm-3 |
| glitch | 1 | 1 | 1 | perc |
| samples808 | 2 | 2 | 1 | woodblock |
| trip | 1 | 1 | 1 | perc |
| acid | 1 | 1 | 1 | perc |
| house | 1 | 1 | 1 | hat-pedal |
| lab | 1 | 1 | 1 | perc |
| linnrock | 1 | 1 | 1 | perc |

Sin fila asignada: el open hat del 808 (suena distinto del hat cerrado, no
conviene alternarlo en HAT), el woodblock de freak, y ride, tom, conga,
rimshot y el clap del 808.

## Historial de limpieza

- Se borraron los kits `909samples` y el `trip` original. Se agregaron
  `acid`, `house`, `lab`, `linnrock` y un `trip` nuevo; carpetas y archivos
  se renombraron al formato de arriba.

- Se borraron los 4 duplicados de `trip`. Con ellos se fueron los unicos
  nombres con `#`, que el servidor de Vite no servia (devolvia el
  `index.html` aun con `%23`).
- Se renombraron 43 archivos al formato de arriba. Contenido identico,
  verificado por sha256 antes y despues; git los registra como renombres.
- Verificado con el servidor de desarrollo (Vite 8.3.8): `manifest.json` y
  los 51 archivos se sirven como `audio/wav` con su tamano exacto.

## Como los usa la app

- Al despertar el audio se carga el manifiesto y el kit elegido; los demas
  kits se cargan la primera vez que se tocan en la seccion KIT (una tecla
  por kit; al tocarla suena su kick).
- **Variantes:** si una fila tiene varios archivos, la semilla del patron
  elige uno por paso (`pickVariant` en `src/core/drum-kits.ts`). Un paso
  suena siempre con la misma variante hasta que se aprieta RNDM.
- **Si un archivo falla**, esa fila sigue con las demas variantes; si no
  queda ninguna, usa una voz sintetizada de respaldo. El display del DRUM
  muestra `FALTA <archivo>`. Sin manifiesto, las cuatro filas usan el
  respaldo y las teclas de KIT quedan deshabilitadas.
- Los archivos sin fila (`"row": null`) todavia no se usan.
