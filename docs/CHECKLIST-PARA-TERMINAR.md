# Checklist para terminar

Actualizado: 2026-09-23 · Publicado: POS **0.1.69** · Servidor **0.19.0**

Todo lo que queda por probar y por afinar, con qué bloquea cada cosa.

**Qué quiere decir "terminar":** que el sistema se pueda instalar y operar en un
comercio nuevo **sin que estemos nosotros al lado**. Con esa vara, la lista de
abajo se ordena sola.

**Lo que no se puede terminar sin ayuda de afuera:** los cuatro puntos de
hardware (térmica, cajón, balanza, lector) y la verificación en producción de la
Factura A y B, que necesita un CUIT de Responsable Inscripto. Todo lo demás
depende sólo de nosotros.

---

## 1 · Décima vuelta — POS 0.1.69

### Lo que la novena vuelta (22/9) dejó cerrado

- **Los pagos ya no sobreviven a un cambio de carrito** (ADR-0081). Era lo más
  grave de la octava.
- **Se puede corregir el medio de pago** sin perder el carrito: Esc deshace el
  último pago y vuelve a elegir.
- **El cartel de cobro quedó claro.** Seba: *"SI, SUPER"*.
- **El lector sigue andando después de elegir cliente o receptor.**
- **La reimpresión de una B de puros exentos lleva el bloque** de transparencia
  fiscal, con IVA Contenido $ 0,00 (corrección en ADR-0079).

### Lo que la novena vuelta destapó

- [ ] **Correr `docs/PRUEBA-DECIMA-VUELTA.txt`.** 15 minutos.

- [ ] **EL EXENTO: TERCERA VUELTA SIN PODER PROBARSE.** El botón estaba, Seba
      lo tocó, y el catálogo siguió viejo. Revisé la cadena entera —el endpoint
      devuelve `tipoIva`, el mapeo manda `EXENTO` a `null`, el `UPSERT` escribe
      `NULL`, la lectura distingue `NULL` de `"0"`— y está bien de punta a
      punta. **Sigo sin saber por qué.**
      *Lo que se arregló en 0.1.69 no es el exento: es no poder ver qué pasa.
      El botón ahora dice "Catálogo al día (N productos)" o el motivo del
      fallo, y la descarga salió de adentro de la transacción SQLite
      (ADR-0082). La próxima vuelta lo resuelve en una, no en tres.*

- [ ] **F4 y "Descartar" no preguntaban nada.** Dentro de Tauri
      `window.confirm` devuelve una **promesa**, y el código la daba por un sí:
      F4 vaciaba la caja sin preguntar, y el botón Descartar —que saca
      operaciones de la cola para siempre— tampoco preguntaba. Eso último no lo
      vio nadie porque nunca se usó.
      *Se arregla esperando la respuesta. Va con test de los dos entornos.*

- [ ] **Decidir qué hacer con F12.** Seba propone sacarlo: dispara la venta sin
      preguntar el medio de pago, sin dejar cargar el efectivo y sin mostrar el
      vuelto, y para salir del panel hay que apretar TAB cinco veces. Su
      argumento: *"si se aprieta ese botón de manera accidental ya te genera la
      venta en un medio de pago que quizás no era"*, y el flujo con Enter quedó
      rápido igual. **Es decisión de Rodrigo.**

- [ ] **Verificar que la reimpresión de una A discrimine IVA.** Salió bien el
      6/9, el 8/9 y el 9/9. Se cierra junto con el exento: los dos papeles
      tienen que decir lo mismo. *Falta también que el duplicado muestre el
      renglón "Exento", que se agregó en 0.1.69.*

- [ ] **El duplicado no muestra el vuelto.** El servidor no lo guarda, así que
      la reimpresión lo pone en cero. El original sí lo muestra, y difieren.
      *Arreglarlo es una columna nueva en la venta, el payload de sync y el
      DTO. No es grave —el vuelto no es un dato fiscal— pero el papel tiene que
      decir lo mismo las dos veces.*

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
      *Prueba de un minuto: configurar un débito, ver que no deje poner recargo
      ni cuotas, y cobrar con él.*

- [ ] **Ingresos Brutos en el comprobante.** El mismo régimen de transparencia,
      pero provincial: hay que informar la **alícuota** de IIBB (no el importe)
      en los comprobantes a consumidor final. **CABA lo posterga al 1/1/2027**
      (Res. AGIP 339/2026); Entre Ríos y Chubut avanzaron con cronogramas
      propios; Mendoza y Santa Fe adhirieron sin reglamentar; el resto no se
      movió. **Formosa no lo implementó**, así que no bloquea a LAGUS.
      *El problema de diseño es que cada provincia pide algo distinto: la
      alícuota tiene que ser configuración por sucursal, no una constante.*

- [ ] **Factura de Crédito Electrónica MiPyME (Ley 27.440).** Si una MiPyME le
      factura a una empresa grande por más de **$5.549.862** (valor desde el
      14/4/2026, se actualiza), corresponde emitir una FCE y no una Factura A
      común. No lo soportamos.
      *No bloquea a un comercio minorista. Sí bloquearía a una distribuidora,
      que es justamente el perfil del CUIT con el que probamos.*

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
      *No es técnico y es de NexoSoft, no del comercio. Va junto con el contrato
      de licencias, que ya está pendiente.*

---

## 3 · Factura A y B — lo que queda después

