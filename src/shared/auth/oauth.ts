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

const local = (key: string) => ({
  get: () => (typeof window === 'undefined' ? null : window.localStorage.getItem(key)),
  set: (v: string) => { if (typeof window !== 'undefined') window.localStorage.setItem(key, v); },
  clear: () => { if (typeof window !== 'undefined') window.localStorage.removeItem(key); },
});

// Invitación pendiente: se recuerda por si el regreso de Google o del
// correo de confirmación pierde el enlace original.
export const pendingInvite = local('nexo.invite');
// Token para el que la persona ya dio su consentimiento (creó la cuenta o
// entró desde ese mismo enlace): al volver se une sin otro toque.
export const inviteConsent = local('nexo.invite.consent');

/** Marca de alta desde la app; el hook de registro la exige (junto con las invitaciones). */
export const SIGNUP_SOURCE = 'mis-turnos';

const PROD_ORIGIN = 'https://nuestros-turnos.vercel.app';
const origin = () => (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : PROD_ORIGIN);

/** Enlace general permanente de Mis Turnos (se puede reenviar libremente). */
export const generalLink = () => `${origin()}/unirse`;
/** Enlace privado de invitación de pareja. */
export const inviteLink = (token: string) => `${origin()}/invitacion?token=${token}`;

/** Compartir (hoja nativa en iPhone, p. ej. WhatsApp) o, si no hay, copiar. Devuelve el resultado. */
export async function shareOrCopy(message: string, url: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ text: message, url });
      return 'shared';
    }
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') return 'failed';
  }
  return copyText(url);
}

export async function copyText(text: string): Promise<'copied' | 'failed'> {
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
