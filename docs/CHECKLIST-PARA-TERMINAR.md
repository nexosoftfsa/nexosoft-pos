# Checklist para terminar

Fecha: 2026-09-02 · Publicado: POS **0.1.54** · Servidor **0.14.0**

Todo lo que queda por probar y por afinar, con qué bloquea cada cosa.

**Qué quiere decir "terminar":** que el sistema se pueda instalar y operar en un
comercio nuevo **sin que estemos nosotros al lado**. Con esa vara, la lista de
abajo se ordena sola.

**Lo que no se puede terminar esta semana, y hay que decirlo:** los tres puntos
de hardware (térmica, balanza, cajón) no dependen de nosotros. Están
implementados y con tests, pero nadie los vio funcionando sobre un fierro real,
y no los vamos a ver hasta que haya un fierro. Todo lo demás sí entra en la
semana.

---

## 1 · Pruebas de campo — las hace Seba, esta semana

Son las que cierran el trabajo de estos días. Sin esto no sabemos si lo que
publicamos anda.

- [ ] **Reprobar sin internet, ahora con POS 0.1.54.**
      `docs/PRUEBA-VENTA-SIN-INTERNET.txt`.
      La corrida del 2/9 salió bien en casi todo —la venta conservó la hora, el
      ticket no inventó número, la caja sumó— pero destapó que el POS **dejaba
      de sincronizar por falta de internet aunque el servidor estuviera al
      lado** (ADR-0066). Lo que hay que ver ahora es lo que antes no podía
      pasar: que sin internet la venta aparezca en Comprobantes y en la caja
      **en el momento**, sin esperar a que vuelva la conexión.
      *Bloquea: entregar el sistema a cualquier comercio con internet inestable.*

- [ ] **Cerrar la caja con ventas realmente sin subir.** El paso 7 del 2/9 no
      llegó a probarlo: la venta ya había subido antes de desconectar, así que
      la cola estaba vacía y el aviso no tenía por qué aparecer. Hay que vender
      **durante** el corte y recién ahí cerrar (ADR-0065).

- [ ] **Bloqueo por falta de pago.** `docs/PRUEBA-SUSCRIPCION-SOCIO.txt`.
      **Nunca se probó.** Lo que hay que ver es que durante el bloqueo sigan
      andando **cerrar la caja, Reportes y Comprobantes**: un comercio bloqueado
      tiene que poder cerrar el día y sacar sus números, aunque no pueda vender.
      *Bloquea: cobrar la suscripción. Es nuestro modelo de negocio.*

- [x] ~~**Actualizar los dos, con migración de base.**~~ El servidor 0.14.0
      agrega una columna al turno de caja: la primera actualización con
      migración desde que existe el actualizador automático. **Salió bien el
      2/9**, Seba actualizó sin tocar nada.

---

## 2 · Hardware — no depende de nosotros

Implementado y con tests, nunca visto sobre el fierro. **No entra en la semana.**

- [ ] **QR fiscal en impresora térmica** (desde POS 0.1.42). Lo verificado es el
      mapa de bits y el comando ESC/POS, no el papel. Prueba de dos minutos
      cuando haya térmica: vender y escanear.
      *LAGUS todavía no tiene térmica.*

- [ ] **Cajón de dinero.** `abrirCajon()` manda el pulso `ESC p` por el RJ11 de
      la impresora ([impresora-escpos.ts:258](apps/pos-desktop/src/datos/impresora-escpos.ts:258)).
      Sale junto con la térmica: sin impresora no hay cajón.

- [ ] **Balanza.** **No hay adaptador real** — sólo el mock (ADR-0018). Falta un
      plugin Tauri para RS-232 y el parser de la trama, que depende de la marca.
      ❓ **Pregunta para vos: ¿LAGUS vende por peso?** Si vende, esto es
      bloqueante para ellos y hay que ponerlo en la semana igual.

- [ ] **Lector de código de barras.** Si es **HID** (el común, se comporta como
      un teclado) no hace falta nada y ya anda. Si es **serial**, falta el
      plugin del puerto COM.
      ❓ **Pregunta: ¿cuál usa LAGUS?**

---

## 3 · Antes de instalar en un comercio nuevo

- [ ] **Instalación en Program Files en vez de AppData.** Lo frené por riesgo de
      doble instalación (quedarían dos copias, una vieja en AppData). Hay que
      probarlo en una PC de descarte antes de cambiarlo.
      *Ganancia: le saca peso a una de las señales que hicieron que Defender se
      comiera el POS.*

- [ ] **Decidir qué hacemos con la firma de código.** Ya está decidido no gastar
      ahora, y está bien. Lo que falta es aceptarlo por escrito: **cada alta
      lleva un paso manual** ("Proteger del antivirus") y cada actualización es
      una tirada de dados. Revisar cuando haya volumen de clientes.

- [ ] **Escribir el instructivo de instalación desde cero, para un tercero.**
      Existe `docs/INSTRUCTIVO-INSTALACION.txt`, del 27/08, anterior a todo lo
      de ARCA, el antivirus y el certificado. Hay que releerlo entero y
      actualizarlo.
      *Bloquea: que instale alguien que no seamos nosotros. O sea, bloquea
      vender.*

---

## 4 · Escala — no bloquea el primer cliente, sí el número 50

- [ ] **Alerta de vencimiento de certificados.** El dato ya existe:
      `certificado.service.ts` calcula `diasParaVencer`. Falta que alguien lo
      mire de forma centralizada — hoy el servidor es por sucursal y nadie va a
      mirar 50 tableros. Va en el panel de licencias, que ya tiene el canal.
      *Un certificado de ARCA dura 2 años. Con 50 clientes son 50 bombas de
      tiempo silenciosas.*

- [ ] **Licencias: la parte legal.** Lo técnico está hecho. Falta el contrato y
      decidir el límite por sucursal.

- [ ] **Multisucursal.** Postergado a propósito, el rumbo ya está elegido y
      Dropbox descartado. Se retoma después de cerrar esto.

---

## 5 · Deuda conocida — opcional, anotada para que no se pierda

- [ ] **Cachear el último número de comprobante** para sacarle un viaje a ARCA
      por venta (ADR-0061). **No se hizo a propósito**: elegiste las otras dos
      optimizaciones. Hoy cada venta fiscal son dos llamadas a ARCA y tarda ~3
      segundos; con esto sería una.

- [ ] **ADR-0018 quedó viejo.** Dice que falta el plugin de impresora ESC/POS y
      ya está hecho desde el 22/08. Corregir la tabla para que no confunda a
      quien lo lea el año que viene.

- [ ] **Turnos de caja cerrados antes de hoy** no tienen
      `ventasSinSincronizarAlCerrar`, así que no se marcan como incompletos. No
      hay forma de saberlo a posteriori. Sin acción, es sólo un límite conocido.

---

## Preguntas abiertas para Rodrigo

1. **¿LAGUS vende por peso?** Define si la balanza entra en la semana o no.
2. **¿Qué lector usa LAGUS**, HID o serial?
3. **¿Cuándo consigue LAGUS la térmica?** Es lo único que traba tres puntos.
4. **¿"Terminar" es dejarlo listo para LAGUS, o listo para vendérselo a un
   comercio que no conocemos?** Son dos varas muy distintas y cambian la mitad
   de esta lista.
