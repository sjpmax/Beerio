﻿import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'

// Load environment variables
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

// Type definitions
export interface BeerSuggestion {
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

interface BeerDetails {
    name: string;
    abv: string;
    type: string;
    brewery: string;
    confidence: 'high' | 'medium' | 'low';
    source: 'database' | 'api' | 'ai_inference' | 'web_search';
}

interface BraveSearchResult {
    title: string;
    url: string;
    description: string;
    snippet?: string;
}

interface BeerSearchData {
    size?: number;
    type?: string;
    brewery?: string;
    abv?: number;
    description?: string;
    confidence: 'high' | 'medium' | 'low';
}

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // Not needed for React Native
    },
});

// ========================================
// AUTHENTICATION FUNCTIONS
// ========================================

export async function signUp(email: string, password: string, username?: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;

    // If signup successful and user was created, create profile in users table
    if (data.user) {
        const { error: profileError } = await supabase.from('users').insert({
            auth_user_id: data.user.id,
            email: data.user.email,
            username: username || email.split('@')[0], // Use email prefix if no username provided
            role: 'user',
            reputation: 0
        });

        if (profileError) {
            console.error('Error creating user profile:', profileError);
            // Don't throw here - auth user was created successfully
        }
    }

    return data;
}

export async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

export async function getCurrentUser() {
    const { data } = await supabase.auth.getUser();
    return data.user;
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

// ========================================
// DATA FETCHING FUNCTIONS
// ========================================

export async function fetchBeerTypes() {
    const { data, error } = await supabase.from('beer_types').select('type');
    if (error) throw error;
    return data;
}

export async function fetchBars() {
    const { data, error } = await supabase.from('bars').select();
    if (error) throw error;
    return data;
}

export async function fetchStates() {
    const { data, error } = await supabase
        .from('states')
        .select('id, name, abbreviation')
        .order('name');
    if (error) throw error;
    return data;
}

// ========================================
// BEER SEARCH FUNCTIONS
// ========================================

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

export async function searchAllBeers(query: string): Promise<BeerSuggestion[]> {
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
            .ilike('name', `%${query}%`)
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

// Search beers using Open Food Facts API
export async function searchBeersFromAPI(query: string): Promise<BeerSuggestion[]> {
    try {
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
                    type: 'Beer',
                    brewery: product.brands || 'Unknown Brewery',
                    source: 'beerdb' as const
                }));
        }

        throw new Error('Open Food Facts API failed');
    } catch (error) {
        console.error('Open Food Facts error:', error);
        return getModernPopularBeers(query);
    }
}

// Beer type classification
function classifyBeerType(beerName: string): string {
    const name = beerName.toLowerCase();

    // Light beers
    if (name.includes('light') || name.includes('lite')) {
        return 'Light Lager';
    }

    // IPAs
    if (name.includes('ipa') || name.includes('india pale ale') ||
        name.includes('pale ale') && (name.includes('hop') || name.includes('bitter'))) {
        return 'IPA';
    }

    // Wheat beers
    if (name.includes('wheat') || name.includes('weizen') || name.includes('witbier') ||
        name.includes('white') || name.includes('belgian white')) {
        return 'Wheat Beer';
    }

    // Stouts and Porters
    if (name.includes('stout') || name.includes('porter') || name.includes('guinness')) {
        return 'Stout';
    }

    // Lagers
    if (name.includes('lager') || name.includes('pilsner') || name.includes('pils')) {
        return 'Lager';
    }

    // Ales
    if (name.includes('ale') && !name.includes('pale')) {
        return 'Ale';
    }

    // Seasonal/Specialty
    if (name.includes('pumpkin') || name.includes('oktoberfest') || name.includes('marzen')) {
        return 'Seasonal';
    }

    // Sours
    if (name.includes('sour') || name.includes('berliner') || name.includes('gose')) {
        return 'Sour';
    }

    // Hard Seltzers
    if (name.includes('seltzer') || name.includes('hard seltzer') || name.includes('white claw')) {
        return 'Seltzer';
    }

    return 'Beer';
}

