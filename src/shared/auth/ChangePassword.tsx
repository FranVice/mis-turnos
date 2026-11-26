import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { Banner, Button, colors, useToast } from '../ui';

// Cambiar la contraseña con la sesión iniciada. No envía correos: sirve
// también mientras no haya SMTP propio (cuentas creadas a mano).
export function ChangePassword() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!supabase || busy) return;
    setError(null);
    if (pw.length < 12) return setError('Usa al menos 12 caracteres.');
    if (pw !== repeat) return setError('Las dos contraseñas no coinciden.');
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) {
        if (/different from the old|same as/i.test(error.message)) setError('La nueva contraseña debe ser distinta de la actual.');
        else if (/reauthenticat|recent/i.test(error.message)) setError('Por seguridad, cierra sesión, vuelve a entrar y repite el cambio.');
        else if (/weak|pwned|leaked/i.test(error.message)) setError('Esa contraseña es demasiado común. Elige otra.');
        else setError(error.message);
        return;
      }
      setPw('');
      setRepeat('');
      setOpen(false);
      toast('Contraseña cambiada');
    } catch {
      setError('No se pudo conectar. Vuelve a intentarlo.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <Button title="Cambiar contraseña" variant="secondary" onPress={() => setOpen(true)} />;

  return (
    <View style={s.box}>
      <Text style={s.label}>Nueva contraseña</Text>
      <TextInput
        value={pw}
        onChangeText={setPw}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        accessibilityLabel="Nueva contraseña"
        style={s.input}
        placeholder="Mínimo 12 caracteres"
        placeholderTextColor={colors.faint}
      />
      <Text style={s.label}>Repítela</Text>
      <TextInput
        value={repeat}
        onChangeText={setRepeat}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        accessibilityLabel="Repite la nueva contraseña"
        onSubmitEditing={save}
        style={s.input}
        placeholderTextColor={colors.faint}
      />
      {error ? <Banner kind="error">{error}</Banner> : null}
      <View style={s.row}>
        <Button
          title="Cancelar"
          variant="ghost"
          onPress={() => {
            setOpen(false);
            setError(null);
            setPw('');
            setRepeat('');
          }}
          style={{ flex: 1 }}
        />
        <Button title="Guardar" onPress={save} loading={busy} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  box: { gap: 8, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  label: { fontSize: 12, fontWeight: '800', color: colors.faint, textTransform: 'uppercase', letterSpacing: 0.8 },
  input: { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 14, fontSize: 17, color: colors.text },
  row: { flexDirection: 'row', gap: 8 },
});
