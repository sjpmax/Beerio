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

interface MenuBeer {
    name: string;
    brewery?: string;
    abv?: number;
    price?: number;
    size?: number;
    type?: string;
    description?: string;
    confidence: 'high' | 'medium' | 'low';
    rawText: string;
}

export default function BeerAdd() {
    const navigation = useNavigation();

    // Form state
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

    // Data state
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
    const [isSearchingBreweries, setIsSearchingBreweries] = useState(false);

    // AI Autofill state
    const [showAIButton, setShowAIButton] = useState(false);
    const [isAILoading, setIsAILoading] = useState(false);
    const [aiConfidence, setAiConfidence] = useState<'high' | 'medium' | 'low' | null>(null);
    const [aiSource, setAiSource] = useState<string>('');

    // 📷 NEW: OCR Menu Scanning state
    const [showMenuModal, setShowMenuModal] = useState(false);
    const [menuImage, setMenuImage] = useState<string | null>(null);
    const [isProcessingMenu, setIsProcessingMenu] = useState(false);
    const [parsedBeers, setParsedBeers] = useState<MenuBeer[]>([]);
    const [selectedMenuBeer, setSelectedMenuBeer] = useState<MenuBeer | null>(null);

    // Load initial data
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

    const takeMenuPhoto = async () => {
        try {
            const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
            if (!permissionResult.granted) {
                showAlert('Permission needed', 'Camera permission is required to scan menus');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                allowsEditing: false, // Let them take the photo naturally
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
                mediaTypes: ImagePicker.MediaTypeOptions.Images, // Back to the old way that worked
                allowsEditing: false, // Just removed the aspect ratio
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
        console.log('📷 starting picture procesing...');
        if (!selectedBar) {
            showAlert('Error', 'Please select a bar first before scanning menu');
            console.log('error no bar selected');
            return;
        }
        setIsProcessingMenu(true);
        setShowMenuModal(true);
       

        
        try {
            console.log('📷 Processing menu photo...');
            const beers = await processMenuPhoto(imageUri, selectedBar); // ✅ Pass bar ID

            setParsedBeers(beers);

            if (beers.length === 0) {
                showAlert(
                    'No Beers Found',
                    'Could not find any beer information in this image. Try taking a clearer photo of the beer menu section.'
                );
            } else {
                showAlert(
                    '🍺 Menu Scanned!',
                    `Found ${beers.length} beers! Review and add them to your bar.`
                );
            }
        } catch (error) {
            console.error('Menu processing error:', error);
            showAlert(
                'Processing Failed',
                'Could not process the menu image. Please try again or add beers manually.'
            );
        } finally {
            setIsProcessingMenu(false);
        }
    };

    const selectMenuBeer = async (beer: MenuBeer) => {
        if (!selectedBar) {
            showAlert('Error', 'Please select a bar first before adding beers from menu scan');
            return;
        }

        try {
            const currentUser = await getCurrentUser();
            if (!currentUser) {
                showAlert('Error', 'You must be logged in to add beers');
                return;
            }

            // Instantly add the beer to the database
            const { error } = await supabase.from('beers').insert([{
                name: beer.name,
                type: beer.type || 'Ale',
                abv: beer.abv || 5.0,
                price: beer.price || 0,
                size_oz: beer.size || 16,
                beer_format: 'draft',
                bar_id: selectedBar,
                brewery_id: null,
                pending_review: true,
                status: 'pending',
                submitted_by: currentUser.id,
                submitted_at: new Date().toISOString(),
            }]);

            if (error) {
                showAlert('Error', `Failed to add ${beer.name}: ${error.message}`);
            } else {
                showAlert(
                    '🍺 Beer Added!',
                    `${beer.name} has been added and will appear in the main list once approved!`
                );

                // Remove this beer from the parsed list so user doesn't add it twice
                setParsedBeers(prev => prev.filter(b => b !== beer));
            }
        } catch (error) {
            showAlert('Error', `Failed to add ${beer.name}`);
        }
    };

    const addMultipleBeers = async () => {
        if (!selectedBar) {
            showAlert('Error', 'Please select a bar first');
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

            // Add all high and medium confidence beers
            const beersToAdd = parsedBeers.filter(beer =>
                beer.confidence === 'high' || beer.confidence === 'medium'
            );

            for (const beer of beersToAdd) {
                try {
                    const { error } = await supabase.from('beers').insert([{
                        name: beer.name,
                        type: beer.type || 'Ale',
                        abv: beer.abv || 5.0,
                        price: beer.price || 0,
                        size_oz: beer.size || 16,
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

            showAlert(
                '🎉 Bulk Add Complete!',
                `Successfully added ${addedCount} beers from the menu!\n\nThey will appear in the main list once approved by admins.`
            );

            // Close modal and reset
            setShowMenuModal(false);
            setParsedBeers([]);
            setMenuImage(null);

        } catch (error) {
            showAlert('Error', 'Failed to add beers in bulk');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Beer search functionality (existing)
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
        setAiSource('');

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

    // AI Autofill function (existing)
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
                setAiSource(details.source);

                if (filledFields.length > 0) {
                    const sourceText = details.source === 'web_search' ? '🦁 Brave Search' :
                        details.source === 'api' ? 'Beer Database' : 'AI Inference';

                    showAlert(
                        '🤖 AI Autofill Complete',
                        `Filled in: ${filledFields.join(', ')}\n\nSource: ${sourceText}\nConfidence: ${details.confidence}\n\nPlease verify the information is correct.`
                    );
                }
            } else {
                showAlert(
                    '🤖 AI Autofill',
                    'Sorry, I couldn\'t find detailed information about this beer. Try typing a more specific name or brewery.'
                );
            }
        } catch (error) {
            console.error('AI autofill error:', error);
            showAlert('Error', 'AI autofill failed. Please fill in manually.');
        } finally {
            setIsAILoading(false);
        }
    };

    // Brewery search functionality (existing - keeping it short)
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

    // Image picker (existing)
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

    // Form reset (existing)
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
        setAiSource('');
        setSelectedMenuBeer(null);
    };

    // Submit beer (existing)
    async function addBeer() {
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

            const { error } = await supabase.from('beers').insert([
                {
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
                },
            ]);

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
    }

    // Render functions for suggestions (keeping existing ones short)
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

    // 📷 NEW: Render menu beer item
    const renderMenuBeer = ({ item, index }: { item: MenuBeer; index: number }) => (
        <View style={[
            styles.menuBeerItem,
            {
                backgroundColor: item.confidence === 'high' ? '#f0fff4' :
                    item.confidence === 'medium' ? '#fffbeb' : '#fef2f2'
            }
        ]}>
            <Text style={styles.menuBeerName}>{item.name}</Text>
            <Text style={styles.menuBeerDetails}>
                {item.brewery && `${item.brewery} • `}
                {item.abv}% ABV • ${item.price} • {item.size}oz • {item.type}
            </Text>
            <Text style={styles.menuBeerConfidence}>
                Confidence: {item.confidence}
            </Text>

            <TouchableOpacity
                onPress={() => selectMenuBeer(item)}
                style={styles.selectBeerButton}
            >
                <Text style={styles.selectBeerButtonText}>Use This Beer</Text>
            </TouchableOpacity>
        </View>
    );

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

                {/* 📷 NEW: Menu Scanning Section */}
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

                {/* Rest of existing form... */}
                {/* Brewery Input */}
                <View style={[styles.inputContainer, { zIndex: 501 }]}>
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
                                AI filled with {aiConfidence} confidence from {aiSource === 'web_search' ? 'Brave Search' : aiSource} - please verify
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

                    {selectedMenuBeer && (
                        <View style={styles.selectedBeerInfo}>
                            <Text style={styles.selectedBeerText}>
                                📷 From menu scan: {selectedMenuBeer.name}
                            </Text>
                            <Text style={styles.selectedBeerSource}>
                                Confidence: {selectedMenuBeer.confidence}
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

                {/* Rest of form fields... */}
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

            {/* 📷 NEW: Menu Preview Modal */}
            <Modal
                visible={showMenuModal}
                animationType="slide"
                presentationStyle="pageSheet"
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>
                            📷 Menu Scan Results
                        </Text>
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
                            {parsedBeers.length > 0 && (
                                <>
                                    <Text style={styles.resultsHeader}>
                                        Found {parsedBeers.length} beers:
                                    </Text>

                                    <FlatList
                                        data={parsedBeers}
                                        renderItem={renderMenuBeer}
                                        keyExtractor={(item, index) => index.toString()}
                                        style={styles.menuBeersList}
                                    />

                                    {selectedBar && parsedBeers.length > 0 && (
                                        <TouchableOpacity
                                            style={styles.bulkAddButton}
                                            onPress={addMultipleBeers}
                                            disabled={isSubmitting}
                                        >
                                            <Text style={styles.bulkAddButtonText}>
                                                {isSubmitting ? 'Adding Beers...' : `🍺 Add All Remaining Beers (${parsedBeers.filter(b => b.confidence !== 'low').length}) to ${bars.find(b => b.id === selectedBar)?.name}`}
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

    // 📷 Menu scanning styles
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
    menuBeersList: {
        flex: 1,
        paddingHorizontal: 16,
    },
    menuBeerItem: {
        padding: 12,
        borderRadius: 8,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    menuBeerName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1e293b',
        marginBottom: 4,
    },
    menuBeerDetails: {
        fontSize: 14,
        color: '#64748b',
        marginBottom: 4,
    },
    menuBeerConfidence: {
        fontSize: 12,
        color: '#6b7280',
        marginBottom: 8,
    },
    selectBeerButton: {
        backgroundColor: '#10b981',
        padding: 8,
        borderRadius: 6,
        alignItems: 'center',
    },
    selectBeerButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
    },
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

    // Form input styles
    input: {
        backgroundColor: '#fff',
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
        fontSize: 16,
    },
    inputContainer: {
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

    // AI Autofill styles
    aiButton: {
        backgroundColor: '#ff6600',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: -12,
        marginBottom: 16,
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
        marginTop: -12,
        marginBottom: 12,
    },
    confidenceText: {
        color: '#92400e',
        fontSize: 12,
        textAlign: 'center',
        fontStyle: 'italic',
    },

    // Selected beer info styles
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

    // Suggestions dropdown styles
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

    // Picker styles
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
    },

    // Image styles
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

    // Submit button styles
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

    // Success banner styles
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
});