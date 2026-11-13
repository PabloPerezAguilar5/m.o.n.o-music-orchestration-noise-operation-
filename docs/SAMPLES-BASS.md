# Samples de BASS (TB-303)

Samples de bajo en `public/samples/bass/`: 63 loops de 128 BPM, ordenados y
con `manifest.json` (ver "Orden aplicado", al final). Todavia **no** estan
conectados al audio. Las secciones 1 a 5 son el inventario de los 252 archivos
tal como llegaron.

## Donde estaban

Llegaron en `public/samples/Bass/`, con **B mayuscula**; ya se renombro a
`bass`. Importaba porque el servidor de Vite distingue mayusculas y
minusculas en la URL: con la carpeta `Bass`, `/samples/bass/...` devolvia el
`index.html` de la app y solo `/samples/Bass/...` servia el audio. Windows no
distingue, por eso en el explorador parecian la misma carpeta.

## Resumen

- **252 archivos `.wav`** en 5 carpetas, cada una con 4 subcarpetas de tempo
  (`120bpm`, `125bpm`, `128bpm`, `132bpm`). Mas 5 `.DS_Store` de macOS.
- **161,4 MiB** en disco; **unos 234 MiB** decodificados (mono, float32,
  48 kHz) si se cargaran todos a la vez. Un solo tempo: 63 archivos, 42 MiB.
- **Formato unico:** WAV PCM, 24 bit, **mono**, 44,1 kHz. Chunks `fmt`,
  `JUNK`, `Fake` y `data` (sin `smpl`, sin loops marcados).
- **Todos son loops** de duracion exacta: 1 o 4 compases de 4/4 al tempo de
  su carpeta. **No hay ninguna nota suelta.**
- Normalizados: pico de -1,0 dBFS (tres archivos a -2 o -3 dBFS).
- Sin duplicados: ni archivos iguales ni audio igual (sha256 del archivo y
  del chunk `data`).
- Sin silencio al comienzo: el sonido arranca en los primeros 3,1 ms en todos
  los archivos (umbral -60 dBFS) y pasa los -20 dBFS antes de los 100 ms.

## 1. Estructura

| Carpeta | Subcarpetas | Archivos | En disco | Audio total |
| --- | --- | ---: | ---: | ---: |
| Basslines | 120/125/128/132bpm, 14 c/u | 56 | 13,5 MiB | 107 s |
| Basslines FX | 120/125/128/132bpm, 14 c/u | 56 | 13,5 MiB | 107 s |
| High Arps | 120/125/128/132bpm, 14 c/u | 56 | 53,8 MiB | 426 s |
| One Note Sweeps | 120/125/128/132bpm, 7 c/u | 28 | 26,9 MiB | 213 s |
| One Note Sweeps FX | 120/125/128/132bpm, 14 c/u | 56 | 53,8 MiB | 426 s |
| **Total** | | **252** | **161,4 MiB** | **1279 s** |

Cada carpeta de tempo repite el mismo juego de nombres, solo cambia el
numero de BPM. Nombres (`<bpm>` = 120, 125, 128 o 132; `<K>` = letra de A a
G, ver "Notas"):

| Carpeta | Patron del nombre | Variantes | Por tempo |
| --- | --- | --- | ---: |
| Basslines | `AM_BaStat<V>_<bpm><K>.wav` | V = A, B | 2 x 7 = 14 |
| Basslines FX | `AM_BaStat<V>[alt]_<bpm><K>.wav` | V = A, B | 2 x 7 = 14 |
| High Arps | `AM_HiTeeb[<V>]_<bpm><K>.wav` | V = A, B | 2 x 7 = 14 |
| One Note Sweeps | `AM_OneNoteSweepDry_<bpm><K>.wav` | una sola | 7 |
| One Note Sweeps FX | `AM_OneNoteSweepFX<v>_<bpm><K>.wav` | v = a, b | 2 x 7 = 14 |

