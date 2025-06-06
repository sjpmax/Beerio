// utils/menuOCR.ts
// Create this file in your utils folder

import { searchBeerWithBrave } from './supabase';

// Interface for parsed menu beers
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

// OCR function using Google Vision (you'll need to implement this)
export async function extractTextFromMenuImage(imageUri: string): Promise<string> {
    try {
        // For now, this is a placeholder
        // You'll need to implement Google Vision OCR here
        // Using your existing googleVision.ts setup

        console.log('📷 OCR not yet implemented - using mock data for testing');

        // Mock menu text for testing (like The Bishop's Collar)
        return `
ALLAGASH CURIEUX An award winning golden ale aged in freshly emptied bourbon barrels. Notes of caramel, oak and vanilla. 10.2% Maine 12.

BELL'S TWO HEARTED IPA Brewed with 100% Centennial hops. The perfect balance of malt and citrusy pine. 7.0% abv Michigan 8.

GUINNESS A classic Irish dry stout sweet smelling with hints of coffee and a rich and creamy finish. 4.2% abv Dublin 7.

LANCASTER KOLSCH A tribute to the traditional beer of Cologne. Light and crisp with well-balanced hop character. 5.5% abv Pennsylvania 7.

YARDS PHILLY PALE ALE Dry-hopped with an abundance of distinctive Simcoe hops, this straw-colored pale ale is more drinkable than bitter, more aromatic than aggressive. 4.6% abv Pennsylvania 6.
    `;
    } catch (error) {
        console.error('OCR failed:', error);
        throw error;
    }
}

// Parse menu text into structured beer data
export function parseMenuText(menuText: string): MenuBeer[] {
    const lines = menuText.split('\n').filter(line => line.trim().length > 5);
    const beers: MenuBeer[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Skip empty lines or section headers
        if (!line || line.includes('DRAFT BEERS') || line.includes('BOTTLES')) {
            continue;
        }

        const beer = parseBeerLine(line);
        if (beer) {
            beers.push(beer);
        }
    }

    return beers;
}

