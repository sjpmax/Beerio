// utils/claudeMenuReader.ts - ANTI-HALLUCINATION VERSION

import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

import { supabase } from './supabase';
export interface ClaudeBeer {
    name: string;
    brewery?: string | null;
    abv: number | null;
    price: number | null;
    size?: number | null;
    type: string;
    confidence: 'high' | 'medium' | 'low';
}

export async function extractBeersWithClaude(imageUri: string): Promise<ClaudeBeer[]> {
    try {
        console.log('🚨 CLAUDE EXTRACTION STARTING - ANTI-HALLUCINATION MODE 🚨');

        // Convert image to base64
        let base64Image: string;

        if (Platform.OS === 'web') {
            const response = await fetch(imageUri);
            const blob = await response.blob();
            base64Image = await blobToBase64(blob);
        } else {
            base64Image = await FileSystem.readAsStringAsync(imageUri, {
                encoding: FileSystem.EncodingType.Base64,
            });
        }

        console.log('📊 Base64 conversion successful, size:', base64Image.length);

        // Detect media type
        let mediaType: string;
        if (base64Image.startsWith('/9j/')) {
            mediaType = 'image/jpeg';
        } else if (base64Image.startsWith('iVBORw0KGgo')) {
            mediaType = 'image/png';
        } else {
            mediaType = 'image/jpeg';
        }

        const requestBody = {
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1500,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: mediaType,
                            data: base64Image
                        }
                    },
                    {
                        type: 'text',
                        text: `Extract beer information from this tap list image.

RULES:
1. Extract beer names, brewery names, ABV percentages, and prices you can clearly see
2. If brewery name is clearly visible before the beer name, include it  
3. Look for prices - they're often numbers like "7.5", "8", "6.50" after the beer name
4. Sizes like "16oz" should be extracted if clearly visible
5. ABV percentages are usually shown as "4.2%", "5.9%", etc.
6. Beer type can be inferred from visible style names (IPA, Lager, Stout, etc.)

IMPORTANT: Extract what you can actually see, don't make up data.

Examples from typical menus:
- "Bell's Two Hearted 7.5" → name: "Two Hearted", brewery: "Bell's", price: 7.50
- "Guinness 7.5" → name: "Guinness", brewery: null, price: 7.50  
- "Golden Road Mango Cart" → name: "Mango Cart", brewery: "Golden Road", price: null
- "American IPA, MI, 16oz 7%" → type: "American IPA", size: 16, abv: 7.0

Return JSON array:
[
  {
    "name": "Two Hearted", 
    "brewery": "Bell's",
    "type": "American IPA",
    "abv": 7.0,
    "price": 7.50,
    "size": 16,
    "confidence": "high"
  }
]

Return ONLY the JSON array, no other text.`
                    }
                ]
            }]
        };

        console.log('📤 Sending anti-hallucination request to Claude...');

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Claude API Error:', errorText);
            throw new Error(`Claude API error: ${response.status}`);
        }

        const result = await response.json();
        const claudeResponse = result.content[0]?.text || '';

        console.log('📝 Raw Claude response:', claudeResponse);

        // Parse the JSON response
        const jsonMatch = claudeResponse.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.error('❌ No JSON found in response');
            return [];
        }

        let beers;
        try {
            beers = JSON.parse(jsonMatch[0]);
        } catch (parseError) {
            console.error('❌ JSON parse error:', parseError);
            return [];
        }

        console.log('📋 Parsed beers before cleaning:', JSON.stringify(beers, null, 2));

        // SMART CLEANING: Keep visible data, remove obvious hallucinations
        const cleanedBeers = beers
            .filter(beer => isValidBeer(beer))
            .map((beer: any) => {
                const cleaned: ClaudeBeer = {
                    name: String(beer.name || '').trim(),
                    brewery: validateBrewery(beer.brewery, beer.name),
                    abv: validateABV(beer.abv),
                    price: validatePrice(beer.price),
                    size: validateSize(beer.size),
                    type: validateBeerType(beer.type),
                    confidence: 'high' as const
                };

                // Additional validation
                if (cleaned.name.length < 2 || cleaned.name.length > 50) {
                    console.log(`🚫 Rejecting beer with invalid name: ${cleaned.name}`);
                    return null;
                }

                // Check for obvious food items that slipped through
                if (isFoodItem(cleaned.name)) {
                    console.log(`🚫 Rejecting food item: ${cleaned.name}`);
                    return null;
                }

                return cleaned;
            })
            .filter(beer => beer !== null);

        // Final hallucination check
        if (hasHallucination(cleanedBeers)) {
            console.log('🚨 HALLUCINATION DETECTED - Applying additional cleaning');
            return cleanedBeers.map(beer => ({
                ...beer,
                brewery: null,
                price: null,
                size: null,
                confidence: 'medium' as const
            }));
        }

        console.log('✅ Final cleaned beers:', JSON.stringify(cleanedBeers, null, 2));
        return cleanedBeers;

    } catch (error) {
        console.error('❌ Claude extraction failed:', error);
        return [];
    }
}

