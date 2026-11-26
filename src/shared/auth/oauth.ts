import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

/**
 * «Entrar con Google» solo aparece cuando el proveedor está configurado en
 * Supabase (Authentication → Providers → Google) y EXPO_PUBLIC_GOOGLE_AUTH=1.
 */
export const googleEnabled = process.env.EXPO_PUBLIC_GOOGLE_AUTH === '1';

/** Dirección de vuelta tras Google o tras confirmar el correo (debe estar en Redirect URLs). */
export const returnUrl = (path = '/') =>
  Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin + path : undefined;

export async function signInWithGoogle(path = '/'): Promise<string | null> {
  if (!supabase) return null;
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnUrl(path) } });
  if (!error) return null;
  if (/not enabled|unsupported provider/i.test(error.message)) return 'El acceso con Google aún no está activado.';
  return error.message;
}

// Invitación pendiente: se recuerda por si el regreso de Google o del
// correo de confirmación pierde el enlace original.
const INVITE_KEY = 'nexo.invite';
export const pendingInvite = {
  get: () => (typeof window === 'undefined' ? null : window.localStorage.getItem(INVITE_KEY)),
  set: (token: string) => { if (typeof window !== 'undefined') window.localStorage.setItem(INVITE_KEY, token); },
  clear: () => { if (typeof window !== 'undefined') window.localStorage.removeItem(INVITE_KEY); },
};
