# Patches: guardar, cargar y compartir (etapa 8)

Un **patch** es la foto completa del lienzo como datos planos: nodos y posiciones,
cables (ruteo y modulacion), patrones de DRUM, BASS, SYNTH y SLICE tal cual,
perillas y teclas de cada nodo, BPM, tonica y escala, kit de DRUM, loop y compas
de SLICE, niveles del MASTER, metronomo. No lleva lo transitorio: si esta sonando,
el cabezal, las notas tocadas en vivo, la seleccion.

## Modulos

| Archivo | Que hace |
| --- | --- |
| `src/core/patch.ts` | Esquema (`Patch`, `v: 1`), validador estricto (`parsePatch`, `parsePatchText`), migracion por version (`migratePatch`, `MIGRATIONS` vacio), nombre de archivo. Nucleo puro. |
| `src/core/patch-link.ts` | Link `#p=<version>.<datos>`: deflate-raw + base64url con `CompressionStream`; formato sin comprimir `#p=1r.<datos>` donde no exista. Limite de 6000 caracteres. |
| `src/state/patch-state.ts` | Estado -> patch (`patchFromState`) y patch -> estado (`stateFromPatch`); que parte del estado es "persistente". |
| `src/state/patch-storage.ts` | Interfaz `PatchStorage` (list, get, save, rename, delete), `IndexedDbPatchStorage`, `MemoryPatchStorage` (respaldo), `LazyPatchStorage`, `openPatchStorage()`. |
| `src/state/patches.ts` | `Patches`: SAVE, LOAD, RENOMBRAR, BORRAR, EXPORT, IMPORT, SHARE, link al abrir, sesion automatica, avisos al display. Sin DOM. |
| `src/state/store.ts` | `loadPatch(patch)`: aplica un patch ya validado en una sola actualizacion de estado. |
| `src/ui/panel/mono-panel.ts` | Seccion PATCH del MASTER (SAVE, LOAD, SHARE, EXPORT, IMPORT), el nombre tipeado en el display, portapapeles, descarga y selector de archivo. |
| `src/ui/panel/mono-patch-list.ts` | La lista de LOAD: nombre, fecha, ABRIR, RENOMBRAR (campo en la fila), BORRAR (pregunta dos veces), CERRAR. |
| `src/ui/patch-files.ts` | Descarga de un archivo y selector de archivo (lo unico con DOM). |
| `src/main.ts` | Al abrir: restaura la sesion; si hay link, lo carga; despues vigila los cambios. |

## Formato

```json
{
  "v": 1,
  "name": "Mi groove",
  "date": "2026-11-14T12:00:00.000Z",
  "bpm": 128,
  "key": { "root": 0, "scale": "pentaMinor" },
  "nodes": ["master", "drum", "bass"],
  "positions": { "drum": { "x": 110, "y": 235 } },
  "params": { "bass": { "cutoff": 0.45, "chaos": 0.2 } },
  "cables": [{ "from": "drum", "to": "master", "cut": false }],
  "drum": { "kit": "samples808", "seed": 1297043023, "pattern": [[[{ "velocity": 0.8, "offset": 0 }], []]] },
  "bass": { "voice": "synth", "seed": 0, "mode": "pulse", "pattern": [], "wave": "saw", "sub": false, "slides": true,
            "slice": { "category": "line", "loop": { "set": "line", "file": "a-128-c.wav" }, "bar": 0, "sync": true,
                       "reverse": false, "mode": "original", "seed": 0, "pattern": [] } },
  "synth": { "seed": 0, "mode": "chords", "preset": "pluck", "pattern": [] },
  "lead": { "octave": 0, "scaleLock": false, "hold": false },
  "drone": { "preset": "drone", "mode": "touch" },
  "distType": "soft",
  "lfo": { "shape": "sine", "sync": false },
  "metronome": { "on": false, "volume": 0.7 }
}
```

- Los patrones se guardan tal cual (no se regeneran). Las semillas viajan para
  que DICE/CAOS sigan siendo reproducibles despues.
- `params` puede ser parcial: una perilla que falta toma su valor por defecto,
  nunca el de la sesion anterior, asi el mismo patch carga siempre igual.
- El archivo exportado es el mismo JSON, con extension `.mono`.

### Migracion

`migratePatch(raw)` lee `v` y aplica `MIGRATIONS[v]` hasta llegar a
`PATCH_VERSION`, una version por vez; cada paso tiene que subir `v` en uno (si no,
error). Hoy `MIGRATIONS` esta vacio porque solo existe la version 1. Un patch sin
version o de una version mas nueva se rechaza. El mecanismo esta testeado con
migraciones inyectadas.

## Validacion (los patches pueden venir de desconocidos)

`parsePatch` construye una copia limpia leyendo cada campo por nombre; nunca copia
claves que no conoce y nunca ejecuta nada del patch.