function isValidBeer(beer: any): boolean {
    // Must have a name
    if (!beer.name || typeof beer.name !== 'string') {
        console.log('🚫 Invalid beer: missing name');
        return false;
    }

    // Name shouldn't be too generic
    const genericNames = [
        'beer', 'drink', 'beverage', 'selection', 'tap', 'draft', 'bottle', 'can',
        'special', 'house', 'local', 'domestic', 'import', 'light', 'regular'
    ];

    const nameLower = beer.name.toLowerCase().trim();
    if (genericNames.includes(nameLower)) {
        console.log(`🚫 Invalid beer: too generic - ${beer.name}`);
        return false;
    }

    return true;
}
function validateBrewery(brewery: any, beerName: string = ''): string | null {
    if (!brewery || typeof brewery !== 'string') {
        // Try to infer brewery from well-known beer names
        return inferBreweryFromBeerName(beerName);
    }

    const breweryTrimmed = brewery.trim();
    if (breweryTrimmed.length < 2 || breweryTrimmed.length > 50) return null;

    // Check for obviously made-up brewery names
    const suspiciousBreweries = [
        'unknown brewery', 'local brewery', 'house brewery', 'tap house',
        'beer company', 'brewing company', 'brewery', 'breweries',
        'unknown', 'various', 'multiple', 'mixed', 'different'
    ];

    if (suspiciousBreweries.includes(breweryTrimmed.toLowerCase())) {
        // Try to infer from beer name instead
        return inferBreweryFromBeerName(beerName);
    }

    return breweryTrimmed;
}

function inferBreweryFromBeerName(beerName: string): string | null {
    if (!beerName) return null;

    const nameLower = beerName.toLowerCase().trim();

    // Well-known beer to brewery mappings
    const knownBeers: { [key: string]: string } = {
        // Major brands
        'guinness': 'Guinness',
        'stella artois': 'Stella Artois',
        'heineken': 'Heineken',
        'corona': 'Corona',
        'budweiser': 'Anheuser-Busch',
        'bud light': 'Anheuser-Busch',
        'miller lite': 'Miller Brewing',
        'coors light': 'Coors',
        'blue moon': 'Blue Moon Brewing',
        'sam adams': 'Samuel Adams',
        'yuengling': 'Yuengling',

        // Craft breweries (from your menu)
        'allagash curieux': 'Allagash Brewing',
        'bell\'s two hearted': 'Bell\'s Brewery',
        'two hearted': 'Bell\'s Brewery',
        'hudson north': 'Hudson North Brewing',
        'mainstay white flag': 'Mainstay Brewing',
        'yards standard punch': 'Yards Brewing',
        'yards philly pale': 'Yards Brewing',
        'lancaster kolsch': 'Lancaster Brewing',
        'lawson\'s hazy rays': 'Lawson\'s Finest Liquids',
        'von trapp pilsner': 'Von Trapp Brewing',
        'new trail trail marker': 'New Trail Brewing',
        'love city callowhill': 'Love City Brewing',

        // Common partial matches
        'allagash': 'Allagash Brewing',
        'bell\'s': 'Bell\'s Brewery',
        'yards': 'Yards Brewing',
        'lancaster': 'Lancaster Brewing',
        'lawson\'s': 'Lawson\'s Finest Liquids',
        'von trapp': 'Von Trapp Brewing',
        'love city': 'Love City Brewing',
        'mainstay': 'Mainstay Brewing',
        'hudson': 'Hudson North Brewing'
    };

    // Direct match
    if (knownBeers[nameLower]) {
        console.log(`🏭 Mapped "${beerName}" to ${knownBeers[nameLower]}`);
        return knownBeers[nameLower];
    }

    // Partial match - check if beer name contains any known brewery
    for (const [beerKey, breweryName] of Object.entries(knownBeers)) {
        if (nameLower.includes(beerKey)) {
            console.log(`🏭 Partial match: "${beerName}" contains "${beerKey}" → ${breweryName}`);
            return breweryName;
        }
    }

    console.log(`🤷 No brewery mapping found for: "${beerName}"`);
    return null;
}

