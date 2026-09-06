# Checklist para terminar

Actualizado: 2026-09-06 · Publicado: POS **0.1.57** · Servidor **0.16.0**

Todo lo que queda por probar y por afinar, con qué bloquea cada cosa.

**Qué quiere decir "terminar":** que el sistema se pueda instalar y operar en un
comercio nuevo **sin que estemos nosotros al lado**. Con esa vara, la lista de
abajo se ordena sola.

**Lo que no se puede terminar sin ayuda de afuera:** los cuatro puntos de
hardware (térmica, cajón, balanza, lector) y la verificación en producción de la
Factura A y B, que necesita un CUIT de Responsable Inscripto. Todo lo demás
depende sólo de nosotros.

---

## 1 · La prueba de Factura A y B, otra vez

La corrida del 4/9 **no llegó a ejecutar nada de lo que iba a probar**. ARCA
rechazó todo al autenticar, antes de mirar el comprobante: *"Certificado no
emitido por AC de confianza"*. Causa: hay un certificado por entorno y no valen
cruzados; al pasar a homologación se seguía firmando con el de producción.
Arreglado el 6/9 (ADR-0071) — ahora se guardan los dos y el sistema avisa antes.

- [ ] **Correr `docs/PRUEBA-FACTURA-A-B-Y-ND-2.txt`.** Incluye sacar el
      certificado de homologación en el portal de ARCA (~20 min de trámite), la
      prueba entera de A, B y ND, y volver a producción para confirmar que ese
      certificado no se perdió.
      *Bloquea: vender a un Responsable Inscripto.*

- [ ] **Que la venta de prueba sea de un producto al 21%.** El "Aceite de
      Girasol" que usó Seba está cargado como **EXENTO**: con ese producto la
      Factura A sale con `ImpNeto = 0` y todo en `ImpOpEx`, una A donde no hay
      nada gravado, que es lo contrario de para qué existe la A. Ya está
      corregido en el instructivo nuevo.

- [ ] **Verificar que la reimpresión de una A ya discrimine IVA.** Arreglado el
      4/9 (el desglose se guarda congelado al emitir), sin probar en campo.
      Es el paso 7 del instructivo nuevo.

---

## 2 · Factura A y B — lo que queda después

- [ ] **"Exento" significa cosas distintas en el POS y en el servidor.**
      El POS mapea `EXENTO → alícuota 0%`; el servidor lo trata como exento real
      (`ImpOpEx`, sin renglón). No son lo mismo y nuestro propio comentario en
      `iva-de-producto.ts` lo explica.
      **Alcance del arreglo:** `Articulo.alicuotaIva` pasa a nullable, y eso toca
      9 archivos de producción más tests — el tipo, el cálculo de precio, el
      cálculo del comprobante, los dos mapeos de SQLite, el pull del catálogo,
      los servicios de venta y facturación, y los datos demo. Mecánico pero no
      chico.
      *No era la causa del rechazo del 4/9. Sigue siendo un problema real, pero
      no bloquea nada todavía: dejarlo para después de la prueba.*

- [ ] **No hay forma de sacar un A4 ORIGINAL.** El botón "Imprimir A4" vive en
      el panel de post-venta; una vez cerrada la venta, Comprobantes sólo ofrece
      "Reimprimir", que marca DUPLICADO — como corresponde. Si el cliente pide
      la factura en A4 dos minutos después, sólo se le puede dar un duplicado.
      *Decidir si vale agregar un A4 original mientras la venta sigue abierta.*

- [ ] **Conseguir un CUIT de Responsable Inscripto.** Es lo único que separa a
      la A y la B de estar verificadas **en producción**. Con el CUIT de Seba
      —Monotributo en el padrón— se prueba el circuito pero no se emite de
      verdad.
      *Decisión tuya, no es técnico.*

---

## 3 · Pruebas de campo pendientes

- [ ] **Bloqueo por falta de pago.** `docs/PRUEBA-SUSCRIPCION-SOCIO.txt`.
      **Nunca se probó.** Hay que ver que durante el bloqueo sigan andando
      **cerrar la caja, Reportes y Comprobantes**: un comercio bloqueado tiene
      que poder cerrar el día y sacar sus números, aunque no pueda vender.
      *Bloquea: cobrar la suscripción. Es el modelo de negocio.*

---

## 4 · Hardware — no depende de nosotros

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

## 5 · Antes de instalar en un comercio nuevo

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

## 6 · Escala — no bloquea al primer cliente, sí al número cincuenta

- [ ] **Alerta de vencimiento de certificados.** El dato ya existe
      (`diasParaVencer`); falta que alguien lo mire de forma centralizada. Hoy
      el servidor es por sucursal y nadie va a mirar cincuenta tableros.
      *Un certificado de ARCA dura 2 años: con 50 clientes son 50 bombas de
      tiempo silenciosas.*
- [ ] **Licencias: la parte legal.** Lo técnico está hecho. Falta el contrato y
      el límite por sucursal.
- [ ] **Multisucursal.** Postergado a propósito; el rumbo ya está elegido.

---

## 7 · Deuda conocida — anotada para que no se pierda

- [ ] **El umbral de $10.000.000** (RG 5700/2025) no está implementado: hoy se
      puede emitir una B por cualquier monto sin identificar al comprador.
      Falta decidir si al superarlo se **bloquea** o se **avisa**.
      *Recomendación: avisar. Frenar una venta por un tema formal, con el cliente
      adelante, es peor que emitirla y corregirla.*
- [ ] **Elegir la alícuota de una Nota de Débito.** Hoy va siempre al 21% en A y
      B. Si hace falta elegirla, el concepto tendría que venir con su tasa.
- [ ] **Nota de Crédito parcial.** Hoy anular es por el total. Devolver un solo
      producto de una venta de diez no se puede.
- [ ] **Cachear el último número de comprobante** para sacarle un viaje a ARCA
      por venta (ADR-0061). No se hizo a propósito.
- [ ] **ADR-0018 quedó viejo:** dice que falta el plugin de impresora ESC/POS y
      está hecho desde el 22/08.
- [ ] **Turnos de caja cerrados antes del 02/09** no tienen registrado cuántas
      ventas quedaban sin subir, así que no se marcan como arqueo incompleto. No
      hay forma de saberlo a posteriori. Sin acción: es un límite conocido.

---

## 8 · De otras fases

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
