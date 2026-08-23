/**
 * Evaluación de fortaleza de contraseña, pensada para el **acceso remoto**
 * (Fase 17.C).
 *
 * Cuando el panel se expone a internet (ADR-0055), la contraseña del usuario
 * que entra desde afuera pasa a ser la única cosa que separa a un
 * desconocido de los datos del comercio. El rate-limiting y el lockout de
 * ADR-0052 hacen lentísimo un ataque por fuerza bruta, pero no salvan de una
 * contraseña que se adivina en tres intentos (el nombre del comercio y el
 * año, por ejemplo).
 *
 * Esto NO bloquea el login: sólo marca la contraseña como débil para que el
 * POS lo avise antes de exponer el panel. Cambiar la política de contraseñas
 * de golpe dejaría a comercios afuera de su propio sistema.
 */

/**
 * Mínimo para considerar aceptable una contraseña que se usa desde internet.
 * El instalador exige 8, que alcanza para una PC en el mostrador pero no
 * para algo publicado en la web.
 */
export const LARGO_MINIMO_REMOTO = 12;

/**
 * Las que prueba primero cualquier atacante. No pretende ser exhaustiva —
 * una lista de un millón de entradas no cambiaría el resultado, porque el
 * resto de las reglas ya cubre lo que estas ejemplifican.
 */
const COMUNES: ReadonlySet<string> = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'contraseña',
  'contrasena',
  'password',
  'password1',
  'passw0rd',
  'qwertyuiop',
  'administrador',
  'admin1234',
  'administrador1',
  'nexosoft',
  'nexosoft123',
  'iloveyou',
  'bienvenido',
]);

export interface Fortaleza {
  readonly debil: boolean;
  /** Explicación en criollo de por qué es débil. `null` si no lo es. */
  readonly motivo: string | null;
}

const FUERTE: Fortaleza = { debil: false, motivo: null };

export interface ContextoPassword {
  /** Email del usuario: la parte antes de la @ es un candidato obvio. */
  readonly email?: string | undefined;
  /** Nombre del comercio: el candidato más obvio de todos. */
  readonly nombreComercio?: string | undefined;
}

/** Palabras del contexto que valen como pista (las muy cortas dan falsos positivos). */
function pistas(contexto: ContextoPassword): string[] {
  const crudas = [
    contexto.email?.split('@')[0] ?? '',
    ...(contexto.nombreComercio ?? '').split(/[\s.,-]+/),
  ];
  return crudas.map((p) => p.trim().toLowerCase()).filter((p) => p.length >= 4);
}

/**
 * Decide si una contraseña es demasiado débil para exponerla a internet.
 * Se evalúa con la contraseña en claro, en el momento del login — nunca se
 * guarda ni se registra: sólo queda el veredicto.
 */
export function evaluarFortaleza(password: string, contexto: ContextoPassword = {}): Fortaleza {
  const limpia = password.trim();
  const minuscula = limpia.toLowerCase();

  if (limpia.length < LARGO_MINIMO_REMOTO) {
    return {
      debil: true,
      motivo: `Tiene menos de ${LARGO_MINIMO_REMOTO} caracteres.`,
    };
  }
  if (COMUNES.has(minuscula)) {
    return { debil: true, motivo: 'Es una de las contraseñas más usadas del mundo.' };
  }
  for (const pista of pistas(contexto)) {
    if (minuscula.includes(pista)) {
      return {
        debil: true,
        motivo: 'Contiene el nombre del comercio o del usuario, que cualquiera conoce.',
      };
    }
  }
  // Un solo tipo de carácter: "12345678901" o "mimamameamamucho". Con
  // suficiente largo dejan de ser adivinables, pero hasta ahí son de las
  // primeras que prueba un ataque de diccionario.
  const soloDigitos = /^\d+$/.test(limpia);
  const soloLetrasMismaCaja = /^[a-záéíóúñ]+$/.test(minuscula) && limpia === minuscula;
  if ((soloDigitos || soloLetrasMismaCaja) && limpia.length < 16) {
    return {
      debil: true,
      motivo: soloDigitos
        ? 'Son todos números.'
        : 'Son todas letras minúsculas, sin números ni símbolos.',
    };
  }
  return FUERTE;
}