- **Tipos incorrectos se rechazan** con `PatchError('field', ruta)` (por ejemplo
  `bpm` texto, `key.scale` fuera de la lista, un paso que no es objeto). El
  display dice `PATCH INVALIDO · BPM`.
- **Claves desconocidas se descartan**, incluidas `__proto__`, `constructor` y
  `prototype` (se leen solo propiedades propias y esas tres nunca). Hay un test
  que verifica que `Object.prototype` queda intacto.
- **Numeros recortados** a su rango: BPM 40..300, perillas 0..1, tonica 0..11,
  posiciones dentro del lienzo, octava del LEAD, compas de SLICE 1..4, pedazos
  0..15, notas y largos de los patrones.
- **Textos limitados**: nombre a 40 caracteres sin caracteres de control; ids de
  kit y archivos de loop con un patron estricto (`^[a-z0-9][a-z0-9.-]{0,39}$`,
  asi `../` no pasa).
- **Listas limitadas**: 16 pasos (sobrantes fuera, faltantes rellenos con
  silencio), 3 golpes por paso, 3 notas por acorde, 64 cables.
- **Cables**: solo entre nodos conocidos y presentes, con entrada valida (nada al
  DRUM, nada del MASTER, el LFO nunca al MASTER), sin bucles, sin repetidos.
- **Tamano**: mas de 200 KB de texto se rechaza antes de parsear
  (`parsePatchText`); el link tambien se acota antes de descomprimir.
- **Kits y loops**: si los manifests ya cargaron y el kit o loop no existe, se usa
  el por defecto (`samples808`, `line/a-128-c.wav`) y se avisa en el display
  (`KIT VINYL NO EXISTE · SE USA 808`). Si los manifests todavia no estan (un
  link al abrir la pagina, antes del primer toque), se acepta lo bien formado y
  `Patches` lo vuelve a comprobar cuando llegan.
- **Nunca HTML**: los nombres se muestran como texto por Lit (hay test con
  `<b>` en el nombre).

Un campo que **falta** no es un error: toma su valor por defecto. Un patch
`{"v":1}` carga como el MASTER solo con patrones en silencio.

## Guardar y cargar

- `PatchStorage` es la interfaz; `IndexedDbPatchStorage` guarda en la base `mono`,
  store `patches`, registros `{ id, name, date, patch }`. Si IndexedDB falla
  (navegacion privada, navegador sin soporte), `openPatchStorage()` cae a
  `MemoryPatchStorage` y el display avisa una vez
  `SIN ALMACENAMIENTO · NO SE VA A CONSERVAR` en el primer cambio; la lista de LOAD
  marca `SOLO EN ESTA SESION`.
- **Sesion automatica:** `Patches.watch()` mira el store y, un segundo despues del
  ultimo cambio que un patch guardaria (no el cabezal ni el estado del audio),
  guarda en la ranura `session` con nombre "Ultima sesion". Al abrir sin link se
  restaura, detenida, con el aviso `SESION RESTAURADA · TOCA PLAY PARA SEGUIR`.
  La ranura no aparece en la lista de LOAD.
- **Panel MASTER, seccion PATCH** (entre CLICK y MACRO, cinco teclas en 3+2):
  - **SAVE**: el display se vuelve un campo de texto (como el BPM del zocalo):
    Enter guarda, Escape o salir cancela; vacio toma "Patch N". Display:
    `GUARDADO · nombre`.
  - **LOAD**: la zona del tempo se reemplaza por la lista (LED encendido mientras
    esta abierta): nombre, fecha corta, ABRIR, RENOMBRAR (campo en la misma fila,
    Enter confirma) y BORRAR (la primera vez pasa a `¿BORRAR?`, la segunda borra).
    CERRAR vuelve al tempo. La lista hace scroll interno.
  - **SHARE**: ver abajo.
  - **EXPORT**: baja `<nombre>.mono` (nombre sugerido "Patch N").
  - **IMPORT**: abre el selector de archivos; mas de 200 KB se rechaza sin leer;
    el resto pasa por `parsePatchText`.
- **Aplicar un patch** (`store.loadPatch`): una sola actualizacion de estado con
  la parte persistente nueva y la transitoria de la sesion (sigue sonando o
  detenido como estaba). Las generaciones de DRUM, BASS, SLICE y SYNTH suben, asi
  el backend trata los patrones como regenerados y todo lo estructural (nodos,
  cables, kit, loop, patrones) entra en el proximo compas con las voces liberadas
  como siempre. Los samples se cargan de forma perezosa como antes y el display
  muestra `CARGANDO` / `FALTA` por nodo.

## Compartir por link

- `encodePatchLink`: JSON -> UTF-8 -> deflate-raw (`CompressionStream`) ->
  base64url -> `#p=1.<datos>`. Sin `CompressionStream`: `#p=1r.<datos>` con el
  JSON en base64url. Un patch con 5 nodos y patrones generados ocupa ~1,5 KB
  comprimido.
