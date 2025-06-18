// utils/menuVision.ts - WITH BRAVE SEARCH ENHANCEMENT

import { extractBeersWithClaude, ClaudeBeer } from './claudeMenuReader';

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
        console.log('🔧 processMenuPhoto called with enhancement enabled');

        // Step 1: Get bar information
        let barInfo = null;
        if (barId) {
            barInfo = await getBarInfo(barId);
            console.log(`🏪 Bar info:`, barInfo);
        }

        // Step 2: Extract with Claude Vision
        console.log('🤖 Extracting with Claude...');
        const claudeBeers = await extractBeersWithClaude(imageUri);

        if (claudeBeers.length === 0) {
            console.log('❌ Claude returned zero beers');
            return [];
        }

        console.log(`✅ Claude extracted ${claudeBeers.length} beers`);

        // Step 3: Enhance each beer with missing data
        const enhancedBeers: MenuBeer[] = [];

        for (const claudeBeer of claudeBeers) {
            console.log(`🔍 Processing: ${claudeBeer.name}`);

            let enhanced = await enhanceBeerData(claudeBeer, barInfo, allBeersFromThisBrewery);
            enhancedBeers.push(enhanced);
        }

        console.log(`✅ Enhanced ${enhancedBeers.length} beers`);
        return enhancedBeers.filter(beer => isBeerReasonable(beer));

    } catch (error) {
        console.error('❌ processMenuPhoto failed:', error);
        return [];
    }
}

async function enhanceBeerData(
    claudeBeer: ClaudeBeer,
    barInfo: any,
    allBeersFromThisBrewery: boolean
): Promise<MenuBeer> {

    let enhanced: MenuBeer = {
        name: claudeBeer.name,
        brewery: claudeBeer.brewery,
        abv: claudeBeer.abv,
        price: claudeBeer.price,
        size: claudeBeer.size,
        type: claudeBeer.type,
        description: `Beer available at ${barInfo?.name || 'unknown location'}`,
        confidence: claudeBeer.confidence,
        rawText: `${claudeBeer.name} - Vision extraction`
    };

    // Step 1: Handle brewery attribution
    if (allBeersFromThisBrewery && barInfo) {
        enhanced.brewery = barInfo.name;
        enhanced.description = `House beer at ${barInfo.name}`;
        enhanced.confidence = 'high';
        console.log(`🏭 Attributed to house brewery: ${barInfo.name}`);
    } else if (!enhanced.brewery && claudeBeer.brewery) {
        enhanced.brewery = claudeBeer.brewery;
    }

    // Step 2: Try to fill missing data with Brave search (if brewery is known)
    if (enhanced.brewery && (!enhanced.abv || !enhanced.size)) {
        console.log(`🦁 Searching web for ${enhanced.name} by ${enhanced.brewery}...`);

        try {
            const webData = await searchBeerWithBrave(enhanced.name, enhanced.brewery);

            if (webData) {
                // Fill in missing data only
                if (!enhanced.abv && webData.abv) {
                    enhanced.abv = webData.abv;
                    console.log(`🦁 Found ABV via web: ${webData.abv}%`);
                }

                if (!enhanced.size && webData.size) {
                    enhanced.size = webData.size;
                    console.log(`🦁 Found size via web: ${webData.size}oz`);
                }

                if (!enhanced.type && webData.type) {
                    enhanced.type = webData.type;
                    console.log(`🦁 Found type via web: ${webData.type}`);
                }

                if (webData.abv || webData.size || webData.type) {
                    enhanced.confidence = 'high';
                    enhanced.rawText += ' + web search';
                }
            }
        } catch (error) {
            console.log(`🦁 Web search failed for ${enhanced.name}:`, error);
        }
    }

    // Step 3: Reasonable defaults for missing data
    if (!enhanced.abv) {
        enhanced.abv = null; // Don't guess
    }

    if (!enhanced.size) {
        enhanced.size = null; // Don't guess
    }

    if (!enhanced.type) {
        enhanced.type = inferBeerTypeFromName(enhanced.name);
    }

    return enhanced;
}

async function searchBeerWithBrave(beerName: string, brewery?: string): Promise<any> {
    try {
        // Import here to avoid circular dependency
        const { searchBeerWithBrave: searchFunction } = await import('./supabase');
        return await searchFunction(beerName, brewery);
    } catch (error) {
        console.log('🦁 Brave search not available:', error);
        return null;
    }
}

function inferBeerTypeFromName(name: string): string {
    const nameLower = name.toLowerCase();

    if (nameLower.includes('ipa')) return 'IPA';
    if (nameLower.includes('lager')) return 'Lager';
    if (nameLower.includes('stout')) return 'Stout';
    if (nameLower.includes('pilsner') || nameLower.includes('pils')) return 'Pilsner';
    if (nameLower.includes('wheat')) return 'Wheat Beer';
    if (nameLower.includes('sour')) return 'Sour';
    if (nameLower.includes('pale ale')) return 'Pale Ale';
    if (nameLower.includes('porter')) return 'Porter';
    if (nameLower.includes('amber')) return 'Amber Ale';
    if (nameLower.includes('brown')) return 'Brown Ale';
    if (nameLower.includes('blonde')) return 'Blonde Ale';
    if (nameLower.includes('cider')) return 'Cider';

    return 'Ale';
}

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

    // Must have reasonable price if specified
    if (beer.price && (beer.price < 1 || beer.price > 50)) {
        return false;
    }

    return true;
}

// Helper to get bar information
async function getBarInfo(barId: string): Promise<any> {
    try {
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