# Consulta al contador — situación impositiva de NexoSoft

Relevamiento del 29/9/2026, verificado contra el texto de las normas (no de
memoria). Las fuentes están al final.

**Para qué es esto.** NexoSoft factura electrónicamente contra ARCA (WSFEv1)
para comercios minoristas. Hay tres cosas que el sistema **ya hace de una
manera** y que conviene que estén respaldadas por escrito, porque la norma no
las resuelve o porque la decisión no es técnica. Ninguna impide operar hoy.

---

## Las tres preguntas

### 1. Impuestos internos: ¿$ 0,00, o hay que estimarlos?

**Qué hace el sistema hoy:** imprime el renglón "Otros Impuestos Nacionales
Indirectos" en **$ 0,00** en toda Factura B.

**Por qué:** los impuestos internos son de **etapa única** — se pagan en el
expendio, que es la primera venta del fabricante. Un comercio que revende no es
sujeto pasivo, no los liquida y no tiene forma de conocer el monto contenido en
el precio al que compró.

**Lo que encontramos en la norma, y es lo que da pie a la consulta.** La
RG 5614/2024 escalonó la implementación en su artículo 6° y trató los dos
grupos distinto:

- **inciso a)** — "empresas grandes" (las del régimen de Factura de Crédito
  Electrónica), desde el 1/1/2025: _"deberán discriminar los impuestos al valor
  agregado **e internos**. A tales fines, los impuestos internos deberán
  reflejarse en el campo 'Otros Impuestos Nacionales Indirectos'."_
- **inciso b)** — el resto de los contribuyentes, obligatorio desde el
  1/4/2025: habla **sólo del IVA**. No menciona los impuestos internos.

O sea: la única mención expresa a discriminar internos está en el inciso de las
grandes empresas. Para el resto, el texto del cronograma se limita al IVA.

**En contra de esa lectura** juega el artículo 1°, que es general y habla de
_"los demás impuestos nacionales indirectos **que tienen incidencia en la
formación de los precios**"_ — y el interno pagado por el fabricante sí incide
en el precio, aunque el comercio no lo liquide.

**Y ARCA no lo aclaró.** A 18 meses de vigencia no hay pronunciamiento. El
sector combustibles —que es el caso testigo, porque revende un producto con
impuestos específicos— lo viene reclamando: un tributarista del sector señala
que la expresión es "demasiado amplia", que la RG 5614/2024 "no aclara qué
impuestos deben discriminarse" y pide que ARCA sea específica "a fin de no
incurrir luego en violaciones involuntarias".

> **La pregunta:** ¿confirma el $ 0,00 para un comercio que revende? ¿O prefiere
> que dejemos el renglón en blanco, o que se cargue una estimación por producto?
>
> El sistema ya tiene el campo preparado por producto. Se descartó estimarlo
> porque ese número no sería el impuesto interno de nada: sería una cuenta
> nuestra con cara de dato fiscal. Pero es una decisión suya, no nuestra.

---

### 2. Umbral de $ 10.000.000: ¿se bloquea la venta o se avisa?

**Qué hace el sistema hoy:** nada. Se puede emitir una Factura B por cualquier
importe sin identificar al comprador. **Esto sí es un incumplimiento.**

**La norma.** RG 5700/2025, vigente desde el 29/5/2025: a partir de
**$ 10.000.000** hay que consignar los datos del comprador. Dos cosas que
conviene saber:

- El umbral es **fijo**: la RG eliminó la actualización semestral por IPC que
  tenían los topes anteriores ($ 417.288 y $ 208.644). No se mueve solo.
- La RG 5866/2026, que reorganizó el régimen de comprobantes este año, lo
  **mantuvo** en $ 10.000.000.

Se pide CUIT, CUIL, CDI o DNI (pasaporte o documento del país de origen para
extranjeros). Apellido, nombre y domicilio **pueden completarse con "NR" (No
Requerido) o con ceros** si el sistema lo exige — esto último nos sirve, porque
significa que alcanza con pedir el documento.

Aparte del monto, hay que identificar con CUIT **siempre** que el comprador lo
pida para deducir en Ganancias.

> **La pregunta:** al superar los $ 10.000.000, ¿el sistema **bloquea** la
> emisión hasta que se cargue el comprador, o **avisa** y deja emitir?
>
> Nuestra recomendación es **avisar**. Frenar una venta por un tema formal, con
> el cliente adelante del mostrador, es peor que emitirla y corregirla después
> con una nota de crédito. Pero si su criterio es que el riesgo de sanción pesa
> más, lo hacemos bloqueante.

---

### 3. Costo financiero en cuotas: ¿va en el ticket o sólo en la exhibición?

**Qué hace el sistema hoy:** aplica el recargo por cuotas y lo imprime. **No**
muestra el precio de contado ni el costo financiero total (CFT).

**La norma.** Resolución 4/2025 de la Secretaría de Industria y Comercio: cuando
los precios se exhiban financiados hay que indicar el precio de contado, la
cantidad y el monto de cada cuota, y el costo financiero total efectivo anual.

Por cómo está redactada, entendemos que apunta a la **exhibición y la
publicidad** (góndola, cartel, web), no al comprobante. Pero es la
interpretación de un programador, no de un contador.

> **La pregunta:** ¿corresponde que el ticket muestre el precio de contado y el
> CFT cuando la venta fue en cuotas, o alcanza con la exhibición?
>
> Si va en el ticket, es un cambio chico. Si va en la exhibición, es del comercio
> y no nuestro — aunque podríamos generar las etiquetas de góndola con el dato.