function validatePrice(price: any): number | null {
    if (price === null || price === undefined) return null;

    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 1 || numPrice > 50) {
        console.log(`🚫 Invalid price: ${price}`);
        return null;
    }

    return numPrice;
}

function validateSize(size: any): number | null {
    if (size === null || size === undefined) return null;

    const numSize = parseInt(size);
    if (isNaN(numSize) || numSize < 4 || numSize > 64) {
        console.log(`🚫 Invalid size: ${size}`);
        return null;
    }

    return numSize;
}

function validateABV(abv: any): number | null {
    if (abv === null || abv === undefined) return null;

    const numABV = parseFloat(abv);
    if (isNaN(numABV) || numABV < 0.5 || numABV > 20) {
        console.log(`🚫 Invalid ABV: ${abv}`);
        return null;
    }

    return numABV;
}

function validateBeerType(type: any, beerName: string = '', brewery: string = ''): string {
    // Ensure beer types are loaded
    if (BEER_TYPES_CACHE.length === 0) {
        BEER_TYPES_CACHE = getDefaultBeerTypes();
    }

    // If we have a type from Claude, try to match it
    if (type && typeof type === 'string') {
        const normalizedType = type.trim();

        // Direct match (case insensitive)
        const directMatch = BEER_TYPES_CACHE.find(
            dbType => dbType.toLowerCase() === normalizedType.toLowerCase()
        );
        if (directMatch) return directMatch;
    }

    // Smart classification based on beer name and description
    const searchText = `${beerName} ${brewery} ${type || ''}`.toLowerCase();

    // IPA variations (most specific first)
    if (searchText.includes('hazy') && searchText.includes('ipa')) return 'IPA';
    if (searchText.includes('session') && searchText.includes('ipa')) return 'Session IPA';
    if (searchText.includes('ipa') || searchText.includes('india pale ale')) return 'IPA';

    // Stouts and Porters
    if (searchText.includes('guinness')) return 'Stout';
    if (searchText.includes('stout')) return 'Stout';
    if (searchText.includes('porter')) return 'Porter';

    // Lagers and Pilsners
    if (searchText.includes('pilsner') || searchText.includes('pils')) return 'Pilsner';
    if (searchText.includes('kolsch')) return 'Kolsch';
    if (searchText.includes('märzen') || searchText.includes('oktoberfest')) return 'Märzen';
    if (searchText.includes('vienna lager')) return 'Vienna Lager';
    if (searchText.includes('lager')) return 'Lager';

    // Wheat beers
    if (searchText.includes('wit') || searchText.includes('white')) return 'Wheat Beer';
    if (searchText.includes('wheat') || searchText.includes('hefeweizen')) return 'Hefeweizen';

    // Belgian styles
    if (searchText.includes('saison')) return 'Saison';
    if (searchText.includes('tripel')) return 'Tripel';
    if (searchText.includes('quadrupel')) return 'Quadrupel';
    if (searchText.includes('belgian')) return 'Belgian Ale';

    // Ale variations
    if (searchText.includes('pale ale') && !searchText.includes('ipa')) return 'Pale Ale';
    if (searchText.includes('brown ale')) return 'Brown Ale';
    if (searchText.includes('amber ale')) return 'Amber Ale';
    if (searchText.includes('blonde ale')) return 'Blonde Ale';
    if (searchText.includes('red ale') || searchText.includes('irish red')) return 'Red Ale';
    if (searchText.includes('cream ale')) return 'Cream Ale';

    // Specialty styles
    if (searchText.includes('sour')) return 'Sour';
    if (searchText.includes('gose')) return 'Gose';
    if (searchText.includes('barleywine')) return 'Barleywine';
    if (searchText.includes('doppelbock')) return 'Doppelbock';

    // Non-beer
    if (searchText.includes('cider')) return 'Cider';
    if (searchText.includes('seltzer')) return 'Hard Seltzer';

    // Light beers
    if (searchText.includes('lite') || searchText.includes('light')) return 'Lite';

    // Default fallback
    console.log(`🤔 Unknown beer type for "${beerName}" - defaulting to Pale Ale`);
    return 'Pale Ale';
}

