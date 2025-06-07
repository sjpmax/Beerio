// utils/menuOCR.ts - MUCH simpler now!

import { extractBeersWithClaude, ClaudeBeer } from './claudeMenuReader';
import { readMenuWithClaude } from './claudeVision';

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


export async function processMenuPhoto(imageUri: string): Promise<MenuBeer[]> {
try {
    console.log('📷 Processing menu photo with Claude...');

    const claudeBeers = await readMenuWithClaude(imageUri);

    const menuBeers: MenuBeer[] = claudeBeers.map(beer => ({
        name: beer.name,
        brewery: beer.brewery,
        abv: beer.abv,
        price: beer.price,
        size: beer.size || 16,
        type: beer.type,
        description: beer.brewery ? `${beer.brewery} ${beer.type}` : beer.type,
        confidence: beer.confidence,
        rawText: `${beer.name} ${beer.brewery || ''} ${beer.type} ${beer.abv}% ABV $${beer.price}`
    }));

    console.log('🍺 Found', menuBeers.length, 'beers with Claude');
    return menuBeers;

} catch (error) {
    console.error('Menu processing failed:', error);
    throw error;
}
}