import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Button, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../utils/supabase';

export default function BeerValueTable() {
    const [beers, setBeers] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: 'valueScore', direction: 'desc' });
    const [loading, setLoading] = useState(true);
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

 const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#1e3a8a',
        alignItems: 'center', // Center the content
    },
    title: {
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 16,
        textAlign: 'center',
        color: '#FFD700',
    },
    table: {
        borderWidth: 1,
        borderColor: '#3b82f6',
        borderRadius: 8,
        overflow: 'hidden',
        maxWidth: 1200, // Constrain max width
        width: '100%', // But still responsive
        alignSelf: 'center', // Center the table
    },
    row: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderColor: '#3b82f6',
        minHeight: 44, // Consistent row height
    },
    headerRow: {
        backgroundColor: '#1e40af',
    },
    bestValueRow: {
        backgroundColor: '#166534',
    },
    headerCell: {
        padding: 8, // Reduced padding
        fontWeight: 'bold',
        color: '#FFD700',
        textAlign: 'center',
        fontSize: 14, // Smaller font
    },
    cell: {
        padding: 8, // Reduced padding
        textAlign: 'center',
        color: '#f1f5f9',
        fontSize: 13, // Smaller font for data
    },
    loading: {
        padding: 20,
        textAlign: 'center',
        color: '#FFD700',
    },
    footer: {
        marginTop: 16,
        padding: 16,
        backgroundColor: '#1e40af',
        borderRadius: 8,
        maxWidth: 1200, // Match table width
        width: '100%',
        alignSelf: 'center',
    },
    footerText: {
        color: '#f1f5f9',
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