// Enhanced search that combines local + API + classification
export async function searchBeersEnhanced(query: string): Promise<BeerSuggestion[]> {
    if (query.length < 2) return [];

    try {
        // 1. Search local database first (fastest)
        const localResults = await searchAllBeers(query);

        // 2. Search using existing API function
        const apiResults = await searchBeersFromAPI(query);

        // 3. Enhance API results with better type classification
        const enhancedApiResults = apiResults.map(beer => ({
            ...beer,
            type: classifyBeerType(beer.name)
        }));

        // 4. Combine and deduplicate
        const allResults = [...localResults, ...enhancedApiResults];
        const uniqueResults = allResults.filter((beer, index, self) =>
            index === self.findIndex(b => b.name.toLowerCase() === beer.name.toLowerCase())
        );

        return uniqueResults.slice(0, 8);

    } catch (error) {
        console.error('Enhanced search error:', error);
        return await searchBeersFromAPI(query);
    }
}

// Popular beers fallback
function getModernPopularBeers(query: string): BeerSuggestion[] {
    const popularBeers = [
        { name: 'Bud Light', abv: '4.2', type: 'Light Lager', brewery: 'Anheuser-Busch' },
        { name: 'Miller Lite', abv: '4.2', type: 'Light Lager', brewery: 'Molson Coors' },
        { name: 'Coors Light', abv: '4.2', type: 'Light Lager', brewery: 'Molson Coors' },
        { name: 'Budweiser', abv: '5.0', type: 'Lager', brewery: 'Anheuser-Busch' },
        { name: 'Corona Extra', abv: '4.6', type: 'Lager', brewery: 'Grupo Modelo' },
        { name: 'Heineken', abv: '5.0', type: 'Lager', brewery: 'Heineken' },
        { name: 'Stella Artois', abv: '5.2', type: 'Lager', brewery: 'AB InBev' },
        { name: 'Dogfish Head 60 Minute IPA', abv: '6.0', type: 'IPA', brewery: 'Dogfish Head' },
        { name: 'Stone IPA', abv: '6.9', type: 'IPA', brewery: 'Stone Brewing' },
        { name: 'Lagunitas IPA', abv: '6.2', type: 'IPA', brewery: 'Lagunitas' },
        { name: 'Blue Moon Belgian White', abv: '5.4', type: 'Wheat Beer', brewery: 'Molson Coors' },
        { name: 'Sam Adams Boston Lager', abv: '4.9', type: 'Lager', brewery: 'Boston Beer Co' },
        { name: 'Guinness Draught', abv: '4.2', type: 'Stout', brewery: 'Diageo' },
        { name: 'Yuengling Traditional Lager', abv: '4.5', type: 'Lager', brewery: 'Yuengling' },
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

// ========================================
// BRAVE SEARCH INTEGRATION
// ========================================

// Rate limiting + caching variables
let lastSearchTime = 0;
const SEARCH_DELAY = 2000;
const searchCache = new Map();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Brave Search API integration with rate limiting, caching, and CORS proxy
async function braveWebSearch(query: string): Promise<BraveSearchResult[]> {
    try {
        // Check cache first
        const cacheKey = query.toLowerCase();
        const cachedResult = searchCache.get(cacheKey);

        if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_DURATION) {
            console.log('📦 Using cached Brave search result');
            return cachedResult.data;
        }

        // Rate limiting - ensure we don't exceed API limits
        const now = Date.now();
        const timeSinceLastSearch = now - lastSearchTime;

        if (timeSinceLastSearch < SEARCH_DELAY) {
            const waitTime = SEARCH_DELAY - timeSinceLastSearch;
            console.log(`⏱️ Rate limiting: waiting ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        lastSearchTime = Date.now();

        // Build URL with CORS proxy for web platform
        let url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;

        // Add CORS proxy for web platform
        if (Platform?.OS === 'web') {
            url = `https://beerio-proxy-v2.vercel.app/api/brave-search?query=${encodeURIComponent(query)}`;
        }

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
                'X-Subscription-Token': process.env.EXPO_PUBLIC_BRAVE_SEARCH_API_KEY || ''
            }
        });

        if (!response.ok) {
            if (response.status === 429) {
                console.log('🦁 Rate limited by Brave API - falling back to AI inference');
                return []; // Will trigger fallback to AI inference
            }
            throw new Error(`Brave Search API error: ${response.status}`);
        }

        const data = await response.json();
        const results = data.web?.results || [];

        // Cache the results
        searchCache.set(cacheKey, {
            data: results,
            timestamp: Date.now()
        });

        return results;
    } catch (error) {
        console.error('Brave Search failed:', error);

        // On web platform, CORS issues are common - provide helpful message
        if (Platform?.OS === 'web') {
            console.log('💡 If you see CORS errors, try using the mobile app or set up your own proxy server');
        }

        return [];
    }
}