function parseBeerLine(text: string): MenuBeer | null {
    // Skip obvious non-beer lines
    if (text.toLowerCase().includes('wine') ||
        text.toLowerCase().includes('cocktail') ||
        text.toLowerCase().includes('appetizer') ||
        text.length < 15) {
        return null;
    }

    // Patterns for different menu formats
    const patterns = [
        // Pattern 1: "ALLAGASH CURIEUX An award winning... 10.2% Maine 12."
        /^([A-Z\s&']+?)\s+(.+?)\s+(\d+\.?\d*%)\s*(?:abv)?\s+([A-Za-z\s]+?)\s+(\d+\.?\d*)\s*\.?\s*$/i,

        // Pattern 2: "BELL'S TWO HEARTED IPA Brewed with... 7.0% abv Michigan 8."
        /^([A-Z\s&']+?)\s+(.+?)\s+(\d+\.?\d*%)\s*abv\s+([A-Za-z\s]+?)\s+(\d+\.?\d*)\s*\.?\s*$/i,

        // Pattern 3: Simple "GUINNESS ... 4.2% abv Dublin 7."
        /^([A-Z\s]+?)\s+(.+?)\s+(\d+\.?\d*%)\s*abv\s+([A-Za-z\s]+?)\s+(\d+\.?\d*)\s*\.?\s*$/i,

        // Pattern 4: "BUD LIGHT 4.2% $6"
        /^([A-Z\s&']+?)\s+(\d+\.?\d*%)\s+(\$?\d+\.?\d*)\s*$/i,
    ];

    for (let i = 0; i < patterns.length; i++) {
        const match = text.match(patterns[i]);
        if (match) {
            const beer = createBeerFromMatch(match, i, text);
            if (beer) return beer;
        }
    }

    return null;
}

function createBeerFromMatch(match: RegExpMatchArray, patternIndex: number, rawText: string): MenuBeer | null {
    try {
        let name, description, abv, location, price;

        switch (patternIndex) {
            case 0:
            case 1:
            case 2:
                // Full patterns with description
                [, name, description, abv, location, price] = match;
                break;
            case 3:
                // Simple pattern without description
                [, name, abv, price] = match;
                description = '';
                location = '';
                break;
            default:
                return null;
        }

        const cleanName = name.trim();
        const cleanAbv = parseFloat(abv.replace('%', ''));
        const cleanPrice = parseFloat(price.replace('$', ''));

        return {
            name: cleanName,
            brewery: inferBreweryFromName(cleanName),
            abv: cleanAbv,
            price: cleanPrice,
            size: inferSizeFromAbv(cleanAbv),
            type: inferBeerType(cleanName, description || ''),
            description: description?.trim(),
            confidence: patternIndex <= 1 ? 'high' : patternIndex === 2 ? 'medium' : 'low',
            rawText
        };
    } catch (error) {
        console.error('Error creating beer from match:', error);
        return null;
    }
}

function inferBreweryFromName(name: string): string | undefined {
    const breweryMap: { [key: string]: string } = {
        'ALLAGASH': 'Allagash Brewing',
        'BELL\'S': 'Bell\'s Brewery',
        'BELLS': 'Bell\'s Brewery',
        'DOGFISH HEAD': 'Dogfish Head',
        'STONE': 'Stone Brewing',
        'SIERRA NEVADA': 'Sierra Nevada',
        'BUD LIGHT': 'Anheuser-Busch',
        'BUDWEISER': 'Anheuser-Busch',
        'MILLER': 'Molson Coors',
        'COORS': 'Molson Coors',
        'GUINNESS': 'Diageo',
        'YARDS': 'Yards Brewing',
        'VICTORY': 'Victory Brewing',
        'LANCASTER': 'Lancaster Brewing',
        'BROOKLYN': 'Brooklyn Brewery',
        'LAGUNITAS': 'Lagunitas',
        'FOUNDERS': 'Founders Brewing',
        'CORONA': 'Grupo Modelo',
        'HEINEKEN': 'Heineken',
        'STELLA ARTOIS': 'AB InBev',
        'BRAWLER': 'Yards Brewing',  // Add specific beer names that map to breweries
        'LOVE CITY': 'Love City Brewing',
        'PHILADELPHIA': 'Yards Brewing', // Sometimes menus say "Philadelphia Pale Ale"
    };

    const upperName = name.toUpperCase();
    for (const [pattern, brewery] of Object.entries(breweryMap)) {
        if (upperName.includes(pattern)) {
            return brewery;
        }
    }

    return undefined;
}

function inferBeerType(name: string, description: string): string {
    const combined = `${name} ${description}`.toLowerCase();

    if (combined.includes('ipa') || combined.includes('india pale ale')) return 'IPA';
    if (combined.includes('pale ale')) return 'Pale Ale';
    if (combined.includes('stout')) return 'Stout';
    if (combined.includes('porter')) return 'Porter';
    if (combined.includes('lager')) return 'Lager';
    if (combined.includes('pilsner') || combined.includes('kolsch')) return 'Pilsner';
    if (combined.includes('wheat') || combined.includes('wit') || combined.includes('weizen')) return 'Wheat Beer';
    if (combined.includes('sour')) return 'Sour';
    if (combined.includes('light')) return 'Light Lager';
    if (combined.includes('amber')) return 'Amber Ale';
    if (combined.includes('brown')) return 'Brown Ale';

    return 'Ale';
}

function inferSizeFromAbv(abv: number): number {
    // High ABV beers typically served in smaller portions
    if (abv >= 10) return 8;  // Very strong beers - snifter
    if (abv >= 8) return 10;  // Strong beers - small glass
    if (abv >= 6.5) return 12; // IPAs and stronger ales
    if (abv >= 5.5) return 14; // Standard craft beers

    return 16; // Standard pint for lighter beers
}

// Main menu processing function
export async function processMenuPhoto(imageUri: string): Promise<MenuBeer[]> {
    try {
        console.log('📷 Processing menu photo...');

        // Step 1: Extract text using OCR
        const extractedText = await extractTextFromMenuImage(imageUri);

        if (!extractedText || extractedText.trim().length === 0) {
            throw new Error('No text found in image');
        }

        console.log('📝 Extracted text length:', extractedText.length);

        // Step 2: Parse text into beer objects
        const beers = parseMenuText(extractedText);

        console.log('🍺 Found', beers.length, 'potential beers');

        // Step 3: Enhance with web search for missing data (optional)
        const enhancedBeers = await Promise.all(
            beers.map(async (beer) => {
                // Only enhance low confidence beers to save API calls
                if (beer.confidence === 'low') {
                    try {
                        const webData = await searchBeerWithBrave(beer.name, beer.brewery);

                        if (webData) {
                            return {
                                ...beer,
                                size: beer.size || webData.size || inferSizeFromAbv(beer.abv || 5),
                                type: beer.type || webData.type || beer.type,
                                brewery: beer.brewery || webData.brewery,
                                confidence: 'medium' as const
                            };
                        }
                    } catch (error) {
                        console.error('Enhancement failed for:', beer.name);
                    }
                }

                return beer;
            })
        );

        // Filter out very low quality results
        return enhancedBeers.filter(beer =>
            beer.name.length > 2 &&
            beer.abv && beer.abv > 0 && beer.abv < 20 &&
            beer.price && beer.price > 0
        );

    } catch (error) {
        console.error('Menu processing failed:', error);
        throw error;
    }
}

// Test function for development
export async function testMenuParsing(): Promise<MenuBeer[]> {
    const mockMenuText = `
ALLAGASH CURIEUX An award winning golden ale aged in freshly emptied bourbon barrels. Notes of caramel, oak and vanilla. 10.2% Maine 12.

BELL'S TWO HEARTED IPA Brewed with 100% Centennial hops. The perfect balance of malt and citrusy pine. 7.0% abv Michigan 8.

GUINNESS A classic Irish dry stout sweet smelling with hints of coffee and a rich and creamy finish. 4.2% abv Dublin 7.

BUD LIGHT 4.2% $6

DOGFISH HEAD 60 MINUTE IPA 6.0% Delaware $9
  `;

    return parseMenuText(mockMenuText);
}