- [ ] **Verificar en campo la Transparencia Fiscal (Ley 27.743).** Hecho el
      17/9 (ADR-0079): la Factura B sale con la leyenda del régimen, el **IVA
      Contenido** y **Otros Impuestos Nacionales Indirectos**, más la aclaración
      de que son sólo los nacionales. Rige desde el 1/4/2025 y no lo
      cumplíamos. De paso se corrigió que la térmica discriminara el IVA por
      alícuota en una B, que el A4 no hacía.
      *Falta mirar un PDF: el IVA contenido tiene que coincidir con el IVA que
      se le declaró a ARCA.*

- [ ] **Preguntarle al contador por los impuestos internos.** Hoy el renglón va
      en **$0,00**, que es lo que imprime un supermercado real y la lectura
      literal de la norma: los internos son de etapa única y un comercio que
      revende no es sujeto pasivo. La norma **no resuelve** el caso del
      revendedor —los tributaristas se lo están reclamando a ARCA— así que
      conviene tenerlo confirmado por escrito.
      *Si dijera que hay que estimarlo, necesitamos que diga con qué criterio:
      inventarlo nosotros no es una opción.*
      *El campo `otrosImpuestosNacionales` ya existe, para el día que le
      vendamos a alguien que sí los liquida. Ese caso además tiene que mandar
      el importe a ARCA en `Tributos`, que es trabajo de servidor.*

- [ ] **Conseguir un CUIT de Responsable Inscripto.** Es lo único que separa a
      la A y la B de estar verificadas **en producción**. Con el CUIT de Seba
      —Monotributo en el padrón— se prueba el circuito pero no se emite de
      verdad.
      *Decisión tuya, no es técnico.*

---

## 4 · Pruebas de campo pendientes

- [ ] **Bloqueo por falta de pago.** `docs/PRUEBA-SUSCRIPCION-SOCIO.txt`.
      **Nunca se probó.** Hay que ver que durante el bloqueo sigan andando
      **cerrar la caja, Reportes y Comprobantes**: un comercio bloqueado tiene
      que poder cerrar el día y sacar sus números, aunque no pueda vender.
      *Bloquea: cobrar la suscripción. Es el modelo de negocio.*

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
      ❓ *¿LAGUS vende por peso?*
- [ ] **Lector de código de barras.** Si es **HID** ya anda; si es **serial**,
      falta el plugin del puerto COM. ❓ *¿Cuál usa LAGUS?*

---

## 6 · Antes de instalar en un comercio nuevo

- [ ] **Reescribir el instructivo de instalación.** El que hay
      (`docs/INSTRUCTIVO-INSTALACION.txt`) es del **27/08**, anterior a todo lo
      de ARCA, el antivirus, el certificado y las Facturas A/B.
      Tiene que decir, además, que el certificado es **por entorno**: si el alta
      se prueba en homologación y después pasa a producción, son dos trámites
      con el mismo `.csr` (ADR-0071).
      *Bloquea: que instale alguien que no seamos nosotros. O sea, bloquea vender.*

- [ ] **Instalación en Program Files en vez de AppData.** Frenado por riesgo de
      doble instalación. Hay que probarlo en una PC de descarte.
      *Ganancia: le saca peso a una de las señales que hicieron que Defender se
      comiera el POS.*

- [ ] **Dejar por escrito qué hacemos con la firma de código.** Ya está decidido
      no gastar ahora. Falta aceptar el costo por escrito: cada alta lleva un
      paso manual y cada actualización es una tirada de dados con el antivirus.

---

## 7 · Escala — no bloquea al primer cliente, sí al número cincuenta

- [ ] **Alerta de vencimiento de certificados.** El dato ya existe
      (`diasParaVencer`); falta que alguien lo mire de forma centralizada. Hoy
      el servidor es por sucursal y nadie va a mirar cincuenta tableros.
      *Un certificado de ARCA dura 2 años: con 50 clientes son 50 bombas de
      tiempo silenciosas.*
- [ ] **Licencias: la parte legal.** Lo técnico está hecho. Falta el contrato y
      el límite por sucursal.
- [ ] **Multisucursal.** Postergado a propósito; el rumbo ya está elegido.

---

## 8 · Deuda conocida — anotada para que no se pierda

- [ ] **El umbral de $10.000.000** (RG 5700/2025) no está implementado: hoy se
      puede emitir una B por cualquier monto sin identificar al comprador.
      Falta decidir si al superarlo se **bloquea** o se **avisa**.
      *Recomendación: avisar. Frenar una venta por un tema formal, con el cliente
      adelante, es peor que emitirla y corregirla.*
- [ ] **Elegir la alícuota de una Nota de Débito.** Hoy va siempre al 21% en A y
      B. Si hace falta elegirla, el concepto tendría que venir con su tasa.
- [ ] **Nota de Crédito parcial.** Hoy anular es por el total. Devolver un solo
      producto de una venta de diez no se puede.
- [ ] **El CAE se pide ANTES de abrir la transacción** (`ventas.service.ts`).
      Con el arreglo de ADR-0072 la colisión de número ya no puede pasar, pero
      cualquier otra falla del `INSERT` entre el CAE y el commit deja lo mismo:
      un comprobante autorizado en ARCA que no existe en nuestra base. Hoy al
      menos queda registrado como discrepancia fiscal, con el número y el CAE.
      *Arreglarlo de verdad implica reservar la fila antes de hablar con ARCA,
      o poder anular ante ARCA lo que no se pudo guardar. Ninguna es chica.*
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
