# Checklist para terminar

Actualizado: 2026-09-16 · Publicado: POS **0.1.63** · Servidor **0.19.0**

Todo lo que queda por probar y por afinar, con qué bloquea cada cosa.

**Qué quiere decir "terminar":** que el sistema se pueda instalar y operar en un
comercio nuevo **sin que estemos nosotros al lado**. Con esa vara, la lista de
abajo se ordena sola.

**Lo que no se puede terminar sin ayuda de afuera:** los cuatro puntos de
hardware (térmica, cajón, balanza, lector) y la verificación en producción de la
Factura A y B, que necesita un CUIT de Responsable Inscripto. Todo lo demás
depende sólo de nosotros.

---

## 1 · Séptima vuelta — POS 0.1.63

### Lo que la sexta vuelta (11/9) dejó cerrado

- **El bucle de los cientos de comprobantes: no vuelve.** Con Billetera QR y
  Enter a lo bestia sobre el cartel de espera salió **una sola venta**. Era el
  defecto más grave del proyecto (ADR-0075).
- **El freno de ráfaga no pisa la cola offline.** Los dos números coincidieron:
  8 ventas sin internet, 8 subidas. Era el riesgo real de haber puesto un tope
  por ritmo.
- **El tope no molesta operando normal.** 10 ventas en un minuto y medio, sin
  un solo rechazo.
- **El clic afuera ya no roba el original**, y el A4 sale como ORIGINAL.

### Lo que la sexta vuelta destapó, ya corregido y sin verificar

- [ ] **Correr `docs/PRUEBA-SEPTIMA-VUELTA.txt`.** 20 minutos.

- [ ] **Las dos ventas trabadas de Seba: saber POR QUÉ.** Es la única incógnita
      real que queda. Las viene arrastrando desde hace tres pruebas y hasta
      ahora el POS no le mostraba el motivo: el botón de ver el error sólo
      aparecía con las fallidas, y éstas están pendientes. Eso se arregló
      (0.1.62) — ahora las trabadas se listan aparte con su motivo.
      *El arreglo es de visibilidad: la causa sigue sin conocerse. El paso 2 del
      instructivo es leerla.*

- [ ] **El asistente en $0,00, ahora con Tarjeta y Transferencia.** Cuarta vez
      con la misma raíz: un listener de teclado mirando el carrito de un closure
      viejo. Va contra un `ref` (0.1.62).
      *La regla ya está escrita: lo que coordina trabajo asincrónico va en un
      `ref`.*

- [ ] **Comprobantes se recarga sola cuando baja la cola.** Seba tocó
      Sincronizar parado ahí, las ventas subieron y la lista siguió siendo la
      de antes; tuvo que cambiar de menú y volver (0.1.62).

- [ ] **Verificar en campo un producto exento.** Arreglado el 16/9 (ADR-0076):
      `EXENTO` ya no se mapea a la alícuota del 0%. El comprobante que se le
      declara a ARCA siempre estuvo bien; lo que estaba mal era el **papel**, que
      imprimía "IVA 0%" y sumaba el exento al subtotal neto.
      *Falta venderlo una vez y mirar el ticket: tiene que decir "Exento" con su
      importe, y el subtotal neto no tiene que incluirlo.*

- [ ] **Verificar que la reimpresión de una A discrimine IVA.** Salió bien el
      6/9, el 8/9 y el 9/9. Falta darlo por cerrado formalmente.

---

## 2 · Factura A y B — lo que queda después

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
