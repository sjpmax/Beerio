import React, { useState, useEffect } from 'react';
import { View, TextInput, Button, Text, Alert, TouchableOpacity, Image, StyleSheet, ScrollView } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { supabase, fetchBeerTypes } from '../../utils/supabase';

export default function BeerAdd() {
  const [beerName, setBeerName] = useState('');
  const [beerType, setBeerType] = useState('');
  const [abv, setAbv] = useState('');
  const [price, setPrice] = useState('');
  const [size, setSize] = useState('16');
  const [image, setImage] = useState(null);
  const [beerTypes, setBeerTypes] = useState([]);

  useEffect(() => {
    async function getBeerTypes() {
      try {
        const types = await fetchBeerTypes();
        setBeerTypes(types);
      } catch (error) {
        Alert.alert('Error', 'Failed to fetch beer types');
      }
    }
    getBeerTypes();
  }, []);

  async function pickImage() {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  }

  async function addBeer() {
    if (!beerName || !beerType || !abv || !price) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const { error } = await supabase.from('beers').insert([
      {
        name: beerName,
        type: beerType,
        abv: parseFloat(abv),
        price: parseFloat(price),
        size_oz: parseInt(size),
        bar_id: null,
        user_id: null,
      },
    ]);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Success', 'Beer added!');
      setBeerName('');
      setBeerType('');
      setAbv('');
      setPrice('');
      setSize('16');
      setImage(null);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          placeholder="Beer Name"
          value={beerName}
          onChangeText={setBeerName}
        />
        <View style={styles.pickerWrapper}>
          <Picker
            selectedValue={beerType}
            onValueChange={(itemValue) => setBeerType(itemValue)}
            style={styles.picker}
          >
            {beerTypes.map((type) => (
              <Picker.Item key={type.type} label={type.type} value={type.type} />
            ))}
          </Picker>
        </View>
        <TextInput
          style={styles.input}
          placeholder="ABV (%)"
          value={abv}
          onChangeText={setAbv}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Price ($)"
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Size (oz)"
          value={size}
          onChangeText={setSize}
          keyboardType="numeric"
        />

        {image && (
          <Image source={{ uri: image }} style={styles.image} />
        )}
        <TouchableOpacity onPress={pickImage} style={styles.imageButton}>
          <Text style={styles.imageButtonText}>📷 Upload Menu Image</Text>
        </TouchableOpacity>

        <Button title="Add Beer" onPress={addBeer} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f4f5',
  },
  content: {
    padding: 20,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  input: {
    backgroundColor: '#fff',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  pickerWrapper: {
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  picker: {
    padding: 12,
    fontSize: 16,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
    resizeMode: 'cover',
  },
  imageButton: {
    marginBottom: 24,
    alignItems: 'center',
  },
  imageButtonText: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 16,
  },
});
