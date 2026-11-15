# Pantallas de poca altura (etapa 9)

Un telefono de costado (844x390, hasta 360 px de alto) no tiene lugar para el
panel de hardware completo debajo del lienzo. Por debajo de **600 px de alto**
(`@media (max-height: 600px)`, constante `SHORT_SCREEN_QUERY` en
`src/ui/styles/shared.ts`; `global.css` repite la misma consulta) el layout cambia.
**En pantallas mas altas no cambia nada**: el test de paridad con el prototipo
sigue pasando a 1280x720 y `short-screen.spec.ts` lo verifica.

## Que cambia debajo de 600 px

| Pieza | Pantalla alta | Pantalla baja |
| --- | --- | --- |
| Lienzo y panel | Lienzo 1.1 : panel 1 | Lienzo = 27 % del alto (minimo 88 px), el panel el resto (minimo 150 px) |
| Divisor | No existe | Entre ambos. Se arrastra (puntero) o con flechas arriba y abajo (teclado, 3 % por toque). Se recuerda en `localStorage` (clave `mono.stage-share`); si el almacenamiento esta bloqueado, vale para esa visita |
| Perillas | Fila sobre la zona | **Columna lateral** de 222 px a la izquierda de la zona, con scroll vertical propio. Las secciones de dos perillas van de a dos por fila |
| Zona (grilla, teclado, pad, lista) | Debajo de las perillas | Al lado de la columna, con scroll vertical propio |
| Perillas y teclas | 30 a 48 px (`--ks`) | `--ks` = 44 px; el MACRO 48 px; teclas de 44 px minimo |
| Grupos de teclas (KIT, MODO, SONIDO, OSC...) | Una fila o rejilla chica | Rejilla de 2 o 3 columnas, filas de 44 px |
| Cabecera | Placa, display, franja | Sin franja; la X de quitar tiene el area tactil de 44 px (pseudo-elemento) |

El tablero (`.plate`) pasa a un color liso en pantalla baja, para que las sombras
que avisan "hay mas abajo / arriba" en cada zona con scroll se fundan con el fondo.
Ademas de la barra, esas sombras se ven aunque la pantalla tactil oculte la barra
hasta que se la usa.

## Cada panel a 844x390 (y 740x360)

Todos se ven completos o con scroll interno, sin cortar una fila a la mitad
(`tests/e2e/short-screen.spec.ts` lo comprueba para MASTER con su lista de patches,
DRUM, BASS en SYNTH y en SLICE, SYNTH, LEAD, DRONE, DISTORSION y LFO):

- **Con scroll vertical interno**: la columna de perillas de todos los nodos con muchas
  secciones (DRUM, BASS, SYNTH, MASTER...); la grilla de SYNTH (11 filas) y de BASS;
  la zona de SLICE (lista de loops, onda y pasos); la lista de LOAD.
- **Su zona entra sin scroll**: LEAD (teclado), DRONE (pad), DISTORSION (tres teclas), LFO
  (pantalla de la onda) y la grilla de DRUM. La columna de perillas de cada uno si puede
  scrollear.

## Decisiones donde el enunciado era ambiguo

1. **Teclas de la grilla de pasos y piezas de la onda de SLICE: menos de 44 px.** Son
   16 columnas; a 844 px de ancho, con la columna de perillas, cada una mide unos
   33 px de ancho. Alto: 34 px (28 px con mas de 8 filas, SYNTH). Todo lo demas
   (perillas, teclas, teclas del teclado, items de lista, botones del tempo, play,
   +, chips del menu) mide 44 px o mas. Si hiciera falta 44 px tambien en los pasos,
   la grilla de SYNTH pasaria a 11 x 44 px de alto y habria que desplazarse mas.
2. **La X de quitar nodo se ve de 26x22 px** (igual que en pantalla alta) pero responde
   en un area de 44x44 px.
3. **"Pantalla baja" se decide por el alto de la ventana** (600 px), no por el ancho ni
   por el dispositivo: una ventana de escritorio baja tambien usa este layout. 600 px
   deja a 720 px (el caso de referencia) fuera con mucho margen.
4. **El panel exige 150 px y el lienzo 88 px**; con 360 px de alto queda lugar para
   ambos. Por debajo de unos 280 px de alto no cabe todo y la pagina no scrollea: no
   es un caso soportado.
5. **El divisor recuerda su posicion**: el almacenamiento puede fallar (ventana privada)
   y no pasa nada.
6. **Aviso de audio** (`docs/COMPAT.md`): el display de MASTER lo muestra siempre; el
   de un nodo, solo si ese nodo depende de lo que falta (AudioWorklet): SYNTH, LEAD,
   DISTORSION, LFO y BASS en voz SYNTH. DRUM, DRONE y BASS en SLICE no lo necesitan y
   siguen mostrando lo suyo.

## Test de paridad

`tests/e2e/parity.spec.ts`, caso 17: a 844x390 ya no se comparan pixeles con el
prototipo (el layout cambio a proposito, ver arriba). Sigue recorriendo los mismos
estados en ese tamano, y `short-screen.spec.ts` verifica el layout. A 1280x720 no
cambio ningun estado.
