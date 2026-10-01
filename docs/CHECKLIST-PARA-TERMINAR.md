# Checklist para terminar

Actualizado: 2026-10-01 · Publicado: POS **0.1.73** · Servidor **0.21.0**

Todo lo que queda por probar y por afinar, con qué bloquea cada cosa.

**Qué quiere decir "terminar":** que el sistema se pueda instalar y operar en un
comercio nuevo **sin que estemos nosotros al lado**. Con esa vara, la lista de
abajo se ordena sola.

**Lo que no se puede terminar sin ayuda de afuera:** los cuatro puntos de
hardware (térmica, cajón, balanza, lector) y la verificación en producción de la
Factura A y B, que necesita un CUIT de Responsable Inscripto. Todo lo demás
depende sólo de nosotros.

---

## 1 · Lo que sigue — POS 0.1.73 + Servidor 0.21.0

> **EL CIRCUITO DE ARCA ESTÁ CERRADO Y VERIFICADO EN CAMPO** (1/10/2026, trece
> vueltas, un mes). Emisión con CAE y QR, Factura A y B, notas de crédito y
> débito, exentos, Transparencia Fiscal en su lugar, original y duplicado
> idénticos, y la venta sin internet. **No queda nada nuestro por hacer.** Lo
> único que falta **no depende de nosotros**: un CUIT de Responsable Inscripto
> para probarlo en producción y no en homologación.
>
> Lo siguiente en la lista ya es otra cosa: el **bloqueo por falta de pago**,
> que nunca se probó y es lo que traba cobrar la suscripción, y el **hardware**
> cuando haya térmica.

### Lo que la decimotercera vuelta (1/10) dejó cerrado

- **El bloque de Transparencia Fiscal, al pie izquierdo**, como pide la
  RG 5614/2024. Verificado en el A4 de una Factura B.
- **Se pueden imprimir los dos formatos de la misma venta**: ticket ORIGINAL +
  A4 DUPLICADO, con el mismo CAE y el mismo número. Y el A4 solo sigue saliendo
  ORIGINAL.
- **Sin regresiones**: el exento, F4 y el foco, las ventas suben con CAE.

**Una falsa alarma que vale anotar.** Seba reportó que "los comprobantes tipo A
siguen con el recuadro de transparencia fiscal abajo a la derecha". Lo que está
viendo es el bloque de **totales** (Subtotal neto / Exento / IVA / TOTAL), que
va a la derecha y así corresponde. **La Factura A no lleva recuadro de
transparencia**, y es a propósito (`transparenciaFiscal()` sólo para la letra
B). Pero si no es obvio para quien prueba el sistema todos los días, tampoco lo
va a ser para un inspector: quedó agregado como cuarta pregunta en
`docs/CONSULTA-AL-CONTADOR.md`.

### Lo que la duodécima vuelta (30/9) dejó cerrado

- **EL EXENTO, DE PUNTA A PUNTA.** La A de puros exentos sale con "Subtotal neto
  $ 0,00" y "Exento $ 1.450,00" en los cuatro casos: ticket chico, A4, original
  y duplicado. Cuatro vueltas.
- **El foco vuelve solo al buscador** al cancelar una pregunta. Seba: _"Perfecto"_.
- Sin regresiones: la B con Transparencia Fiscal, las ventas suben y tienen CAE.

### Lo que la duodécima vuelta destapó

- [ ] **Correr `docs/PRUEBA-DECIMOTERCERA-VUELTA.txt`.** 5 minutos, sólo POS.

- [x] **El bloque de Transparencia Fiscal estaba del lado equivocado.** La
      RG 5614/2024 no sólo fija qué datos lleva el comprobante sino **dónde**:
      el inciso g) los pone "en el espacio inferior **izquierdo**". Nuestro A4
      lo imprimía abajo a la derecha. _Salió del relevamiento para el contador,
      no de una prueba de campo: los tres datos estaban y en el orden correcto,
      así que desde afuera se veía bien._

- [x] **Elegido un formato, no había forma de sacar el otro.** Seba: _"si quiero
      imprimir también en A4 debo ir a Comprobantes y traer el duplicado
      solamente"_ — para darnos las dos versiones tuvo que volver a vender.
      _Hay una opción "Los dos": el ticket sale ORIGINAL y el A4 DUPLICADO, que
      es lo que corresponde — el original es uno solo, el que se lleva el
      cliente._

