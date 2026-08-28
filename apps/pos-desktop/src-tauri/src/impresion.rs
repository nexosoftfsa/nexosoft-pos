//! Impresión térmica ESC/POS: manda los bytes crudos al spooler de Windows
//! con datatype "RAW".
//!
//! Esto saltea el renderizado del navegador (`window.print()`), que trata al
//! ticket como una página de oficina: obliga a un tamaño de papel fijo — en
//! una térmica el driver declara un rollo de 3276mm — y por lo tanto
//! desperdicia papel, no controla el corte y abre un diálogo en cada venta.
//! Mandando ESC/POS directo, el papel avanza exactamente lo que se imprimió
//! y el corte lo hace la impresora por comando.
//!
//! ## Por qué se rechaza a las impresoras virtuales
//!
//! Los bytes ESC/POS son comandos de una térmica, no un documento. Si el
//! trabajo va a parar a una impresora virtual (Microsoft Print to PDF, XPS,
//! OneNote, fax), el driver escribe esos bytes crudos dentro de un archivo con
//! extensión `.pdf` y el spooler **informa éxito**: se escribieron todos los
//! bytes. El resultado es un archivo que ningún lector puede abrir y una venta
//! que el POS da por impresa mientras el cliente se va sin ticket.
//!
//! Por eso se mira el puerto y el driver ANTES de mandar nada: un fallo
//! ruidoso con un mensaje que dice qué pasa es mucho mejor que un éxito falso.

/// Una impresora instalada en el sistema, como la ve el POS.
#[derive(serde::Serialize)]
pub struct ImpresoraDelSistema {
    pub nombre: String,
    pub puerto: String,
    pub driver: String,
    /// `false` para las impresoras virtuales: no sirven para ESC/POS.
    pub sirve_para_ticket: bool,
    pub predeterminada: bool,
}

/// Puertos que no son un dispositivo físico: el trabajo termina en un archivo.
const PUERTOS_VIRTUALES: [&str; 4] = ["PORTPROMPT", "FILE:", "NUL", "SHRFAX"];
/// Marcas en el nombre del driver de las impresoras que generan documentos.
const DRIVERS_VIRTUALES: [&str; 6] = ["pdf", "xps", "onenote", "fax", "document writer", "print to"];

/// ¿Es una impresora que genera un archivo en vez de imprimir en papel?
///
/// Se mira primero el puerto porque es independiente del idioma de Windows:
/// "Microsoft Print to PDF" y "Microsoft XPS Document Writer" usan
/// `PORTPROMPT:` en cualquier localización. El nombre del driver es el respaldo
/// para las virtuales de terceros (PDFCreator, Bullzip y compañía).
pub fn es_impresora_virtual(puerto: &str, driver: &str) -> bool {
    let p = puerto.trim().to_ascii_uppercase();
    if PUERTOS_VIRTUALES.iter().any(|v| p.starts_with(v)) {
        return true;
    }
    let d = driver.to_ascii_lowercase();
    DRIVERS_VIRTUALES.iter().any(|v| d.contains(v))
}

/// El mensaje que ve el cajero cuando el ticket iba a parar a un archivo.
pub fn mensaje_impresora_virtual(nombre: &str) -> String {
    format!(
        "\"{}\" no es una impresora de tickets: es una impresora virtual que guarda el trabajo en un archivo en vez de imprimirlo. \
El ticket se estaba enviando ahí, y por eso no salía en papel. \
Elegí la impresora térmica en Configuración > Impresora de tickets.",
        nombre
    )
}

#[cfg(windows)]
mod windows_impl {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;

