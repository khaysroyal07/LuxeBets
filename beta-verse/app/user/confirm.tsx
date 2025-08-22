// app/confirm.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert } from 'react-native';
import { supabase } from '@/lib/supabase'; // Adjust the import path as necessary

export default function ConfirmScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  const handleVerify = async () => {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'email',
      });

      if (error) throw error;

      Alert.alert('Success', 'Email confirmed!');
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 22, marginBottom: 10 }}>Confirm Your Email</Text>

      <TextInput
        placeholder="Your email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={{
          borderWidth: 1,
          marginBottom: 10,
          padding: 10,
          borderRadius: 5,
        }}
      />

      <TextInput
        placeholder="6-digit code"
        keyboardType="numeric"
        value={code}
        onChangeText={setCode}
        style={{
          borderWidth: 1,
          marginBottom: 10,
          padding: 10,
          borderRadius: 5,
        }}
      />

      <Button title="Confirm Email" onPress={handleVerify} />
    </View>
  );
}
