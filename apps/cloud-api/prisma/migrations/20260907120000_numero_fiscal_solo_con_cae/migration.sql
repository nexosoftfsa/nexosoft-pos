-- Un comprobante fiscal SIN CAE no ocupa número de la serie fiscal.
--
-- Hasta ahora, cuando ARCA no respondía o rechazaba, el comprobante se
-- guardaba con un número "provisional" sacado de nuestra propia serie. Ese
-- número queda ocupado en la misma columna, con el mismo unique, que después
-- va a usar el número real de ARCA. Cuando ARCA llega a ese número el INSERT
-- falla, y falla DESPUÉS de que ARCA ya autorizó: se pierde la venta y queda
-- un comprobante autorizado en ARCA que no existe en la base.
--
-- Esta migración libera los provisionales que ya quedaron sembrados. Sin esto,
-- el arreglo del código no alcanza: las minas que ya están puestas siguen
-- explotando a medida que ARCA avanza su numeración.
--
-- No toca:
--   - comprobantes CON CAE: ese número es el de ARCA y es el bueno;
--   - TicketNoFiscal: no existe en ARCA, su número es propio y nadie lo pisa.
--
-- Ver docs/adr/0072-un-comprobante-sin-cae-no-tiene-numero.md
UPDATE "ventas"
SET "numeroComprobante" = NULL
WHERE "cae" IS NULL
  AND "numeroComprobante" IS NOT NULL
  AND "tipoComprobante" IS NOT NULL
  AND "tipoComprobante" <> 'TicketNoFiscal';
