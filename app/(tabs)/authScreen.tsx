import React, { useState, useEffect } from 'react';
import {
    View,
    TextInput,
    Button,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    RefreshControl
} from 'react-native';
import { supabase, signUp, signIn, getCurrentUser, signOut } from '../../utils/supabase';

type UserRole = 'admin' | 'moderator' | 'user';
type BeerStatus = 'pending' | 'approved' | 'rejected';
type BarStatus = 'pending' | 'approved' | 'rejected';

interface User {
    id: string;
    email: string;
    role: UserRole;
}

interface PendingBeer {
    id: string;
    name: string;
    type: string;
    abv: number;
    price: number;
    size_oz: number;
    status: BeerStatus;
    submitted_by: string;
    submitted_at: string;
    bar_name?: string;
}

interface PendingBar {
    id: string;
    name: string;
    street_address: string;
    city: string;
    status: BarStatus;
    submitted_by: string;
    submitted_at: string;
}

export default function AccountScreen() {
    // Auth state
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Admin state
    const [pendingBeers, setPendingBeers] = useState<PendingBeer[]>([]);
    const [pendingBars, setPendingBars] = useState<PendingBar[]>([]);
    const [activeTab, setActiveTab] = useState<'beers' | 'bars'>('beers');
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        checkUser();
    }, []);

    useEffect(() => {
        if (user && (user.role === 'admin' || user.role === 'moderator')) {
            loadPendingItems();
        }
    }, [user]);

    async function checkUser() {
        try {
            const currentUser = await getCurrentUser();
            if (currentUser) {
                // Get user role from your users table
                const { data: profile, error } = await supabase
                    .from('users')
                    .select('role, username')
                    .eq('auth_user_id', currentUser.id)
                    .single();

                setUser({
                    id: currentUser.id,
                    email: currentUser.email || '',
                    role: profile?.role || 'user'
                });
            }
        } catch (error) {
            console.error('Error checking user:', error);
        } finally {
            setIsLoading(false);
        }
    }

    async function loadPendingItems() {
        try {
            // Load pending beers - simplified query without joins
            const { data: beers, error: beersError } = await supabase
                .from('beers')
                .select('*')
                .eq('status', 'pending')
                .order('submitted_at', { ascending: false });

            if (beersError) throw beersError;

            // Load pending bars - simplified query without joins
            const { data: bars, error: barsError } = await supabase
                .from('bars')
                .select('*')
                .eq('status', 'pending')
                .order('submitted_at', { ascending: false });

            if (barsError) throw barsError;

            // Get bar names for beers that have bar_id
            const beersWithBarNames = await Promise.all(
                (beers || []).map(async (beer) => {
                    if (beer.bar_id) {
                        const { data: bar } = await supabase
                            .from('bars')
                            .select('name')
                            .eq('id', beer.bar_id)
                            .single();
                        return { ...beer, bar_name: bar?.name };
                    }
                    return beer;
                })
            );

            setPendingBeers(beersWithBarNames);
            setPendingBars(bars || []);
        } catch (error) {
            console.error('Error loading pending items:', error);
            Alert.alert('Error', 'Failed to load pending items');
        }
    }

    async function handleSignUp() {
        try {
            const result = await signUp(email, password);
            setMessage('Check your email for confirmation!');
        } catch (error: any) {
            setMessage(error.message);
        }
    }

    async function handleSignIn() {
        try {
            await signIn(email, password);
            setMessage('Logged in successfully!');
            checkUser();
        } catch (error: any) {
            setMessage(error.message);
        }
    }

    async function handleSignOut() {
        try {
            await signOut();
            setUser(null);
            setMessage('Signed out successfully');
        } catch (error: any) {
            setMessage(error.message);
        }
    }

    async function approveBeer(beerId: string) {
        try {
            const { error } = await supabase
                .from('beers')
                .update({
                    status: 'approved',
                    pending_review: false
                })
                .eq('id', beerId);

            if (error) throw error;

            Alert.alert('Success', 'Beer approved!');
            loadPendingItems();
        } catch (error: any) {
            Alert.alert('Error', error.message);
        }
    }

    async function rejectBeer(beerId: string) {
        try {
            const { error } = await supabase
                .from('beers')
                .update({
                    status: 'rejected',
                    pending_review: false,
                    rejection_reason: 'Rejected by moderator'
                })
                .eq('id', beerId);

            if (error) throw error;

            Alert.alert('Success', 'Beer rejected');
            loadPendingItems();
        } catch (error: any) {
            Alert.alert('Error', error.message);
        }
    }

    async function approveBar(barId: string) {
        try {
            const { error } = await supabase
                .from('bars')
                .update({
                    status: 'approved',
                    pending_review: false
                })
                .eq('id', barId);

            if (error) throw error;

            Alert.alert('Success', 'Bar approved!');
            loadPendingItems();
        } catch (error: any) {
            Alert.alert('Error', error.message);
        }
    }

    async function rejectBar(barId: string) {
        try {
            const { error } = await supabase
                .from('bars')
                .update({
                    status: 'rejected',
                    pending_review: false,
                    rejection_reason: 'Rejected by moderator'
                })
                .eq('id', barId);

            if (error) throw error;

            Alert.alert('Success', 'Bar rejected');
            loadPendingItems();
        } catch (error: any) {
            Alert.alert('Error', error.message);
        }
    }

    const onRefresh = async () => {
        setRefreshing(true);
        await loadPendingItems();
        setRefreshing(false);
    };

    if (isLoading) {
        return (
            <View style={styles.container}>
                <Text style={styles.loadingText}>Loading...</Text>
            </View>
        );
    }

    // If user is not logged in, show auth form
    if (!user) {
        return (
            <View style={styles.container}>
                <Text style={styles.title}>Account</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />
                <TextInput
                    style={styles.input}
                    placeholder="Password"
                    value={password}
                    secureTextEntry
                    onChangeText={setPassword}
                />
                <View style={styles.buttonContainer}>
                    <Button title="Sign Up" onPress={handleSignUp} />
                    <Button title="Sign In" onPress={handleSignIn} />
                </View>
                {message && <Text style={styles.message}>{message}</Text>}
            </View>
        );
    }

    // User is logged in
    return (
        <ScrollView
            style={styles.container}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
        >
            {/* User Profile Section */}
            <View style={styles.profileSection}>
                <Text style={styles.title}>Account</Text>
                <Text style={styles.userInfo}>Email: {user.email}</Text>
                <Text style={styles.userInfo}>Role: {user.role}</Text>
                <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
                    <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
            </View>

            {/* Admin/Moderator Section */}
            {(user.role === 'admin' || user.role === 'moderator') && (
                <View style={styles.adminSection}>
                    <Text style={styles.adminTitle}>Review Pending Submissions</Text>

                    {/* Tab Selector */}
                    <View style={styles.tabContainer}>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'beers' && styles.activeTab]}
                            onPress={() => setActiveTab('beers')}
                        >
                            <Text style={[styles.tabText, activeTab === 'beers' && styles.activeTabText]}>
                                Beers ({pendingBeers.length})
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'bars' && styles.activeTab]}
                            onPress={() => setActiveTab('bars')}
                        >
                            <Text style={[styles.tabText, activeTab === 'bars' && styles.activeTabText]}>
                                Bars ({pendingBars.length})
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Pending Beers */}
                    {activeTab === 'beers' && (
                        <View>
                            {pendingBeers.length === 0 ? (
                                <Text style={styles.emptyText}>No pending beers to review</Text>
                            ) : (
                                pendingBeers.map((beer) => (
                                    <View key={beer.id} style={styles.pendingItem}>
                                        <Text style={styles.itemName}>{beer.name}</Text>
                                        <Text style={styles.itemDetails}>
                                            {beer.type} • {beer.abv}% ABV • ${beer.price} • {beer.size_oz}oz
                                        </Text>
                                        {beer.bar_name && (
                                            <Text style={styles.itemDetails}>Bar: {beer.bar_name}</Text>
                                        )}
                                        <Text style={styles.submittedBy}>
                                            Submitted: {new Date(beer.submitted_at).toLocaleDateString()}
                                        </Text>
                                        <View style={styles.actionButtons}>
                                            <TouchableOpacity
                                                style={styles.approveButton}
                                                onPress={() => approveBeer(beer.id)}
                                            >
                                                <Text style={styles.buttonText}>Approve</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.rejectButton}
                                                onPress={() => rejectBeer(beer.id)}
                                            >
                                                <Text style={styles.buttonText}>Reject</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))
                            )}
                        </View>
                    )}

                    {/* Pending Bars */}
                    {activeTab === 'bars' && (
                        <View>
                            {pendingBars.length === 0 ? (
                                <Text style={styles.emptyText}>No pending bars to review</Text>
                            ) : (
                                pendingBars.map((bar) => (
                                    <View key={bar.id} style={styles.pendingItem}>
                                        <Text style={styles.itemName}>{bar.name}</Text>
                                        <Text style={styles.itemDetails}>
                                            {bar.street_address}, {bar.city}
                                        </Text>
                                        <Text style={styles.submittedBy}>
                                            Submitted: {new Date(bar.submitted_at).toLocaleDateString()}
                                        </Text>
                                        <View style={styles.actionButtons}>
                                            <TouchableOpacity
                                                style={styles.approveButton}
                                                onPress={() => approveBar(bar.id)}
                                            >
                                                <Text style={styles.buttonText}>Approve</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.rejectButton}
                                                onPress={() => rejectBar(bar.id)}
                                            >
                                                <Text style={styles.buttonText}>Reject</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))
                            )}
                        </View>
                    )}
                </View>
            )}

            {message ? <Text style={styles.message}>{message}</Text> : null}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: '#f4f4f5',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
        color: '#333',
    },
    loadingText: {
        fontSize: 18,
        textAlign: 'center',
        marginTop: 50,
        color: '#666',
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
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 20,
    },
    profileSection: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 20,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    userInfo: {
        fontSize: 16,
        marginBottom: 8,
        color: '#333',
    },
    signOutButton: {
        backgroundColor: '#ef4444',
        padding: 12,
        borderRadius: 8,
        marginTop: 16,
        alignItems: 'center',
    },
    signOutText: {
        color: '#fff',
        fontWeight: '600',
    },
    adminSection: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    adminTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 16,
        color: '#333',
    },
    tabContainer: {
        flexDirection: 'row',
        marginBottom: 20,
        backgroundColor: '#f0f0f0',
        borderRadius: 8,
        padding: 4,
    },
    tab: {
        flex: 1,
        padding: 12,
        alignItems: 'center',
        borderRadius: 6,
    },
    activeTab: {
        backgroundColor: '#2563eb',
    },
    tabText: {
        fontSize: 16,
        color: '#666',
    },
    activeTabText: {
        color: '#fff',
        fontWeight: '600',
    },
    emptyText: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        fontStyle: 'italic',
        marginTop: 20,
    },
    pendingItem: {
        backgroundColor: '#f9f9f9',
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        borderLeft: 4,
        borderLeftColor: '#fbbf24',
    },
    itemName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 4,
    },
    itemDetails: {
        fontSize: 14,
        color: '#666',
        marginBottom: 2,
    },
    submittedBy: {
        fontSize: 12,
        color: '#888',
        marginBottom: 12,
    },
    actionButtons: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    approveButton: {
        backgroundColor: '#10b981',
        padding: 10,
        borderRadius: 6,
        flex: 0.4,
        alignItems: 'center',
    },
    rejectButton: {
        backgroundColor: '#ef4444',
        padding: 10,
        borderRadius: 6,
        flex: 0.4,
        alignItems: 'center',
    },
    buttonText: {
        color: '#fff',
        fontWeight: '600',
    },
    message: {
        marginTop: 16,
        padding: 12,
        backgroundColor: '#e0e7ff',
        borderRadius: 8,
        textAlign: 'center',
        color: '#1e40af',
    },
});