### Lo que la undécima vuelta (29/9) dejó cerrado

- **EL EXENTO ENTRÓ.** _"Catálogo al día (27 productos)"_. Cuatro vueltas.
- **La Factura A mixta sale bien y su duplicado es idéntico.** Seba:
  _"Idénticos ambos"_. Subtotal neto 8.264,46 + Exento 1.450,00 + IVA 1.735,54
  = 11.450,00, y los renglones suman 9.714,46.
- **El ticket chico original y su duplicado también coinciden.**
- **F4 pregunta**, el separador de miles anda (_"Perfecto!"_), las
  confirmaciones de gestión preguntan, y el F12 ya no está.

### Lo que la undécima vuelta destapó

- [ ] **Correr `docs/PRUEBA-DUODECIMA-VUELTA.txt`.** 10 minutos, sólo POS.

- [x] **La Factura A de PUROS exentos salía sin el bloque de totales.** Ni
      "Subtotal neto" ni el renglón "Exento": sólo los renglones y el TOTAL. El
      que la recibe no tenía cómo saber que la operación era exenta.
      _`subtotalNeto()` devolvía `null` cuando no quedaba ningún renglón
      gravado, y ese `null` gobierna el bloque entero en los tres renderers.
      Tercera vez con la misma confusión —"no hay nada que sumar" tratado como
      "no se sabe"— y **el test lo fijaba al revés** (apéndice de ADR-0084)._

- [x] **Al cancelar una pregunta, el foco no volvía al buscador.** Había que
      llevarlo con el mouse, en una pantalla que se opera con el teclado.
      _Lo devuelve `Dialogos.tsx`, antes de resolver la promesa, y la caja lo
      manda siempre al buscador._

- [ ] **El duplicado no muestra el vuelto.** Sigue pendiente: el servidor no lo
      guarda. Columna nueva + payload + DTO.

- [ ] **"Microsoft Print to PDF" desde el POS.** Bajado de prioridad por Seba;
      se mira con las pruebas de térmica.

### Lo que la décima vuelta (26/9) dejó cerrado

- **La Factura A imprime los renglones sin IVA** y la suma cierra sola.
  Verificado por Seba: 1.450,00 + 8.264,46 = 9.714,46 (ADR-0083).
- **La Transparencia Fiscal anda en la B.** IVA Contenido $ 286,36 sobre un
  aceite de $ 1.650 al 21%.
- **El tilde de "Venta registrada" quedó claro.** Seba: _"Perfecto!"_.
- **Los pagos, el medio de pago y el lector** siguen bien desde la novena.

### Lo que la décima vuelta destapó

- [ ] **Correr `docs/PRUEBA-UNDECIMA-VUELTA.txt`.** 15 minutos.

- [x] **EL EXENTO: RESUELTO A LA CUARTA.** El botón Sincronizar de 0.1.69
      finalmente lo dijo: `NOT NULL constraint failed: articulo.alicuota_iva`.
      La columna se creó `NOT NULL` y desde el 16/9 el código escribe `NULL`
      para los exentos. Como el volcado corre en una sola transacción, el
      primer exento hacía `ROLLBACK` de todo: **no fallaba el exento, no
      entraba nada**. De ahí que se viera como "el catálogo no baja".
      _Migración de SQLite que recrea las dos tablas, condicional y con las FK
      chequeadas (ADR-0084). Una base nueva nunca lo tuvo; la de Seba sí._

- [ ] **Confirmar en campo que el catálogo ya baja.** Es el paso 2 de la
      prueba, y es el que cierra tres vueltas de pruebas perdidas.

- [x] **El papel y ARCA decían cosas distintas.** Lo destapó comparar el
      original y el duplicado de la MISMA Factura A: el original imprimió
      "IVA 0%" sobre el arroz y el duplicado "Exento". El POS imprimía con su
      catálogo y el servidor declaraba con el suyo.
      _Ahora el POS manda la alícuota que imprimió y el servidor declara ésa
      (ADR-0084). El catálogo del servidor queda de respaldo, y si difieren
      queda un warning en el log._

- [ ] **Confirmar que el duplicado salga igual que el original.** No sólo los
      números: encabezados, tipografía e interlineado. Las hojas se
      renderizaban adentro de la pantalla que las imprimía y heredaban su CSS
      —`.gestion th { text-transform: uppercase }`—, así que Comprobantes
      imprimía distinto que la caja. _Ahora van por un portal a `<body>`._

