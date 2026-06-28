import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { API_URL } from "../api/config";
import { ClienteApi } from "../api/cliente-http";
import { iniciarSesion, type Credenciales } from "../api/auth";
import { decodificarToken, tokenExpirado, type DatosSesion } from "./token";
import { borrarTokens, guardarTokens, leerTokens } from "./almacen-sesion";

interface EstadoSesion {
  /** Datos del usuario logueado, o null si no hay sesión vigente. */
  readonly sesion: DatosSesion | null;
  /** Cliente HTTP ya configurado con el token vigente. */
  readonly api: ClienteApi;
  login: (credenciales: Credenciales) => Promise<void>;
  logout: () => void;
}

const Contexto = createContext<EstadoSesion | null>(null);

/** Restaura la sesión desde el almacenamiento, descartándola si expiró/es inválida. */
function restaurarSesion(): { sesion: DatosSesion | null; token: string | null } {
  const tokens = leerTokens();
  if (!tokens) return { sesion: null, token: null };
  try {
    const datos = decodificarToken(tokens.accessToken);
    if (tokenExpirado(datos)) {
      borrarTokens();
      return { sesion: null, token: null };
    }
    return { sesion: datos, token: tokens.accessToken };
  } catch {
    borrarTokens();
    return { sesion: null, token: null };
  }
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const inicial = restaurarSesion();
  const [sesion, setSesion] = useState<DatosSesion | null>(inicial.sesion);
  const tokenRef = useRef<string | null>(inicial.token);

  // Cliente estable: lee el token vigente desde el ref en cada request.
  const api = useMemo(() => new ClienteApi(API_URL, () => tokenRef.current), []);

  const login = useCallback(async (credenciales: Credenciales) => {
    const tokens = await iniciarSesion(API_URL, credenciales);
    const datos = decodificarToken(tokens.accessToken);
    guardarTokens(tokens);
    tokenRef.current = tokens.accessToken;
    setSesion(datos);
  }, []);

  const logout = useCallback(() => {
    borrarTokens();
    tokenRef.current = null;
    setSesion(null);
  }, []);

  const valor = useMemo<EstadoSesion>(
    () => ({ sesion, api, login, logout }),
    [sesion, api, login, logout],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): EstadoSesion {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useSesion debe usarse dentro de <ProveedorSesion>");
  return ctx;
}
