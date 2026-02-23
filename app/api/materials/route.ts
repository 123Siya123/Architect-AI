/**
 * =============================================================================
 * APP/API/MATERIALS/ROUTE.TS — Materials Library API
 * =============================================================================
 *
 * Serves the materials database to the frontend.
 * GET /api/materials — returns all materials
 * GET /api/materials?category=cladding — filtered by category
 *
 * WHY AN API ROUTE?
 * While the JSON could be imported directly, an API route allows:
 * - Future: user-defined custom materials
 * - Future: regional pricing (different prices by country)
 * - Future: material search/filtering
 * - Keeps the JSON out of the client bundle
 * =============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import materialsData from '@/data/materials.json';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let materials = Object.values(materialsData);

    // Filter by category if specified
    if (category) {
        materials = materials.filter((m) => m.category === category);
    }

    return NextResponse.json({
        count: materials.length,
        materials: Object.fromEntries(materials.map((m) => [m.id, m])),
    });
}
