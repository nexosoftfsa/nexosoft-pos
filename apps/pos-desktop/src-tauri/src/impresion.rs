//! Impresión térmica ESC/POS: manda los bytes crudos al spooler de Windows
//! con datatype "RAW".
//!
//! Esto saltea el renderizado del navegador (`window.print()`), que trata al
//! ticket como una página de oficina: obliga a un tamaño de papel fijo — en
//! una térmica el driver declara un rollo de 3276mm — y por lo tanto
//! desperdicia papel, no controla el corte y abre un diálogo en cada venta.
//! Mandando ESC/POS directo, el papel avanza exactamente lo que se imprimió
//! y el corte lo hace la impresora por comando.

#[cfg(windows)]
mod windows_impl {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;

    use winapi::ctypes::c_void;
    use winapi::shared::minwindef::{BYTE, DWORD};
    use winapi::um::winspool::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, GetDefaultPrinterW, OpenPrinterW,
        StartDocPrinterW, StartPagePrinter, WritePrinter, DOC_INFO_1W,
    };

    fn a_wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
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

    pub fn imprimir_raw(nombre: &str, datos: &[u8]) -> Result<(), String> {
        if datos.is_empty() {
            return Err("No hay nada para imprimir.".into());
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
    pub fn impresora_por_defecto() -> Result<String, String> {
        Err("La impresión térmica directa solo está implementada en Windows.".into())
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
