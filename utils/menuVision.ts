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


export async function processMenuPhoto(imageUri: string): Promise<MenuBeer[]> {
    try {
        // Step 1: Basic extraction (existing)
        const claudeBeers = await extractBeersWithClaude(imageUri);

        // Step 2: Enhance each beer with web data
        const enhancedBeers = await Promise.all(
            claudeBeers.map(beer => enhanceBeerWithWebData(beer))
        );

        return enhancedBeers;
    } catch (error) {
        console.error('Menu processing failed:', error);
        throw error;
    }
}