---

## Lo que ya cumplimos, para no gastarle tiempo

Verificado contra el texto de la norma, no de memoria:

| Obligación                                       | Norma                     | Estado                                                    |
| ------------------------------------------------ | ------------------------- | --------------------------------------------------------- |
| Factura electrónica con CAE                      | RG 4291                   | Sí, por WSFEv1                                            |
| QR fiscal en el comprobante                      | RG 4892/2020              | Sí                                                        |
| Condición de IVA del receptor                    | RG 5616/2024              | Sí, en el papel y en el web service                       |
| Comprobantes asociados en NC y ND                | —                         | Sí (`CbtesAsoc`)                                          |
| ORIGINAL y DUPLICADO                             | RG 1415                   | Sí                                                        |
| Leyenda + IVA Contenido + Otros Imp. Nac. Indir. | Ley 27.743 / RG 5614/2024 | Sí, con los tres datos y en ese orden                     |
| Precios unitarios netos en la Factura A          | RG 259/98                 | Sí, y los renglones suman el neto declarado               |
| Débito sin recargo                               | Ley 27.253                | Sí, el sistema lo impide y lo ignora si quedó configurado |

**Una aclaración que puede ahorrar una discusión:** desde la RG 4290/2018 un
comercio minorista **elige** entre controlador fiscal y factura electrónica, y
ni siquiera tiene que informarle a ARCA cuál usa. No hace falta homologar nada
para que un comercio nos use legalmente. Sigue vigente.

---

## Lo que viene con fecha

**Ingresos Brutos en el comprobante.** El mismo régimen de transparencia, pero
provincial: hay que informar la **alícuota** de IIBB (no el monto en pesos) en
los comprobantes a consumidor final.

Al día de hoy adhirieron **cinco jurisdicciones**: CABA, Chubut, Entre Ríos,
Mendoza y Santa Fe. Cuatro reglamentaron, y **ninguna está en vigencia plena**:
todas las que pusieron fecha la corrieron al **1/1/2027**.

- CABA: prorrogado al 1/1/2027 (Res. 339/AGIP/2026)
- Mendoza: prorrogado del 1/10/2026 al 1/1/2027 (RG 39/2026, ATM)
- Entre Ríos: prorrogado al 1/1/2027
- Chubut: suspendido hasta el 31/12/2026

Quedan excluidos los del Régimen Simplificado.

**Formosa no adhirió**, así que no alcanza a LAGUS. Pero el diseño nos importa
igual: como cada provincia pide algo distinto, la alícuota tiene que ser
**configuración por sucursal** y no una constante del programa. Eso ya está
anotado para resolverlo antes de fin de 2026.

---

## Un punto formal que encontramos y vamos a corregir nosotros

La RG 5614/2024 indica dónde va el bloque de transparencia fiscal: **en el
espacio inferior izquierdo** del comprobante, con el título, debajo "IVA
Contenido" y debajo "Otros Impuestos Nacionales Indirectos".

Nuestro comprobante A4 lo imprime abajo a la **derecha**. Los tres datos están y
están en el orden correcto, pero la ubicación no es la que dice la norma. Lo
corregimos nosotros, no requiere consulta. En el ticket térmico no aplica: es
una sola columna.

---

## Fuentes

- [RG 5614/2024 — texto completo (Boletín Oficial, 13/12/2024)](https://www.boletinoficial.gob.ar/detalleAviso/primera/318151/20241213)
- [RG 5614/2024 — Consejo Profesional de Ciencias Económicas de Salta (PDF con el articulado)](https://www.consejosalta.org.ar/wp-content/uploads/ARCA-5614.pdf)
- [RG 5700/2025 — umbral de $10.000.000 para identificar al consumidor final](https://blogdelcontador.com.ar/news-45898-arca-eleva-a-10-millones-el-limite-para-identificar-al-consumidor-final-en-comprobantes)
- [RG 5866/2026 — reorganización del régimen de comprobantes (CPCE Formosa)](https://cpcef.org.ar/rg-5866-2026-arca-reorganiza-el-regimen-de-comprobantes-y-actualiza-topes-de-facturacion/)
- [Límite para facturar a consumidor final sin datos — actualizado a septiembre 2026](https://www.tusfacturas.app/cual-es-el-limite-facturacion-afip-a-consumidor-final-sin-especificar-datos.html)
- [Transparencia fiscal en estaciones de servicio: qué impuestos discriminar (el reclamo del sector)](https://surtidores.com.ar/regimen-de-transparencia-fiscal-al-consumidor-que-cambio-trae-para-las-estaciones-de-servicio/)
- [Estado provincia por provincia del régimen de transparencia de IIBB](https://www.ambito.com/novedades-fiscales/la-transparencia-fiscal-impuestos-provinciales-esta-cada-vez-mas-perezosa-n6326904)
- [CABA: prórroga al 1/1/2027 (Res. 339/AGIP/2026)](https://www.gestionyeficiencia.com/agip-339-prorroga-iibb-facturas-caba-2027/)
- [Resolución 4/2025 (SIC) — exhibición de precios financiados y CFT](https://www.boletinoficial.gob.ar/detalleAviso/primera/319787/20250117)
- [RG 4290/2018 — la opción entre controlador fiscal y factura electrónica](https://contadoresenred.com/factura-electronica-o-controlador-fiscal-para-todos-rg-4290/)
- [ARCA — página oficial de Transparencia Fiscal](https://www.afip.gob.ar/comunicacion/transparencia-fiscal/)
