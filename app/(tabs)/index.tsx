import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme, Button, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../utils/supabase';

export default function BeerValueTable() {
    const [beers, setBeers] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: 'valueScore', direction: 'desc' });
    const [loading, setLoading] = useState(true);
    const colorScheme = useColorScheme();
    const navigation = useNavigation();

    // Calculate how much alcohol you get per dollar (ABV * oz / price)
    const calculateValueScore = (beer) => {
        // Total alcohol content = ABV (as %) * size in oz / 100
        // Value score = alcohol content / price
        return ((beer.abv * beer.size_oz) / 100) / beer.price;
    };

    useEffect(() => {
        const fetchBeers = async () => {
            try {
                setLoading(true);
                const { data, error } = await supabase
                    .from('beers').select('*, bars!inner(name)');

                if (error) {
                    console.error('Error fetching beers:', error.message);
                    return;
                }

                // Add value score to each beer
                const beersWithScore = data.map(beer => ({
                    ...beer,
                    barName: beer.bars?.name,
                    valueScore: calculateValueScore(beer)
                }));

                setBeers(beersWithScore);
            } catch (error) {
                console.error('Error:', error.message);
            } finally {
                setLoading(false);
            }
        };

        fetchBeers();
    }, []);

    // Sort function
    const sortBeers = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }

        const sortedData = [...beers].sort((a, b) => {
            if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
            if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
            return 0;
        });

        setBeers(sortedData);
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
        if (!beers.length) return null;
        let bestBeer = beers[0];
        for (const beer of beers) {
            if (beer.valueScore > bestBeer.valueScore) {
                bestBeer = beer;
            }
        }
        return bestBeer.id;
    };

    const bestValueId = getBestValueId();

    // Render individual beer row
    const renderBeerRow = ({ item: beer }) => (
        <View
            style={[
                styles.row,
                beer.id === bestValueId ? styles.bestValueRow : null
            ]}
        >
            <Text style={[styles.cell, { flex: 2 }]}>{beer.name}</Text>
            <Text style={[styles.cell, { flex: 2 }]}>{beer.type}</Text>
            <Text style={[styles.cell, { flex: 1 }]}>{beer.size_oz}</Text>
            <Text style={[styles.cell, { flex: 1 }]}>${beer.price}</Text>
            <Text style={[styles.cell, { flex: 1 }]}>{beer.abv}%</Text>
            <Text style={[styles.cell, { flex: 1.5 }]}>{beer.valueScore.toFixed(3)}</Text>
            <Text style={[styles.cell, { flex: 1.5 }]}>{beer.barName}</Text>
        </View>
    );

    // Header component for FlatList
    const ListHeader = () => (
        <>
            <Text style={styles.title}>Beer Value Comparison</Text>
            <View style={styles.table}>
                {/* Header Row */}
                <View style={[styles.row, styles.headerRow]}>
                    <TouchableOpacity onPress={() => sortBeers('name')} style={{ flex: 2 }}>
                        <Text style={styles.headerCell}>Name{getSortIndicator('name')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => sortBeers('type')} style={{ flex: 2 }}>
                        <Text style={styles.headerCell}>Type{getSortIndicator('type')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => sortBeers('size_oz')} style={{ flex: 1 }}>
                        <Text style={styles.headerCell}>Size (oz){getSortIndicator('size_oz')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => sortBeers('price')} style={{ flex: 1 }}>
                        <Text style={styles.headerCell}>Price ($){getSortIndicator('price')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => sortBeers('abv')} style={{ flex: 1 }}>
                        <Text style={styles.headerCell}>ABV (%){getSortIndicator('abv')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => sortBeers('valueScore')} style={{ flex: 1.5 }}>
                        <Text style={styles.headerCell}>Value Score{getSortIndicator('valueScore')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => sortBeers('barName')} style={{ flex: 1.5 }}>
                        <Text style={styles.headerCell}>Bar Name{getSortIndicator('barName')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </>
    );

    // Footer component for FlatList
    const ListFooter = () => (
        <>
            <View style={styles.footer}>
                <Text style={styles.footerText}>
                    Value Score Formula: (ABV% × Size in oz / 100) ÷ Price
                </Text>
                <Text style={styles.footerText}>
                    Higher score = more alcohol per dollar = better value
                </Text>
            </View>
            <Button
                title="Add Beer"
                onPress={() => navigation.navigate('BeerAdd')}
            />
        </>
    );

    // Define the styles based on color scheme
    const styles = StyleSheet.create({
        container: {
            flex: 1,
            padding: 16,
            backgroundColor: colorScheme === 'dark' ? '#242c40' : '#f5f5f5',
        },
        title: {
            fontSize: 22,
            fontWeight: 'bold',
            marginBottom: 16,
            textAlign: 'center',
            color: colorScheme === 'dark' ? '#FFD700' : '#333333',
        },
        table: {
            borderWidth: 1,
            borderColor: colorScheme === 'dark' ? '#4a4a4a' : '#dddddd',
            borderRadius: 8,
            overflow: 'hidden',
        },
        row: {
            flexDirection: 'row',
            borderBottomWidth: 1,
            borderColor: colorScheme === 'dark' ? '#4a4a4a' : '#dddddd',
        },
        headerRow: {
            backgroundColor: colorScheme === 'dark' ? '#3a3f4b' : '#e0e0e0',
        },
        bestValueRow: {
            backgroundColor: colorScheme === 'dark' ? '#2c4a2c' : '#d0f0d0',
        },
        headerCell: {
            padding: 12,
            fontWeight: 'bold',
            color: colorScheme === 'dark' ? '#FFD700' : '#333333',
            textAlign: 'center',
        },
        cell: {
            padding: 12,
            textAlign: 'center',
            color: colorScheme === 'dark' ? '#e0e0e0' : '#333333',
        },
        loading: {
            padding: 20,
            textAlign: 'center',
            color: colorScheme === 'dark' ? '#FFD700' : '#333333',
        },
        footer: {
            marginTop: 16,
            padding: 16,
            backgroundColor: colorScheme === 'dark' ? '#3a3f4b' : '#e0e0e0',
            borderRadius: 8,
        },
        footerText: {
            color: colorScheme === 'dark' ? '#e0e0e0' : '#333333',
            fontSize: 14,
        }
    });

    if (loading) {
        return (
            <View style={styles.container}>
                <Text style={styles.loading}>Loading beer data...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={beers}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderBeerRow}
                ListHeaderComponent={ListHeader}
                ListFooterComponent={ListFooter}
                showsVerticalScrollIndicator={true}
                contentContainerStyle={{ paddingBottom: 20 }}
            />
        </View>
    );
}