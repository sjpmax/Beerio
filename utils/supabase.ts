import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Not needed for React Native
  },
});

// User Sign-Up
export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

// User Sign-In
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Get Current Logged-in User
export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

// User Sign-Out
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Fetch beer types
export async function fetchBeerTypes() {
  const { data, error } = await supabase.from('beer_types').select('type');
  if (error) throw error;
  return data;
}

// Fetch bars
export async function fetchBars() {
  const { data, error } = await supabase.from('bars').select();
  if (error) throw error;
  return data;
}

// Types for beer search
interface BeerSuggestion {
  id: string;
  name: string;
  abv: string;
  type: string;
  brewery?: string;
  source: 'beerdb' | 'local';
  // New fields for existing beer info
  availableAt?: string;
  currentPrice?: number;
  currentSize?: number;
}

// Search beers using Open Food Facts API (much more current than beer.db!)
export async function searchBeersFromAPI(query: string): Promise<BeerSuggestion[]> {
  try {
    // Try Open Food Facts - it has current beer data
    const response = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&categories=beers&fields=product_name,alcohol_by_volume_value,brands`
    );
    
    if (response.ok) {
      const data = await response.json();
      const products = data.products || [];
      
      return products
        .filter((product: any) => 
          product.product_name && 
          product.alcohol_by_volume_value
        )
        .slice(0, 4)
        .map((product: any, index: number) => ({
          id: `openfood-${index}`,
          name: product.product_name,
          abv: product.alcohol_by_volume_value?.toString() || '0',
          type: 'Beer', // Open Food Facts doesn't have detailed beer types
          brewery: product.brands || 'Unknown Brewery',
          source: 'beerdb' as const // Keep as 'beerdb' for UI consistency
        }));
    }
    
    throw new Error('Open Food Facts API failed');
  } catch (error) {
    console.error('Open Food Facts error:', error);
    // Fallback to curated popular beers with current data
    return getModernPopularBeers(query);
  }
}

// Updated popular beers with more current/accurate data
function getModernPopularBeers(query: string): BeerSuggestion[] {
  const popularBeers = [
    // Light Lagers
    { name: 'Bud Light', abv: '4.2', type: 'Light Lager', brewery: 'Anheuser-Busch' },
    { name: 'Miller Lite', abv: '4.2', type: 'Light Lager', brewery: 'Molson Coors' },
    { name: 'Coors Light', abv: '4.2', type: 'Light Lager', brewery: 'Molson Coors' },
    
    // Regular Lagers
    { name: 'Budweiser', abv: '5.0', type: 'Lager', brewery: 'Anheuser-Busch' },
    { name: 'Corona Extra', abv: '4.6', type: 'Lager', brewery: 'Grupo Modelo' },
    { name: 'Heineken', abv: '5.0', type: 'Lager', brewery: 'Heineken' },
    { name: 'Stella Artois', abv: '5.2', type: 'Lager', brewery: 'AB InBev' },
    
    // IPAs (very popular now!)
    { name: 'Dogfish Head 60 Minute IPA', abv: '6.0', type: 'IPA', brewery: 'Dogfish Head' },
    { name: 'Stone IPA', abv: '6.9', type: 'IPA', brewery: 'Stone Brewing' },
    { name: 'Lagunitas IPA', abv: '6.2', type: 'IPA', brewery: 'Lagunitas' },
    { name: 'Founders All Day IPA', abv: '4.7', type: 'Session IPA', brewery: 'Founders' },
    
    // Craft Standards
    { name: 'Blue Moon Belgian White', abv: '5.4', type: 'Wheat Beer', brewery: 'Molson Coors' },
    { name: 'Sam Adams Boston Lager', abv: '4.9', type: 'Lager', brewery: 'Boston Beer Co' },
    { name: 'Guinness Draught', abv: '4.2', type: 'Stout', brewery: 'Diageo' },
    { name: 'Yuengling Traditional Lager', abv: '4.5', type: 'Lager', brewery: 'Yuengling' },
    
    // Trending Styles
    { name: 'White Claw Hard Seltzer', abv: '5.0', type: 'Seltzer', brewery: 'White Claw' },
    { name: 'Modelo Especial', abv: '4.4', type: 'Lager', brewery: 'Grupo Modelo' },
    { name: 'Michelob Ultra', abv: '4.2', type: 'Light Lager', brewery: 'Anheuser-Busch' },
  ];

  const queryLower = query.toLowerCase();
  return popularBeers
    .filter(beer => 
      beer.name.toLowerCase().includes(queryLower) ||
      beer.type.toLowerCase().includes(queryLower) ||
      beer.brewery.toLowerCase().includes(queryLower)
    )
    .slice(0, 4)
    .map((beer, index) => ({
      id: `popular-${index}`,
      name: beer.name,
      abv: beer.abv,
      type: beer.type,
      brewery: beer.brewery,
      source: 'beerdb' as const
    }));
}

// Search local database for custom beers
export async function searchLocalBeers(query: string): Promise<BeerSuggestion[]> {
  try {
    const { data, error } = await supabase
      .from('beers')
      .select('id, name, abv, type')
      .ilike('name', `%${query}%`)
      .limit(3);

    if (error) throw error;

    return data.map(beer => ({
      id: beer.id.toString(),
      name: beer.name,
      abv: beer.abv?.toString() || '0',
      type: beer.type || 'Unknown',
      source: 'local' as const
    }));
  } catch (error) {
    console.error('Local search error:', error);
    return [];
  }
}


export async function searchAllBeers (query: string): Promise<BeerSuggestion[]> {
  if (query.length < 2) return [];

  try {
    const { data, error } = await supabase
      .from('beers')
      .select(`
        id, name, abv, type, size_oz, price,
        breweries(name),
        bars(name)
      `)
      .eq('pending_review', false)
      .is('rejection_reason', null)
      .ilike('name', `%${query}%`) // Just search beer names
      .limit(8);

    if (error) throw error;

    return data.map(beer => ({
      id: beer.id.toString(),
      name: beer.name,
      abv: beer.abv?.toString() || '0',
      type: beer.type || 'Unknown',
      brewery: beer.breweries?.name || 'Unknown Brewery',
      source: 'local' as const,
      availableAt: beer.bars?.name || 'Unknown Bar',
      currentPrice: beer.price,
      currentSize: beer.size_oz
    }));
  } catch (error) {
    console.error('Beer search error:', error);
    return [];
  }
}

// Create brewery with moderation
export async function createBreweryWithModeration(breweryName: string) {
  try {
    const { data, error } = await supabase
      .from('breweries')
      .insert([{ 
        name: breweryName,
        pending_review: true, // Requires review
        added_by_user_id: null // You can add user ID here if you have auth
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating brewery:', error);
    throw error;
  }
}

// Add beer with moderation
export async function addBeerWithModeration(beerData: {
  name: string;
  type: string;
  brewery_id?: number;
  abv: number;
  price: number;
  size_oz: number;
  bar_id: number;
  source?: string;
  external_id?: string;
}) {
  try {
    const { data, error } = await supabase.from('beers').insert([{
      ...beerData,
      pending_review: true, // Requires review
      user_id: null // Add user ID if you have auth
    }]).select();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error adding beer:', error);
    throw error;
  }
}

// Get pending items for moderation (admin only)
export async function getPendingItems() {
  try {
    const [breweries, beers, bars] = await Promise.all([
      supabase.from('pending_breweries').select('*'),
      supabase.from('pending_beers').select('*'),
      supabase.from('pending_bars').select('*')
    ]);

    return {
      breweries: breweries.data || [],
      beers: beers.data || [],
      bars: bars.data || []
    };
  } catch (error) {
    console.error('Error fetching pending items:', error);
    throw error;
  }
}

// Approve content (admin only)
export async function approveContent(
  table: 'breweries' | 'beers' | 'bars',
  contentId: number,
  reviewerId: string
) {
  try {
    const { error } = await supabase.rpc('approve_content', {
      table_name: table,
      content_id: contentId,
      reviewer_id: reviewerId
    });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error approving content:', error);
    throw error;
  }
}

// Reject content (admin only)
export async function rejectContent(
  table: 'breweries' | 'beers' | 'bars',
  contentId: number,
  reviewerId: string,
  reason: string
) {
  try {
    const { error } = await supabase.rpc('reject_content', {
      table_name: table,
      content_id: contentId,
      reviewer_id: reviewerId,
      reason: reason
    });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error rejecting content:', error);
    throw error;
  }
}

// Get moderation dashboard stats
export async function getModerationStats() {
  try {
    const { data, error } = await supabase
      .from('moderation_dashboard')
      .select('*');

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching moderation stats:', error);
    return [];
  }
}