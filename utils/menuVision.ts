// utils/menuOCR.ts - MUCH simpler now!

import { extractBeersWithClaude, ClaudeBeer } from './claudeMenuReader';
import { enhanceBeerWithWebData } from './supabase';
export interface MenuBeer {
    name: string;
    brewery?: string;
    abv?: number;
    price?: number;
    size?: number;
    type?: string;
    description?: string;
    confidence: 'high' | 'medium' | 'low';
    rawText: string;
}


export async function processMenuPhoto(
    imageUri: string,
    barId?: string,
    allBeersFromThisBrewery: boolean = false
): Promise<MenuBeer[]> {
    try {
        console.log('🔧 processMenuPhoto called with:');
        console.log('🔧 imageUri:', imageUri);
        console.log('🔧 barId:', barId);
        console.log('🔧 allBeersFromThisBrewery:', allBeersFromThisBrewery);

        // Step 1: Get bar information
        let barInfo = null;
        if (barId) {
            barInfo = await getBarInfo(barId);
            console.log(`🏪 Bar info retrieved:`, barInfo);
        }

        // Step 2: Extract basic info with Claude Vision
        console.log('🤖 About to call extractBeersWithClaude...');
        const claudeBeers = await extractBeersWithClaude(imageUri);

        console.log('🤖 Claude extraction result:');
        console.log('🤖 Number of beers:', claudeBeers?.length || 0);
        console.log('🤖 Raw Claude response:', JSON.stringify(claudeBeers, null, 2));

        if (claudeBeers.length === 0) {
            console.log('❌ Claude returned zero beers');
            return [];
        }

        console.log(`✅ Claude extracted ${claudeBeers.length} beers successfully`);

        // Step 3: Simple brewery attribution based on user choice
        const enhancedBeers: MenuBeer[] = claudeBeers.map(beer => {
            console.log(`🔧 Processing beer: ${beer.name}`);

            if (allBeersFromThisBrewery && barInfo) {
                console.log(`🏭 Attributing to house brewery: ${barInfo.name}`);
                return {
                    name: beer.name,
                    brewery: barInfo.name,
                    abv: beer.abv,
                    price: beer.price,
                    size: beer.size,
                    type: beer.type,
                    description: `House beer at ${barInfo.name}`,
                    confidence: 'high' as const,
                    rawText: `${beer.name} - House beer`
                };
            } else {
                console.log(`🍺 Using mixed brewery attribution`);
                return {
                    name: beer.name,
                    brewery: beer.brewery || 'Unknown Brewery',
                    abv: beer.abv,
                    price: beer.price,
                    size: beer.size,
                    type: beer.type,
                    description: `Beer available at ${barInfo?.name || 'unknown location'}`,
                    confidence: beer.confidence,
                    rawText: `${beer.name} - ${beer.brewery ? 'Brewery detected' : 'Brewery unknown'}`
                };
            }
        });

        console.log(`✅ Enhanced ${enhancedBeers.length} beers`);
        console.log('✅ Final enhanced beers:', JSON.stringify(enhancedBeers, null, 2));

        const filteredBeers = enhancedBeers.filter(beer => isBeerReasonable(beer));
        console.log(`✅ After filtering: ${filteredBeers.length} beers`);

        return filteredBeers;

    } catch (error) {
        console.error('❌ processMenuPhoto failed:', error);
        console.error('❌ Error details:', error.message);
        console.error('❌ Error stack:', error.stack);
        return [];
    }
}