function isFoodItem(name: string): boolean {
    const foodKeywords = [
        'pizza', 'burger', 'sandwich', 'salad', 'soup', 'wings', 'fries',
        'appetizer', 'entree', 'pasta', 'chicken', 'beef', 'pork', 'fish',
        'nachos', 'quesadilla', 'wrap', 'bowl', 'plate', 'special',
        'happy hour', 'menu', 'food', 'kitchen', 'grill', 'fried',
        'baked', 'grilled', 'served', 'comes with', 'includes'
    ];

    const nameLower = name.toLowerCase();
    return foodKeywords.some(keyword => nameLower.includes(keyword));
}


let BEER_TYPES_CACHE: string[] = [];

// Load beer types from your database on app start
export async function loadBeerTypesFromDatabase(): Promise<string[]> {
    try {
        const { data, error } = await supabase
            .from('beer_types')
            .select('type')
            .order('type');

        if (error) throw error;

        BEER_TYPES_CACHE = data.map(item => item.type);
        console.log('✅ Loaded beer types from database:', BEER_TYPES_CACHE.length);
        return BEER_TYPES_CACHE;
    } catch (error) {
        console.error('❌ Failed to load beer types:', error);
        return getDefaultBeerTypes();
    }
}

function getDefaultBeerTypes(): string[] {
    return [
        'IPA', 'Lager', 'Pilsner', 'Stout', 'Porter', 'Pale Ale',
        'Wheat Beer', 'Sour', 'Brown Ale', 'Amber Ale', 'Blonde Ale',
        'Barleywine', 'Belgian Ale', 'Hefeweizen', 'Cream Ale', 'Gose',
        'Kolsch', 'Doppelbock', 'Tripel', 'Quadrupel', 'Lite',
        'Saison', 'Red Ale', 'Irish Red', 'Märzen', 'Oktoberfest',
        'Hard Seltzer', 'Cider', 'Vienna Lager', 'Session IPA'
    ];
}

export async function initializeBeerTypes(): Promise<void> {
    await loadBeerTypesFromDatabase();
}

// Helper function to get available beer types (for your picker)
export function getAvailableBeerTypes(): string[] {
    return BEER_TYPES_CACHE.length > 0 ? BEER_TYPES_CACHE : getDefaultBeerTypes();
}

function hasHallucination(beers: ClaudeBeer[]): boolean {
    if (beers.length === 0) return false;

    // Check for suspicious patterns that indicate hallucination

    // 1. All beers have identical ABV (very suspicious)
    const abvs = beers.map(beer => beer.abv).filter(abv => abv !== null);
    if (abvs.length > 2) {
        const uniqueABVs = new Set(abvs);
        if (uniqueABVs.size === 1) {
            console.log('🚨 Suspicious: All beers have identical ABV');
            return true;
        }
    }

    // 2. Too many beers with very specific ABVs (like 4.2, 5.0, 6.5)
    const commonABVs = [4.2, 5.0, 5.5, 6.0, 6.5, 7.0];
    const commonABVCount = abvs.filter(abv => commonABVs.includes(abv)).length;
    if (commonABVCount > beers.length * 0.8) {
        console.log('🚨 Suspicious: Too many common ABV values');
        return true;
    }

    // 3. Beer names that look made up or too perfect
    const suspiciousNames = beers.filter(beer => {
        const name = beer.name.toLowerCase();

        // Check for obviously made-up names
        const madeUpPatterns = [
            /house \w+/,  // "House IPA", "House Lager"
            /tap \d+/,    // "Tap 1", "Tap 2"
            /\w+ special/, // "Monday Special"
            /local \w+/   // "Local Beer"
        ];

        return madeUpPatterns.some(pattern => pattern.test(name));
    });

    if (suspiciousNames.length > beers.length * 0.5) {
        console.log('🚨 Suspicious: Too many generic beer names');
        return true;
    }

    return false;
}

// Helper function for web platform
function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = reader.result as string;
            resolve(base64data.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}