Ejemplos: `Basslines/120bpm/AM_BaStatA_120A.wav`,
`Basslines FX/132bpm/AM_BaStatB[alt]_132G.wav`,
`High Arps/125bpm/AM_HiTeeb[A]_125C.wav`,
`One Note Sweeps/128bpm/AM_OneNoteSweepDry_128F.wav`,
`One Note Sweeps FX/120bpm/AM_OneNoteSweepFXb_120E.wav`.

Las 4 subcarpetas de tempo tienen todas sus letras (A a G) y variantes
completas: no falta ningun archivo.

## 2. Formato

Igual en los 252 archivos, asi que va una fila por carpeta y tempo:

| Carpeta | Tipo | Bits | Canales | Frecuencia | Duracion por tempo (120 / 125 / 128 / 132) | Compases |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| Basslines | WAV PCM | 24 | 1 | 44,1 kHz | 2,000 / 1,920 / 1,875 / 1,818 s | 1 |
| Basslines FX | WAV PCM | 24 | 1 | 44,1 kHz | 2,000 / 1,920 / 1,875 / 1,818 s | 1 |
| High Arps | WAV PCM | 24 | 1 | 44,1 kHz | 8,000 / 7,680 / 7,500 / 7,273 s | 4 |
| One Note Sweeps | WAV PCM | 24 | 1 | 44,1 kHz | 8,000 / 7,680 / 7,500 / 7,273 s | 4 |
| One Note Sweeps FX | WAV PCM | 24 | 1 | 44,1 kHz | 8,000 / 7,680 / 7,500 / 7,273 s | 4 |

Las duraciones coinciden al milisegundo con 1 o 4 compases al tempo de la
carpeta: estan cortados para loopear. Comprobado en Chromium: el servidor de
desarrollo los sirve como `audio/wav` y `decodeAudioData` los decodifica sin
error, incluido el chunk desconocido `Fake`. Safari y Firefox no se
probaron todavia.

Diferencia con DRUM: los samples de drums nuevos tambien son 44,1 kHz, pero
los de bajo son mono y 24 bit. Web Audio los remuestrea solo al decodificar.

## 3. Clasificacion tentativa por duracion

No hay golpes cortos: el archivo mas corto dura 1,818 s (un compas a
132 BPM). Todo cae en "frase o arpegio". Lo dudoso esta marcado con **(?)**
para que lo confirmes.

| Carpeta | Clase tentativa | Que se escucha (analisis automatico) |
| --- | --- | --- |
| Basslines | frase | linea de bajo de 1 compas, unas 29 notas detectadas, registro grave (A1, B0, C1, D1, F1, G1 en 120bpm) |
| Basslines FX | frase | misma idea con efecto ("alt"), unas 23 notas por compas |
| High Arps | arpegio | 4 compases en registro agudo (A4, B4 en 120bpm) |
| One Note Sweeps | **frase (?)** | una sola nota repetida durante 4 compases con barrido de filtro |
| One Note Sweeps FX | **frase (?)** | igual, con efecto; dos variantes (a, b) |

**(?) One Note Sweeps:** suenan como una nota, pero son 4 compases de esa
nota repetida (cerca de 100 ataques) mientras el filtro se abre y se cierra.
Se pueden usar como frase, o recortarlos para sacar notas sueltas (cada
ataque con el filtro en otra posicion). Decidi vos; recortar implica revisar
a oido donde cortar.

## 4. Notas

**No hay notas sueltas**, asi que no hay notas por confirmar en sentido
estricto. Lo que si trae cada nombre es una letra final de A a G (sin
sostenidos ni octava). La deteccion automatica de altura, donde da
resultado, coincide con esa letra, asi que es la **tonica del loop**
(tonalidad), no una nota exacta:

| Archivo | Letra | Altura detectada |
| --- | :-: | --- |
| Basslines/120bpm/AM_BaStatA_120A.wav | A | A1 (55,0 Hz) |
| Basslines/120bpm/AM_BaStatA_120B.wav | B | B0 (30,9 Hz) |
| Basslines/120bpm/AM_BaStatA_120C.wav | C | C1 (33,3 Hz) |
| Basslines/120bpm/AM_BaStatA_120D.wav | D | D1 (36,4 Hz) |
| Basslines/120bpm/AM_BaStatA_120F.wav | F | F1 (43,4 Hz) |
| Basslines/120bpm/AM_BaStatA_120G.wav | G | G1 (48,4 Hz) |
| One Note Sweeps/120bpm/AM_OneNoteSweepDry_120D.wav | D | D2 (73,6 Hz) |
| One Note Sweeps/120bpm/AM_OneNoteSweepDry_120E.wav | E | E2 (83,1 Hz) |
| One Note Sweeps/128bpm/AM_OneNoteSweepDry_128G.wav | G | G2 (97,1 Hz) |
| High Arps/120bpm/AM_HiTeeb[A]_120A.wav | A | A4 (441 Hz) |
| High Arps/120bpm/AM_HiTeeb[A]_120B.wav | B | B4 (495,5 Hz) |

La octava **esta por confirmar** en todos: el detector da octavas distintas
segun el momento del loop (la 303 con el filtro cerrado engana al detector),
y en varios archivos no encontro altura estable. Si se recortan notas de los
One Note Sweeps, cada una queda "nota por confirmar (tonica <letra>)" hasta
escucharla.

## 5. Problemas

Los puntos 1, 2, 3 y 5 se resolvieron en "Orden aplicado". El 6 ya no
aplica: esos tres archivos son de 120 BPM y quedaron en
`reference/bass-extra/`. Siguen abiertos el 4 (tempos fijos: ahora todo es de
128 BPM) y el 7.

1. **Carpeta `Bass` con mayuscula.** Vite la sirve solo como
   `/samples/Bass/`; `/samples/bass/` devuelve el `index.html` (200
   `text/html`, 461 bytes). En un servidor Linux pasaria lo mismo. Conviene
   renombrarla a `bass`.
2. **5 archivos `.DS_Store`** (uno por carpeta principal). Git ya los ignora
   (`.gitignore`), pero Vite los sirve y `vite build` los copiaria a
   `dist/`. Hay que borrarlos.
3. **Nombres fuera del formato del proyecto:** espacios en las carpetas
   (`Basslines FX`, `High Arps`, `One Note Sweeps`, `One Note Sweeps FX`),
   corchetes (`[alt]`, `[A]`, `[B]`), mayusculas, guiones bajos y el
   prefijo de marca `AM_`. Vite los sirve bien (con y sin codificar la URL),
   pero los corchetes ya dieron problemas con las herramientas: Git Bash no
   convierte rutas que los contienen. En DRUM se uso
   `^[a-z0-9]+(-[a-z0-9]+)*\.wav$`; propongo lo mismo.
4. **Tempos fijos.** Cada loop existe solo a 120, 125, 128 y 132 BPM; la app
   va de 40 a 300. A otro tempo hay que reproducirlo mas rapido o mas lento
   (cambia la altura) o estirarlo en el tiempo (no esta implementado).
   Afecta como se usan, no el inventario.
5. **Peso.** 161 MiB en el repo y unos 234 MiB decodificados si se cargara
   todo. Cargar solo el tempo y la tonalidad en uso lo baja a pocos MiB.
6. **Volumen dispar menor:** tres archivos tienen el pico por debajo del
   resto (-1 dBFS): `Basslines/120bpm/AM_BaStatA_120C.wav` (-3 dBFS),
   `AM_BaStatA_120F.wav` y `AM_BaStatA_120G.wav` (-2 dBFS). Probablemente
   no importa.
7. **Chunks raros:** `JUNK` y `Fake` antes de `data`. Chromium los ignora;
   falta probar Safari y Firefox.

