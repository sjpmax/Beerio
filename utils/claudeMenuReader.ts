// utils/claudeMenuReader.ts

import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

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
        console.log('🚨 CLAUDE EXTRACTION STARTING 🚨');
        console.log('🤖 Image URI received:', imageUri);

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

        console.log('📊 Base64 conversion successful');
        console.log('📊 Image size:', base64Image.length, 'characters');
        console.log('📋 Base64 header:', base64Image.substring(0, 50));

        // Detect media type from base64 header
        let mediaType: string;
        if (base64Image.startsWith('/9j/')) {
            mediaType = 'image/jpeg';
        } else if (base64Image.startsWith('iVBORw0KGgo')) {
            mediaType = 'image/png';
        } else {
            mediaType = 'image/jpeg'; // Default to JPEG
        }

        console.log('🖼️ Media type detected:', mediaType);
        console.log('🔑 API Key exists:', !!process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY);

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

STRICT RULES:
1. Extract ONLY beer names and ABV percentages you can clearly see
2. DO NOT include brewery names - set brewery to null
3. DO NOT include prices - set price to null  
4. DO NOT include sizes - set size to null
5. Beer type can be inferred from visible style names (IPA, Lager, etc.)

Example format:
[
  {
    "name": "NUBIAN",
    "brewery": null,
    "type": "BROWN ALE", 
    "abv": 5.7,
    "price": null,
    "size": null,
    "confidence": "high"
  }
]

Return ONLY the JSON array. DO NOT add brewery information.`
                    }
                ]
            }]
        };

        console.log('📤 Sending request to Claude...');
        console.log('📤 Request body prepared (without base64 data)');

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(requestBody)
        });

        console.log('📨 Claude response status:', response.status);
        console.log('📨 Claude response ok:', response.ok);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Claude API Error Response:', {
                status: response.status,
                statusText: response.statusText,
                body: errorText
            });
            throw new Error(`Claude API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        const claudeResponse = result.content[0]?.text || '';

        console.log('📝 Raw Claude response:', claudeResponse);

        // Parse the JSON response
        const jsonMatch = claudeResponse.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.error('❌ No JSON found in Claude response');
            console.error('❌ Full response was:', claudeResponse);
            throw new Error('No valid JSON found in Claude response');
        }

        console.log('📋 JSON match found:', jsonMatch[0]);

        const beers = JSON.parse(jsonMatch[0]);
        console.log('📋 Parsed beers:', JSON.stringify(beers, null, 2));

        // AGGRESSIVE CLEANING: Force all brewery info to null
        const cleanedBeers = beers.map((beer: any) => ({
            name: beer.name,
            brewery: null, // FORCE null - never trust Claude with brewery info
            abv: beer.abv && beer.abv > 0 && beer.abv < 20 ? beer.abv : null,
            price: null,   // FORCE null 
            size: null,    // FORCE null
            type: beer.type || 'Ale',
            confidence: 'high' as const
        }));

        console.log('✅ Claude extracted and cleaned', cleanedBeers.length, 'beers');
        console.log('✅ Final cleaned beers:', JSON.stringify(cleanedBeers, null, 2));

        return cleanedBeers;

    } catch (error) {
        console.error('❌ Claude menu reading failed:', error);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
        return [];
    }
}

function hasObviousHallucination(beers: any[]): boolean {
    if (beers.length === 0) return false;

    // Check for suspicious brewery patterns
    const breweries = beers.map(beer => beer.brewery).filter(brewery => brewery !== null);

    // Red flags for hallucination:

    // 1. Foreign language brewery names (common Claude hallucination)
    const foreignPatterns = [
        /brouwerij/i,     // Dutch
        /zwevegem/i,      // Belgian location
        /alvinne/i,       // Common hallucinated brewery
        /picobrouw/i,     // Partial Dutch brewery term
        /brasserie/i,     // French
        /cervecería/i     // Spanish
    ];

    const hasForeignBrewery = breweries.some(brewery =>
        foreignPatterns.some(pattern => pattern.test(brewery))
    );

    if (hasForeignBrewery) {
        console.log('🚨 Detected foreign brewery hallucination');
        return true;
    }

    // 2. All beers have identical pricing (suspicious)
    const prices = beers.map(beer => beer.price).filter(price => price !== null && price !== undefined);
    if (prices.length > 2) {
        const uniquePrices = new Set(prices);
        if (uniquePrices.size === 1) {
            console.log('🚨 Suspicious: All beers have identical price');
            return true;
        }
    }

    // 3. Too many beers have complete information (unusual for tap photos)
    const completeBeers = beers.filter(beer =>
        beer.brewery && beer.price && beer.size && beer.abv
    );

    if (completeBeers.length > beers.length * 0.7) {
        console.log('🚨 Suspicious: Too many beers have complete information');
        return true;
    }

    // 4. Check for obviously made-up brewery names
    const suspiciousBreweries = [
        'unknown brewery',
        'local brewery',
        'house brewery',
        'tap house',
        'beer company'
    ];

    const hasSuspiciousBrewery = breweries.some(brewery =>
        suspiciousBreweries.some(suspicious =>
            brewery.toLowerCase().includes(suspicious.toLowerCase())
        )
    );

    if (hasSuspiciousBrewery) {
        console.log('🚨 Detected generic brewery hallucination');
        return true;
    }

    return false;
}

function cleanHallucinatedData(beers: any[]): any[] {
    return beers.map(beer => {
        const cleanedBeer = { ...beer };

        // Remove suspicious brewery names
        if (beer.brewery) {
            const foreignPatterns = [
                /brouwerij/i, /zwevegem/i, /alvinne/i, /picobrouw/i,
                /brasserie/i, /cervecería/i
            ];

            const isSuspicious = foreignPatterns.some(pattern =>
                pattern.test(beer.brewery)
            );

            if (isSuspicious) {
                console.log(`🧹 Cleaning suspicious brewery: ${beer.brewery}`);
                cleanedBeer.brewery = null;
                cleanedBeer.confidence = 'medium';
            }
        }

        // Remove obviously wrong prices (all same price is suspicious)
        if (beer.price) {
            const allPrices = beers.map(b => b.price).filter(p => p !== null);
            const uniquePrices = new Set(allPrices);

            if (uniquePrices.size === 1 && allPrices.length > 2) {
                console.log(`🧹 Removing suspicious uniform pricing: $${beer.price}`);
                cleanedBeer.price = null;
                cleanedBeer.confidence = 'medium';
            }
        }

        return cleanedBeer;
    });
}


// Helper function for web platform
function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = reader.result as string;
            resolve(base64data.split(',')[1]); // Remove data:image/jpeg;base64, prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}