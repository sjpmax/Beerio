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


export async function processMenuPhoto(imageUri: string, barId?: string): Promise<MenuBeer[]> {
    try {
        console.log('📷 Starting menu processing pipeline...');
        console.log(`🏪 Bar ID: ${barId}`);

        // Step 1: Extract basic info with Claude Vision
        console.log('🤖 Step 1: Claude Vision extraction...');
        const claudeBeers = await extractBeersWithClaude(imageUri);

        if (claudeBeers.length === 0) {
            console.log('❌ No beers extracted from image');
            return [];
        }

        console.log(`✅ Claude extracted ${claudeBeers.length} beers`);

        // Step 2: Enhanced validation and web search for each beer
        console.log('🔍 Step 2: Enhancing with Brave Search...');
        const enhancedBeers: MenuBeer[] = [];

        for (const beer of claudeBeers) {
            try {
                console.log(`🔍 Processing: ${beer.name}`);

                // Use the existing enhanceBeerWithWebData function
                const enhancedBeer = await enhanceBeerWithWebData(beer);

                // Additional validation after enhancement
                const validatedBeer = await validateEnhancedBeer(enhancedBeer, barId);

                if (validatedBeer) {
                    enhancedBeers.push(validatedBeer);
                    console.log(`✅ Enhanced: ${validatedBeer.name} (${validatedBeer.confidence})`);
                } else {
                    console.log(`❌ Rejected after validation: ${beer.name}`);
                }

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                console.error(`❌ Failed to enhance ${beer.name}:`, error);

                // Fallback: create basic MenuBeer without enhancement
                const fallbackBeer = createFallbackMenuBeer(beer, barId);
                enhancedBeers.push(fallbackBeer);
            }
        }

        console.log(`🎉 Final result: ${enhancedBeers.length} enhanced beers`);

        // Step 3: Final filtering and sorting
        const finalBeers = enhancedBeers
            .filter(beer => isBeerReasonable(beer))
            .sort((a, b) => {
                // Sort by confidence, then by completeness
                const confidenceOrder = { 'high': 3, 'medium': 2, 'low': 1 };
                const aScore = confidenceOrder[a.confidence] || 0;
                const bScore = confidenceOrder[b.confidence] || 0;

                if (aScore !== bScore) return bScore - aScore;

                // Prefer beers with more complete information
                const aCompleteness = getCompletenessScore(a);
                const bCompleteness = getCompletenessScore(b);

                return bCompleteness - aCompleteness;
            });

        console.log(`✅ Pipeline complete: ${finalBeers.length} final beers`);
        return finalBeers;

    } catch (error) {
        console.error('❌ Menu processing pipeline failed:', error);
        return [];
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
function createFallbackMenuBeer(claudeBeer: ClaudeBeer, barId?: string): MenuBeer {
    return {
        name: claudeBeer.name,
        brewery: claudeBeer.brewery || 'Unknown Brewery',
        abv: claudeBeer.abv,
        price: claudeBeer.price,
        size: claudeBeer.size || 16,
        type: claudeBeer.type,
        description: `Beer extracted from menu scan`,
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