Sin problemas: duplicados (ninguno), silencios largos al comienzo (ninguno),
archivos danados (ninguno).

## Orden aplicado

Hecho el 2026-11-13. Las secciones 1 a 5 de arriba describen los 252
archivos **tal como llegaron**; esto es lo que quedo despues.

### Que se hizo

1. Se borraron los 5 `.DS_Store`.
2. Los loops de 120, 125 y 132 BPM (189 archivos) se movieron, sin borrar ni
   renombrar, a `reference/bass-extra/`, con las carpetas originales
   (`reference/bass-extra/Basslines/120bpm/AM_BaStatA_120A.wav`, etc.). Esa
   carpeta esta en `.gitignore`: queda solo en esta maquina.
3. `public/samples/Bass` paso a ser `public/samples/bass`.
4. Los 63 loops de 128 BPM quedaron en `line`, `line-fx`, `arp`, `sweep` y
   `sweep-fx`, con nombres nuevos. `note` esta vacia.
5. Se genero `public/samples/bass/manifest.json`.
6. Los WAV van a git (no estan ignorados).

Antes y despues se compararon los sha256 de los 252 archivos: el contenido
no cambio en ninguno.

Todavia **no** estan conectados al audio.

### Estructura

```
public/samples/bass/
  manifest.json
  line/       14  frase, 1 compas    (Basslines)
  line-fx/    14  frase, 1 compas    (Basslines FX)
  arp/        14  arpegio, 4 compases (High Arps)
  sweep/       7  frase, 4 compases  (One Note Sweeps)
  sweep-fx/   14  frase, 4 compases  (One Note Sweeps FX)
  note/        0  nota suelta (vacia; tiene un .gitkeep)
```

63 WAV, 42 MiB, todos de 128 BPM. Nombre: `<variante>-<bpm>-<tonica>.wav`,
en minusculas.

### manifest.json

```json
{
  "version": 1,
  "types": ["note", "phrase", "arp"],
  "sets": [
    {
      "id": "line",
      "type": "phrase",
      "files": [
        { "file": "a-128-a.wav", "variant": "a", "bars": 1, "bpm": 128, "key": "A" }
      ]
    },
    { "id": "note", "type": "note", "files": [] }
  ]
}
```

- `type` por juego: `line`, `line-fx`, `sweep` y `sweep-fx` = `phrase`;
  `arp` = `arp`; `note` = `note`.
- Cada archivo lleva `variant`, `bars`, `bpm` y `key` (solo la letra de la
  tonica, en mayuscula; la octava sigue por confirmar).
- `tests/unit/bass-samples-manifest.test.ts` comprueba que el manifiesto
  coincida con las carpetas, que los nombres cumplan el formato y coincidan
  con sus datos, que la duracion sea exactamente `bars` compases a `bpm`, que
  todo sea de 128 BPM y que no queden `.DS_Store`.

### Decisiones tomadas en lo ambiguo

- **Variante de `sweep`:** el original (`AM_OneNoteSweepDry_128A.wav`) no
  tiene variante. Para respetar `<variante>-<bpm>-<tonica>` se uso `dry`, que
  viene del nombre original: `sweep/dry-128-a.wav`.
- **Variantes:** se pasaron a minuscula tal cual (`A`/`B` en line, line-fx y
  arp; `a`/`b` en sweep-fx).
- **`bars` va en cada archivo**, como pediste, aunque es igual en todo un
  juego (1 en line y line-fx, 4 en el resto).
