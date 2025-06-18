import React, { useState, useEffect } from 'react';
import { View, TextInput, Text, TouchableOpacity, Image, StyleSheet, ScrollView, FlatList, Modal, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import {
    supabase,
    fetchBeerTypes,
    fetchBars,
    searchBeersEnhanced,
    getCurrentUser,
    getEnhancedBeerAutofill,
    findBeerServingSize
} from '../../utils/supabase';
import { processMenuPhoto } from '../../utils/menuVision';
import { showAlert, showSubmissionSuccess, showSuccessThenReset } from '../../utils/uiHelpers';

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

interface EditableBeer {
    id: string;
    name: string;
    brewery: string;
    abv: string;
    size: string;
    price: string;
    type: string;
    confidence: 'high' | 'medium' | 'low';
    selected: boolean;
}

export default function BeerAdd() {
    const navigation = useNavigation();

    // Core form state
    const [beerName, setBeerName] = useState('');
    const [beerType, setBeerType] = useState('');
    const [brewery, setBrewery] = useState('');
    const [selectedBar, setSelectedBar] = useState('');
    const [abv, setAbv] = useState('');
    const [price, setPrice] = useState('');
    const [size, setSize] = useState('16');
    const [beerFormat, setBeerFormat] = useState('draft');
    const [image, setImage] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [lastSubmittedBeer, setLastSubmittedBeer] = useState('');

    // Data
    const [bars, setBars] = useState([]);
    const [beerTypes, setBeerTypes] = useState([]);
    const [breweryId, setBreweryId] = useState<string | null>(null);

    // Search state
    const [beerSuggestions, setBeerSuggestions] = useState<BeerSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedBeerInfo, setSelectedBeerInfo] = useState<BeerSuggestion | null>(null);
    const [brewerySuggestions, setBrewerySuggestions] = useState<BrewerySuggestion[]>([]);
    const [showBrewerySuggestions, setShowBrewerySuggestions] = useState(false);

    // AI Autofill state
    const [showAIButton, setShowAIButton] = useState(false);
    const [isAILoading, setIsAILoading] = useState(false);
    const [aiConfidence, setAiConfidence] = useState<'high' | 'medium' | 'low' | null>(null);

    // Menu scanning state (simplified)
    const [showMenuModal, setShowMenuModal] = useState(false);
    const [menuImage, setMenuImage] = useState<string | null>(null);
    const [isProcessingMenu, setIsProcessingMenu] = useState(false);
    const [editableBeers, setEditableBeers] = useState<EditableBeer[]>([]);
    const [areAllBeersFromThisBrewery, setAreAllBeersFromThisBrewery] = useState(false);

    // Load initial data
    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        try {
            const [types, barInfo] = await Promise.all([
                fetchBeerTypes(),
                fetchBars()
            ]);
            setBeerTypes(types);
            setBars(barInfo);
        } catch (error) {
            showAlert('Error', 'Failed to load data');
        }
    };

    // Menu scanning functions
    const takeMenuPhoto = async () => {
        try {
            const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
            if (!permissionResult.granted) {
                showAlert('Permission needed', 'Camera permission is required to scan menus');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                allowsEditing: false,
                quality: 0.8,
            });

            if (!result.canceled) {
                setMenuImage(result.assets[0].uri);
                processMenu(result.assets[0].uri);
            }
        } catch (error) {
            showAlert('Error', 'Failed to take photo');
        }
    };

    const pickMenuPhoto = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: false,
                quality: 0.8,
            });

            if (!result.canceled) {
                setMenuImage(result.assets[0].uri);
                processMenu(result.assets[0].uri);
            }
        } catch (error) {
            showAlert('Error', 'Failed to pick photo');
        }
    };

    const processMenu = async (imageUri: string) => {
        if (!selectedBar) {
            showAlert('Error', 'Please select a bar first before scanning menu');
            return;
        }

        setIsProcessingMenu(true);
        setShowMenuModal(true);

        try {
            const beers = await processMenuPhoto(imageUri, selectedBar, areAllBeersFromThisBrewery);

            if (beers && beers.length > 0) {
                const editableBeers: EditableBeer[] = beers.map((beer, index) => ({
                    id: `menu-${index}`,
                    name: beer.name,
                    brewery: beer.brewery || '',
                    abv: beer.abv?.toString() || '',
                    size: beer.size?.toString() || '',
                    price: beer.price?.toString() || '',
                    type: beer.type || '',
                    confidence: beer.confidence,
                    selected: beer.confidence === 'high' || beer.confidence === 'medium'
                }));

                setEditableBeers(editableBeers);
                showAlert('🍺 Menu Scanned!', `Found ${beers.length} beers! Edit any details and add them to your bar.`);
            } else {
                showAlert('No Beers Found', 'Could not find any beer information in this image. Try taking a clearer photo of the beer menu section.');
            }
        } catch (error) {
            console.error('Menu processing error:', error);
            showAlert('Processing Failed', `Could not process the menu image: ${error.message}. Please try again or add beers manually.`);
        } finally {
            setIsProcessingMenu(false);
        }
    };

    // Beer search functionality
    const searchBeers = async (query: string) => {
        setIsSearching(true);
        try {
            const results = await searchBeersEnhanced(query);
            setBeerSuggestions(results);
            setShowSuggestions(results.length > 0);
        } catch (error) {
            console.error('Search error:', error);
        } finally {
            setIsSearching(false);
        }
    };

    const handleBeerNameChange = (text: string) => {
        setBeerName(text);
        setSelectedBeerInfo(null);
        setAiConfidence(null);
        setShowAIButton(text.length >= 3 && !selectedBeerInfo);

        if (text.length >= 2) {
            searchBeers(text);
        } else {
            setBeerSuggestions([]);
            setShowSuggestions(false);
            setShowAIButton(false);
        }
    };

    const selectBeer = (beer: BeerSuggestion) => {
        setBeerName(beer.name);
        setAbv(beer.abv);
        setBeerType(beer.type);

        if (beer.brewery && beer.brewery !== 'Unknown Brewery') {
            setBrewery(beer.brewery);
            searchBreweries(beer.brewery);
        }

        if (beer.currentSize) {
            setSize(beer.currentSize.toString());
        }

        setSelectedBeerInfo(beer);
        setShowSuggestions(false);
        setBeerSuggestions([]);
        setShowAIButton(false);
    };

    // AI Autofill
    const handleAIAutofill = async () => {
        setIsAILoading(true);
        setShowAIButton(false);

        try {
            const details = await getEnhancedBeerAutofill(beerName);

            if (details) {
                const filledFields = [];

                if (!abv && details.abv) {
                    setAbv(details.abv);
                    filledFields.push('ABV');
                }

                if (!beerType && details.type) {
                    setBeerType(details.type);
                    filledFields.push('Type');
                }

                if (!brewery && details.brewery && details.brewery !== 'Unknown Brewery') {
                    setBrewery(details.brewery);
                    filledFields.push('Brewery');
                }

                if (!size || size === '16') {
                    const foundSize = await findBeerServingSize(beerName, details.brewery);
                    if (foundSize) {
                        setSize(foundSize.toString());
                        filledFields.push('Size');
                    }
                }

                setAiConfidence(details.confidence);

                if (filledFields.length > 0) {
                    showAlert('🤖 AI Autofill Complete', `Filled in: ${filledFields.join(', ')}\n\nConfidence: ${details.confidence}\n\nPlease verify the information is correct.`);
                }
            } else {
                showAlert('🤖 AI Autofill', 'Sorry, I couldn\'t find detailed information about this beer. Try typing a more specific name or brewery.');
            }
        } catch (error) {
            console.error('AI autofill error:', error);
            showAlert('Error', 'AI autofill failed. Please fill in manually.');
        } finally {
            setIsAILoading(false);
        }
    };

    // Brewery search
    const searchBreweries = async (query: string) => {
        if (query.length < 2) {
            setBrewerySuggestions([]);
            setShowBrewerySuggestions(false);
            return;
        }

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
        }
    };

    const handleBreweryChange = (text: string) => {
        setBrewery(text);
        setBreweryId(null);
        searchBreweries(text);
    };

    const selectBrewery = (breweryOption: BrewerySuggestion) => {
        setBrewery(breweryOption.name);
        setBreweryId(breweryOption.id);
        setShowBrewerySuggestions(false);
        setBrewerySuggestions([]);
    };

    // Image picker
    const pickImage = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 1,
            });

            if (!result.canceled) {
                setImage(result.assets[0].uri);
            }
        } catch (error) {
            showAlert('Error', 'Failed to pick image');
        }
    };

    // Form reset
    const resetForm = () => {
        setBeerName('');
        setBeerType('');
        setBrewery('');
        setBreweryId(null);
        setAbv('');
        setPrice('');
        setSize('16');
        setBeerFormat('draft');
        setImage(null);
        setSelectedBar('');
        setSelectedBeerInfo(null);
        setBeerSuggestions([]);
        setShowSuggestions(false);
        setBrewerySuggestions([]);
        setShowBrewerySuggestions(false);
        setShowAIButton(false);
        setAiConfidence(null);
    };

    // Submit single beer
    const addBeer = async () => {
        if (!beerName || !beerType || !abv || !price) {
            showAlert('Error', 'Please fill in all fields');
            return;
        }

        setIsSubmitting(true);

        try {
            const currentUser = await getCurrentUser();
            if (!currentUser) {
                showAlert('Error', 'You must be logged in to add beers');
                return;
            }

            const { error } = await supabase.from('beers').insert([{
                name: beerName,
                type: beerType,
                abv: parseFloat(abv),
                price: parseFloat(price),
                size_oz: parseInt(size),
                beer_format: beerFormat,
                bar_id: selectedBar || null,
                brewery_id: breweryId ? parseInt(breweryId) : null,
                pending_review: true,
                status: 'pending',
                submitted_by: currentUser.id,
                submitted_at: new Date().toISOString(),
            }]);

            if (error) {
                showAlert('Error', error.message);
            } else {
                setLastSubmittedBeer(beerName);
                showSubmissionSuccess(
                    beerName,
                    'Beer',
                    () => showSuccessThenReset(setLastSubmittedBeer, resetForm),
                    () => navigation.navigate('index')
                );
            }
        } catch (error: any) {
            showAlert('Error', error.message || 'Failed to add beer');
            console.error('Error adding beer:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Bulk add from menu scan
    const updateEditableBeer = (index: number, field: keyof EditableBeer, value: string | boolean) => {
        setEditableBeers(prev =>
            prev.map((beer, i) =>
                i === index ? { ...beer, [field]: value } : beer
            )
        );
    };

    const addSelectedBeers = async () => {
        if (!selectedBar) {
            showAlert('Error', 'Please select a bar first');
            return;
        }

        const selectedBeers = editableBeers.filter(beer => beer.selected);
        if (selectedBeers.length === 0) {
            showAlert('Error', 'Please select at least one beer to add');
            return;
        }

        setIsSubmitting(true);
        let addedCount = 0;

        try {
            const currentUser = await getCurrentUser();
            if (!currentUser) {
                showAlert('Error', 'You must be logged in to add beers');
                return;
            }

            for (const beer of selectedBeers) {
                try {
                    const { error } = await supabase.from('beers').insert([{
                        name: beer.name.trim(),
                        type: beer.type.trim() || 'Ale',
                        abv: beer.abv ? parseFloat(beer.abv) : null,
                        price: beer.price ? parseFloat(beer.price) : null,
                        size_oz: beer.size ? parseInt(beer.size) : null,
                        beer_format: 'draft',
                        bar_id: selectedBar,
                        brewery_id: null,
                        pending_review: true,
                        status: 'pending',
                        submitted_by: currentUser.id,
                        submitted_at: new Date().toISOString(),
                    }]);

                    if (!error) {
                        addedCount++;
                    }
                } catch (error) {
                    console.error('Error adding beer:', beer.name, error);
                }
            }

            showAlert('🎉 Bulk Add Complete!', `Successfully added ${addedCount} beers!\n\nThey will appear in the main list once approved.`);

            // Reset menu scanning state
            setShowMenuModal(false);
            setEditableBeers([]);
            setMenuImage(null);

        } catch (error) {
            showAlert('Error', 'Failed to add beers in bulk');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Render functions
    const renderBeerSuggestion = ({ item }: { item: BeerSuggestion }) => (
        <TouchableOpacity style={styles.suggestionItem} onPress={() => selectBeer(item)}>
            <Text style={styles.suggestionName}>{item.name}</Text>
            <Text style={styles.suggestionDetails}>
                {item.brewery ? `${item.brewery} • ` : ''}{item.abv}% ABV • {item.type}
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

    const renderBrewerySuggestion = ({ item }: { item: BrewerySuggestion }) => (
        <TouchableOpacity style={styles.suggestionItem} onPress={() => selectBrewery(item)}>
            <Text style={styles.suggestionName}>{item.name}</Text>
            {item.location && (
                <Text style={styles.suggestionDetails}>{item.location}</Text>
            )}
            <Text style={styles.suggestionSource}>🏭 Brewery Database</Text>
        </TouchableOpacity>
    );

    const renderEditableBeer = ({ item, index }: { item: EditableBeer; index: number }) => (
        <View style={[
            styles.editableBeerCard,
            {
                borderColor: item.selected ? '#3b82f6' : '#e2e8f0',
                borderWidth: item.selected ? 2 : 1,
                backgroundColor: item.selected ? '#f0f9ff' : '#fff'
            }
        ]}>
            {/* Header with checkbox */}
            <View style={styles.beerHeader}>
                <TouchableOpacity
                    style={styles.checkboxContainer}
                    onPress={() => updateEditableBeer(index, 'selected', !item.selected)}
                >
                    <View style={[
                        styles.checkbox,
                        item.selected && styles.checkboxSelected
                    ]}>
                        {item.selected && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.confidenceText}>
                        {item.confidence} confidence
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Editable fields */}
            <TextInput
                style={styles.beerNameInput}
                value={item.name}
                onChangeText={(text) => updateEditableBeer(index, 'name', text)}
                placeholder="Beer Name"
            />

            <TextInput
                style={styles.breweryInput}
                value={item.brewery}
                onChangeText={(text) => updateEditableBeer(index, 'brewery', text)}
                placeholder="Brewery"
            />

            <View style={styles.fieldRow}>
                <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>ABV</Text>
                    <TextInput
                        style={styles.fieldInput}
                        value={item.abv}
                        onChangeText={(text) => updateEditableBeer(index, 'abv', text)}
                        placeholder="5.0"
                        keyboardType="decimal-pad"
                    />
                    <Text style={styles.fieldUnit}>%</Text>
                </View>

                <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Size</Text>
                    <TextInput
                        style={styles.fieldInput}
                        value={item.size}
                        onChangeText={(text) => updateEditableBeer(index, 'size', text)}
                        placeholder=""
                        keyboardType="numeric"
                    />
                    <Text style={styles.fieldUnit}>oz</Text>
                </View>

                <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Price</Text>
                    <Text style={styles.fieldUnit}>$</Text>
                    <TextInput
                        style={styles.fieldInput}
                        value={item.price}
                        onChangeText={(text) => updateEditableBeer(index, 'price', text)}
                        placeholder=""
                        keyboardType="decimal-pad"
                    />
                </View>
            </View>

            <TextInput
                style={styles.typeInput}
                value={item.type}
                onChangeText={(text) => updateEditableBeer(index, 'type', text)}
                placeholder="Beer Type (IPA, Lager, etc.)"
            />
        </View>
    );

    const selectedBeersCount = editableBeers.filter(beer => beer.selected).length;

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.card}>
                {lastSubmittedBeer ? (
                    <View style={styles.successBanner}>
                        <Text style={styles.successText}>
                            ✅ {lastSubmittedBeer} submitted successfully!
                        </Text>
                    </View>
                ) : null}

                {/* Menu Scanning Section */}
                <View style={styles.menuScanSection}>
                    <Text style={styles.sectionTitle}>📷 Scan Menu (Beta)</Text>
                    <Text style={styles.sectionSubtitle}>
                        Take a photo of a beer menu to add multiple beers quickly
                    </Text>

                    <View style={styles.menuButtonRow}>
                        <TouchableOpacity style={styles.menuButton} onPress={takeMenuPhoto}>
                            <Text style={styles.menuButtonText}>📷 Take Photo</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.menuButton} onPress={pickMenuPhoto}>
                            <Text style={styles.menuButtonText}>🖼️ Choose Photo</Text>
                        </TouchableOpacity>
                    </View>
                </View>

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
                                <Picker.Item
                                    key={bar.id}
                                    label={`${bar.name} • ${bar.street_address}`}
                                    value={bar.id}
                                />
                            ))}
                        </Picker>
                    </View>
                    <TouchableOpacity
                        style={styles.addButton}
                        onPress={() => navigation.navigate('barAdd')}
                    >
                        <Text style={styles.addButtonText}>+</Text>
                    </TouchableOpacity>
                </View>

                {selectedBar && (
                    <View style={styles.breweryAttributionSection}>
                        <TouchableOpacity
                            style={styles.checkboxContainer}
                            onPress={() => setAreAllBeersFromThisBrewery(!areAllBeersFromThisBrewery)}
                        >
                            <View style={[
                                styles.checkbox,
                                areAllBeersFromThisBrewery && styles.checkboxSelected
                            ]}>
                                {areAllBeersFromThisBrewery && <Text style={styles.checkmark}>✓</Text>}
                            </View>
                            <Text style={styles.checkboxLabel}>
                                Are all beers made at {bars.find(b => b.id === selectedBar)?.name}?
                            </Text>
                        </TouchableOpacity>
                        <Text style={styles.subtext}>
                            {areAllBeersFromThisBrewery
                                ? "All scanned beers will be attributed to this brewery"
                                : "We'll try to detect the actual brewery for each beer"
                            }
                        </Text>
                    </View>
                )}

                {/* Single Beer Form */}
                <Text style={styles.sectionTitle}>Add Individual Beer</Text>

                {/* Brewery Input */}
                <View style={[styles.inputContainer, { zIndex: 501 }]}>
                    <TextInput
                        style={styles.input}
                        placeholder="Brewery Name (start typing for suggestions)"
                        value={brewery}
                        onChangeText={handleBreweryChange}
                        onFocus={() => brewery.length >= 2 && setShowBrewerySuggestions(true)}
                    />

                    {showBrewerySuggestions && brewerySuggestions.length > 0 && (
                        <View style={styles.suggestionsContainer}>
                            <FlatList
                                data={brewerySuggestions}
                                renderItem={renderBrewerySuggestion}
                                keyExtractor={(item) => item.id}
                                style={styles.suggestionsList}
                                nestedScrollEnabled={true}
                            />
                        </View>
                    )}
                </View>

                {/* Beer Name Input with AI */}
                <View style={[styles.inputContainer, { zIndex: 500 }]}>
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

                    {showAIButton && !selectedBeerInfo && (
                        <TouchableOpacity
                            style={styles.aiButton}
                            onPress={handleAIAutofill}
                            disabled={isAILoading}
                        >
                            <Text style={styles.aiButtonText}>
                                {isAILoading ? '🦁 Searching with Brave...' : '🦁 AI Autofill'}
                            </Text>
                        </TouchableOpacity>
                    )}

                    {aiConfidence && (
                        <View style={styles.confidenceIndicator}>
                            <Text style={styles.confidenceText}>
                                AI filled with {aiConfidence} confidence - please verify
                            </Text>
                        </View>
                    )}

                    {selectedBeerInfo && (
                        <View style={styles.selectedBeerInfo}>
                            <Text style={styles.selectedBeerText}>
                                ✅ {selectedBeerInfo.name}
                                {selectedBeerInfo.brewery ? ` by ${selectedBeerInfo.brewery}` : ''}
                            </Text>
                            <Text style={styles.selectedBeerSource}>
                                From: {selectedBeerInfo.source === 'beerdb' ? 'Beer Database' : 'Your Database'}
                            </Text>
                        </View>
                    )}

                    {showSuggestions && beerSuggestions.length > 0 && (
                        <View style={styles.suggestionsContainer}>
                            <FlatList
                                data={beerSuggestions}
                                renderItem={renderBeerSuggestion}
                                keyExtractor={(item) => `${item.source}-${item.id}`}
                                style={styles.suggestionsList}
                                nestedScrollEnabled={true}
                            />
                        </View>
                    )}
                </View>

                {/* Other form fields */}
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

            {/* Menu Preview Modal */}
            <Modal
                visible={showMenuModal}
                animationType="slide"
                presentationStyle="pageSheet"
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>📷 Menu Scan Results</Text>
                        <TouchableOpacity
                            onPress={() => setShowMenuModal(false)}
                            style={styles.closeButton}
                        >
                            <Text style={styles.closeButtonText}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    {menuImage && (
                        <Image source={{ uri: menuImage }} style={styles.menuImagePreview} />
                    )}

                    {isProcessingMenu ? (
                        <View style={styles.processingContainer}>
                            <Text style={styles.processingText}>🤖 Processing menu...</Text>
                            <Text style={styles.processingSubtext}>
                                Using AI to extract beer information
                            </Text>
                        </View>
                    ) : (
                        <>
                            {editableBeers.length > 0 && (
                                <>
                                    <Text style={styles.resultsHeader}>
                                        Found {editableBeers.length} beers - edit and select:
                                    </Text>

                                    <FlatList
                                        data={editableBeers}
                                        renderItem={renderEditableBeer}
                                        keyExtractor={(item) => item.id}
                                        style={styles.beersList}
                                    />

                                    {selectedBar && selectedBeersCount > 0 && (
                                        <TouchableOpacity
                                            style={styles.bulkAddButton}
                                            onPress={addSelectedBeers}
                                            disabled={isSubmitting}
                                        >
                                            <Text style={styles.bulkAddButtonText}>
                                                {isSubmitting ? 'Adding Beers...' : `🍺 Add Selected Beers (${selectedBeersCount}) to ${bars.find(b => b.id === selectedBar)?.name}`}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </View>
            </Modal>
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

    // Success banner
    successBanner: {
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

    // Menu scanning section
    menuScanSection: {
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
        borderWidth: 2,
        borderColor: '#e2e8f0',
        borderStyle: 'dashed',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1e293b',
        marginBottom: 4,
    },
    sectionSubtitle: {
        fontSize: 14,
        color: '#64748b',
        marginBottom: 12,
    },
    menuButtonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    menuButton: {
        backgroundColor: '#3b82f6',
        padding: 12,
        borderRadius: 8,
        flex: 0.48,
        alignItems: 'center',
    },
    menuButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
    },

    // Form inputs
    inputContainer: {
        position: 'relative',
        width: '100%',
        marginBottom: 16,
    },
    input: {
        backgroundColor: '#fff',
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
    },
    searchingText: {
        fontSize: 12,
        color: '#666',
        fontStyle: 'italic',
        marginTop: 4,
    },

    // Picker styles
    pickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        width: '100%',
    },
    pickerWrapper: {
        flex: 1,
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 8,
        marginRight: 8,
        overflow: 'hidden',
        marginBottom: 16,
    },
    picker: {
        padding: 12,
        fontSize: 16,
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
    },

    // Brewery attribution
    breweryAttributionSection: {
        backgroundColor: '#f8fafc',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderWidth: 2,
        borderColor: '#3b82f6',
        borderRadius: 4,
        marginRight: 12,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxSelected: {
        backgroundColor: '#3b82f6',
        borderColor: '#3b82f6',
    },
    checkmark: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    checkboxLabel: {
        fontSize: 16,
        color: '#1e293b',
        fontWeight: '600',
        flex: 1,
    },
    subtext: {
        fontSize: 13,
        color: '#64748b',
        fontStyle: 'italic',
        marginLeft: 32,
    },

    // AI Autofill
    aiButton: {
        backgroundColor: '#ff6600',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    aiButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
    },
    confidenceIndicator: {
        backgroundColor: '#fef3c7',
        borderColor: '#f59e0b',
        borderWidth: 1,
        borderRadius: 6,
        padding: 8,
        marginTop: 8,
    },
    confidenceText: {
        color: '#92400e',
        fontSize: 12,
        textAlign: 'center',
        fontStyle: 'italic',
    },

    // Selected beer info
    selectedBeerInfo: {
        backgroundColor: '#e6f7ff',
        padding: 8,
        borderRadius: 6,
        marginTop: 8,
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

    // Suggestions dropdown
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
        zIndex: 1000,
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
    suggestionLocation: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    suggestionSource: {
        fontSize: 12,
        color: '#2563eb',
        marginTop: 2,
    },

    // Image
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

    // Submit button
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
    },

    // Modal styles
    modalContainer: {
        flex: 1,
        backgroundColor: '#fff',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1e293b',
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeButtonText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#64748b',
    },
    menuImagePreview: {
        width: '100%',
        height: 200,
        resizeMode: 'cover',
        marginBottom: 16,
    },
    processingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
    },
    processingText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#3b82f6',
        marginBottom: 8,
    },
    processingSubtext: {
        fontSize: 14,
        color: '#64748b',
        textAlign: 'center',
    },
    resultsHeader: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1e293b',
        padding: 16,
        paddingBottom: 8,
    },
    beersList: {
        flex: 1,
        paddingHorizontal: 16,
    },

    // Editable beer card
    editableBeerCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    beerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    beerNameInput: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1e293b',
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
        paddingVertical: 8,
        marginBottom: 8,
    },
    breweryInput: {
        fontSize: 16,
        color: '#64748b',
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
        paddingVertical: 8,
        marginBottom: 12,
    },
    fieldRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    fieldGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginHorizontal: 4,
    },
    fieldLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        minWidth: 35,
    },
    fieldInput: {
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
        fontSize: 14,
        color: '#1f2937',
        backgroundColor: '#f9fafb',
        flex: 1,
        textAlign: 'center',
        marginHorizontal: 4,
    },
    fieldUnit: {
        fontSize: 14,
        color: '#6b7280',
        fontWeight: '500',
    },
    typeInput: {
        fontSize: 14,
        color: '#64748b',
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
        paddingVertical: 8,
    },

    // Bulk add button
    bulkAddButton: {
        backgroundColor: '#3b82f6',
        padding: 16,
        borderRadius: 8,
        margin: 16,
        alignItems: 'center',
    },
    bulkAddButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
        textAlign: 'center',
    },
});