import React, { useState } from 'react';
import { View, TextInput, Button, Text } from 'react-native';
import { supabase, signUp, signIn, getCurrentUser, signOut } from '../../utils/supabase';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  async function handleSignUp() {
    try {
      await signUp(email, password);
      setMessage('Check your email for confirmation!');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleSignIn() {
    try {
      await signIn(email, password);
      setMessage('Logged in successfully!');
    } catch (error) {
      setMessage(error.message);
    }
  }
  console.log("Supabase functions loaded:", { signUp, signIn, getCurrentUser, signOut });

  return (
    <View>
      <TextInput placeholder="Email" onChangeText={setEmail} />
      <TextInput placeholder="Password" secureTextEntry onChangeText={setPassword} />
      <Button title="Sign Up" onPress={handleSignUp} />
      <Button title="Sign In" onPress={handleSignIn} />
      {message && <Text>{message}</Text>}
    </View>
  );
}