- [x] **F4 no hacía nada.** Segunda ronda seguida con el mismo botón roto: el
      22/9 vaciaba la caja sin preguntar, el 26/9 no hacía absolutamente nada.
      _El diálogo del webview de Tauri no se puede usar; ahora lo dibuja la app.
      De paso se arreglaron los **diez** `window.confirm` de los módulos de
      gestión, que venían ejecutándose sin preguntar._

- [x] **Separador de miles al tipear el importe.** Seba puso $ 20.000 donde
      quería $ 2.000. _El campo agrupa los miles a medida que entran los
      dígitos, con el cursor en su lugar._

- [x] **Se sacó el atajo F12.** Lo pidió dos rondas seguidas.

- [ ] **El duplicado no muestra el vuelto.** El servidor no lo guarda, así que
      la reimpresión lo pone en cero. El original sí lo muestra, y difieren.
      _Arreglarlo es una columna nueva en la venta, el payload de sync y el
      DTO. No es grave —el vuelto no es un dato fiscal— pero el papel tiene que
      decir lo mismo las dos veces._

- [ ] **"Microsoft Print to PDF" dejó de funcionar** desde el POS (no desde
      otros programas). La pantalla de impresión aparece, se elige, y el
      archivo no se guarda ni avisa nada. Con "Guardar como PDF" anda.
      _Seba lo bajó de prioridad: se mira junto con las pruebas de térmica.
      Sospecha: el `afterprint` limpia la hoja antes de que ese driver termine
      de generar el archivo._

---

## 2 · Cumplimiento normativo — barrido del 17/9/2026

Se revisó qué más tiene que cumplir un POS que factura en Argentina, además de
emitir con CAE. Lo que sigue es el resultado.

**Ya cumplimos** (verificado en el código, no de memoria): factura electrónica
con CAE por WSFEv1; QR fiscal (RG 4892/2020); condición de IVA del receptor en
el comprobante y en el web service (RG 5616/2024, rechazo automático desde el
1/7/2025); comprobantes asociados en notas de crédito y débito; ORIGINAL y
DUPLICADO; Transparencia Fiscal al Consumidor (Ley 27.743, desde 0.1.65).

**Falsa alarma, y es una buena noticia:** desde la RG 4290/2018 un comercio
minorista puede **elegir** entre controlador fiscal y factura electrónica. No
necesitamos homologar nada ni competir contra el controlador: nuestros clientes
pueden usarnos legalmente. Era la duda más cara de todas.

- [ ] **Verificar en campo la Transparencia Fiscal.** El original de la
      Factura B salió perfecto el 18/9 y el IVA contenido da bien. Falta
      cerrarlo con la reimpresión de una B de puros exentos, que es lo que se
      corrigió en 0.1.68.

- [ ] **Verificar que el débito no cobre recargo.** Hecho el 17/9 (ADR-0080):
      el servidor lo rechaza, el formulario lo avisa al elegir el tipo, y **la
      caja ignora cualquier recargo de débito que haya quedado guardado de
      antes** — que era la parte que importaba, porque si no el arreglo quedaba
      esperando a que alguien entrara a editar la tarjeta.
      _Prueba de un minuto: configurar un débito, ver que no deje poner recargo
      ni cuotas, y cobrar con él._

- [ ] **Ingresos Brutos en el comprobante.** El mismo régimen de transparencia,
      pero provincial: hay que informar la **alícuota** de IIBB (no el importe)
      en los comprobantes a consumidor final. **CABA lo posterga al 1/1/2027**
      (Res. AGIP 339/2026); Entre Ríos y Chubut avanzaron con cronogramas
      propios; Mendoza y Santa Fe adhirieron sin reglamentar; el resto no se
      movió. **Formosa no lo implementó**, así que no bloquea a LAGUS.
      _El problema de diseño es que cada provincia pide algo distinto: la
      alícuota tiene que ser configuración por sucursal, no una constante._

- [ ] **Factura de Crédito Electrónica MiPyME (Ley 27.440).** Si una MiPyME le
      factura a una empresa grande por más de **$5.549.862** (valor desde el
      14/4/2026, se actualiza), corresponde emitir una FCE y no una Factura A
      común. No lo soportamos.
      _No bloquea a un comercio minorista. Sí bloquearía a una distribuidora,
      que es justamente el perfil del CUIT con el que probamos._