    use winapi::ctypes::c_void;
    use winapi::shared::minwindef::{BYTE, DWORD};
    use winapi::um::winspool::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, GetDefaultPrinterW,
        GetPrinterW, OpenPrinterW, StartDocPrinterW, StartPagePrinter, WritePrinter, DOC_INFO_1W,
        PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_2W,
    };

    use super::{es_impresora_virtual, mensaje_impresora_virtual, ImpresoraDelSistema};

    fn a_wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    /// Lee una cadena terminada en cero que el spooler dejó en el buffer.
    unsafe fn desde_wide(p: *const u16) -> String {
        if p.is_null() {
            return String::new();
        }
        let mut largo = 0usize;
        while *p.add(largo) != 0 {
            largo += 1;
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(p, largo))
    }

    /// Buffer alineado a 8 bytes para las structs del spooler.
    ///
    /// `PRINTER_INFO_2W` tiene punteros adentro, así que un `Vec<u8>` (alineado
    /// a 1) no sirve para castearlo en x64.
    fn buffer_alineado(bytes: usize) -> Vec<u64> {
        vec![0u64; bytes.div_ceil(8).max(1)]
    }

    pub fn impresora_por_defecto() -> Result<String, String> {
        unsafe {
            // Primera llamada con buffer nulo: devuelve el largo necesario.
            let mut largo: DWORD = 0;
            GetDefaultPrinterW(ptr::null_mut(), &mut largo);
            if largo == 0 {
                return Err("No hay una impresora predeterminada configurada en Windows.".into());
            }
            let mut buffer = vec![0u16; largo as usize];
            if GetDefaultPrinterW(buffer.as_mut_ptr(), &mut largo) == 0 {
                return Err("No se pudo leer la impresora predeterminada de Windows.".into());
            }
            let fin = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
            Ok(String::from_utf16_lossy(&buffer[..fin]))
        }
    }

    /// Puerto y driver de una impresora, para saber si es virtual.
    fn puerto_y_driver(nombre: &str) -> Result<(String, String), String> {
        unsafe {
            let mut nombre_w = a_wide(nombre);
            let mut handle = ptr::null_mut();
            if OpenPrinterW(nombre_w.as_mut_ptr(), &mut handle, ptr::null_mut()) == 0 {
                return Err(format!(
                    "No se pudo abrir la impresora \"{}\". Revisá que el nombre sea exacto y que esté encendida.",
                    nombre
                ));
            }

            let mut necesario: DWORD = 0;
            GetPrinterW(handle, 2, ptr::null_mut(), 0, &mut necesario);
            if necesario == 0 {
                ClosePrinter(handle);
                return Err(format!("No se pudieron leer los datos de \"{}\".", nombre));
            }
            let mut buffer = buffer_alineado(necesario as usize);
            let ok = GetPrinterW(
                handle,
                2,
                buffer.as_mut_ptr() as *mut BYTE,
                necesario,
                &mut necesario,
            );
            ClosePrinter(handle);
            if ok == 0 {
                return Err(format!("No se pudieron leer los datos de \"{}\".", nombre));
            }

            let info = &*(buffer.as_ptr() as *const PRINTER_INFO_2W);
            Ok((desde_wide(info.pPortName), desde_wide(info.pDriverName)))
        }
    }

    pub fn listar() -> Result<Vec<ImpresoraDelSistema>, String> {
        let predeterminada = impresora_por_defecto().unwrap_or_default();
        unsafe {
            let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
            let mut necesario: DWORD = 0;
            let mut cantidad: DWORD = 0;
            EnumPrintersW(
                flags,
                ptr::null_mut(),
                2,
                ptr::null_mut(),
                0,
                &mut necesario,
                &mut cantidad,
            );
            if necesario == 0 {
                // Sin impresoras instaladas no hay error: hay una lista vacía.
                return Ok(Vec::new());
            }
            let mut buffer = buffer_alineado(necesario as usize);
            if EnumPrintersW(
                flags,
                ptr::null_mut(),
                2,
                buffer.as_mut_ptr() as *mut BYTE,
                necesario,
                &mut necesario,
                &mut cantidad,
            ) == 0
            {
                return Err("No se pudo leer la lista de impresoras de Windows.".into());
            }

            let base = buffer.as_ptr() as *const PRINTER_INFO_2W;
            let mut salida = Vec::with_capacity(cantidad as usize);
            for i in 0..cantidad as usize {
                let info = &*base.add(i);
                let nombre = desde_wide(info.pPrinterName);
                let puerto = desde_wide(info.pPortName);
                let driver = desde_wide(info.pDriverName);
                salida.push(ImpresoraDelSistema {
                    predeterminada: nombre == predeterminada,
                    sirve_para_ticket: !es_impresora_virtual(&puerto, &driver),
                    nombre,
                    puerto,
                    driver,
                });
            }
            Ok(salida)
        }
    }

    pub fn imprimir_raw(nombre: &str, datos: &[u8]) -> Result<(), String> {
        if datos.is_empty() {
            return Err("No hay nada para imprimir.".into());
        }

        // Antes de mandar un solo byte: si el destino es una impresora virtual,
        // el trabajo terminaría en un archivo ilegible y el spooler diría que
        // salió todo bien. Ver el comentario del encabezado.
        let (puerto, driver) = puerto_y_driver(nombre)?;
        if es_impresora_virtual(&puerto, &driver) {
            return Err(mensaje_impresora_virtual(nombre));
        }

        unsafe {
            let mut nombre_w = a_wide(nombre);
            let mut handle = ptr::null_mut();
            if OpenPrinterW(nombre_w.as_mut_ptr(), &mut handle, ptr::null_mut()) == 0 {
                return Err(format!(
                    "No se pudo abrir la impresora \"{}\". Revisá que el nombre sea exacto y que esté encendida.",
                    nombre
                ));
            }

            let mut doc = a_wide("Ticket NexoSoft");
            let mut tipo = a_wide("RAW");
            let mut info = DOC_INFO_1W {
                pDocName: doc.as_mut_ptr(),
                pOutputFile: ptr::null_mut(),
                pDatatype: tipo.as_mut_ptr(),
            };

            if StartDocPrinterW(handle, 1, &mut info as *mut _ as *mut BYTE) == 0 {
                ClosePrinter(handle);
                return Err("No se pudo iniciar el trabajo de impresión.".into());
            }
            if StartPagePrinter(handle) == 0 {
                EndDocPrinter(handle);
                ClosePrinter(handle);
                return Err("No se pudo iniciar la página en la impresora.".into());
            }

            let mut escritos: DWORD = 0;
            let ok = WritePrinter(
                handle,
                datos.as_ptr() as *mut c_void,
                datos.len() as DWORD,
                &mut escritos,
            );

            EndPagePrinter(handle);
            EndDocPrinter(handle);
            ClosePrinter(handle);

            if ok == 0 {
                return Err("La impresora rechazó los datos.".into());
            }
            if escritos as usize != datos.len() {
                return Err(format!(
                    "Se enviaron {} de {} bytes a la impresora.",
                    escritos,
                    datos.len()
                ));
            }
            Ok(())
        }
    }
}

