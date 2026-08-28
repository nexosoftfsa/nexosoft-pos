/**
 * Pone en fila las tareas que comparten una clave: dos con la misma clave nunca
 * corren a la vez, y las de claves distintas no se estorban.
 *
 * Existe por la numeración de ARCA. Pedir un CAE son dos pasos —preguntar cuál
 * fue el último número autorizado y mandar el siguiente— y entre uno y otro hay
 * una llamada de red. Con dos cajas vendiendo al mismo tiempo, las dos leen el
 * mismo último número, las dos proponen el mismo siguiente, y ARCA rechaza la
 * segunda por numeración no correlativa. Ese rechazo además no es transitorio:
 * la venta quedaba marcada RECHAZADA y no se reintentaba nunca.
 *
 * La clave es el punto de venta + el tipo de comprobante, porque es exactamente
 * el alcance en el que ARCA exige correlatividad: dos cajas facturando B y C a
 * la vez no tienen por qué esperarse.
 */
export class ColaPorClave {
  /** Última tarea encolada por clave. Nunca rechaza: ver `enFila`. */
  private readonly ultima = new Map<string, Promise<void>>();

  async enFila<T>(clave: string, tarea: () => Promise<T>): Promise<T> {
    const previa = this.ultima.get(clave) ?? Promise.resolve();

    let liberar!: () => void;
    const miTurno = new Promise<void>((resolver) => {
      liberar = resolver;
    });
    // El que venga después espera a que termine mi turno. `liberar` se llama
    // siempre (está en el `finally`), así que una tarea que falla libera la
    // fila en vez de dejarla trabada.
    this.ultima.set(clave, previa.then(() => miTurno));

    await previa;
    try {
      return await tarea();
    } finally {
      liberar();
    }
  }

  /** Cuántas claves hay en juego. Sólo para tests. */
  get clavesActivas(): number {
    return this.ultima.size;
  }
}
