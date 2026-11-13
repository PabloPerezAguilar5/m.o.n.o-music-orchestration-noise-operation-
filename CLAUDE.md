# M.O.N.O. (music orchestration & noise operation)

App web de musica en vivo, electronica y experimental. Lienzo de nodos
conectados por cables (arriba) + panel de hardware del nodo seleccionado
(abajo). Solo web, horizontal, sin PWA, sin backend.

## Referencias (solo lectura, NO modificar)
- reference/prototype/mono.html: fuente de verdad visual y de interaccion.
- reference/fck-synth (clon de PabloPerezAguilar5/fck-synth): DrumEngine
  (reloj con lookahead), SynthPadEngine, generacion de bajo con semilla,
  escalas.
- reference/m.o.n.o-studio (clon de PabloPerezAguilar5/m.o.n.o-studio):
  generadores con semilla, nucleo separado del audio, transacciones en
  vivo, kits de samples.
Reutilizar la logica; descartar React y Tone.js.

## Decisiones permanentes
- TypeScript estricto + Vite. SIN React. Paneles con Lit (Web Components),
  lienzo en SVG, visualizadores en Canvas (WebGPU mas adelante).
- Audio: Web Audio API + AudioWorklet. DSP pesado en Rust/WebAssembly por
  etapas, nodo por nodo. Nada de Tone.js.
- Nucleo musical (src/core) en TypeScript puro: sin DOM, sin Web Audio.
- Un solo reloj con lookahead contra AudioContext.currentTime. Nunca
  setInterval como reloj musical.
- Grafo de audio dinamico: cada nodo expone entrada y salida; cada cable
  es una conexion real que se crea y corta en vivo sin cortar el sonido.
- Cambios estructurales entran en el proximo compas.
- Generacion con semilla reproducible (random, riot, evolve, minimal,
  dense, human, glitch, euclid).
- Samples propios solo para DRUM; el resto se sintetiza por codigo.
- Maximo 7 nodos, uno por tipo: SYNTH, DRUM, BASS, DRONE/NOISE,
  DISTORSION, LFO, LEAD. MASTER fijo en el centro. Nodos arrastrables.
- Al agregar un nodo, la reproduccion arranca sola. Todo suena solo,
  salvo LEAD (en vivo) y el pad de DRONE.

## Estetica (no negociable)
- Fondo #1B1B2A. Colores: synth #00FFB3, drum #FF007A, bass #A700FF,
  drone #FF4500, distorsion #FFEA00, lfo #CFCFE6, lead #00E5FF,
  master #EDEDF7.
- Lienzo en monocromo: nodos grises, se encienden con su color al sonar.
- Panel tipo hardware TR-909: chasis crema, perillas negras, cabeceras
  oscuras, pasos numerados con LED, display. El color del nodo solo en
  el marco de neon, cabeceras, LEDs y display. Controles grandes.
- Evitar el look generico de IA: nada de tarjetas redondeadas con sombra
  gris, ni librerias de componentes por defecto.

## Convenciones
- Codigo e identificadores en ingles; textos de interfaz en espanol.
- Un modulo = una responsabilidad. Interfaz AudioBackend para desacoplar.
- Tests con Vitest (nucleo y generadores) y Playwright (interaccion).
- Commits pequenos, uno por etapa. Antes de cada etapa: plan y espera
  mi aprobacion.
- Probar en navegador real antes de dar algo por terminado.

## Commits
No agregues lineas "Co-Authored-By" ni "Claude-Session" ni ninguna otra
atribucion a las herramientas en los mensajes de commit ni en los PR.