// Extract beer data from search results
function extractBeerDataFromResults(results: BraveSearchResult[]): BeerSearchData | null {
    const extracted: BeerSearchData = { confidence: 'low' };
    let foundData = false;

    for (const result of results) {
        const text = `${result.title} ${result.description} ${result.snippet || ''}`.toLowerCase();

        // Extract serving size
        const sizePatterns = [
            /(\d+)\s*oz\s*pour/i,
            /(\d+)\s*ounce/i,
            /(\d+)\s*oz\s*draft/i,
            /served\s*in\s*(\d+)\s*oz/i,
            /(\d+)\s*oz\s*glass/i
        ];

        for (const pattern of sizePatterns) {
            const match = text.match(pattern);
            if (match && !extracted.size) {
                const size = parseInt(match[1]);
                if (size >= 8 && size <= 32) {
                    extracted.size = size;
                    foundData = true;
                    break;
                }
            }
        }

        // Extract ABV
        const abvPatterns = [
            /(\d+\.?\d*)\s*%\s*abv/i,
            /(\d+\.?\d*)\s*%\s*alcohol/i,
            /abv:\s*(\d+\.?\d*)%/i
        ];

        for (const pattern of abvPatterns) {
            const match = text.match(pattern);
            if (match && !extracted.abv) {
                const abv = parseFloat(match[1]);
                if (abv >= 0.5 && abv <= 20) {
                    extracted.abv = abv;
                    foundData = true;
                    break;
                }
            }
        }

        // Extract beer type/style
        const typePatterns = [
            /\b(ipa|india pale ale)\b/i,
            /\b(pale ale)\b/i,
            /\b(lager)\b/i,
            /\b(pilsner)\b/i,
            /\b(stout)\b/i,
            /\b(porter)\b/i,
            /\b(wheat beer|hefeweizen|witbier)\b/i,
            /\b(sour beer|sour ale)\b/i,
            /\b(amber ale)\b/i,
            /\b(brown ale)\b/i,
            /\b(light beer|light lager)\b/i
        ];

        for (const pattern of typePatterns) {
            const match = text.match(pattern);
            if (match && !extracted.type) {
                extracted.type = capitalizeWords(match[1]);
                foundData = true;
                break;
            }
        }

        // Extract brewery info
        const breweryPatterns = [
            /brewed\s*by\s*([^.,]+)/i,
            /brewery:\s*([^.,]+)/i,
            /from\s*([^.,]+)\s*brewery/i
        ];

        for (const pattern of breweryPatterns) {
            const match = text.match(pattern);
            if (match && !extracted.brewery) {
                extracted.brewery = match[1].trim();
                foundData = true;
                break;
            }
        }
    }

    // Set confidence based on amount of data found
    if (foundData) {
        const dataPoints = [extracted.size, extracted.abv, extracted.type, extracted.brewery]
            .filter(Boolean).length;

        if (dataPoints >= 3) extracted.confidence = 'high';
        else if (dataPoints >= 2) extracted.confidence = 'medium';
        else extracted.confidence = 'low';

        return extracted;
    }

    return null;
}

