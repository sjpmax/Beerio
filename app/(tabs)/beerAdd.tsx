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

export interface MenuBeer {
    name: string;
    brewery?: string;
    abv?: number | null;
    price?: number | null;
    size?: number | null; // ← Make this explicitly optional/nullable
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
    const [selectedBeersForBulk, setSelectedBeersForBulk] = useState<Set<number>>(new Set());

    const [enhancingBeers, setEnhancingBeers] = useState<Set<string>>(new Set());   

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

    const [areAllBeersFromThisBrewery, setAreAllBeersFromThisBrewery] = useState(false);
    const [editableSuggestions, setEditableSuggestions] = useState<EditableBeer[]>([]);
    const [selectedSuggestionsForBulk, setSelectedSuggestionsForBulk] = useState<Set<number>>(new Set());


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

    interface EditableBeer {
        id: string;
        name: string;
        brewery: string;
        abv: string;
        size: string;
        price: string;
        type: string;
        confidence: 'high' | 'medium' | 'low';
        source: string;
        isReadyForBulk: boolean;
    }

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

    useEffect(() => {
        if (parsedBeers.length > 0) {
            // Auto-select high and medium confidence beers
            const highConfidenceIndices = parsedBeers
                .map((beer, index) => ({ beer, index }))
                .filter(({ beer }) => beer.confidence === 'high' || beer.confidence === 'medium')
                .map(({ index }) => index);

            setSelectedBeersForBulk(new Set(highConfidenceIndices));
        }
    }, [parsedBeers]);

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
        console.log('📷 Starting picture processing...');
        console.log('🔍 Image URI:', imageUri);

        if (!selectedBar) {
            showAlert('Error', 'Please select a bar first before scanning menu');
            return;
        }

        setIsProcessingMenu(true);
        setShowMenuModal(true);

