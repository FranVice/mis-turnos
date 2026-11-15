import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { authStorage } from './storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const forceDemo = process.env.EXPO_PUBLIC_DEMO === '1';

// Sin credenciales (o con EXPO_PUBLIC_DEMO=1) la app arranca en modo demostración.
export const isDemo = forceDemo || !url || !key || url.includes('TU-PROYECTO');

export const supabase: SupabaseClient | null = isDemo
  ? null
  : createClient(url!, key!, {
      auth: {
        storage: authStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    });
