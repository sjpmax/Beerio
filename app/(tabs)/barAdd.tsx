import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
    KeyboardAvoidingView,
    Platform
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from '@react-navigation/native';
import { supabase, getCurrentUser, fetchStates } from '../../utils/supabase';
import { showAlert, showSubmissionSuccess, showSuccessThenReset } from '../../utils/uiHelpers';

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

    // Special type selection
    const [specialType, setSpecialType] = useState('happy_hour');

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

            // For now, we'll use dummy coordinates until we add Google Maps
            // TODO: Replace with actual geocoding
            const dummyLat = 39.9526 + (Math.random() - 0.5) * 0.1; // Philly area
            const dummyLng = -75.1652 + (Math.random() - 0.5) * 0.1;

            const activeDailySpecials = Object.keys(dailySpecials)
                .filter(day => dailySpecials[day].hasSpecial && dailySpecials[day].description.trim())
                .map(day => ({
                    day: day,
                    description: dailySpecials[day].description.trim()
                }));

            const selectedDaysArray = Object.keys(specialDays).filter(day => specialDays[day]);

            const { error } = await supabase.from('bars').insert([
                {
                    name: barName.trim(),
                    street_address: streetAddress.trim(),
                    city: city.trim(),
                    state_id: parseInt(selectedStateId),
                    zip: zipCode.trim(),
                    latitude: dummyLat,
                    longitude: dummyLng,
                    happy_hour_days: (specialType === 'happy_hour' || specialType === 'both') ? selectedDaysArray : null,
                    happy_hour_start: (specialType === 'happy_hour' || specialType === 'both') && !isAllDay ? specialStart : null,
                    happy_hour_end: (specialType === 'happy_hour' || specialType === 'both') && !isAllDay ? specialEnd : null,
                    happy_hour_discount_amount: (specialType === 'happy_hour' || specialType === 'both') ? specialDescription : null,
                    special_type: specialType,
                    daily_specials: activeDailySpecials.length > 0 ? activeDailySpecials : null,
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

    const resetBarForm = () => {
        setBarName('');
        setStreetAddress('');
        setCity('');
        setZipCode('');
        setSpecialType('happy_hour');
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
    };

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
                    <TextInput
                        style={styles.input}
                        placeholder="e.g., Fishtown Tavern"
                        value={barName}
                        onChangeText={setBarName}
                        autoCapitalize="words"
                    />

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

                    <Text style={styles.sectionTitle}>Beer Specials</Text>

                    {/* Special Type Selection */}
                    <Text style={styles.label}>What type of beer specials does this bar have?</Text>

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
                            📍 Location coordinates will be added automatically when we integrate with Google Maps
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
        backgroundColor: '#1e3a8a', // Philly blue theme
    },
    scrollContent: {
        padding: 20,
    },
    header: {
        marginBottom: 30,
        alignItems: 'center',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#FFD700', // Philly gold
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#f1f5f9',
        textAlign: 'center',
    },
    form: {
        backgroundColor: '#1e40af',
        borderRadius: 16,
        padding: 20,
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
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
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