- [ ] **Libro IVA Digital (RG 4597).** Es obligación del comercio, no nuestra,
      pero hoy no exportamos nada con ese formato: el contador tiene que
      rearmarlo. Es la clase de fricción por la que un comercio cambia de
      sistema.

- [ ] **Precios en cuotas: precio de contado y CFT.** Si el comercio financia,
      tiene que exhibir el precio de contado, la cantidad y el valor de cada
      cuota y el costo financiero total (Res. 4/2025 y Ley 24.240). Nosotros
      aplicamos el recargo por cuotas y lo imprimimos, pero **no mostramos el
      CFT ni el precio de contado**. Aplica sobre todo a la exhibición y la
      publicidad, no tanto al ticket — conviene confirmarlo con el contador.

- [ ] **Datos personales (Ley 25.326).** Guardamos clientes con nombre, CUIT o
      DNI y domicilio, y los alojamos nosotros. La ley exige inscribir la base
      en el registro de la AAIP y tener medidas de seguridad documentadas.
      _No es técnico y es de NexoSoft, no del comercio. Va junto con el contrato
      de licencias, que ya está pendiente._

---

## 3 · Factura A y B — lo que queda después

- [ ] **Verificar en campo la Transparencia Fiscal (Ley 27.743).** Hecho el
      17/9 (ADR-0079): la Factura B sale con la leyenda del régimen, el **IVA
      Contenido** y **Otros Impuestos Nacionales Indirectos**, más la aclaración
      de que son sólo los nacionales. Rige desde el 1/4/2025 y no lo
      cumplíamos. De paso se corrigió que la térmica discriminara el IVA por
      alícuota en una B, que el A4 no hacía.
      _Falta mirar un PDF: el IVA contenido tiene que coincidir con el IVA que
      se le declaró a ARCA._

- [ ] **Preguntarle al contador por los impuestos internos.** Hoy el renglón va
      en **$0,00**, que es lo que imprime un supermercado real y la lectura
      literal de la norma: los internos son de etapa única y un comercio que
      revende no es sujeto pasivo. La norma **no resuelve** el caso del
      revendedor —los tributaristas se lo están reclamando a ARCA— así que
      conviene tenerlo confirmado por escrito.
      _Si dijera que hay que estimarlo, necesitamos que diga con qué criterio:
      inventarlo nosotros no es una opción._
      _El campo `otrosImpuestosNacionales` ya existe, para el día que le
      vendamos a alguien que sí los liquida. Ese caso además tiene que mandar
      el importe a ARCA en `Tributos`, que es trabajo de servidor._

- [ ] **Conseguir un CUIT de Responsable Inscripto.** Es lo único que separa a
      la A y la B de estar verificadas **en producción**. Con el CUIT de Seba
      —Monotributo en el padrón— se prueba el circuito pero no se emite de
      verdad.
      _Decisión tuya, no es técnico._

---

## 4 · Pruebas de campo pendientes

- [ ] **Bloqueo por falta de pago.** `docs/PRUEBA-SUSCRIPCION-SOCIO.txt`.
      **Nunca se probó.** Hay que ver que durante el bloqueo sigan andando
      **cerrar la caja, Reportes y Comprobantes**: un comercio bloqueado tiene
      que poder cerrar el día y sacar sus números, aunque no pueda vender.
      _Bloquea: cobrar la suscripción. Es el modelo de negocio._

---

## 5 · Hardware — no depende de nosotros

Implementado y con tests, nunca visto sobre el fierro.

- [ ] **QR fiscal en impresora térmica** (desde POS 0.1.42). Lo verificado es el
      mapa de bits y el comando ESC/POS, no el papel. Prueba de dos minutos
      cuando haya térmica: vender y escanear.
- [ ] **Cajón de dinero.** Manda el pulso `ESC p` por el RJ11 de la impresora.
      Sale junto con la térmica.
- [ ] **Balanza.** **No hay adaptador real**, sólo el mock (ADR-0018). Falta un
      plugin Tauri para RS-232 y el parser de la trama, que depende de la marca.
      ❓ _¿LAGUS vende por peso?_
- [ ] **Lector de código de barras.** Si es **HID** ya anda; si es **serial**,
      falta el plugin del puerto COM. ❓ _¿Cuál usa LAGUS?_

---

## 6 · Antes de instalar en un comercio nuevo