async function createEnhancedMenuBeer(claudeBeer: ClaudeBeer, barInfo: any): Promise<MenuBeer> {
    const beer: MenuBeer = {
        name: claudeBeer.name,
        brewery: 'Unknown Brewery', // Default
        abv: claudeBeer.abv,
        price: claudeBeer.price,
        size: claudeBeer.size || 16,
        type: claudeBeer.type,
        description: `Beer extracted from menu scan`,
        confidence: claudeBeer.confidence,
        rawText: `${claudeBeer.name} - Vision extraction`,
    };

    // Strategy 1: If this is a brewery, assume house beers
    if (barInfo && barInfo.is_brewery) {
        beer.brewery = barInfo.name;
        beer.description = `House beer at ${barInfo.name}`;
        beer.confidence = 'high';
        console.log(`🏭 Attributed to house brewery: ${barInfo.name}`);
        return beer;
    }

    // Strategy 2: Try to find this beer in our database (indicating it's served here)
    if (barInfo) {
        const existingBeer = await findBeerInDatabase(claudeBeer.name, barInfo.id);
        if (existingBeer) {
            beer.brewery = existingBeer.brewery || barInfo.name;
            beer.description = `Known beer at ${barInfo.name}`;
            beer.confidence = 'high';
            console.log(`📊 Found in database with brewery: ${beer.brewery}`);
            return beer;
        }
    }

    // Strategy 3: Check if beer name suggests it's a house beer
    const houseIndicators = ['house', 'tap', 'special', 'signature', 'our', 'exclusive'];
    const isLikelyHouseBeer = houseIndicators.some(indicator =>
        claudeBeer.name.toLowerCase().includes(indicator)
    );

    if (isLikelyHouseBeer && barInfo) {
        beer.brewery = barInfo.name;
        beer.description = `Likely house beer at ${barInfo.name}`;
        beer.confidence = 'medium';
        console.log(`🏠 Detected house beer indicator, attributed to: ${barInfo.name}`);
        return beer;
    }

    // Strategy 4: Try web search for brewery info (but be cautious)
    try {
        const webData = await searchBeerWithBrave(claudeBeer.name);
        if (webData && webData.brewery && webData.confidence === 'high') {
            beer.brewery = webData.brewery;
            beer.description = `Brewery found via web search`;
            beer.confidence = 'medium'; // Lower confidence since it's external
            console.log(`🌐 Web search found brewery: ${webData.brewery}`);
            return beer;
        }
    } catch (error) {
        console.log(`🌐 Web search failed for ${claudeBeer.name}`);
    }

    // Strategy 5: Default to bar name if all else fails
    if (barInfo) {
        beer.brewery = barInfo.name;
        beer.description = `Available at ${barInfo.name}`;
        beer.confidence = 'low';
        console.log(`🎯 Defaulted brewery to bar: ${barInfo.name}`);
    }

    return beer;
}
async function findBeerInDatabase(beerName: string, barId: string): Promise<any> {
    try {
        const { supabase } = await import('./supabase');

        const { data, error } = await supabase
            .from('beers')
            .select(`
                name, 
                breweries(name),
                bars(name)
            `)
            .eq('bar_id', barId)
            .ilike('name', `%${beerName}%`)
            .eq('pending_review', false)
            .limit(1)
            .single();

        if (error || !data) return null;

        return {
            name: data.name,
            brewery: data.breweries?.name,
            bar: data.bars?.name
        };

    } catch (error) {
        console.log('Database search failed:', error);
        return null;
    }
}
async function searchBeerWithBrave(beerName: string): Promise<any> {
    try {
        // Import here to avoid circular dependency
        const { searchBeerWithBrave: searchFunction } = await import('./supabase');
        return await searchFunction(beerName);
    } catch (error) {
        console.log('Brave search not available');
        return null;
    }
}

async function validateEnhancedBeer(beer: MenuBeer, barId?: string): Promise<MenuBeer | null> {
    // Check for obvious food items that slipped through
    const foodKeywords = [
        'pizza slice', 'burger', 'sandwich', 'salad bowl', 'soup bowl',
        'chicken wings', 'fries', 'appetizer', 'entree', 'pasta dish'
        // Remove 'pasta' alone since "Pasta Shapes" is a legitimate beer name
    ];
    const isFoodItem = foodKeywords.some(keyword =>
        beer.name.toLowerCase().includes(keyword)
    );

    if (isFoodItem) {
        console.log(`🚫 Filtering out food item: ${beer.name}`);
        return null;
    }

    // Validate enhanced data makes sense
    if (beer.abv && (beer.abv < 0.5 || beer.abv > 20)) {
        console.log(`⚠️ Suspicious ABV for ${beer.name}: ${beer.abv}%`);
        // Don't reject, but lower confidence
        beer.confidence = 'low';
    }

    if (beer.price && (beer.price < 1 || beer.price > 50)) {
        console.log(`⚠️ Suspicious price for ${beer.name}: $${beer.price}`);
        beer.confidence = 'low';
    }

    // If we have a bar ID, try to get bar info for better brewery attribution
    if (barId && (!beer.brewery || beer.brewery === 'Unknown' || beer.brewery === 'Unknown Brewery')) {
        try {
            const barInfo = await getBarInfo(barId);
            if (barInfo && barInfo.name) {
                beer.brewery = barInfo.name;
                console.log(`🏪 Updated brewery to bar name: ${beer.brewery}`);
            }
        } catch (error) {
            console.log('Could not get bar info for brewery attribution');
        }
    }

    return beer;
}

