
import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
    KeyboardAvoidingView,
    Platform,
    FlatList
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { supabase, getCurrentUser, fetchStates } from '../../utils/supabase';
import { showAlert, showSubmissionSuccess, showSuccessThenReset } from '../../utils/uiHelpers';

interface NearbyBarSuggestion {
    name: string;
    address: string;
    placeId: string;
    distance: number;
    rating?: number;
    isOpen?: boolean;
    coordinates: {
        latitude: number;
        longitude: number;
    };
}

export default function AddBarScreen() {
    const navigation = useNavigation();

    // Form state
    const [barName, setBarName] = useState('');
    const [streetAddress, setStreetAddress] = useState('');
    const [city, setCity] = useState('');
    const [selectedStateId, setSelectedStateId] = useState('');
    const [zipCode, setZipCode] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [states, setStates] = useState([]);
    const [lastSubmittedBar, setLastSubmittedBar] = useState('');

    // GPS and Google Maps state
    const [userLocation, setUserLocation] = useState(null);
    const [nearbyBarSuggestions, setNearbyBarSuggestions] = useState<NearbyBarSuggestion[]>([]);
    const [showNearbyBars, setShowNearbyBars] = useState(false);
    const [isSearchingNearby, setIsSearchingNearby] = useState(false);
    const [selectedNearbyBar, setSelectedNearbyBar] = useState<NearbyBarSuggestion | null>(null);

    const [searchTimeout, setSearchTimeout] = useState(null);

    // Special type selection
    const [specialType, setSpecialType] = useState('none');

    // Happy hour specials state
    const [specialDays, setSpecialDays] = useState({
        monday: false,
        tuesday: false,
        wednesday: false,
        thursday: false,
        friday: false,
        saturday: false,
        sunday: false
    });
    const [isAllDay, setIsAllDay] = useState(true);
    const [specialStart, setSpecialStart] = useState('');
    const [specialEnd, setSpecialEnd] = useState('');
    const [specialDescription, setSpecialDescription] = useState('');

    // Daily specials state
    const [dailySpecials, setDailySpecials] = useState({
        monday: { hasSpecial: false, description: '' },
        tuesday: { hasSpecial: false, description: '' },
        wednesday: { hasSpecial: false, description: '' },
        thursday: { hasSpecial: false, description: '' },
        friday: { hasSpecial: false, description: '' },
        saturday: { hasSpecial: false, description: '' },
        sunday: { hasSpecial: false, description: '' }
    });

    const anyDaySelected = Object.values(specialDays).some(day => day);

    // Happy hour time options
    const timeOptions = [
        { label: 'Select time...', value: '' },
        { label: '12:00 PM', value: '12:00' },
        { label: '1:00 PM', value: '13:00' },
        { label: '2:00 PM', value: '14:00' },
        { label: '3:00 PM', value: '15:00' },
        { label: '4:00 PM', value: '16:00' },
        { label: '5:00 PM', value: '17:00' },
        { label: '6:00 PM', value: '18:00' },
        { label: '7:00 PM', value: '19:00' },
        { label: '8:00 PM', value: '20:00' },
        { label: '9:00 PM', value: '21:00' },
        { label: '10:00 PM', value: '22:00' },
        { label: '11:00 PM', value: '23:00' },
        { label: '12:00 AM', value: '00:00' },
        { label: '1:00 AM', value: '01:00' },
        { label: '2:00 AM', value: '02:00' },
        { label: '3:00 AM', value: '03:00' },
        { label: '4:00 AM', value: '04:00' },
        { label: '5:00 AM', value: '05:00' },
        { label: '6:00 AM', value: '06:00' },
        { label: '7:00 AM', value: '07:00' },
        { label: '8:00 AM', value: '08:00' },
        { label: '9:00 AM', value: '09:00' },
        { label: '10:00 AM', value: '10:00' },
        { label: '11:00 AM', value: '11:00' },
    ];

    // Get user location on component mount
    useEffect(() => {
        async function getCurrentLocation() {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status === 'granted') {
                    console.log('📍 Getting user location...');
                    const location = await Location.getCurrentPositionAsync({
                        accuracy: Location.Accuracy.Balanced
                    });
                    setUserLocation(location.coords);
                    console.log('✅ Location obtained:', location.coords);
                } else {
                    console.log('❌ Location permission denied');
                    showAlert('Location Permission', 'Location access will help suggest nearby bars automatically.');
                }
            } catch (error) {
                console.error('Error getting location:', error);
            }
        }
        getCurrentLocation();
    }, []);

    // Fetch states on component mount
    useEffect(() => {
        async function getStates() {
            try {
                const stateData = await fetchStates();
                setStates(stateData);

                // Default to Pennsylvania if available
                const pennsylvania = stateData?.find(state => state.abbreviation === 'PA');
                if (pennsylvania) {
                    setSelectedStateId(pennsylvania.id.toString());
                }
            } catch (error) {
                console.error('Error fetching states:', error);
            }
        }
        getStates();
    }, []);

    useEffect(() => {
        // Cleanup timeout on component unmount
        return () => {
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
        };
    }, [searchTimeout]);

    // Calculate distance between two coordinates
    const calculateDistance = (pos1: any, pos2: any): number => {
        const R = 6371; // Earth's radius in km
        const dLat = (pos2.lat - pos1.latitude) * Math.PI / 180;
        const dLon = (pos2.lng - pos1.longitude) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(pos1.latitude * Math.PI / 180) * Math.cos(pos2.lat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    // Search nearby bars using Google Places API
    const searchNearbyBars = async (query: string, location: any) => {
        if (!process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) {
            console.log('❌ Google Maps API key not configured');
            return;
        }

        // Prevent search if query is too short
        if (query.length < 3) {
            setNearbyBarSuggestions([]);
            setShowNearbyBars(false);
            return;
        }

        setIsSearchingNearby(true);

        try {
            console.log(`🔍 Searching for "${query}" near location...`);

            // Single optimized search call
            const response = await fetch(
                `https://maps.googleapis.com/maps/api/place/nearbysearch/json?` +
                `location=${location.latitude},${location.longitude}&` +
                `radius=8000&` +
                `keyword=${encodeURIComponent(query)}&` +
                `type=bar&` +
                `key=${process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}`
            );

            const data = await response.json();

            if (data.status !== 'OK') {
                console.log(`❌ Google Places API error:`, data.status, data.error_message);

                // If no results with type=bar, try a broader search
                if (data.status === 'ZERO_RESULTS') {
                    console.log(`🔄 Trying broader search without type filter...`);
                    return await searchNearbyBarsBackup(query, location);
                }

                setNearbyBarSuggestions([]);
                setShowNearbyBars(false);
                return;
            }

            console.log(`✅ Found ${data.results?.length || 0} initial results`);
            processSearchResults(data.results || [], query, location);

        } catch (error) {
            console.error('❌ Google Places search failed:', error);
            setNearbyBarSuggestions([]);
            setShowNearbyBars(false);
        } finally {
            setIsSearchingNearby(false);
        }
    };

    const processSearchResults = (results: any[], query: string, location: any) => {
        const nearbyBars = results
            .filter(place => {
                const name = place.name.toLowerCase();
                const searchTerm = query.toLowerCase();

                // Improved matching logic
                const nameMatches = (
                    name.includes(searchTerm) ||
                    name.split(' ').some(word => word.startsWith(searchTerm)) ||
                    searchTerm.split(' ').every(term => name.includes(term))
                );

                // Filter out irrelevant businesses
                const excludeTypes = ['liquor_store', 'doctor', 'hospital', 'pharmacy', 'gas_station'];
                const includeTypes = ['bar', 'restaurant', 'brewery', 'night_club', 'cafe'];

                const hasRelevantType = place.types.some(type => includeTypes.includes(type));
                const hasExcludedType = place.types.some(type => excludeTypes.includes(type));

                return nameMatches && hasRelevantType && !hasExcludedType;
            })
            .map(place => ({
                name: place.name,
                address: place.vicinity || place.formatted_address || 'Address not available',
                placeId: place.place_id,
                distance: calculateDistance(location, place.geometry.location),
                rating: place.rating,
                isOpen: place.opening_hours?.open_now,
                businessType: determineBusinessType(place.types),
                coordinates: {
                    latitude: place.geometry.location.lat,
                    longitude: place.geometry.location.lng
                }
            }))
            .sort((a, b) => {
                const queryLower = query.toLowerCase();

                // 1. Exact name match first
                const aExact = a.name.toLowerCase() === queryLower;
                const bExact = b.name.toLowerCase() === queryLower;
                if (aExact && !bExact) return -1;
                if (!aExact && bExact) return 1;

                // 2. Name starts with query
                const aStarts = a.name.toLowerCase().startsWith(queryLower);
                const bStarts = b.name.toLowerCase().startsWith(queryLower);
                if (aStarts && !bStarts) return -1;
                if (!aStarts && bStarts) return 1;

                // 3. Business type relevance
                const aRelevance = getBusinessTypeRelevance(a.businessType);
                const bRelevance = getBusinessTypeRelevance(b.businessType);
                if (aRelevance !== bRelevance) return bRelevance - aRelevance;

                // 4. Distance
                return a.distance - b.distance;
            })
            .slice(0, 6); // Limit to 6 results

        console.log(`✅ Final filtered results: ${nearbyBars.length}`);
        nearbyBars.forEach((bar, index) => {
            console.log(`  ${index + 1}. ${bar.name} (${bar.businessType}) - ${bar.distance.toFixed(1)}km`);
        });

        setNearbyBarSuggestions(nearbyBars);
        setShowNearbyBars(nearbyBars.length > 0);
    };


    const determineBusinessType = (types: string[]): string => {
        if (types.includes('brewery')) return 'brewery';
        if (types.includes('bar')) return 'bar';
        if (types.includes('night_club')) return 'nightclub';
        if (types.includes('restaurant')) return 'restaurant';
        if (types.includes('cafe')) return 'cafe';
        return 'establishment';
    };

    const getBusinessTypeRelevance = (businessType: string): number => {
        const relevanceMap = {
            'brewery': 5,
            'bar': 4,
            'nightclub': 3,
            'restaurant': 2,
            'cafe': 1,
            'establishment': 0
        };
        return relevanceMap[businessType] || 0;
    };

    const searchWithBackupStrategy = async (query: string, location: any) => {
        // If first search doesn't yield good results, try a broader search
        try {
            const response = await fetch(
                `https://maps.googleapis.com/maps/api/place/nearbysearch/json?` +
                `location=${location.latitude},${location.longitude}&` +
                `radius=5000&` +
                `keyword=${encodeURIComponent(query + ' bar')}&` + // Add "bar" to help matching
                `key=${process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}`
            );

            const data = await response.json();

            if (data.status === 'OK' && data.results?.length > 0) {
                console.log(`🔄 Backup search found ${data.results.length} additional results`);
                return data.results;
            }
        } catch (error) {
            console.error('Backup search failed:', error);
        }

        return [];
    };

    // Helper function to toggle daily special
    const toggleDailySpecial = (day) => {
        setDailySpecials(prev => ({
            ...prev,
            [day]: {
                ...prev[day],
                hasSpecial: !prev[day].hasSpecial
            }
        }));
    };

    // Helper function to update daily special description
    const updateDailySpecialDescription = (day, description) => {
        setDailySpecials(prev => ({
            ...prev,
            [day]: {
                ...prev[day],
                description
            }
        }));
    };

    const toggleSpecialDay = (day) => {
        setSpecialDays(prev => ({
            ...prev,
            [day]: !prev[day]
        }));
    };


    const handleBarNameChange = (text: string) => {
        setBarName(text);
        setSelectedNearbyBar(null);

        // Clear existing timeout
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        // Hide suggestions immediately if text is too short
        if (text.length < 3) {
            setNearbyBarSuggestions([]);
            setShowNearbyBars(false);
            return;
        }

        // Set new timeout for search
        const newTimeout = setTimeout(() => {
            if (userLocation && text.length >= 3) {
                console.log(`🔍 Debounced search triggered for: "${text}"`);
                searchNearbyBars(text, userLocation);
            }
        }, 800); // Wait 800ms after user stops typing

        setSearchTimeout(newTimeout);
    };

    const selectNearbyBar = async (nearbyBar: NearbyBarSuggestion) => {
        console.log(`📍 Selected nearby bar: ${nearbyBar.name}`);
        setSelectedNearbyBar(nearbyBar);
        setBarName(nearbyBar.name);
        setShowNearbyBars(false);

        // Get detailed place info for address breakdown
        const placeDetails = await getPlaceDetails(nearbyBar.placeId);

        if (placeDetails) {
            setStreetAddress(placeDetails.street_address);
            setCity(placeDetails.city);
            setZipCode(placeDetails.zip);

            console.log('✅ Auto-filled address from Google Places');
        } else {
            // Fallback: use the basic address from search
            setStreetAddress(nearbyBar.address);
        }
    };

    const handleSubmit = async () => {
        // Basic validation
        if (!barName.trim() || !streetAddress.trim() || !city.trim() || !zipCode.trim() || !selectedStateId) {
            Alert.alert('Error', 'Please fill in all required fields');
            return;
        }

        setIsSubmitting(true);

        try {
            const currentUser = await getCurrentUser();
            if (!currentUser) {
                Alert.alert('Error', 'You must be logged in to add bars');
                return;
            }

            // Use real coordinates if we have them from Google Places
            let latitude, longitude;
            if (selectedNearbyBar) {
                latitude = selectedNearbyBar.coordinates.latitude;
                longitude = selectedNearbyBar.coordinates.longitude;
                console.log('✅ Using real coordinates from Google Places');
            } else {
                // Fallback to dummy coordinates
                latitude = 39.9526 + (Math.random() - 0.5) * 0.1; // Philly area
                longitude = -75.1652 + (Math.random() - 0.5) * 0.1;
                console.log('⚠️ Using dummy coordinates - consider adding geocoding');
            }

            const activeDailySpecials = Object.keys(dailySpecials)
                .filter(day => dailySpecials[day].hasSpecial && dailySpecials[day].description.trim())
                .map(day => ({
                    day: day,
                    description: dailySpecials[day].description.trim()
                }));

            const selectedDaysArray = Object.keys(specialDays).filter(day => specialDays[day]);

            // Check if this bar might be a brewery
            const isBrewery = barName.toLowerCase().includes('brewery') ||
                barName.toLowerCase().includes('brewing') ||
                barName.toLowerCase().includes('brewhouse');

            const { error } = await supabase.from('bars').insert([
                {
                    name: barName.trim(),
                    street_address: streetAddress.trim(),
                    city: city.trim(),
                    state_id: parseInt(selectedStateId),
                    zip: zipCode.trim(),
                    latitude: latitude,
                    longitude: longitude,
                    is_brewery: isBrewery, // Auto-detect brewery status
                    website: selectedNearbyBar ? await getWebsiteFromPlaceId(selectedNearbyBar.placeId) : null,
                    google_place_id: selectedNearbyBar?.placeId || null,
                    happy_hour_days: (specialType === 'happy_hour' || specialType === 'both') ? selectedDaysArray : null,
                    happy_hour_start: (specialType === 'happy_hour' || specialType === 'both') && !isAllDay ? specialStart : null,
                    happy_hour_end: (specialType === 'happy_hour' || specialType === 'both') && !isAllDay ? specialEnd : null,
                    happy_hour_discount_amount: (specialType === 'happy_hour' || specialType === 'both') ? specialDescription : null,
                    special_type: specialType === 'none' ? null : specialType, // Set null for no specials
                    daily_specials: (specialType === 'daily_specials' || specialType === 'both') && activeDailySpecials.length > 0 ? activeDailySpecials : null,
                    pending_review: true,
                    status: 'pending',
                    submitted_by: currentUser.id,
                    submitted_at: new Date().toISOString(),
                }
            ]);

            if (error) {
                throw error;
            }

            // Show success with bar name
            setLastSubmittedBar(barName);
            showSubmissionSuccess(
                barName,
                'Bar',
                () => showSuccessThenReset(setLastSubmittedBar, resetBarForm),
                () => navigation.goBack()
            );
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to add bar');
            console.error('Error adding bar:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Helper to get website from place details
    const getWebsiteFromPlaceId = async (placeId: string): Promise<string | null> => {
        const details = await getPlaceDetails(placeId);
        return details?.website || null;
    };

    // Add this function to your component:
    const getPlaceDetails = async (placeId: string): Promise<any> => {
        try {
            const response = await fetch(
                `https://maps.googleapis.com/maps/api/place/details/json?` +
                `place_id=${placeId}&` +
                `fields=name,formatted_address,address_components,geometry,website&` +
                `key=${process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}`
            );

            const data = await response.json();

            if (data.status === 'OK') {
                const result = data.result;
                const addressComponents = result.address_components;

                // Parse address components
                const streetNumber = addressComponents.find(comp => comp.types.includes('street_number'))?.long_name || '';
                const streetName = addressComponents.find(comp => comp.types.includes('route'))?.long_name || '';
                const city = addressComponents.find(comp => comp.types.includes('locality'))?.long_name || '';
                const zip = addressComponents.find(comp => comp.types.includes('postal_code'))?.long_name || '';

                return {
                    street_address: `${streetNumber} ${streetName}`.trim(),
                    city: city,
                    zip: zip,
                    geometry: result.geometry,
                    website: result.website
                };
            }
        } catch (error) {
            console.error('Error getting place details:', error);
        }
        return null;
    };

    const resetBarForm = () => {
        setBarName('');
        setStreetAddress('');
        setCity('');
        setZipCode('');
        setSpecialType('none');
        setSpecialDays({
            monday: false, tuesday: false, wednesday: false, thursday: false,
            friday: false, saturday: false, sunday: false
        });
        setDailySpecials({
            monday: { hasSpecial: false, description: '' },
            tuesday: { hasSpecial: false, description: '' },
            wednesday: { hasSpecial: false, description: '' },
            thursday: { hasSpecial: false, description: '' },
            friday: { hasSpecial: false, description: '' },
            saturday: { hasSpecial: false, description: '' },
            sunday: { hasSpecial: false, description: '' }
        });
        setIsAllDay(true);
        setSpecialStart('');
        setSpecialEnd('');
        setSpecialDescription('');
        setSelectedNearbyBar(null);
        setNearbyBarSuggestions([]);
        setShowNearbyBars(false);
    };

    // Render nearby bar suggestion - REMOVED (now using inline .map())

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Text style={styles.title}>Add New Bar</Text>
                    <Text style={styles.subtitle}>
                        Help the community discover great beer spots!
                    </Text>
                    {userLocation && (
                        <Text style={styles.locationStatus}>
                            📍 GPS enabled - we'll suggest nearby bars as you type
                        </Text>
                    )}
                </View>

                <View style={styles.form}>
                    {lastSubmittedBar && (
                        <View style={styles.successBanner}>
                            <Text style={styles.successText}>
                                ✅ {lastSubmittedBar} submitted successfully!
                            </Text>
                        </View>
                    )}

                    <Text style={styles.label}>Bar Name *</Text>
                    <View style={[styles.inputContainer, { zIndex: 1000 }]}>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g., Fishtown Tavern"
                            value={barName}
                            onChangeText={handleBarNameChange}
                            autoCapitalize="words"
                        />

                        {isSearchingNearby && (
                            <Text style={styles.searchingText}>🔍 Finding nearby bars...</Text>
                        )}

                        {selectedNearbyBar && (
                            <View style={styles.selectedBarInfo}>
                                <Text style={styles.selectedBarText}>
                                    ✅ Selected: {selectedNearbyBar.name}
                                </Text>
                                <Text style={styles.selectedBarMeta}>
                                    📍 {selectedNearbyBar.distance.toFixed(1)}km away • Auto-filled address
                                </Text>
                            </View>
                        )}


                        {showNearbyBars && nearbyBarSuggestions.length > 0 && (
                            <View style={styles.suggestionsContainer}>
                                <Text style={styles.suggestionsHeader}>📍 Nearby bars matching "{barName}":</Text>
                                <View style={styles.suggestionsList}>
                                    {nearbyBarSuggestions.map((item) => (
                                        <TouchableOpacity
                                            key={item.placeId}
                                            style={styles.nearbyBarItem}
                                            onPress={() => selectNearbyBar(item)}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={styles.nearbyBarName}>{item.name}</Text>
                                            <Text style={styles.nearbyBarAddress}>{item.address}</Text>
                                            <View style={styles.nearbyBarMeta}>
                                                <Text style={styles.distance}>📍 {item.distance.toFixed(1)}km away</Text>
                                                {item.rating && <Text style={styles.rating}>⭐ {item.rating}/5</Text>}
                                                {item.isOpen !== undefined && (
                                                    <Text style={[styles.openStatus, { color: item.isOpen ? '#10b981' : '#ef4444' }]}>
                                                        {item.isOpen ? '🟢 Open' : '🔴 Closed'}
                                                    </Text>
                                                )}
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}
                    </View>

                    <Text style={styles.label}>Street Address *</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g., 1234 Frankford Ave"
                        value={streetAddress}
                        onChangeText={setStreetAddress}
                        autoCapitalize="words"
                    />

                    <Text style={styles.label}>City *</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g., Philadelphia"
                        value={city}
                        onChangeText={setCity}
                        autoCapitalize="words"
                    />

                    <View style={styles.row}>
                        <View style={styles.halfWidth}>
                            <Text style={styles.label}>State *</Text>
                            <View style={styles.pickerWrapper}>
                                <Picker
                                    selectedValue={selectedStateId}
                                    onValueChange={(itemValue) => setSelectedStateId(itemValue)}
                                    style={styles.picker}
                                >
                                    <Picker.Item label="Select state..." value="" />
                                    {states.map((state) => (
                                        <Picker.Item
                                            key={state.id}
                                            label={`${state.name} (${state.abbreviation})`}
                                            value={state.id.toString()}
                                        />
                                    ))}
                                </Picker>
                            </View>
                        </View>

                        <View style={styles.halfWidth}>
                            <Text style={styles.label}>Zip Code *</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="19125"
                                value={zipCode}
                                onChangeText={setZipCode}
                                keyboardType="numeric"
                                maxLength={5}
                            />
                        </View>
                    </View>

                    <Text style={styles.sectionTitle}>Beer Specials (Optional)</Text>

                    {/* Special Type Selection */}
                    <Text style={styles.label}>Does this bar have beer specials?</Text>

                    <TouchableOpacity
                        style={styles.checkboxContainer}
                        onPress={() => setSpecialType('none')}
                    >
                        <View style={[styles.radioButton, specialType === 'none' && styles.radioButtonSelected]}>
                            {specialType === 'none' && <View style={styles.radioButtonInner} />}
                        </View>
                        <Text style={styles.checkboxLabel}>No beer specials</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.checkboxContainer}
                        onPress={() => setSpecialType('happy_hour')}
                    >
                        <View style={[styles.radioButton, specialType === 'happy_hour' && styles.radioButtonSelected]}>
                            {specialType === 'happy_hour' && <View style={styles.radioButtonInner} />}
                        </View>
                        <Text style={styles.checkboxLabel}>Happy Hour (time-based beer discounts)</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.checkboxContainer}
                        onPress={() => setSpecialType('daily_specials')}
                    >
                        <View style={[styles.radioButton, specialType === 'daily_specials' && styles.radioButtonSelected]}>
                            {specialType === 'daily_specials' && <View style={styles.radioButtonInner} />}
                        </View>
                        <Text style={styles.checkboxLabel}>Daily Beer Specials (all-day recurring deals)</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.checkboxContainer}
                        onPress={() => setSpecialType('both')}
                    >
                        <View style={[styles.radioButton, specialType === 'both' && styles.radioButtonSelected]}>
                            {specialType === 'both' && <View style={styles.radioButtonInner} />}
                        </View>
                        <Text style={styles.checkboxLabel}>Both types of specials</Text>
                    </TouchableOpacity>

                    {/* Happy Hour Section */}
                    {(specialType === 'happy_hour' || specialType === 'both') && (
                        <>
                            <Text style={styles.subSectionTitle}>Happy Hour Details</Text>

                            <Text style={styles.label}>Which days?</Text>
                            <View style={styles.dayGrid}>
                                {[
                                    { key: 'monday', label: 'Mon' },
                                    { key: 'tuesday', label: 'Tue' },
                                    { key: 'wednesday', label: 'Wed' },
                                    { key: 'thursday', label: 'Thu' },
                                    { key: 'friday', label: 'Fri' },
                                    { key: 'saturday', label: 'Sat' },
                                    { key: 'sunday', label: 'Sun' }
                                ].map((day) => (
                                    <TouchableOpacity
                                        key={day.key}
                                        style={[styles.dayButton, specialDays[day.key] && styles.dayButtonSelected]}
                                        onPress={() => toggleSpecialDay(day.key)}
                                    >
                                        <Text style={[styles.dayButtonText, specialDays[day.key] && styles.dayButtonTextSelected]}>
                                            {day.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {anyDaySelected && (
                                <>
                                    <TouchableOpacity
                                        style={styles.checkboxContainer}
                                        onPress={() => setIsAllDay(true)}
                                    >
                                        <View style={[styles.radioButton, isAllDay && styles.radioButtonSelected]}>
                                            {isAllDay && <View style={styles.radioButtonInner} />}
                                        </View>
                                        <Text style={styles.checkboxLabel}>All day beer special</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.checkboxContainer}
                                        onPress={() => setIsAllDay(false)}
                                    >
                                        <View style={[styles.radioButton, !isAllDay && styles.radioButtonSelected]}>
                                            {!isAllDay && <View style={styles.radioButtonInner} />}
                                        </View>
                                        <Text style={styles.checkboxLabel}>Specific time range</Text>
                                    </TouchableOpacity>

                                    {!isAllDay && (
                                        <View style={styles.row}>
                                            <View style={styles.halfWidth}>
                                                <Text style={styles.label}>Start Time</Text>
                                                <View style={styles.pickerWrapper}>
                                                    <Picker
                                                        selectedValue={specialStart}
                                                        onValueChange={setSpecialStart}
                                                        style={styles.picker}
                                                    >
                                                        {timeOptions.map((time) => (
                                                            <Picker.Item key={time.value} label={time.label} value={time.value} />
                                                        ))}
                                                    </Picker>
                                                </View>
                                            </View>

                                            <View style={styles.halfWidth}>
                                                <Text style={styles.label}>End Time</Text>
                                                <View style={styles.pickerWrapper}>
                                                    <Picker
                                                        selectedValue={specialEnd}
                                                        onValueChange={setSpecialEnd}
                                                        style={styles.picker}
                                                    >
                                                        {timeOptions.map((time) => (
                                                            <Picker.Item key={time.value} label={time.label} value={time.value} />
                                                        ))}
                                                    </Picker>
                                                </View>
                                            </View>
                                        </View>
                                    )}

                                    <Text style={styles.label}>Happy Hour Beer Deal</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="e.g., $1 off all drafts, Half price cans, $2 off craft beer"
                                        value={specialDescription}
                                        onChangeText={setSpecialDescription}
                                        multiline={true}
                                        numberOfLines={2}
                                    />
                                </>
                            )}
                        </>
                    )}

                    {/* Daily Specials Section */}
                    {(specialType === 'daily_specials' || specialType === 'both') && (
                        <>
                            <Text style={styles.subSectionTitle}>Daily Beer Specials</Text>
                            <Text style={styles.smallText}>Check days that have beer specials and describe them</Text>

                            {Object.keys(dailySpecials).map((day) => {
                                const dayLabels = {
                                    monday: 'Monday',
                                    tuesday: 'Tuesday',
                                    wednesday: 'Wednesday',
                                    thursday: 'Thursday',
                                    friday: 'Friday',
                                    saturday: 'Saturday',
                                    sunday: 'Sunday'
                                };

                                return (
                                    <View key={day} style={styles.dailySpecialRow}>
                                        <TouchableOpacity
                                            style={styles.checkboxContainer}
                                            onPress={() => toggleDailySpecial(day)}
                                        >
                                            <View style={[styles.checkbox, dailySpecials[day].hasSpecial && styles.checkboxChecked]}>
                                                {dailySpecials[day].hasSpecial && <Text style={styles.checkmark}>✓</Text>}
                                            </View>
                                            <Text style={styles.dayLabel}>{dayLabels[day]}</Text>
                                        </TouchableOpacity>

                                        {dailySpecials[day].hasSpecial && (
                                            <TextInput
                                                style={styles.dailySpecialInput}
                                                placeholder="e.g., $18 Bud Light pitchers, $15 bucket of 4 cans"
                                                value={dailySpecials[day].description}
                                                onChangeText={(text) => updateDailySpecialDescription(day, text)}
                                                multiline={true}
                                            />
                                        )}
                                    </View>
                                );
                            })}
                        </>
                    )}

                    <View style={styles.infoBox}>
                        <Text style={styles.infoText}>
                            {selectedNearbyBar
                                ? '✅ Real coordinates from Google Maps'
                                : '📍 Using approximate coordinates - select a suggested bar for precise location'
                            }
                        </Text>
                    </View>

                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => navigation.goBack()}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
                            onPress={handleSubmit}
                            disabled={isSubmitting}
                        >
                            <Text style={styles.submitButtonText}>
                                {isSubmitting ? '🍺 Adding Bar...' : 'Add Bar'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1e3a8a',
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40, // Add extra bottom padding
    },
    header: {
        marginBottom: 30,
        alignItems: 'center',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#FFD700',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#f1f5f9',
        textAlign: 'center',
        marginBottom: 8,
    },
    locationStatus: {
        fontSize: 12,
        color: '#10b981',
        textAlign: 'center',
        fontStyle: 'italic',
    },
    form: {
        backgroundColor: '#1e40af',
        borderRadius: 16,
        padding: 20,
        // Add these properties to contain the dropdown:
        overflow: 'visible', // Allow dropdown to show
        position: 'relative',
        minHeight: 600, // Ensure enough space
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFD700',
        marginBottom: 8,
        marginTop: 16,
    },
    input: {
        backgroundColor: '#f1f5f9',
        borderColor: '#3b82f6',
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        color: '#1e3a8a',
    },
    inputContainer: {
        position: 'relative',
        width: '100%',
        marginBottom: 16, // Add consistent spacing
        // CRITICAL FIX: Ensure proper z-index stacking
        zIndex: 1000,
    },
    searchingText: {
        fontSize: 12,
        color: '#3b82f6',
        fontStyle: 'italic',
        marginTop: 4,
        marginBottom: 8,
    },
    selectedBarInfo: {
        backgroundColor: '#dcfce7',
        borderColor: '#16a34a',
        borderWidth: 1,
        borderRadius: 6,
        padding: 8,
        marginTop: 4,
        marginBottom: 8,
    },
    selectedBarText: {
        fontSize: 14,
        color: '#15803d',
        fontWeight: '600',
    },
    selectedBarMeta: {
        fontSize: 12,
        color: '#166534',
        marginTop: 2,
    },
    // MAIN FIX: Properly contain the suggestions dropdown
    suggestionsContainer: {
        position: 'absolute',
        top: 48, // Position below input
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        borderColor: '#ccc',
        borderWidth: 1,
        borderTopWidth: 0,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 8,
        maxHeight: 220, // Limit height to prevent too much overflow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 10, // Higher elevation for Android
        zIndex: 1001, // Ensure it's above other elements
    },
    suggestionsHeader: {
        fontSize: 12,
        color: '#666',
        padding: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        fontWeight: '600',
        backgroundColor: '#f8f9fa',
    },
    suggestionsList: {
        maxHeight: 180, // Constrain list height, leaving room for header
        // Simple View that will contain the mapped items
    },
    nearbyBarItem: {
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        backgroundColor: '#fff',
    },
    nearbyBarName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    nearbyBarAddress: {
        fontSize: 14,
        color: '#666',
        marginTop: 2,
    },
    nearbyBarMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        flexWrap: 'wrap',
    },
    distance: {
        fontSize: 12,
        color: '#2563eb',
        marginRight: 12,
    },
    rating: {
        fontSize: 12,
        color: '#f59e0b',
        marginRight: 12,
    },
    openStatus: {
        fontSize: 12,
        fontWeight: '600',
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 16,
    },
    halfWidth: {
        width: '48%',
    },
    infoBox: {
        backgroundColor: '#3b82f6',
        borderRadius: 8,
        padding: 12,
        marginTop: 20,
    },
    infoText: {
        color: '#f1f5f9',
        fontSize: 14,
        textAlign: 'center',
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 30,
    },
    cancelButton: {
        backgroundColor: '#6b7280',
        padding: 16,
        borderRadius: 8,
        flex: 0.45,
        alignItems: 'center',
    },
    cancelButtonText: {
        color: '#f1f5f9',
        fontSize: 16,
        fontWeight: '600',
    },
    submitButton: {
        backgroundColor: '#FFD700',
        padding: 16,
        borderRadius: 8,
        flex: 0.45,
        alignItems: 'center',
    },
    submitButtonDisabled: {
        backgroundColor: '#94a3b8',
    },
    submitButtonText: {
        color: '#1e3a8a',
        fontSize: 16,
        fontWeight: '600',
    },
    pickerWrapper: {
        backgroundColor: '#f1f5f9',
        borderColor: '#3b82f6',
        borderWidth: 1,
        borderRadius: 8,
        overflow: 'hidden',
        minHeight: 56,
        justifyContent: 'center',
    },
    picker: {
        color: '#1e3a8a',
        height: 56,
        marginVertical: -8,
        paddingLeft: 12,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFD700',
        marginTop: 24,
        marginBottom: 16,
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        flex: 1,
        marginRight: 8,
    },
    checkbox: {
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
    checkboxChecked: {
        backgroundColor: '#FFD700',
        borderColor: '#FFD700',
    },
    checkmark: {
        color: '#1e3a8a',
        fontSize: 14,
        fontWeight: 'bold',
    },
    checkboxLabel: {
        fontSize: 14,
        color: '#f1f5f9',
        flex: 1,
    },
    dayGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    dayButton: {
        width: '13%',
        backgroundColor: '#3b82f6',
        borderRadius: 6,
        paddingVertical: 8,
        alignItems: 'center',
        marginBottom: 8,
    },
    dayButtonSelected: {
        backgroundColor: '#FFD700',
    },
    dayButtonText: {
        color: '#f1f5f9',
        fontSize: 12,
        fontWeight: '600',
    },
    dayButtonTextSelected: {
        color: '#1e3a8a',
    },
    radioButton: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#3b82f6',
        marginRight: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    radioButtonSelected: {
        borderColor: '#FFD700',
    },
    radioButtonInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#FFD700',
    },
    subSectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#FFD700',
        marginTop: 20,
        marginBottom: 12,
    },
    smallText: {
        fontSize: 14,
        color: '#f1f5f9',
        marginBottom: 16,
        fontStyle: 'italic',
    },
    dailySpecialRow: {
        marginBottom: 16,
    },
    dayLabel: {
        fontSize: 16,
        color: '#f1f5f9',
        fontWeight: '600',
        minWidth: 80,
    },
    dailySpecialInput: {
        backgroundColor: '#f1f5f9',
        borderColor: '#3b82f6',
        borderWidth: 1,
        borderRadius: 6,
        padding: 10,
        fontSize: 14,
        color: '#1e3a8a',
        marginTop: 8,
        minHeight: 60,
        textAlignVertical: 'top',
    },
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