#[cfg(not(windows))]
mod windows_impl {
    use super::ImpresoraDelSistema;

    pub fn impresora_por_defecto() -> Result<String, String> {
        Err("La impresión térmica directa solo está implementada en Windows.".into())
    }
    pub fn listar() -> Result<Vec<ImpresoraDelSistema>, String> {
        Ok(Vec::new())
    }
    pub fn imprimir_raw(_nombre: &str, _datos: &[u8]) -> Result<(), String> {
        Err("La impresión térmica directa solo está implementada en Windows.".into())
    }
}

/// Nombre de la impresora predeterminada de Windows. El POS la usa cuando no
/// hay una configurada a mano.
#[tauri::command]
pub fn impresora_predeterminada() -> Result<String, String> {
    windows_impl::impresora_por_defecto()
}

/// Impresoras instaladas, con el dato de cuáles sirven para imprimir tickets.
/// La pantalla de Configuración la usa para que el comercio elija la térmica en
/// vez de depender de la predeterminada de Windows.
#[tauri::command]
pub fn listar_impresoras() -> Result<Vec<ImpresoraDelSistema>, String> {
    windows_impl::listar()
}

/// Manda bytes ESC/POS ya armados a la impresora. Si `impresora` viene vacío,
/// usa la predeterminada de Windows.
#[tauri::command]
pub fn imprimir_escpos(impresora: Option<String>, datos: Vec<u8>) -> Result<(), String> {
    let nombre = match impresora {
        Some(n) if !n.trim().is_empty() => n,
        _ => windows_impl::impresora_por_defecto()?,
    };
    windows_impl::imprimir_raw(&nombre, &datos)
}

#[cfg(test)]
mod tests {
    use super::es_impresora_virtual;

    #[test]
    fn detecta_las_virtuales_de_windows_por_el_puerto() {
        // "Microsoft Print to PDF" y XPS usan PORTPROMPT: en cualquier idioma.
        assert!(es_impresora_virtual("PORTPROMPT:", "Microsoft Print To PDF"));
        assert!(es_impresora_virtual(
            "PORTPROMPT:",
            "Microsoft XPS Document Writer v4"
        ));
        assert!(es_impresora_virtual("FILE:", "Cualquiera"));
        assert!(es_impresora_virtual("nul:", "Cualquiera"));
        assert!(es_impresora_virtual("SHRFAX:", "Microsoft Shared Fax Driver"));
    }

    #[test]
    fn detecta_las_virtuales_de_terceros_por_el_driver() {
        assert!(es_impresora_virtual("PDFCreator:", "PDFCreator"));
        assert!(es_impresora_virtual("LPT1:", "Bullzip PDF Printer"));
        assert!(es_impresora_virtual("OneNote:", "Send to Microsoft OneNote 16"));
    }

    #[test]
    fn una_termica_de_verdad_pasa() {
        assert!(!es_impresora_virtual("USB001", "EPSON TM-T20II Receipt"));
        assert!(!es_impresora_virtual("COM3", "Generic / Text Only"));
        assert!(!es_impresora_virtual(
            "IP_192.168.0.50",
            "XP-58 Series Printer"
        ));
        assert!(!es_impresora_virtual(
            "\\\\servidor\\caja1",
            "POS-80 Printer"
        ));
    }
}
