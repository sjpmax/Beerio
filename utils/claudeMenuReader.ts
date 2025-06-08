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
        console.log('🚨 CLAUDE FUNCTION STARTING - NEW VERSION WITH PNG DETECTION 🚨');
        console.log('🤖 Using Claude Vision to read menu...');

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

        console.log('📤 Sending image to Claude...');
        console.log('🔑 API Key exists:', !!process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY);
        console.log('📊 Image size:', base64Image.length, 'characters');
        console.log('🔍 Image URI:', imageUri);
        console.log('📋 Base64 header:', base64Image.substring(0, 50));

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
                        text: `You are analyzing a beer tap list/menu photo.

This appears to be a beer tap list with labels showing beer names, ABV percentages, and beer styles.

EXTRACTION RULES:
✅ Extract beer names exactly as written (even if unusual like "Pasta Shapes")
✅ Extract ABV percentages when you see X.X% 
✅ Extract beer styles/types when clearly visible
✅ For missing data, use null (don't guess or estimate)

CRITICAL: Only extract data you can actually see:
- If you don't see a price with $ symbol → "price": null
- If you don't see size info (oz/ml) → "size": null  
- If brewery not visible → "brewery": null

For each beer visible:
[
  {
    "name": "Exact name from tap list",
    "brewery": null,
    "type": "Beer style if visible",
    "abv": 4.8,
    "price": null,
    "size": null,
    "confidence": "high"
  }
]

DO NOT guess or estimate missing information. Return only the JSON array.`
                    }
                ]
            }]
        };

        console.log('📋 Request prepared, sending to Claude...');

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
            // Get the detailed error message from Claude
            const errorText = await response.text();
            console.error('❌ Claude API Response:', {
                status: response.status,
                statusText: response.statusText,
                body: errorText
            });
            throw new Error(`Claude API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        const claudeResponse = result.content[0]?.text || '';

        console.log('📝 Claude response:', claudeResponse);

        // Parse the JSON response
        const jsonMatch = claudeResponse.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            throw new Error('No valid JSON found in Claude response');
        }

        const beers = JSON.parse(jsonMatch[0]);
        // Check for hallucination patterns
        if (hasObviousHallucination(beers)) {
            console.log('🚫 Detected hallucination, using names only');
            // Use only names, set everything else to null
            const safeBeers = beers.map((beer: any) => ({
                name: beer.name,
                brewery: null,
                abv: beer.abv && beer.abv > 0 ? beer.abv : null,
                price: null,
                size: null,
                type: beer.type || 'Ale',
                confidence: 'low' as const
            }));
            return safeBeers;
        }

        // Add confidence scores
        const beersWithConfidence = beers.map((beer: any) => ({
            ...beer,
            confidence: 'high' as const
        }));

        console.log('✅ Claude extracted', beersWithConfidence.length, 'beers');

        return beersWithConfidence;

    } catch (error) {
        console.error('❌ Claude menu reading failed:', error);

        // Fallback to mock data
        console.log('📷 Falling back to mock data...');
        return [
            {
                name: 'Sample Beer',
                brewery: 'Sample Brewery',
                abv: 5.0,
                price: 6.0,
                size: 16,
                type: 'IPA',
                confidence: 'low'
            }
        ];
    }
}

function hasObviousHallucination(beers: any[]): boolean {
    if (beers.length === 0) return false;

    // Check if all beers have identical pricing (suspicious)
    const prices = beers.map(beer => beer.price).filter(price => price !== null && price !== undefined);
    if (prices.length > 2) {
        const uniquePrices = new Set(prices);
        if (uniquePrices.size === 1) {
            console.log('🚨 Suspicious: All beers have identical price');
            return true;
        }
    }

    return false;
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