- SHARE copia la URL completa al portapapeles y el display dice `LINK COPIADO`.
  Si el portapapeles falla (permiso), el link se pone en la barra de direcciones
  (`location.hash`) y el display dice `LINK EN LA BARRA DE DIRECCIONES`.
- Mas de 6000 caracteres: `LINK DEMASIADO LARGO · USA EXPORT` y no se copia nada.
- **Al abrir con link:** primero se restaura la sesion anterior; si no es el
  inicio vacio se guarda en la lista como "Antes del link"; despues el patch del
  link se carga **sin arrancar el sonido** (no hay AudioContext hasta el primer
  toque; test que cuenta los AudioContext creados) y el display dice
  `PATCH LISTO · TOCA PLAY O UN CONTROL PARA EMPEZAR`. El hash se quita de la URL
  con `history.replaceState` para que recargar no lo vuelva a cargar.
- Link danado (base64 roto, deflate roto, version desconocida, tipos mal): el
  display dice `LINK DAÑADO · SE MANTUVO LA SESION` y no cambia nada.
- Un link pegado en la **misma pestaña** (solo cambia el hash, la pagina no se
  recarga) tambien se carga, por `hashchange`, con el mismo flujo.

## Decisiones tomadas en lo ambiguo

- **Una accion `loadPatch` en vez de reproducir las acciones una por una.** Las
  acciones existentes no sirven para esto sin efectos no deseados (`addNode`
  arranca la reproduccion, los pasos se editan de a uno). `loadPatch` pasa por la
  misma `update()` que todas las acciones, asi audio-link manda una escena y el
  backend aplica lo estructural en el proximo compas, igual que siempre.
- **Campos faltantes = valor por defecto; tipos incorrectos = rechazo.** Un patch
  parcial sirve (y es lo que permite links y archivos escritos a mano); uno con
  basura en un campo se rechaza entero, como pediste.
- **Los patches guardados se vuelven a validar al cargarlos** (por si un kit o
  loop desaparecio entre versiones).
- **"Antes del link" no se guarda si la sesion es el inicio vacio** (solo MASTER,
  nada tocado), para no llenar la lista.
- **La ranura de sesion no se lista**: es automatica; renombrarla o borrarla no
  tendria sentido.
- **SHARE y EXPORT usan el nombre sugerido** ("Patch N") sin preguntar: el nombre
  viaja dentro del patch y se puede renombrar despues.
- **El formato sin comprimir lleva `r` en la version** (`1r`), como marca de
  "raw".
- **El estado restaurado arranca detenido** aunque estuviera sonando al cerrar:
  no hay gesto del usuario todavia, y el aviso invita a tocar PLAY.
- **`docs/LAYOUT.md` no existe**; la lista de LOAD hace scroll interno y las
  teclas de PATCH van en 3+2 para no alargar la fila.
- **Paridad:** la seccion PATCH se oculta (`display: none`) en las capturas
  `initial` y `panel-master-all-nodes`, como el nivel LEAD (desviacion 16).

## Pendiente o conocido

- Sin escenas, sin links cortos con servidor, sin cuentas ni nube (solo la
  interfaz `PatchStorage` lista para otra implementacion).
- Si dos pestañas de la app estan abiertas, las dos escriben la misma ranura de
  sesion: gana la ultima que cambio algo.
- Probado en Chromium (desarrollo y build). Safari y Firefox, no. En Safari
  `CompressionStream` existe desde 16.4; antes caeria al formato `1r`.

## Tests

- `tests/unit/patch.test.ts`: ida y vuelta estado -> patch -> estado (sin
  generaciones), patrones tal cual, lo transitorio intacto, perillas faltantes a
  default; el validador contra basura (tipos, claves peligrosas, recortes, limites
  de listas y patrones, cables invalidos, kits y loops inexistentes, 200 KB,
  texto no JSON); migracion (paso a paso, huecos, version nueva); nombre de archivo.
- `tests/unit/patch-link.test.ts`: base64url, codificacion y decodificacion,
  URL completa, formato `1r`, tamano del link, links rotos.
- `tests/unit/patches.test.ts`: almacenamiento en memoria; `Patches`: guardar,
  listar, cargar, renombrar, borrar, sesion automatica con retraso de 1 s (y no
  por el cabezal), restaurar, aviso sin almacenamiento, exportar e importar,
  basura al importar, kits y loops faltantes (al importar y cuando llegan los
  manifests), SHARE y link largo, link sobre una sesion ("Antes del link"), link
  sobre sesion vacia, link roto, patch guardado con kit viejo.
- `tests/e2e/patches.spec.ts`: guardar, recargar (la sesion vuelve detenida),
  LOAD, renombrar y borrar; SHARE y abrir el link en otro contexto con el mismo
  estado, sin AudioContext hasta tocar PLAY; link danado y "Antes del link";
  IMPORT de archivos danados y de uno valido con `<b>` en el nombre.
- `tests/e2e/parity.spec.ts`: desviacion 16 (seccion PATCH oculta en las dos
  capturas del MASTER).