// Create fallback MenuBeer when enhancement fails
function createFallbackMenuBeer(claudeBeer: ClaudeBeer, barInfo: any): MenuBeer {
    return {
        name: claudeBeer.name,
        brewery: barInfo?.name || 'Unknown Brewery',
        abv: claudeBeer.abv,
        price: claudeBeer.price,
        size: claudeBeer.size || 16,
        type: claudeBeer.type,
        description: `Beer extracted from menu scan at ${barInfo?.name || 'unknown location'}`,
        confidence: 'low',
        rawText: `${claudeBeer.name} - Vision extraction only`,
    };
}


// Check if beer data is reasonable
function isBeerReasonable(beer: MenuBeer): boolean {
    // Must have a name
    if (!beer.name || beer.name.trim().length < 2) {
        return false;
    }

    // Name shouldn't be too generic
    const genericNames = ['beer', 'drink', 'beverage', 'selection', 'various'];
    if (genericNames.includes(beer.name.toLowerCase().trim())) {
        return false;
    }

    // Must have reasonable ABV if specified
    if (beer.abv && (beer.abv < 0.5 || beer.abv > 20)) {
        return false;
    }

    return true;
}

// Calculate completeness score for sorting
function getCompletenessScore(beer: MenuBeer): number {
    let score = 0;

    if (beer.name && beer.name !== 'Unknown') score += 1;
    if (beer.brewery && beer.brewery !== 'Unknown Brewery') score += 2;
    if (beer.abv && beer.abv > 0) score += 2;
    if (beer.price && beer.price > 0) score += 1;
    if (beer.size && beer.size > 0) score += 1;
    if (beer.type && beer.type !== 'Unknown') score += 1;
    if (beer.description) score += 1;

    return score;
}

// Helper to get bar information
async function getBarInfo(barId: string): Promise<any> {
    try {
        // Import supabase here to avoid circular dependencies
        const { supabase } = await import('./supabase');

        const { data, error } = await supabase
            .from('bars')
            .select('name, is_brewery')
            .eq('id', barId)
            .single();

        if (error) throw error;
        return data;

    } catch (error) {
        console.error('Error fetching bar info:', error);
        return null;
    }
}
function validateBeer(beer: any): boolean {
    // Must have basic properties
    if (!beer.name || typeof beer.name !== 'string') {
        console.log('❌ Invalid beer: missing name');
        return false;
    }

    // Name should be reasonable length (more permissive)
    if (beer.name.length < 2 || beer.name.length > 60) {
        console.log(`❌ Invalid beer name length: ${beer.name}`);
        return false;
    }

    // ABV should be reasonable for beer (if provided)
    if (beer.abv !== null && beer.abv !== undefined && (beer.abv < 0.5 || beer.abv > 25)) {
        console.log(`❌ Invalid ABV: ${beer.abv}% for ${beer.name}`);
        return false;
    }

    // Price should be reasonable (if provided)
    if (beer.price !== null && beer.price !== undefined && (beer.price < 1 || beer.price > 50)) {
        console.log(`❌ Invalid price: $${beer.price} for ${beer.name}`);
        return false;
    }

    // Size should be reasonable (if provided)
    if (beer.size !== null && beer.size !== undefined && (beer.size < 4 || beer.size > 64)) {
        console.log(`❌ Invalid size: ${beer.size}oz for ${beer.name}`);
        return false;
    }

    return true;
}