- **`note/` vacia** lleva un `.gitkeep` para que git guarde la carpeta. El
  test lo ignora. Su `files` es `[]`; las notas sueltas se agregan despues
  (recortadas de los sweeps o nuevas) con nombre `<nota><octava>.wav` (`c2`,
  `as1` = A#1) o `nota-1.wav` mientras esten por confirmar.
- **`reference/bass-extra/` conserva los nombres originales**, con espacios y
  corchetes, porque solo pediste moverlos, no renombrarlos.
- **Renombrado de `Bass`:** Windows no dejo renombrar la carpeta (EPERM,
  probablemente OneDrive o el editor la tenian abierta). Se creo la carpeta
  nueva, se movieron los archivos uno por uno y se borro la vieja vacia. El
  resultado es el mismo.

### Nombre viejo -> nombre nuevo

| Nombre viejo (`public/samples/Bass/`) | Nombre nuevo (`public/samples/bass/`) |
| --- | --- |
| Basslines/128bpm/AM_BaStatA_128A.wav | line/a-128-a.wav |
| Basslines/128bpm/AM_BaStatA_128B.wav | line/a-128-b.wav |
| Basslines/128bpm/AM_BaStatA_128C.wav | line/a-128-c.wav |
| Basslines/128bpm/AM_BaStatA_128D.wav | line/a-128-d.wav |
| Basslines/128bpm/AM_BaStatA_128E.wav | line/a-128-e.wav |
| Basslines/128bpm/AM_BaStatA_128F.wav | line/a-128-f.wav |
| Basslines/128bpm/AM_BaStatA_128G.wav | line/a-128-g.wav |
| Basslines/128bpm/AM_BaStatB_128A.wav | line/b-128-a.wav |
| Basslines/128bpm/AM_BaStatB_128B.wav | line/b-128-b.wav |
| Basslines/128bpm/AM_BaStatB_128C.wav | line/b-128-c.wav |
| Basslines/128bpm/AM_BaStatB_128D.wav | line/b-128-d.wav |
| Basslines/128bpm/AM_BaStatB_128E.wav | line/b-128-e.wav |
| Basslines/128bpm/AM_BaStatB_128F.wav | line/b-128-f.wav |
| Basslines/128bpm/AM_BaStatB_128G.wav | line/b-128-g.wav |
| Basslines FX/128bpm/AM_BaStatA[alt]_128A.wav | line-fx/a-128-a.wav |
| Basslines FX/128bpm/AM_BaStatA[alt]_128B.wav | line-fx/a-128-b.wav |
| Basslines FX/128bpm/AM_BaStatA[alt]_128C.wav | line-fx/a-128-c.wav |
| Basslines FX/128bpm/AM_BaStatA[alt]_128D.wav | line-fx/a-128-d.wav |
| Basslines FX/128bpm/AM_BaStatA[alt]_128E.wav | line-fx/a-128-e.wav |
| Basslines FX/128bpm/AM_BaStatA[alt]_128F.wav | line-fx/a-128-f.wav |
| Basslines FX/128bpm/AM_BaStatA[alt]_128G.wav | line-fx/a-128-g.wav |
| Basslines FX/128bpm/AM_BaStatB[alt]_128A.wav | line-fx/b-128-a.wav |
| Basslines FX/128bpm/AM_BaStatB[alt]_128B.wav | line-fx/b-128-b.wav |
| Basslines FX/128bpm/AM_BaStatB[alt]_128C.wav | line-fx/b-128-c.wav |
| Basslines FX/128bpm/AM_BaStatB[alt]_128D.wav | line-fx/b-128-d.wav |
| Basslines FX/128bpm/AM_BaStatB[alt]_128E.wav | line-fx/b-128-e.wav |
| Basslines FX/128bpm/AM_BaStatB[alt]_128F.wav | line-fx/b-128-f.wav |
| Basslines FX/128bpm/AM_BaStatB[alt]_128G.wav | line-fx/b-128-g.wav |
| High Arps/128bpm/AM_HiTeeb[A]_128A.wav | arp/a-128-a.wav |
| High Arps/128bpm/AM_HiTeeb[A]_128B.wav | arp/a-128-b.wav |
| High Arps/128bpm/AM_HiTeeb[A]_128C.wav | arp/a-128-c.wav |
| High Arps/128bpm/AM_HiTeeb[A]_128D.wav | arp/a-128-d.wav |
| High Arps/128bpm/AM_HiTeeb[A]_128E.wav | arp/a-128-e.wav |
| High Arps/128bpm/AM_HiTeeb[A]_128F.wav | arp/a-128-f.wav |
| High Arps/128bpm/AM_HiTeeb[A]_128G.wav | arp/a-128-g.wav |
| High Arps/128bpm/AM_HiTeeb[B]_128A.wav | arp/b-128-a.wav |
| High Arps/128bpm/AM_HiTeeb[B]_128B.wav | arp/b-128-b.wav |
| High Arps/128bpm/AM_HiTeeb[B]_128C.wav | arp/b-128-c.wav |
| High Arps/128bpm/AM_HiTeeb[B]_128D.wav | arp/b-128-d.wav |
| High Arps/128bpm/AM_HiTeeb[B]_128E.wav | arp/b-128-e.wav |
| High Arps/128bpm/AM_HiTeeb[B]_128F.wav | arp/b-128-f.wav |
| High Arps/128bpm/AM_HiTeeb[B]_128G.wav | arp/b-128-g.wav |
| One Note Sweeps/128bpm/AM_OneNoteSweepDry_128A.wav | sweep/dry-128-a.wav |
| One Note Sweeps/128bpm/AM_OneNoteSweepDry_128B.wav | sweep/dry-128-b.wav |
| One Note Sweeps/128bpm/AM_OneNoteSweepDry_128C.wav | sweep/dry-128-c.wav |
| One Note Sweeps/128bpm/AM_OneNoteSweepDry_128D.wav | sweep/dry-128-d.wav |
| One Note Sweeps/128bpm/AM_OneNoteSweepDry_128E.wav | sweep/dry-128-e.wav |
| One Note Sweeps/128bpm/AM_OneNoteSweepDry_128F.wav | sweep/dry-128-f.wav |
| One Note Sweeps/128bpm/AM_OneNoteSweepDry_128G.wav | sweep/dry-128-g.wav |
| One Note Sweeps FX/128bpm/AM_OneNoteSweepFXa_128A.wav | sweep-fx/a-128-a.wav |
| One Note Sweeps FX/128bpm/AM_OneNoteSweepFXa_128B.wav | sweep-fx/a-128-b.wav |
| One Note Sweeps FX/128bpm/AM_OneNoteSweepFXa_128C.wav | sweep-fx/a-128-c.wav |
| One Note Sweeps FX/128bpm/AM_OneNoteSweepFXa_128D.wav | sweep-fx/a-128-d.wav |
| One Note Sweeps FX/128bpm/AM_OneNoteSweepFXa_128E.wav | sweep-fx/a-128-e.wav |
| One Note Sweeps FX/128bpm/AM_OneNoteSweepFXa_128F.wav | sweep-fx/a-128-f.wav |
| One Note Sweeps FX/128bpm/AM_OneNoteSweepFXa_128G.wav | sweep-fx/a-128-g.wav |
| One Note Sweeps FX/128bpm/AM_OneNoteSweepFXb_128A.wav | sweep-fx/b-128-a.wav |
| One Note Sweeps FX/128bpm/AM_OneNoteSweepFXb_128B.wav | sweep-fx/b-128-b.wav |
| One Note Sweeps FX/128bpm/AM_OneNoteSweepFXb_128C.wav | sweep-fx/b-128-c.wav |
| One Note Sweeps FX/128bpm/AM_OneNoteSweepFXb_128D.wav | sweep-fx/b-128-d.wav |
| One Note Sweeps FX/128bpm/AM_OneNoteSweepFXb_128E.wav | sweep-fx/b-128-e.wav |
| One Note Sweeps FX/128bpm/AM_OneNoteSweepFXb_128F.wav | sweep-fx/b-128-f.wav |
| One Note Sweeps FX/128bpm/AM_OneNoteSweepFXb_128G.wav | sweep-fx/b-128-g.wav |