- [ ] **Reescribir el instructivo de instalación.** El que hay
      (`docs/INSTRUCTIVO-INSTALACION.txt`) es del **27/08**, anterior a todo lo
      de ARCA, el antivirus, el certificado y las Facturas A/B.
      Tiene que decir, además, que el certificado es **por entorno**: si el alta
      se prueba en homologación y después pasa a producción, son dos trámites
      con el mismo `.csr` (ADR-0071).
      _Bloquea: que instale alguien que no seamos nosotros. O sea, bloquea vender._

- [ ] **Instalación en Program Files en vez de AppData.** Frenado por riesgo de
      doble instalación. Hay que probarlo en una PC de descarte.
      _Ganancia: le saca peso a una de las señales que hicieron que Defender se
      comiera el POS._

- [ ] **Dejar por escrito qué hacemos con la firma de código.** Ya está decidido
      no gastar ahora. Falta aceptar el costo por escrito: cada alta lleva un
      paso manual y cada actualización es una tirada de dados con el antivirus.

---

## 7 · Escala — no bloquea al primer cliente, sí al número cincuenta

- [ ] **Alerta de vencimiento de certificados.** El dato ya existe
      (`diasParaVencer`); falta que alguien lo mire de forma centralizada. Hoy
      el servidor es por sucursal y nadie va a mirar cincuenta tableros.
      _Un certificado de ARCA dura 2 años: con 50 clientes son 50 bombas de
      tiempo silenciosas._
- [ ] **Licencias: la parte legal.** Lo técnico está hecho. Falta el contrato y
      el límite por sucursal.
- [ ] **Multisucursal.** Postergado a propósito; el rumbo ya está elegido.

---

## 8 · Deuda conocida — anotada para que no se pierda

- [ ] **El umbral de $10.000.000** (RG 5700/2025) no está implementado: hoy se
      puede emitir una B por cualquier monto sin identificar al comprador.
      Falta decidir si al superarlo se **bloquea** o se **avisa**.
      _Recomendación: avisar. Frenar una venta por un tema formal, con el cliente
      adelante, es peor que emitirla y corregirla._
- [ ] **Elegir la alícuota de una Nota de Débito.** Hoy va siempre al 21% en A y
      B. Si hace falta elegirla, el concepto tendría que venir con su tasa.
- [ ] **Nota de Crédito parcial.** Hoy anular es por el total. Devolver un solo
      producto de una venta de diez no se puede.
- [ ] **El CAE se pide ANTES de abrir la transacción** (`ventas.service.ts`).
      Con el arreglo de ADR-0072 la colisión de número ya no puede pasar, pero
      cualquier otra falla del `INSERT` entre el CAE y el commit deja lo mismo:
      un comprobante autorizado en ARCA que no existe en nuestra base. Hoy al
      menos queda registrado como discrepancia fiscal, con el número y el CAE.
      _Arreglarlo de verdad implica reservar la fila antes de hablar con ARCA,
      o poder anular ante ARCA lo que no se pudo guardar. Ninguna es chica._
- [ ] **Cachear el último número de comprobante** para sacarle un viaje a ARCA
      por venta (ADR-0061). No se hizo a propósito.
- [ ] **ADR-0018 quedó viejo:** dice que falta el plugin de impresora ESC/POS y
      está hecho desde el 22/08.
- [ ] **Turnos de caja cerrados antes del 02/09** no tienen registrado cuántas
      ventas quedaban sin subir, así que no se marcan como arqueo incompleto. No
      hay forma de saberlo a posteriori. Sin acción: es un límite conocido.

---

## 9 · De otras fases

- [ ] **`scripts/release/generar-codigo-cliente.ps1` rompe la suite**: tiene
      acentos y está guardado sin BOM, así que Windows PowerShell 5.1 lo lee mal.
      Es de la **fase 19** (panel de clientes), no de ésta. El test que lo agarra
      existe porque eso ya nos rompió una vez.

---

## Preguntas abiertas

1. **¿De dónde sacamos un CUIT de Responsable Inscripto?** Sin eso, la A y la B
   quedan verificadas sólo en homologación.
2. **¿LAGUS vende por peso?** Define si la balanza entra o no.
3. **¿Qué lector usa LAGUS**, HID o serial?
4. **¿Cuándo consigue LAGUS la térmica?** Traba tres puntos de hardware.
5. **¿"Terminar" es dejarlo listo para LAGUS, o para vendérselo a un comercio
   que no conocemos?** Son dos varas distintas y cambian la mitad de esta lista.
