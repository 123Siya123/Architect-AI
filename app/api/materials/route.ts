/**
 * GET /api/materials
 * Search and filter materials from the library.
 * Support query params: ?search=name&category=type&maxPrice=val
 */
import { NextResponse } from 'next/server';
import materialsData from '@/data/materials.json';
import { Material } from '@/types';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    const search = searchParams.get('search')?.toLowerCase() || '';
    const category = searchParams.get('category') || '';
    const maxPrice = parseFloat(searchParams.get('maxPrice') || '0');

    // Convert object to array for filtering
    let results = Object.values(materialsData) as Material[];

    // Apply filters
    if (search) {
        results = results.filter(m =>
            m.name.toLowerCase().includes(search) ||
            m.id.toLowerCase().includes(search)
        );
    }

    if (category) {
        results = results.filter(m => m.category === category);
    }

    if (maxPrice > 0) {
        results = results.filter(m => m.price_per_kg <= maxPrice);
    }

    return NextResponse.json({
        total: results.length,
        items: results
    });
}
