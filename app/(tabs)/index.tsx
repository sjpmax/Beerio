import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../utils/supabase';
import { Picker } from '@react-native-picker/picker';

export default function BeerValueTable() {
    const [beers, setBeers] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: 'valueScore', direction: 'desc' });
    const [loading, setLoading] = useState(true);
    const navigation = useNavigation();
    const [selectedBeerType, setSelectedBeerType] = useState('');
    const [beerTypes, setBeerTypes] = useState([]);
    const [filteredBeers, setFilteredBeers] = useState([]);

    // Helper function to get current day in lowercase
    const getCurrentDay = () => {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const now = new Date();
        return days[now.getDay()];
    };

    // Helper function to check if it's currently happy hour
    const isCurrentlyHappyHour = (happyHourDays, happyHourStart, happyHourEnd) => {
        if (!happyHourDays || happyHourDays.length === 0) return false;

        const now = new Date();
        const currentDay = getCurrentDay();
        const currentHour = now.getHours();

        // Check if today is a happy hour day
        if (!happyHourDays.includes(currentDay)) return false;

        // If no time specified, assume all day
        if (!happyHourStart || !happyHourEnd) return true;

        // Parse time strings (assuming format like "17:00")
        const startHour = parseInt(happyHourStart.split(':')[0]);
        const endHour = parseInt(happyHourEnd.split(':')[0]);

        return currentHour >= startHour && currentHour < endHour;
    };

    // Helper function to check if there's a daily special today
    const getTodaySpecial = (dailySpecials) => {
        if (!dailySpecials || dailySpecials.length === 0) return null;

        const currentDay = getCurrentDay();
        const todaySpecial = dailySpecials.find(special => special.day === currentDay);

        return todaySpecial ? todaySpecial.description : null;
    };

    // Calculate how much alcohol you get per dollar (ABV * oz / price)
    const calculateValueScore = (beer) => {
        return ((beer.abv * beer.size_oz) / 100) / beer.price;
    };

    useEffect(() => {
        const fetchBeers = async () => {
            try {
                setLoading(true);
                const { data, error } = await supabase
                    .from('beers')
                    .select(`
                        *, 
                        bars!inner(
                            name, 
                            happy_hour_days, 
                            happy_hour_start, 
                            happy_hour_end, 
                            happy_hour_discount_amount, 
                            daily_specials
                        )
                    `);

                if (error) {
                    console.error('Error fetching beers:', error.message);
                    return;
                }

                // Add value score and bar info to each beer
                const beersWithScore = data.map(beer => ({
                    ...beer,
                    barName: beer.bars?.name,
                    valueScore: calculateValueScore(beer),
                    // Bar specials data
                    happyHourDays: beer.bars?.happy_hour_days,
                    happyHourStart: beer.bars?.happy_hour_start,
                    happyHourEnd: beer.bars?.happy_hour_end,
                    happyHourDiscount: beer.bars?.happy_hour_discount_amount,
                    dailySpecials: beer.bars?.daily_specials
                }));

                setBeers(beersWithScore);
                setFilteredBeers(beersWithScore);
            } catch (error) {
                console.error('Error:', error.message);
            } finally {
                setLoading(false);
            }
        };

        fetchBeers();
    }, []);

    // Get unique beer types that exist in current data
    useEffect(() => {
        if (beers.length > 0) {
            const existingTypes = [...new Set(
                beers
                    .map(beer => beer.type)
                    .filter(type => type && type.trim())
            )].sort();

            setBeerTypes(existingTypes.map(type => ({ type })));
        }
    }, [beers]);

    // Filter beers when type selection changes
    useEffect(() => {
        if (!selectedBeerType) {
            setFilteredBeers(beers);
        } else {
            const filtered = beers.filter(beer =>
                beer.type && beer.type.toLowerCase() === selectedBeerType.toLowerCase()
            );
            setFilteredBeers(filtered);
        }
    }, [selectedBeerType, beers]);

    // Sort function
    const sortBeers = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }

        const sortedData = [...filteredBeers].sort((a, b) => {
            if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
            if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
            return 0;
        });

        setFilteredBeers(sortedData);
        setSortConfig({ key, direction });
    };

    // Get arrow direction for sort headers
    const getSortIndicator = (key) => {
        if (sortConfig.key === key) {
            return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
        }
        return '';
    };

    // Find the beer with the best value score
    const getBestValueId = () => {
        if (!filteredBeers.length) return null;
        let bestBeer = filteredBeers[0];
        for (const beer of filteredBeers) {
            if (beer.valueScore > bestBeer.valueScore) {
                bestBeer = beer;
            }
        }
        return bestBeer.id;
    };

    const bestValueId = getBestValueId();

    // Sort filtered beers by value score (highest first) before taking top 5
    const sortedFilteredBeers = [...filteredBeers].sort((a, b) => b.valueScore - a.valueScore);
    const topFiveBeers = sortedFilteredBeers.slice(0, 5);

    // Beer Card Component
    const BeerCard = ({ beer, rank }) => {
        const currentlyHappyHour = isCurrentlyHappyHour(beer.happyHourDays, beer.happyHourStart, beer.happyHourEnd);
        const todaySpecial = getTodaySpecial(beer.dailySpecials);

        return (
            <View style={styles.beerCard}>
                {/* Rank badge */}
                <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>#{rank}</Text>
                </View>

                {/* Special badges */}
                <View style={styles.badgeContainer}>
                    {currentlyHappyHour && (
                        <View style={styles.happyHourBadge}>
                            <Text style={styles.badgeText}>🍻 Happy Hour</Text>
                        </View>
                    )}
                    {todaySpecial && (
                        <View style={styles.specialBadge}>
                            <Text style={styles.badgeText}>🔥 Special</Text>
                        </View>
                    )}
                </View>

                {/* Main content */}
                <View style={styles.cardContent}>
                    <Text style={styles.beerName}>{beer.name}</Text>
                    <Text style={styles.beerDetails}>{beer.type} • {beer.size_oz}oz</Text>

                    {/* Value score */}
                    <View style={styles.valueScoreContainer}>
                        <Text style={styles.valueScoreNumber}>{beer.valueScore.toFixed(3)}</Text>
                        <Text style={styles.valueScoreLabel}>VALUE SCORE</Text>
                    </View>

                    {/* Price and ABV */}
                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>${beer.price}</Text>
                            <Text style={styles.statLabel}>Price</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{beer.abv}%</Text>
                            <Text style={styles.statLabel}>ABV</Text>
                        </View>
                    </View>

                    {/* Bar and special info */}
                    <View style={styles.barInfo}>
                        <Text style={styles.barName}>{beer.barName}</Text>
                        {todaySpecial && (
                            <Text style={styles.specialText}>💰 {todaySpecial}</Text>
                        )}
                        {currentlyHappyHour && beer.happyHourDiscount && (
                            <Text style={styles.happyHourText}>🍻 {beer.happyHourDiscount}</Text>
                        )}
                    </View>
                </View>
            </View>
        );
    };

    // Table row component
    const renderBeerRow = ({ item: beer }) => (
        <View style={[styles.row, beer.id === bestValueId ? styles.bestValueRow : null]}>
            <Text style={[styles.cell, { flex: 2 }]}>{beer.name}</Text>
            <Text style={[styles.cell, { flex: 1 }]}>${beer.price}</Text>
            <Text style={[styles.cell, { flex: 1.2 }]}>{beer.valueScore.toFixed(3)}</Text>
            <Text style={[styles.cell, { flex: 1.5 }]}>{beer.barName}</Text>
        </View>
    );

    // Filter Component
    const FilterComponent = () => (
        <View style={styles.filterContainer}>
            <Text style={styles.filterLabel}>Filter by Beer Type:</Text>
            <View style={styles.pickerWrapper}>
                <Picker
                    selectedValue={selectedBeerType}
                    onValueChange={(itemValue) => setSelectedBeerType(itemValue)}
                    style={styles.filterPicker}
                >
                    <Picker.Item label="All Beer Types" value="" />
                    {beerTypes.map((type) => (
                        <Picker.Item
                            key={type.type}
                            label={type.type}
                            value={type.type}
                        />
                    ))}
                </Picker>
            </View>
            {selectedBeerType && (
                <TouchableOpacity
                    style={styles.clearFilterButton}
                    onPress={() => setSelectedBeerType('')}
                >
                    <Text style={styles.clearFilterText}>Clear</Text>
                </TouchableOpacity>
            )}
        </View>
    );

    // Table Header
    const TableHeader = () => (
        <View style={[styles.row, styles.headerRow]}>
            <TouchableOpacity onPress={() => sortBeers('name')} style={{ flex: 2 }}>
                <Text style={styles.headerCell}>Name{getSortIndicator('name')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => sortBeers('price')} style={{ flex: 1 }}>
                <Text style={styles.headerCell}>Price{getSortIndicator('price')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => sortBeers('valueScore')} style={{ flex: 1.2 }}>
                <Text style={styles.headerCell}>Score{getSortIndicator('valueScore')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => sortBeers('barName')} style={{ flex: 1.5 }}>
                <Text style={styles.headerCell}>Bar{getSortIndicator('barName')}</Text>
            </TouchableOpacity>
        </View>
    );

    if (loading) {
        return (
            <View style={styles.container}>
                <Text style={styles.loading}>Loading beer data...</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Header */}
            <Text style={styles.title}>Beer Value Comparison</Text>

            {/* Filter */}
            <FilterComponent />

            {/* Filter status */}
            {selectedBeerType && (
                <Text style={styles.filterStatus}>
                    Showing {filteredBeers.length} {selectedBeerType} beer{filteredBeers.length !== 1 ? 's' : ''}
                </Text>
            )}

            {/* Top 5 Cards Section */}
            <View style={styles.topSection}>
                <Text style={styles.sectionTitle}>🏆 Top 5 Best Values</Text>
                {topFiveBeers.map((beer, index) => (
                    <BeerCard key={beer.id} beer={beer} rank={index + 1} />
                ))}
            </View>

            {/* All Beers Table Section */}
            <View style={styles.tableSection}>
                <View style={styles.tableSectionHeader}>
                    <Text style={styles.tableSectionTitle}>All Beers</Text>
                    <Text style={styles.tableSectionSubtitle}>Complete comparison table</Text>
                </View>

                <View style={styles.table}>
                    <TableHeader />
                    <FlatList
                        data={filteredBeers}
                        keyExtractor={(item) => item.id.toString()}
                        renderItem={renderBeerRow}
                        scrollEnabled={false}
                    />
                </View>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
                <Text style={styles.footerText}>
                    Value Score Formula: (ABV% × Size in oz / 100) ÷ Price
                </Text>
                <Text style={styles.footerText}>
                    Higher score = more alcohol per dollar = better value
                </Text>
            </View>

            <TouchableOpacity
                style={styles.addButton}
                onPress={() => navigation.navigate('beerAdd')}
            >
                <Text style={styles.addButtonText}>Add Beer</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1e3a8a',
    },
    content: {
        padding: 16,
        paddingBottom: 40,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 16,
        textAlign: 'center',
        color: '#FFD700',
    },
    loading: {
        padding: 20,
        textAlign: 'center',
        color: '#FFD700',
        fontSize: 18,
    },

    // Filter styles
    filterContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1e40af',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
        flexWrap: 'wrap',
    },
    filterLabel: {
        color: '#FFD700',
        fontSize: 14,
        fontWeight: '600',
        marginRight: 12,
        minWidth: 80,
    },
    pickerWrapper: {
        backgroundColor: '#f1f5f9',
        borderRadius: 6,
        flex: 1,
        minWidth: 150,
        marginRight: 8,
        height: 50,
        justifyContent: 'center',
    },
    filterPicker: {
        color: '#1e3a8a',
        height: 50,
        fontSize: 14,
    },
    clearFilterButton: {
        backgroundColor: '#ef4444',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 4,
    },
    clearFilterText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    filterStatus: {
        color: '#10b981',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 12,
        fontWeight: '600',
    },

    // Top 5 section
    topSection: {
        marginBottom: 32,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFD700',
        marginBottom: 16,
    },

    // Beer card styles
    beerCard: {
        backgroundColor: '#1e40af',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 2,
        borderColor: '#3b82f6',
        position: 'relative',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    rankBadge: {
        position: 'absolute',
        top: 12,
        left: 12,
        backgroundColor: '#FFD700',
        borderRadius: 20,
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rankText: {
        color: '#1e3a8a',
        fontWeight: 'bold',
        fontSize: 14,
    },
    badgeContainer: {
        position: 'absolute',
        top: 12,
        right: 12,
        alignItems: 'flex-end',
    },
    happyHourBadge: {
        backgroundColor: '#ff6600',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        marginBottom: 4,
    },
    specialBadge: {
        backgroundColor: '#ef4444',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    badgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '600',
    },
    cardContent: {
        marginTop: 32,
    },
    beerName: {
        color: '#FFD700',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    beerDetails: {
        color: '#cbd5e1',
        fontSize: 14,
        marginBottom: 16,
    },
    valueScoreContainer: {
        backgroundColor: '#FFD700',
        borderRadius: 8,
        padding: 16,
        alignItems: 'center',
        marginBottom: 16,
    },
    valueScoreNumber: {
        color: '#1e3a8a',
        fontSize: 24,
        fontWeight: 'bold',
    },
    valueScoreLabel: {
        color: '#1e3a8a',
        fontSize: 10,
        fontWeight: '600',
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 16,
    },
    statItem: {
        alignItems: 'center',
    },
    statValue: {
        color: '#f1f5f9',
        fontSize: 18,
        fontWeight: 'bold',
    },
    statLabel: {
        color: '#94a3b8',
        fontSize: 12,
    },
    barInfo: {
        borderTopWidth: 1,
        borderTopColor: '#3b82f6',
        paddingTop: 12,
    },
    barName: {
        color: '#cbd5e1',
        fontSize: 14,
        fontWeight: '600',
    },
    specialText: {
        color: '#fbbf24',
        fontSize: 12,
        marginTop: 4,
    },
    happyHourText: {
        color: '#fb923c',
        fontSize: 12,
        marginTop: 4,
    },

    // Table section
    tableSection: {
        backgroundColor: '#1e40af',
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 20,
    },
    tableSectionHeader: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#3b82f6',
    },
    tableSectionTitle: {
        color: '#FFD700',
        fontSize: 18,
        fontWeight: 'bold',
    },
    tableSectionSubtitle: {
        color: '#cbd5e1',
        fontSize: 14,
    },
    table: {
        borderWidth: 1,
        borderColor: '#3b82f6',
        borderRadius: 8,
        overflow: 'hidden',
    },
    row: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderColor: '#3b82f6',
        minHeight: 44,
        alignItems: 'center',
    },
    headerRow: {
        backgroundColor: '#1e40af',
    },
    bestValueRow: {
        backgroundColor: '#166534',
    },
    headerCell: {
        padding: 8,
        fontWeight: 'bold',
        color: '#FFD700',
        textAlign: 'center',
        fontSize: 14,
    },
    cell: {
        padding: 8,
        textAlign: 'center',
        color: '#f1f5f9',
        fontSize: 13,
    },

    // Footer
    footer: {
        marginTop: 16,
        padding: 16,
        backgroundColor: '#1e40af',
        borderRadius: 8,
    },
    footerText: {
        color: '#f1f5f9',
        fontSize: 14,
        textAlign: 'center',
    },
    addButton: {
        backgroundColor: '#FFD700',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 16,
    },
    addButtonText: {
        color: '#1e3a8a',
        fontSize: 16,
        fontWeight: '600',
    },
});