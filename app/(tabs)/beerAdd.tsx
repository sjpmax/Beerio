
import React, { useState, useEffect } from 'react';
import { View, TextInput, Button, Text, Alert, TouchableOpacity, Image, StyleSheet, ScrollView, FlatList, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { supabase, fetchBeerTypes, fetchBars, searchAllBeers, BeerSuggestion, getCurrentUser  } from '../../utils/supabase';


interface BeerSuggestion {
  id: string;
  name: string;
  abv: string;
  type: string;
  brewery?: string;
  source: 'beerdb' | 'local';
  availableAt?: string;
  currentPrice?: number;
  currentSize?: number;
}

interface BrewerySuggestion {
  id: string;
  name: string;
  location?: string;
}

export default function BeerAdd() {
 const [beerName, setBeerName] = useState('');
  const [beerType, setBeerType] = useState('');
  const [brewery, setBrewery] = useState('');
  const [bars, setBars] = useState([]);
  const [selectedBar, setSelectedBar] = useState('');
  const [abv, setAbv] = useState('');
  const [price, setPrice] = useState('');
  const [size, setSize] = useState('');
  const [image, setImage] = useState(null);
  const [beerTypes, setBeerTypes] = useState([]);
  const [beerSuggestions, setBeerSuggestions] = useState<BeerSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedBeerInfo, setSelectedBeerInfo] = useState<BeerSuggestion | null>(null);
  const [brewerySuggestions, setBrewerySuggestions] = useState<BrewerySuggestion[]>([]);
  const [showBrewerySuggestions, setShowBrewerySuggestions] = useState(false);
  const [isSearchingBreweries, setIsSearchingBreweries] = useState(false);
  const [breweryId, setBreweryId] = useState<string | null>(null);
  const [beerFormat, setBeerFormat] = useState('draft');const [isSubmitting, setIsSubmitting] = useState(false);
const [lastSubmittedBeer, setLastSubmittedBeer] = useState('');

 useEffect(() => {
    async function getBeerTypes() {
      try {
        const types = await fetchBeerTypes();
        setBeerTypes(types);
      } catch (error) {
        showAlert('Error', 'Failed to fetch beer types');
      }
    }
    getBeerTypes();
  }, []);

  useEffect(() => {
    async function getBarNames() {
      try {
        const barInfo = await fetchBars();
        setBars(barInfo);
      } catch (error) {
        showAlert('Error', 'Failed to fetch bars');
      }
    }
    getBarNames();
  }, []);


  // Combined search function - now clean and simple!
  const searchBeers = async (query: string) => {
    setIsSearching(true);
    try {
      const results = await searchAllBeers(query);
      setBeerSuggestions(results);
      setShowSuggestions(results.length > 0);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle beer name input with search
  const handleBeerNameChange = (text: string) => {
    setBeerName(text);
    setSelectedBeerInfo(null);
    
    if (text.length >= 2) {
      searchBeers(text);
    } else {
      setBeerSuggestions([]);
      setShowSuggestions(false);
    }
  };

// Enhanced selectBeer to auto-fill from existing database entry
const selectBeer = (beer: BeerSuggestion) => {
  setBeerName(beer.name);
  setAbv(beer.abv);
  setBeerType(beer.type);
  
  // Auto-fill brewery info
  if (beer.brewery && beer.brewery !== 'Unknown Brewery') {
    setBrewery(beer.brewery);
    // Search for brewery ID to link properly
    searchBreweries(beer.brewery);
  }
  
  // DON'T auto-fill price or size - user needs to enter for their bar
  // But maybe suggest the existing size as a starting point
  if (beer.currentSize) {
    setSize(beer.currentSize.toString());
  }
  
  setSelectedBeerInfo(beer);
  setShowSuggestions(false);
  setBeerSuggestions([]);
};


  
  // Create new brewery function with moderation
  const createNewBrewery = async (breweryName: string) => {
    try {
      const { data, error } = await supabase
        .from('breweries')
        .insert([{ 
          name: breweryName,
          pending_review: true // Requires admin approval
        }])
        .select()
        .single();
      
      if (error) throw error;
      
      setBreweryId(data.id.toString());
      
      // Show user that brewery is pending review
      Alert.alert(
        'Brewery Submitted', 
        `"${breweryName}" has been submitted for review. It will appear in suggestions once approved by an admin.`,
        [{ text: 'OK' }]
      );
      
      return data;
    } catch (error) {
      console.error('Error creating brewery:', error);
      throw error;
    }
  };

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

 async function checkExactDuplicate(beerName: string, breweryId: number | null, barId: string, sizeOz: number) {
  try {
    console.log('Checking duplicate with params:', { beerName, breweryId, barId, sizeOz });
    
    const { data, error } = await supabase
      .from('beers')
      .select('id, price')
      .eq('name', beerName)
      .eq('brewery_id', breweryId)  
      .eq('bar_id', barId) // barId is already a UUID string
      .eq('size_oz', sizeOz)
      .maybeSingle();

    if (error) {
      console.error('Error in duplicate check:', error);
      return null;
    }

    console.log('Duplicate check result:', data);
    return data;
  } catch (error) {
    console.error('Exception in duplicate check:', error);
    return null;
  }
}


async function addBeer() {
    if (!beerName || !beerType || !abv || !price) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsSubmitting(true);

    try {
      // Get current user
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        Alert.alert('Error', 'You must be logged in to add beers');
        return;
      }

      const { error } = await supabase.from('beers').insert([
        {
          name: beerName,
          type: beerType,
          abv: parseFloat(abv),
          price: parseFloat(price),
          size_oz: parseInt(size),
          beer_format: beerFormat,
          bar_id: null,
          user_id: null,
          pending_review: true,
          status: 'pending',
          submitted_by: currentUser.id,
          submitted_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        // Show success with beer name
        setLastSubmittedBeer(beerName);
        Alert.alert(
          '🍺 Success!', 
          `${beerName} has been submitted for review!\n\nAdmins will review it soon and it'll appear in the main list once approved.`,
          [{ text: 'Add Another Beer', style: 'default' }]
        );
        
        // Reset form after a short delay so user sees the success
        setTimeout(() => {
          setBeerName('');
          setBeerType('');
          setAbv('');
          setPrice('');
          setSize('16');
          setBeerFormat('draft');
          setImage(null);
          setLastSubmittedBeer('');
        }, 500);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add beer');
      console.error('Error adding beer:', error);
    } finally {
      setIsSubmitting(false);
    }
  }


  const searchBreweries = async (query: string) => {
  if (query.length < 2) {
    setBrewerySuggestions([]);
    setShowBrewerySuggestions(false);
    return;
  }

  setIsSearchingBreweries(true);
  try {
    const { data, error } = await supabase.rpc('search_breweries', { search_term: query });
    
    if (error) throw error;
    
    const suggestions = data.map((brewery: any) => ({
      id: brewery.id.toString(),
      name: brewery.name,
      location: brewery.location
    }));
    
    setBrewerySuggestions(suggestions);
    setShowBrewerySuggestions(suggestions.length > 0);
  } catch (error) {
    console.error('Brewery search error:', error);
  } finally {
    setIsSearchingBreweries(false);
  }
};

// Handle brewery input changes (ADD THIS)
const handleBreweryChange = (text: string) => {
  setBrewery(text);
  setBreweryId(null);
  searchBreweries(text);
};

// Handle brewery selection (ADD THIS)
const selectBrewery = (breweryOption: BrewerySuggestion) => {
  setBrewery(breweryOption.name);
  setBreweryId(breweryOption.id);
  setShowBrewerySuggestions(false);
  setBrewerySuggestions([]);
};

const renderSuggestion = ({ item }: { item: BeerSuggestion }) => (
  <TouchableOpacity style={styles.suggestionItem} onPress={() => selectBeer(item)}>
    <Text style={styles.suggestionName}>{item.name}</Text>
    <Text style={styles.suggestionDetails}>
      {item.brewery && `${item.brewery} • `}{item.abv}% ABV • {item.type}
    </Text>
    {item.availableAt && (
      <Text style={styles.suggestionLocation}>
        Available at {item.availableAt} ({item.currentSize}oz - ${item.currentPrice})
      </Text>
    )}
    <Text style={styles.suggestionSource}>
      {item.source === 'beerdb' ? '🍺 Beer Database' : '📱 In Your Database'}
    </Text>
  </TouchableOpacity>
);


const showAlert = (title: string, message?: string, buttons?: any[]) => {
  if (Platform.OS === 'web') {
    // Web fallback using browser alerts
    if (buttons && buttons.length > 1) {
      const result = window.confirm(`${title}\n\n${message}`);
      if (result && buttons[1]?.onPress) {
        buttons[1].onPress();
      } else if (!result && buttons[0]?.onPress) {
        buttons[0].onPress();
      }
    } else {
      window.alert(`${title}\n\n${message}`);
      if (buttons?.[0]?.onPress) {
        buttons[0].onPress();
      }
    }
  } else {
    // Mobile - use React Native Alert
    Alert.alert(title, message, buttons);
  }
};


function resetForm() {
  setBeerName('');
  setBeerType('');
  setBrewery('');
  setBreweryId(null);
  setAbv('');
  setPrice('');
  setSize('');
  setImage(null);
  setSelectedBar('');
  setSelectedBeerInfo(null);
  setBeerSuggestions([]);
  setShowSuggestions(false);
  setBrewerySuggestions([]);
  setShowBrewerySuggestions(false);
  setBeerFormat('draft');
}

  return (
   <ScrollView style={styles.container} contentContainerStyle={styles.content}>
    <View style={styles.card}>
      {lastSubmittedBeer && (
        <View style={styles.successBanner}>
          <Text style={styles.successText}>
            ✅ {lastSubmittedBeer} submitted successfully!
          </Text>
        </View>
      )}
        {/* Bar Selection */}
        <View style={styles.pickerRow}>
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={selectedBar}
              onValueChange={(itemValue) => setSelectedBar(itemValue)}
              style={styles.picker}
            >
              <Picker.Item label="Select a bar..." value="" />  
              {bars.map((bar) => (
                <Picker.Item key={bar.name} label={`${bar.name} • ${bar.street_address}`} value={bar.id} />
              ))}
            </Picker>
          </View>
          <TouchableOpacity 
              style={styles.addButton} 
              onPress={() => navigation.navigate('AddBar')}
            >
              <Text style={styles.addButtonText}>+</Text>
            </TouchableOpacity>
        </View>

         {/* Brewery Input with Autocomplete */}
        <View style={[styles.beerInputContainer, { zIndex: 501 }]}>
          <TextInput
            style={styles.input}
            placeholder="Brewery Name (start typing for suggestions)"
            value={brewery}
            onChangeText={handleBreweryChange}
            onFocus={() => brewery.length >= 2 && setShowBrewerySuggestions(true)}
          />
          
          {isSearchingBreweries && (
            <Text style={styles.searchingText}>Searching breweries...</Text>
          )}

          {/* Brewery suggestions dropdown */}
          {showBrewerySuggestions && brewerySuggestions.length > 0 && (
            <View style={styles.suggestionsContainer}>
              <FlatList
                data={brewerySuggestions}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={styles.suggestionItem} 
                    onPress={() => selectBrewery(item)}
                  >
                    <Text style={styles.suggestionName}>{item.name}</Text>
                    {item.location && (
                      <Text style={styles.suggestionDetails}>{item.location}</Text>
                    )}
                    <Text style={styles.suggestionSource}>🏭 Brewery Database</Text>
                  </TouchableOpacity>
                )}
                keyExtractor={(item) => item.id}
                style={styles.suggestionsList}
                nestedScrollEnabled={true}
              />
            </View>
          )}
        </View>

        {/* Beer Name Input with Autocomplete */}
        <View style={[styles.beerInputContainer, { zIndex: 500 }]}>
          <TextInput
            style={styles.input}
            placeholder="Beer Name (type to search)"
            value={beerName}
            onChangeText={handleBeerNameChange}
            onFocus={() => beerName.length >= 2 && setShowSuggestions(true)}
          />
          
          {isSearching && (
            <Text style={styles.searchingText}>Searching beers...</Text>
          )}

          {/* Selected beer info */}
          {selectedBeerInfo && (
            <View style={styles.selectedBeerInfo}>
              <Text style={styles.selectedBeerText}>
                ✅ {selectedBeerInfo.name} 
                {selectedBeerInfo.brewery && ` by ${selectedBeerInfo.brewery}`}
              </Text>
              <Text style={styles.selectedBeerSource}>
                From: {selectedBeerInfo.source === 'beerdb' ? 'Beer Database' : 'Your Database'}
              </Text>
            </View>
          )}

          {/* Suggestions dropdown */}
          {showSuggestions && beerSuggestions.length > 0 && (
            <View style={styles.suggestionsContainer}>
              <FlatList
                data={beerSuggestions}
                renderItem={renderSuggestion}
                keyExtractor={(item) => `${item.source}-${item.id}`}
                style={styles.suggestionsList}
                nestedScrollEnabled={true}
              />
            </View>
          )}
        </View>

        {/* Beer Type Selection */}
        <View style={styles.pickerRow}>
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={beerType}
              onValueChange={(itemValue) => setBeerType(itemValue)}
              style={styles.picker}
            >
              <Picker.Item label="Select beer type..." value="" />
              {beerTypes.map((beer) => (
                <Picker.Item key={beer.type} label={beer.type} value={beer.type} />
              ))}
            </Picker>
          </View>
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
        <View style={styles.pickerRow}>
        <View style={styles.pickerWrapper}>
          <Picker
            selectedValue={beerFormat}
            onValueChange={(itemValue) => setBeerFormat(itemValue)}
            style={styles.picker}
          >
            <Picker.Item label="Draft" value="draft" />
            <Picker.Item label="Bottle" value="bottle" />
            <Picker.Item label="Can" value="can" />
          </Picker>
        </View> 
        </View>
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

 <TouchableOpacity 
  style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]} 
  onPress={addBeer}
  disabled={isSubmitting}
>
  <Text style={styles.submitButtonText}>
    {isSubmitting ? '🍺 Adding Beer...' : 'Add Beer'}
  </Text>
</TouchableOpacity>
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
  beerInputContainer: {
    position: 'relative',
    width: '100%',
    zIndex: 1000,
  },
  searchingText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: -12,
    marginBottom: 8,
  },
  selectedBeerInfo: {
    backgroundColor: '#e6f7ff',
    padding: 8,
    borderRadius: 6,
    marginTop: -12,
    marginBottom: 12,
  },
  selectedBeerText: {
    fontSize: 14,
    color: '#1890ff',
    fontWeight: '500',
  },
  selectedBeerSource: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderColor: '#ccc',
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    maxHeight: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  suggestionsList: {
    maxHeight: 200,
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  suggestionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  suggestionDetails: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  suggestionSource: {
    fontSize: 12,
    color: '#2563eb',
    marginTop: 2,
  },
  pickerWrapper: {
    flex: 1,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    marginRight: 8,
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
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  addButton: {
    width: 40,
    height: 40,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  }, platformText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
    textAlign: 'center',
  },
  submitButton: {
  backgroundColor: '#2563eb',
  padding: 16,
  borderRadius: 8,
  alignItems: 'center',
  marginTop: 8,
},
submitButtonDisabled: {
  backgroundColor: '#94a3b8',
},
submitButtonText: {
  color: '#fff',
  fontSize: 18,
  fontWeight: '600',
},successBanner: {
  backgroundColor: '#dcfce7',
  borderColor: '#16a34a',
  borderWidth: 1,
  borderRadius: 8,
  padding: 12,
  marginBottom: 16,
},
successText: {
  color: '#15803d',
  textAlign: 'center',
  fontWeight: '600',
},
});