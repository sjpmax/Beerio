// utils/claudeVision.ts - FIXED VERSION

import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export interface ClaudeBeer {
    name: string;
    brewery?: string;
    abv: number;
    price: number;
    size?: number;
    type: string;
    confidence: 'high' | 'medium' | 'low';
}

export async function readMenuWithClaude(imageUri: string): Promise<ClaudeBeer[]> {
    try {
        console.log('🆕 NEW CLAUDE VISION FILE - TESTING PNG');

        // Get base64 image
        const base64Image = await FileSystem.readAsStringAsync(imageUri, {
            encoding: FileSystem.EncodingType.Base64,
        });

        console.log('📊 Image size:', base64Image.length);
        console.log('📋 Base64 starts with:', base64Image.substring(0, 20));

        // Enhanced prompt to specifically handle dual pricing
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1500,
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: 'image/png',
                                data: base64Image
                            }
                        },
                        {
                            type: 'text',
                            text: `List ALL beers from this menu. For beers with multiple sizes/prices (like $4.50/$5.50), create separate entries for each size. Include brewery, ABV%, price, and estimated size.

Format each beer as:
Name (Brewery, ABV%) - $Price - Size

If there are dual prices like $4.50/$5.50, list BOTH:
Miller Lite (American Lite, 4.2% ABV) - $4.50 - 10oz
Miller Lite (American Lite, 4.2% ABV) - $5.50 - 16oz`
                        }
                    ]
                }]
            })
        });

        console.log('📋 Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Claude error:', errorText);
            throw new Error(`Claude failed: ${response.status}`);
        }

        const result = await response.json();
        const claudeText = result.content[0]?.text || '';
        console.log('✅ Claude success! Response:', claudeText);

        // Parse Claude's response into structured data
        const beers: ClaudeBeer[] = [];
        const lines = claudeText.split('\n');

        for (const line of lines) {
            // Enhanced regex to capture size info
            // Matches: "Miller Lite (American Lite, 4.2% ABV) - $4.50 - 10oz"
            const detailedMatch = line.match(/([^(]+)\s*\(([^,]*),?\s*(\d+\.?\d*)%\s*ABV\)\s*-\s*\$(\d+\.?\d*)\s*-\s*(\d+)oz/);

            if (detailedMatch) {
                const [, name, brewery, abv, price, size] = detailedMatch;
                beers.push({
                    name: name.trim(),
                    brewery: brewery.trim() || undefined,
                    abv: parseFloat(abv),
                    price: parseFloat(price),
                    size: parseInt(size),
                    type: inferBeerType(name, brewery || ''),
                    confidence: 'high'
                });
                continue;
            }

            // Fallback: Original regex for simpler formats
            const simpleMatch = line.match(/([^(]+)\s*\(([^,]*),?\s*(\d+\.?\d*)%\s*ABV\)\s*-\s*\$(\d+\.?\d*)(?:\/\$(\d+\.?\d*))?/);

            if (simpleMatch) {
                const [, name, brewery, abv, smallPrice, largePrice] = simpleMatch;

                // Create first entry (small size)
                beers.push({
                    name: name.trim(),
                    brewery: brewery.trim() || undefined,
                    abv: parseFloat(abv),
                    price: parseFloat(smallPrice),
                    size: 10, // Small size
                    type: inferBeerType(name, brewery || ''),
                    confidence: 'high'
                });

                // Create second entry if there's a large price
                if (largePrice) {
                    beers.push({
                        name: name.trim(),
                        brewery: brewery.trim() || undefined,
                        abv: parseFloat(abv),
                        price: parseFloat(largePrice),
                        size: 16, // Large size
                        type: inferBeerType(name, brewery || ''),
                        confidence: 'high'
                    });
                }
            }
        }

        // If Claude didn't format it perfectly, try to split dual-price entries post-processing
        const finalBeers = postProcessDualPricing(beers, claudeText);

        console.log('🍺 Parsed', finalBeers.length, 'beers from Claude response');
        return finalBeers;

    } catch (error) {
        console.error('❌ Claude vision failed:', error);
        return [];
    }
}

// Post-process to catch any dual pricing Claude missed
function postProcessDualPricing(beers: ClaudeBeer[], rawText: string): ClaudeBeer[] {
    const expandedBeers: ClaudeBeer[] = [];

    // Look for lines with dual pricing that weren't parsed
    const lines = rawText.split('\n');
    const dualPriceLines = lines.filter(line =>
        line.includes('$') && line.includes('/') && line.match(/\$\d+\.?\d*\/\$\d+\.?\d*/)
    );

    if (dualPriceLines.length > beers.length / 2) {
        // Seems like Claude didn't split the dual pricing properly
        // Try to extract dual prices manually
        for (const line of dualPriceLines) {
            const matches = line.match(/([^$]*)\$(\d+\.?\d*)\/\$(\d+\.?\d*)/);
            if (matches) {
                const [, nameInfo, price1, price2] = matches;

                // Extract beer name and ABV from nameInfo
                const nameMatch = nameInfo.match(/([^(]+)(?:\(.*?(\d+\.?\d*)%.*?\))?/);
                if (nameMatch) {
                    const [, name, abv] = nameMatch;

                    expandedBeers.push({
                        name: name.trim(),
                        abv: parseFloat(abv || '5'),
                        price: parseFloat(price1),
                        size: 10,
                        type: inferBeerType(name, ''),
                        confidence: 'medium'
                    });

                    expandedBeers.push({
                        name: name.trim(),
                        abv: parseFloat(abv || '5'),
                        price: parseFloat(price2),
                        size: 16,
                        type: inferBeerType(name, ''),
                        confidence: 'medium'
                    });
                }
            }
        }
    }

    return expandedBeers.length > beers.length ? expandedBeers : beers;
}

// Helper function to infer beer type
function inferBeerType(name: string, brewery: string): string {
    const text = `${name} ${brewery}`.toLowerCase();

    if (text.includes('ipa')) return 'IPA';
    if (text.includes('lager')) return 'Lager';
    if (text.includes('stout')) return 'Stout';
    if (text.includes('pilsner')) return 'Pilsner';
    if (text.includes('wheat') || text.includes('belgian')) return 'Wheat Beer';
    if (text.includes('sour') || text.includes('tart')) return 'Sour';
    if (text.includes('cider')) return 'Cider';
    if (text.includes('lite') || text.includes('light')) return 'Light Lager';
    if (text.includes('amber')) return 'Amber Lager';

    return 'Ale';
}