// Helper function to capitalize words properly
function capitalizeWords(str: string): string {
    return str.replace(/\b\w+/g, word => {
        // Handle special cases for brewery names
        const lowerWord = word.toLowerCase();
        if (lowerWord === 'brewing') return 'Brewing';
        if (lowerWord === 'brewery') return 'Brewery';
        if (lowerWord === 'beer') return 'Beer';
        if (lowerWord === 'company') return 'Company';
        if (lowerWord === 'co') return 'Co';

        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
}

// Search for specific beer information using Brave
export async function searchBeerWithBrave(beerName: string, brewery?: string): Promise<BeerSearchData | null> {
    const searchQueries = [
        `"${beerName}" ${brewery || ''} beer serving size oz`,
        `"${beerName}" ${brewery || ''} beer specifications`,
        `"${beerName}" brewery alcohol content ABV`,
        `${beerName} beer style type`
    ];

    for (const query of searchQueries) {
        try {
            const results = await braveWebSearch(query.trim());
            const extractedData = extractBeerDataFromResults(results);

            if (extractedData && Object.keys(extractedData).length > 1) {
                return extractedData;
            }
        } catch (error) {
            console.error(`Search failed for query: ${query}`, error);
            continue;
        }
    }

    return null;
}

// Function specifically for finding serving sizes
export async function findBeerServingSize(beerName: string, brewery?: string): Promise<number | null> {
    const query = `"${beerName}" ${brewery || ''} serving size ounces draft beer`;

    try {
        const results = await braveWebSearch(query);

        for (const result of results) {
            const text = `${result.title} ${result.description}`.toLowerCase();

            const sizePatterns = [
                /(\d+)\s*oz\s*pour/,
                /(\d+)\s*ounce\s*glass/,
                /(\d+)\s*oz\s*draft/,
                /served\s*in\s*(\d+)\s*oz/,
                /(\d+)\s*oz\s*pint/
            ];

            for (const pattern of sizePatterns) {
                const match = text.match(pattern);
                if (match) {
                    const size = parseInt(match[1]);
                    if (size >= 8 && size <= 32) {
                        return size;
                    }
                }
            }
        }
    } catch (error) {
        console.error('Size search failed:', error);
    }

    return null;
}

// ========================================
// AI AUTOFILL FUNCTIONS
// ========================================

// Basic AI autofill (placeholder for the comprehensive database you had)
export async function getAIBeerAutofill(beerName: string): Promise<BeerDetails | null> {
    // This would include your comprehensive beer database logic
    // For now, returning null to trigger web search
    return null;
}

// Enhanced autofill that combines local + API + web search
export async function getEnhancedBeerAutofill(beerName: string): Promise<BeerDetails | null> {
    if (!beerName || beerName.length < 2) return null;

    try {
        // Step 1: Try existing methods first (fastest)
        const quickResult = await getAIBeerAutofill(beerName);
        if (quickResult && quickResult.confidence === 'high') {
            return quickResult;
        }

        // Step 2: Use Brave Search for missing data
        const webSearchResult = await searchBeerWithBrave(beerName, quickResult?.brewery);

        if (webSearchResult) {
            return {
                name: beerName,
                abv: webSearchResult.abv?.toString() || quickResult?.abv || '5.0',
                type: webSearchResult.type || quickResult?.type || 'Beer',
                brewery: webSearchResult.brewery || quickResult?.brewery || 'Unknown Brewery',
                confidence: webSearchResult.confidence,
                source: 'web_search'
            };
        }

        // Step 3: Fallback to existing AI inference
        return quickResult;

    } catch (error) {
        console.error('Enhanced autofill failed:', error);
        return await getAIBeerAutofill(beerName);
    }
}


export async function enhanceBeerWithWebData(beer: ClaudeBeer): Promise<MenuBeer> {
    try {
        // Search for beer details
        const webData = await searchBeerWithBrave(
            beer.name,
            beer.brewery
        );

        // Also try BeerAdvocate specific search
        const beerAdvocateData = await searchBeerAdvocate(beer.name, beer.brewery);

        return {
            ...beer,
            // Prefer web data over estimates
            abv: webData?.abv || beerAdvocateData?.abv || beer.abv,
            size: webData?.size || beerAdvocateData?.size || beer.size || 16,
            brewery: webData?.brewery || beer.brewery,
            description: beerAdvocateData?.description,
            rating: beerAdvocateData?.rating,
            confidence: webData ? 'high' : beer.confidence,
            sources: ['vision', webData ? 'brave_search' : null, beerAdvocateData ? 'beeradvocate' : null].filter(Boolean)
        };
    } catch (error) {
        console.error('Enhancement failed for:', beer.name);
        return beer; // Return original if enhancement fails
    }
}

async function searchBeerAdvocate(beerName: string, brewery?: string): Promise<any> {
    const queries = [
        `site:beeradvocate.com "${beerName}" ${brewery || ''} ABV`,
        `site:beeradvocate.com "${beerName}" review rating`,
        `beeradvocate "${beerName}" ${brewery || ''} alcohol content`
    ];

    for (const query of queries) {
        try {
            const results = await braveWebSearch(query);
            const beerAdvocateData = extractBeerAdvocateData(results);
            if (beerAdvocateData) return beerAdvocateData;
        } catch (error) {
            continue;
        }
    }

    return null;
}
function extractBeerAdvocateData(results: BraveSearchResult[]): any {
    for (const result of results) {
        if (!result.url.includes('beeradvocate.com')) continue;

        const text = `${result.title} ${result.description}`.toLowerCase();

        // Extract ABV from BeerAdvocate format
        const abvMatch = text.match(/(\d+\.?\d*)\s*%\s*abv/i);

        // Extract rating
        const ratingMatch = text.match(/(\d+\.?\d*)\s*\/\s*5|score:\s*(\d+)/i);

        return {
            abv: abvMatch ? parseFloat(abvMatch[1]) : null,
            rating: ratingMatch ? parseFloat(ratingMatch[1] || ratingMatch[2]) : null,
            description: result.description,
            source: 'beeradvocate'
        };
    }

    return null;
}

// Enhanced beer validation with 4-step process
// Add this to your utils/supabase.ts file

async function enhanceBeerWithValidation(beer: ClaudeBeer, barId: string): Promise<MenuBeer> {
    try {
        console.log(`🔍 Validating beer: ${beer.name} at bar ${barId}`);

        // Step 1: Check if beer exists in your local database
        const existingBeer = await searchLocalBeersWithContext(beer.name, barId,
            beer.brewery);
        if (existingBeer.length > 0) {
            console.log(`✅ Found ${beer.name} in local database`);
            return mergeWithLocalData(beer, existingBeer[0]);
        }

        // Step 2: Get bar details and check if it's a brewery
        const bar = await getBarDetails(barId);
        if (!bar) {
            console.log(`❌ Bar ${barId} not found`);
            return fallbackBeerData(beer);
        }

        const isBrewery = checkIfBrewery(bar);
        console.log(`🏭 Is ${bar.name} a brewery? ${isBrewery}`);

        if (isBrewery) {
            // Step 3: Scrape brewery website for beer details
            const websiteData = await scrapeBreweryWebsite(bar, beer.name);
            if (websiteData) {
                console.log(`🌐 Found ${beer.name} on ${bar.name} website`);
                return mergeWithWebsiteData(beer, websiteData, bar);
            }
        }

        // Step 4: Use Brave search with context
        const searchData = await searchBeerWithContext(beer.name, bar);
        if (searchData) {
            console.log(`🦁 Found ${beer.name} via Brave search`);
            return mergeWithSearchData(beer, searchData);
        }

        // Fallback to original data with low confidence
        console.log(`⚠️ No additional data found for ${beer.name}`);
        return fallbackBeerData(beer);

    } catch (error) {
        console.error(`❌ Validation failed for ${beer.name}:`, error);
        return fallbackBeerData(beer);
    }
}

// Helper function: Search local database with context
// Helper function: Search local database with context
async function searchLocalBeersWithContext(beerName: string, barId: string, breweryName?: string): Promise<any[]> {
    try {
        let query = supabase
            .from('beers')
            .select(`
                id, name, abv, type, size_oz, price,
                breweries(name),
                bars(name)
            `)
            .ilike('name', `%${beerName}%`)
            .eq('pending_review', false)
            .is('rejection_reason', null);

        // If we know the brewery, search by brewery first (most specific)
        if (breweryName && breweryName !== 'Unknown') {
            const breweryQuery = await supabase
                .from('beers')
                .select(`
                    id, name, abv, type, size_oz, price,
                    breweries!inner(name),
                    bars(name)
                `)
                .ilike('name', `%${beerName}%`)
                .ilike('breweries.name', `%${breweryName}%`)
                .eq('pending_review', false)
                .limit(3);

            if (breweryQuery.data && breweryQuery.data.length > 0) {
                return breweryQuery.data;
            }
        }

        // Fallback: search by bar (less specific but still useful)
        const barQuery = await query
            .eq('bar_id', barId)
            .limit(3);

        if (barQuery.error) throw barQuery.error;
        return barQuery.data || [];

    } catch (error) {
        console.error('Local search error:', error);
        return [];
    }
}

// Helper function: Get bar details
async function getBarDetails(barId: string): Promise<any> {
    try {
        const { data, error } = await supabase
            .from('bars')
            .select('id, name, street_address, city, website, is_brewery')
            .eq('id', barId)
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching bar details:', error);
        return null;
    }
}

// Helper function: Check if bar is a brewery
function checkIfBrewery(bar: any): boolean {
    if (bar.is_brewery === true) return true;

    const name = bar.name.toLowerCase();
    const breweryKeywords = [
        'brewery', 'brewing', 'brewhouse', 'brewpub',
        'brew works', 'beer company', 'beer co'
    ];

    return breweryKeywords.some(keyword => name.includes(keyword));
}

// Helper function: Scrape brewery website
async function scrapeBreweryWebsite(bar: any, beerName: string): Promise<any> {
    if (!bar.website) {
        console.log(`🌐 No website for ${bar.name}`);
        return null;
    }

    try {
        console.log(`🌐 Checking ${bar.website} for ${beerName}`);

        // Use web_fetch to get the brewery website
        const websiteContent = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(bar.website)}`);

        if (!websiteContent.ok) {
            console.log(`❌ Failed to fetch ${bar.website}`);
            return null;
        }

        const data = await websiteContent.json();
        const htmlContent = data.contents;

        // Simple text search for beer name and common data patterns
        const lowerContent = htmlContent.toLowerCase();
        const lowerBeerName = beerName.toLowerCase();

        if (!lowerContent.includes(lowerBeerName)) {
            console.log(`❌ ${beerName} not found on website`);
            return null;
        }

        // Extract ABV if present
        const abvMatch = htmlContent.match(new RegExp(`${beerName}.*?(\\d+\\.?\\d*)\\s*%\\s*abv`, 'i'));
        const abv = abvMatch ? parseFloat(abvMatch[1]) : null;

        // Extract description
        const descMatch = htmlContent.match(new RegExp(`${beerName}.*?<p[^>]*>([^<]+)`, 'i'));
        const description = descMatch ? descMatch[1].trim() : null;

        console.log(`✅ Website data for ${beerName}: ABV=${abv}, desc=${description?.substring(0, 50)}...`);

        return {
            abv,
            description,
            brewery: bar.name,
            source: 'brewery_website',
            confidence: 'high'
        };

    } catch (error) {
        console.error(`❌ Website scraping failed for ${bar.name}:`, error);
        return null;
    }
}

// Helper function: Search with context using Brave
async function searchBeerWithContext(beerName: string, bar: any): Promise<any> {
    const searchQueries = [
        `"${beerName}" "${bar.name}" brewery ABV`,
        `"${beerName}" beer "${bar.city}" ABV alcohol`,
        `"${beerName}" brewery beer ABV percentage`
    ];

    for (const query of searchQueries) {
        try {
            console.log(`🔍 Searching: ${query}`);
            const searchData = await searchBeerWithBrave(beerName, bar.name);

            if (searchData && searchData.confidence === 'high') {
                return searchData;
            }
        } catch (error) {
            console.error(`Search failed for query: ${query}`, error);
            continue;
        }
    }

    return null;
}

// Helper function: Merge with local database data
function mergeWithLocalData(beer: ClaudeBeer, localBeer: any): MenuBeer {
    return {
        name: beer.name,
        brewery: localBeer.breweries?.name || beer.brewery,
        abv: localBeer.abv || beer.abv,
        price: beer.price,
        size: localBeer.size_oz || beer.size || 16,
        type: localBeer.type || beer.type,
        description: `Available at ${localBeer.bars?.name}`,
        confidence: 'high',
        rawText: `${beer.name} - Found in database`,
        source: 'local_database'
    };
}

// Helper function: Merge with website data
function mergeWithWebsiteData(beer: ClaudeBeer, websiteData: any, bar: any): MenuBeer {
    return {
        name: beer.name,
        brewery: bar.name,
        abv: websiteData.abv || beer.abv,
        price: beer.price,
        size: beer.size || 16,
        type: beer.type,
        description: websiteData.description || `House beer at ${bar.name}`,
        confidence: 'high',
        rawText: `${beer.name} - From ${bar.name} website`,
        source: 'brewery_website'
    };
}

// Helper function: Merge with search data
function mergeWithSearchData(beer: ClaudeBeer, searchData: any): MenuBeer {
    return {
        name: beer.name,
        brewery: searchData.brewery || beer.brewery || 'Unknown',
        abv: searchData.abv || beer.abv,
        price: beer.price,
        size: searchData.size || beer.size || 16,
        type: searchData.type || beer.type,
        description: searchData.description || `Beer information from web search`,
        confidence: searchData.confidence || 'medium',
        rawText: `${beer.name} - From web search`,
        source: 'web_search'
    };
}

// Helper function: Fallback when no data found
function fallbackBeerData(beer: ClaudeBeer): MenuBeer {
    return {
        name: beer.name,
        brewery: beer.brewery || 'Unknown',
        abv: beer.abv,
        price: beer.price,
        size: beer.size || 16,
        type: beer.type,
        description: `Beer extracted from menu`,
        confidence: 'low',
        rawText: `${beer.name} - Vision extraction only`,
        source: 'vision_only'
    };
}

// Export the main function
export { enhanceBeerWithValidation };