        try {
            console.log('📷 Processing menu photo with bar context...');
            console.log(`🏪 Selected bar ID: ${selectedBar}`);
            console.log(`🏭 All beers from this brewery: ${areAllBeersFromThisBrewery}`);

            // Add more detailed logging
            console.log('🤖 About to call processMenuPhoto...');

            const beers = await processMenuPhoto(imageUri, selectedBar, areAllBeersFromThisBrewery);

            console.log('📊 Raw beers result:', beers);
            console.log('📊 Number of beers returned:', beers?.length || 0);

            if (beers && beers.length > 0) {
                console.log('📊 First beer details:', JSON.stringify(beers[0], null, 2));
            }

            // Convert to editable suggestions instead of parsed beers
            convertMenuBeersToEditableSuggestions(beers);

            if (beers.length === 0) {
                console.log('❌ Zero beers returned from processMenuPhoto');
                showAlert(
                    'No Beers Found',
                    'Could not find any beer information in this image. Try taking a clearer photo of the beer menu section.'
                );
            } else {
                console.log(`✅ Successfully processed ${beers.length} beers`);
                showAlert(
                    '🍺 Menu Scanned!',
                    `Found ${beers.length} beers! Edit any details and add them to your bar.`
                );
            }
        } catch (error) {
            console.error('❌ Menu processing error:', error);
            console.error('❌ Error stack:', error.stack);
            showAlert(
                'Processing Failed',
                `Could not process the menu image: ${error.message}. Please try again or add beers manually.`
            );
        } finally {
            setIsProcessingMenu(false);
        }
    };


    const selectMenuBeer = async (beer: MenuBeer, index: number) => {
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
                size_oz: beer.size, // ← Don't default to 16, let it be null
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

                // Remove this beer from the parsed list and selected bulk list
                setParsedBeers(prev => prev.filter((_, i) => i !== index));
                setSelectedBeersForBulk(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(index);
                    const adjustedSet = new Set();
                    newSet.forEach(i => {
                        if (i > index) {
                            adjustedSet.add(i - 1);
                        } else {
                            adjustedSet.add(i);
                        }
                    });
                    return adjustedSet;
                });
            }
        } catch (error) {
            showAlert('Error', `Failed to add ${beer.name}`);
        }
    };

    const enhanceBeerWithWebSearch = async (index: number, beer: EditableBeer) => {
        const beerId = beer.id;

        // Prevent multiple simultaneous searches for same beer
        if (enhancingBeers.has(beerId)) return;

        setEnhancingBeers(prev => new Set([...prev, beerId]));

        try {
            console.log(`🦁 Enhancing ${beer.name} with web search...`);

            // Import the search function
            const { searchBeerWithBrave } = await import('../../utils/supabase');

            // Search for missing brewery info
            const webData = await searchBeerWithBrave(beer.name, beer.brewery || undefined);

            if (webData) {
                let updatedFields = [];

                // Fill in missing brewery
                if (!beer.brewery && webData.brewery) {
                    updateEditableSuggestion(index, 'brewery', webData.brewery);
                    updatedFields.push('brewery');
                }

                // Fill in missing ABV
                if (!beer.abv && webData.abv) {
                    updateEditableSuggestion(index, 'abv', webData.abv.toString());
                    updatedFields.push('ABV');
                }

                // Fill in missing size
                if (!beer.size && webData.size) {
                    updateEditableSuggestion(index, 'size', webData.size.toString());
                    updatedFields.push('size');
                }

                // Fill in missing type
                if (!beer.type && webData.type) {
                    updateEditableSuggestion(index, 'type', webData.type);
                    updatedFields.push('style');
                }

                // Boost confidence if we found data
                if (updatedFields.length > 0) {
                    updateEditableSuggestion(index, 'confidence', 'high');
                    updateEditableSuggestion(index, 'source', 'menu_scan + web_search');

                    showAlert(
                        '🦁 Enhancement Complete!',
                        `Found ${updatedFields.join(', ')} for ${beer.name} via web search.\n\nPlease verify the information is correct.`
                    );
                } else {
                    showAlert(
                        '🦁 Web Search',
                        `No additional information found for ${beer.name}. The current data looks complete!`
                    );
                }
            } else {
                showAlert(
                    '🦁 Web Search',
                    `Sorry, couldn't find additional information about ${beer.name}. You can manually edit the fields if needed.`
                );
            }

        } catch (error) {
            console.error('Web enhancement failed:', error);
            showAlert(
                'Enhancement Failed',
                `Web search failed for ${beer.name}. You can still edit the fields manually.`
            );
        } finally {
            setEnhancingBeers(prev => {
                const newSet = new Set(prev);
                newSet.delete(beerId);
                return newSet;
            });
        }
    };

    const autoEnhanceIncompleteBeers = async () => {
        const incompleteBeers = editableSuggestions.filter(beer =>
            !beer.brewery || !beer.abv || !beer.size || !beer.type
        );

        if (incompleteBeers.length === 0) {
            showAlert('All Complete!', 'All beers already have complete information.');
            return;
        }

        showAlert(
            '🦁 Auto-Enhancement',
            `Starting web search for ${incompleteBeers.length} incomplete beers. This may take a moment...`
        );

        // Enhance each incomplete beer with a delay to avoid rate limiting
        for (let i = 0; i < incompleteBeers.length; i++) {
            const beer = incompleteBeers[i];
            const index = editableSuggestions.findIndex(b => b.id === beer.id);

            if (index !== -1) {
                await enhanceBeerWithWebSearch(index, beer);

                // Add delay between searches to respect rate limits
                if (i < incompleteBeers.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
    };


    const needsEnhancement = (beer: EditableBeer): boolean => {
        return !beer.brewery || !beer.abv || !beer.size || beer.brewery === 'Unknown Brewery';
    };



    const toggleBeerForBulkImport = (index: number) => {
        setSelectedBeersForBulk(prev => {
            const newSet = new Set(prev);
            if (newSet.has(index)) {
                newSet.delete(index);
            } else {
                newSet.add(index);
            }
            return newSet;
        });
    };

    // Add this function to select/deselect high confidence beers
    const toggleHighConfidenceBeers = () => {
        const highConfidenceIndices = parsedBeers
            .map((beer, index) => ({ beer, index }))
            .filter(({ beer }) => beer.confidence === 'high' || beer.confidence === 'medium')
            .map(({ index }) => index);

        const allHighConfidenceSelected = highConfidenceIndices.every(index =>
            selectedBeersForBulk.has(index)
        );

        if (allHighConfidenceSelected) {
            // Deselect all high confidence beers
            setSelectedBeersForBulk(prev => {
                const newSet = new Set(prev);
                highConfidenceIndices.forEach(index => newSet.delete(index));
                return newSet;
            });
        } else {
            // Select all high confidence beers
            setSelectedBeersForBulk(prev => {
                const newSet = new Set(prev);
                highConfidenceIndices.forEach(index => newSet.add(index));
                return newSet;
            });
        }
    };

    const addMultipleBeers = async () => {
        if (!selectedBar) {
            showAlert('Error', 'Please select a bar first');
            return;
        }

        if (selectedBeersForBulk.size === 0) {
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

            // Add only selected beers
            const beersToAdd = parsedBeers.filter((_, index) => selectedBeersForBulk.has(index));

            for (const beer of beersToAdd) {
                try {
                    const { error } = await supabase.from('beers').insert([{
                        name: beer.name,
                        type: beer.type || 'Ale',
                        abv: beer.abv || 5.0,
                        price: beer.price || 0,
                        size_oz: beer.size, // ← Don't default to 16, let it be null
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
            setSelectedBeersForBulk(new Set());

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
    const renderMenuBeer = ({ item, index }: { item: MenuBeer; index: number }) => {
        const isSelected = selectedBeersForBulk.has(index);

        return (
            <View style={[
                styles.menuBeerItem,
                {
                    backgroundColor: item.confidence === 'high' ? '#f0fff4' :
                        item.confidence === 'medium' ? '#fffbeb' : '#fef2f2',
                    borderColor: isSelected ? '#3b82f6' : '#e2e8f0',
                    borderWidth: isSelected ? 2 : 1,
                }
            ]}>
                {/* Checkbox for bulk selection */}
                <View style={styles.menuBeerHeader}>
                    <TouchableOpacity
                        style={styles.bulkCheckboxContainer}
                        onPress={() => toggleBeerForBulkImport(index)}
                    >
                        <View style={[
                            styles.bulkCheckbox,
                            isSelected && styles.bulkCheckboxSelected
                        ]}>
                            {isSelected && <Text style={styles.bulkCheckmark}>✓</Text>}
                        </View>
                        <Text style={styles.bulkCheckboxLabel}>Include in bulk</Text>
                    </TouchableOpacity>

                    <Text style={styles.menuBeerConfidence}>
                        {item.confidence} confidence
                    </Text>
                </View>

                <Text style={styles.menuBeerName}>{item.name}</Text>
                <Text style={styles.menuBeerDetails}>
                    {item.brewery && `${item.brewery} • `}
                    {item.abv}% ABV •
                    {item.price ? `$${item.price}` : 'Price unknown'} •
                    {item.size ? `${item.size}oz` : 'Size unknown'} •
                    {item.type}
                </Text>

                <View style={styles.menuBeerActions}>
                    <TouchableOpacity
                        onPress={() => selectMenuBeer(item, index)}
                        style={styles.addNowButton}
                    >
                        <Text style={styles.addNowButtonText}>Add Now</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    const convertMenuBeersToEditableSuggestions = (menuBeers: MenuBeer[]) => {
        const editableBeers: EditableBeer[] = menuBeers.map((beer, index) => ({
            id: `menu-${index}`,
            name: beer.name,
            brewery: beer.brewery || '',
            abv: beer.abv?.toString() || '',
            size: beer.size?.toString() || '',
            price: beer.price?.toString() || '',
            type: beer.type || '',
            confidence: beer.confidence,
            source: 'menu_scan',
            isReadyForBulk: beer.confidence === 'high' || beer.confidence === 'medium' // Auto-select high confidence
        }));

        setEditableSuggestions(editableBeers);

        // Auto-select high confidence beers for bulk
        const autoSelectedIndices = editableBeers
            .map((beer, index) => beer.isReadyForBulk ? index : -1)
            .filter(index => index !== -1);
        setSelectedSuggestionsForBulk(new Set(autoSelectedIndices));
    };

    const updateEditableSuggestion = (index: number, field: keyof EditableBeer, value: string) => {
        setEditableSuggestions(prev =>
            prev.map((beer, i) =>
                i === index ? { ...beer, [field]: value } : beer
            )
        );
    };

    // Toggle suggestion for bulk add
    const toggleSuggestionForBulk = (index: number) => {
        setSelectedSuggestionsForBulk(prev => {
            const newSet = new Set(prev);
            if (newSet.has(index)) {
                newSet.delete(index);
            } else {
                newSet.add(index);
            }
            return newSet;
        });

        // Also update the isReadyForBulk flag
        setEditableSuggestions(prev =>
            prev.map((beer, i) =>
                i === index ? { ...beer, isReadyForBulk: !beer.isReadyForBulk } : beer
            )
        );
    };

    // Add individual editable suggestion to database
    const addEditableSuggestion = async (beer: EditableBeer) => {
        if (!selectedBar) {
            showAlert('Error', 'Please select a bar first');
            return;
        }

        try {
            const currentUser = await getCurrentUser();
            if (!currentUser) {
                showAlert('Error', 'You must be logged in to add beers');
                return;
            }

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

            if (error) {
                showAlert('Error', `Failed to add ${beer.name}: ${error.message}`);
            } else {
                showAlert('🍺 Beer Added!', `${beer.name} has been added successfully!`);

                // Remove from suggestions
                setEditableSuggestions(prev => prev.filter(b => b.id !== beer.id));
                setSelectedSuggestionsForBulk(prev => {
                    const newSet = new Set(prev);
                    const beerIndex = editableSuggestions.findIndex(b => b.id === beer.id);
                    newSet.delete(beerIndex);
                    return newSet;
                });
            }
        } catch (error) {
            showAlert('Error', `Failed to add ${beer.name}`);
        }
    };

    // Bulk add selected editable suggestions
    const bulkAddEditableSuggestions = async () => {
        if (!selectedBar) {
            showAlert('Error', 'Please select a bar first');
            return;
        }

        const selectedBeers = editableSuggestions.filter((_, index) =>
            selectedSuggestionsForBulk.has(index)
        );

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

            showAlert(
                '🎉 Bulk Add Complete!',
                `Successfully added ${addedCount} beers!\n\nThey will appear in the main list once approved.`
            );

            // Clear suggestions
            setEditableSuggestions([]);
            setSelectedSuggestionsForBulk(new Set());

        } catch (error) {
            showAlert('Error', 'Failed to add beers in bulk');
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderEditableSuggestion = ({ item, index }: { item: EditableBeer; index: number }) => {
        const isSelected = selectedSuggestionsForBulk.has(index);
        const isEnhancing = enhancingBeers.has(item.id);
        const canEnhance = needsEnhancement(item);

        return (
            <View style={[
                styles.editableSuggestionCard,
                {
                    borderColor: isSelected ? '#3b82f6' : '#e2e8f0',
                    borderWidth: isSelected ? 2 : 1,
                    backgroundColor: isSelected ? '#f0f9ff' : '#fff'
                }
            ]}>
                {/* Header with beer name and brewery */}
                <View style={styles.suggestionHeader}>
                    <TextInput
                        style={styles.beerNameInput}
                        value={item.name}
                        onChangeText={(text) => updateEditableSuggestion(index, 'name', text)}
                        placeholder="Beer Name"
                        placeholderTextColor="#9ca3af"
                    />
                    <Text style={styles.dashSeparator}> - </Text>
                    <TextInput
                        style={styles.breweryNameInput}
                        value={item.brewery}
                        onChangeText={(text) => updateEditableSuggestion(index, 'brewery', text)}
                        placeholder="Brewery Name"
                        placeholderTextColor="#9ca3af"
                    />
                </View>

                {/* Enhancement button for incomplete beers */}
                {canEnhance && (
                    <TouchableOpacity
                        style={[styles.enhanceButton, isEnhancing && styles.enhanceButtonDisabled]}
                        onPress={() => enhanceBeerWithWebSearch(index, item)}
                        disabled={isEnhancing}
                    >
                        <Text style={styles.enhanceButtonText}>
                            {isEnhancing ? '🦁 Searching...' : '🦁 Enhance with Web Search'}
                        </Text>
                    </TouchableOpacity>
                )}

                {/* Editable fields grid */}
                <View style={styles.suggestionFieldsGrid}>
                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>ABV</Text>
                        <TextInput
                            style={[
                                styles.fieldInput,
                                !item.abv && styles.fieldInputEmpty
                            ]}
                            value={item.abv}
                            onChangeText={(text) => updateEditableSuggestion(index, 'abv', text)}
                            placeholder="4.8"
                            keyboardType="decimal-pad"
                            placeholderTextColor="#9ca3af"
                        />
                        <Text style={styles.fieldUnit}>%</Text>
                    </View>

                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Size</Text>
                        <TextInput
                            style={[
                                styles.fieldInput,
                                !item.size && styles.fieldInputEmpty
                            ]}
                            value={item.size}
                            onChangeText={(text) => updateEditableSuggestion(index, 'size', text)}
                            placeholder="16"
                            keyboardType="numeric"
                            placeholderTextColor="#9ca3af"
                        />
                        <Text style={styles.fieldUnit}>oz</Text>
                    </View>

                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Style</Text>
                        <TextInput
                            style={[
                                styles.fieldInput,
                                !item.type && styles.fieldInputEmpty
                            ]}
                            value={item.type}
                            onChangeText={(text) => updateEditableSuggestion(index, 'type', text)}
                            placeholder="IPA"
                            placeholderTextColor="#9ca3af"
                        />
                    </View>

                    <View style={styles.fieldGroup}>
                        <Text style={styles.fieldLabel}>Price</Text>
                        <Text style={styles.fieldUnit}>$</Text>
                        <TextInput
                            style={[
                                styles.fieldInput,
                                !item.price && styles.fieldInputEmpty
                            ]}
                            value={item.price}
                            onChangeText={(text) => updateEditableSuggestion(index, 'price', text)}
                            placeholder="6.50"
                            keyboardType="decimal-pad"
                            placeholderTextColor="#9ca3af"
                        />
                    </View>
                </View>

                {/* Footer with checkbox and actions */}
                <View style={styles.suggestionFooter}>
                    <TouchableOpacity
                        style={styles.bulkCheckboxContainer}
                        onPress={() => toggleSuggestionForBulk(index)}
                    >
                        <View style={[
                            styles.bulkCheckbox,
                            isSelected && styles.bulkCheckboxSelected
                        ]}>
                            {isSelected && <Text style={styles.bulkCheckmark}>✓</Text>}
                        </View>
                        <Text style={styles.bulkCheckboxLabel}>
                            Ready for bulk add
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.addNowButton}
                        onPress={() => addEditableSuggestion(item)}
                    >
                        <Text style={styles.addNowButtonText}>Add Now</Text>
                    </TouchableOpacity>
                </View>

                {/* Confidence indicator */}
                <View style={[
                    styles.confidenceIndicator,
                    { backgroundColor: getConfidenceColor(item.confidence) }
                ]}>
                    <Text style={styles.confidenceText}>
                        {item.confidence} confidence • {item.source}
                    </Text>
                </View>
            </View>
        );
    };

    const EnhancementControls = () => {
        const incompleteBeersCount = editableSuggestions.filter(needsEnhancement).length;
        const isAnyEnhancing = enhancingBeers.size > 0;

        if (incompleteBeersCount === 0) return null;

        return (
            <View style={styles.enhancementControls}>
                <TouchableOpacity
                    style={[styles.autoEnhanceButton, isAnyEnhancing && styles.autoEnhanceButtonDisabled]}
                    onPress={autoEnhanceIncompleteBeers}
                    disabled={isAnyEnhancing}
                >
                    <Text style={styles.autoEnhanceButtonText}>
                        {isAnyEnhancing
                            ? `🦁 Enhancing ${enhancingBeers.size} beers...`
                            : `🦁 Auto-Enhance ${incompleteBeersCount} Incomplete Beers`
                        }
                    </Text>
                </TouchableOpacity>
                <Text style={styles.enhancementSubtext}>
                    Missing brewery, ABV, or size info will be filled in via web search
                </Text>
            </View>
        );
    };


    // Helper function for confidence colors
    const getConfidenceColor = (confidence: string) => {
        switch (confidence) {
            case 'high': return '#dcfce7';
            case 'medium': return '#fef3c7';
            case 'low': return '#fef2f2';
            default: return '#f3f4f6';
        }
    };

    const BulkSelectionControls = () => {
        const selectedCount = selectedBeersForBulk.size;
        const highConfidenceCount = parsedBeers.filter(beer =>
            beer.confidence === 'high' || beer.confidence === 'medium'
        ).length;

        const highConfidenceIndices = parsedBeers
            .map((beer, index) => ({ beer, index }))
            .filter(({ beer }) => beer.confidence === 'high' || beer.confidence === 'medium')
            .map(({ index }) => index);

        const allHighConfidenceSelected = highConfidenceIndices.length > 0 &&
            highConfidenceIndices.every(index => selectedBeersForBulk.has(index));

        return (
            <>
                <TouchableOpacity
                    style={styles.selectAllButton}
                    onPress={toggleHighConfidenceBeers}
                >
                    <Text style={styles.selectAllButtonText}>
                        {allHighConfidenceSelected ? 'Deselect' : 'Select'} All High/Medium Confidence ({highConfidenceCount})
                    </Text>
                </TouchableOpacity>

                <View style={styles.bulkSummary}>
                    <Text style={styles.bulkSummaryText}>
                        {selectedCount} beer{selectedCount !== 1 ? 's' : ''} selected for bulk import
                    </Text>
                </View>
            </>
        );
    };

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

                {selectedBar && (
                    <View style={styles.breweryAttributionSection}>
                        <TouchableOpacity
                            style={styles.breweryCheckboxContainer}
                            onPress={() => setAreAllBeersFromThisBrewery(!areAllBeersFromThisBrewery)}
                        >
                            <View style={[
                                styles.breweryCheckbox,
                                areAllBeersFromThisBrewery && styles.breweryCheckboxSelected
                            ]}>
                                {areAllBeersFromThisBrewery && <Text style={styles.breweryCheckmark}>✓</Text>}
                            </View>
                            <Text style={styles.breweryCheckboxLabel}>
                                Are all beers made at {bars.find(b => b.id === selectedBar)?.name}?
                            </Text>
                        </TouchableOpacity>
                        <Text style={styles.breweryCheckboxSubtext}>
                            {areAllBeersFromThisBrewery
                                ? "All scanned beers will be attributed to this brewery"
                                : "We'll try to detect the actual brewery for each beer"
                            }
                        </Text>
                    </View>
                )}

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
                            {editableSuggestions.length > 0 && (
                                <>
                                    <Text style={styles.resultsHeader}>
                                        Found {editableSuggestions.length} beers - edit and select:
                                    </Text>

                                    <EnhancementControls />

                                    <FlatList
                                        data={editableSuggestions}
                                        renderItem={renderEditableSuggestion}
                                        keyExtractor={(item, index) => item.id}
                                        style={styles.menuBeersList}
                                    />

                                    {selectedBar && editableSuggestions.length > 0 && (
                                        <TouchableOpacity
                                            style={styles.bulkAddButton}
                                            onPress={bulkAddEditableSuggestions}
                                            disabled={isSubmitting}
                                        >
                                            <Text style={styles.bulkAddButtonText}>
                                                {isSubmitting ? 'Adding Beers...' : `🍺 Add Selected Beers (${selectedSuggestionsForBulk.size}) to ${bars.find(b => b.id === selectedBar)?.name}`}
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
    // ... all your existing styles stay the same ...
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

    // ADD: Editable suggestion styles (merged from editableSuggestionStyles)
    editableSuggestionCard: {
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
    suggestionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    beerNameInput: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1e293b',
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
        paddingVertical: 4,
        flex: 2,
        marginRight: 8,
    },
    dashSeparator: {
        fontSize: 18,
        color: '#64748b',
        fontWeight: 'bold',
    },
    breweryNameInput: {
        fontSize: 16,
        color: '#64748b',
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
        paddingVertical: 4,
        flex: 1.5,
        marginLeft: 8,
    },
    suggestionFieldsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    fieldGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '48%',
        marginBottom: 12,
    },
    fieldLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        minWidth: 40,
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
        minWidth: 60,
        textAlign: 'center',
        marginHorizontal: 4,
    },
    fieldUnit: {
        fontSize: 14,
        color: '#6b7280',
        fontWeight: '500',
    },
    suggestionFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
    },

    // Keep all your existing styles below...
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
    menuBeerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    bulkCheckboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    bulkCheckbox: {
        width: 20,
        height: 20,
        borderWidth: 2,
        borderColor: '#3b82f6',
        borderRadius: 4,
        marginRight: 8,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
    },
    bulkCheckboxSelected: {
        backgroundColor: '#3b82f6',
        borderColor: '#3b82f6',
    },
    bulkCheckmark: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    bulkCheckboxLabel: {
        fontSize: 12,
        color: '#64748b',
        fontWeight: '600',
    },
    menuBeerActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
    },
    addNowButton: {
        backgroundColor: '#10b981',
        padding: 8,
        borderRadius: 6,
        alignItems: 'center',
        minWidth: 80,
    },
    addNowButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 12,
    },
    selectAllButton: {
        backgroundColor: '#6366f1',
        padding: 12,
        borderRadius: 8,
        margin: 16,
        marginBottom: 8,
        alignItems: 'center',
    },
    selectAllButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
    },
    bulkSummary: {
        backgroundColor: '#f8fafc',
        padding: 12,
        margin: 16,
        marginTop: 0,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    bulkSummaryText: {
        fontSize: 14,
        color: '#475569',
        textAlign: 'center',
    },
    breweryAttributionSection: {
        backgroundColor: '#f8fafc',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    breweryCheckboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    breweryCheckbox: {
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
    breweryCheckboxSelected: {
        backgroundColor: '#3b82f6',
        borderColor: '#3b82f6',
    },
    breweryCheckmark: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    breweryCheckboxLabel: {
        fontSize: 16,
        color: '#1e293b',
        fontWeight: '600',
        flex: 1,
    },
    breweryCheckboxSubtext: {
        fontSize: 13,
        color: '#64748b',
        fontStyle: 'italic',
        marginLeft: 32,
    },
    enhanceButton: {
        backgroundColor: '#ff6600',
        padding: 8,
        borderRadius: 6,
        alignItems: 'center',
        marginBottom: 12,
    },
    enhanceButtonDisabled: {
        backgroundColor: '#fbbf24',
        opacity: 0.7,
    },
    enhanceButtonText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    fieldInputEmpty: {
        borderColor: '#f59e0b',
        borderWidth: 2,
        backgroundColor: '#fef3c7',
    },
    enhancementControls: {
        backgroundColor: '#f8fafc',
        padding: 12,
        margin: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    autoEnhanceButton: {
        backgroundColor: '#ff6600',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginBottom: 8,
    },
    autoEnhanceButtonDisabled: {
        backgroundColor: '#fbbf24',
        opacity: 0.7,
    },
    autoEnhanceButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
    },
    enhancementSubtext: {
        fontSize: 12,
        color: '#64748b',
        textAlign: 'center',
        fontStyle: 'italic',
    },
});