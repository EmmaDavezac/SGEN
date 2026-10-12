import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_CONFIGURED, SUPABASE_PUBLISHABLE_KEY } from './config.js';

// El cliente solo usa la clave anon/public. Las operaciones sensibles deben pasar por RLS.
export const supabase = SUPABASE_CONFIGURED
    ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;

export function requireSupabase() {
    if (!supabase) {
        throw new Error('Supabase no está configurado. Completa VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.');
    }
    return supabase;
}

export async function signInWithSupabase(email, password) {
    if (!supabase) return null;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return null;

    const { data: profile, error: profileError } = await supabase
        .from('perfiles')
        .select('id, email, nombre, rol')
        .eq('id', data.user.id)
        .maybeSingle();

    if (profileError || !profile) return null;
    return { ...profile, authId: data.user.id };
}

export async function getValidSession() {
    if (!supabase) throw new Error('Supabase no está configurado.');

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) throw new Error('No hay una sesión activa. Volvé a iniciar sesión.');

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw refreshError;
    if (!refreshed.session) throw new Error('No se pudo renovar la sesión. Volvé a iniciar sesión.');

    return refreshed.session;
}