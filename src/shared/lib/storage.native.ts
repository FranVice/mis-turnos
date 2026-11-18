// En iOS/Android, expo-sqlite proporciona un localStorage persistente
// donde Supabase guarda la sesión entre aperturas de la app.
import 'expo-sqlite/localStorage/install';

export const authStorage = globalThis.localStorage;
