// src/lib/db.ts
import { createClient } from '@supabase/supabase-js';

// --- TYPES (Matching your DB Schema) ---
export interface Product {
  id: string;
  slug: string;
  name: string;
  type: 'PLUGIN' | 'THEME';
  latestVersion: string;
  author?: string;
  authorUrl?: string;
  image?: string;
  lastUpdatedAt?: string;
}

export interface ProductVersion {
  id: string;
  productId: string;
  versionNumber: string;
  downloadUrl?: string;
  updatedOn: string;
}

// --- INITIALIZATION ---
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('❌ Missing SUPABASE_URL or SUPABASE_KEY in .env');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false, // We don't need user sessions for this admin tool
  }
});

// --- HELPER FUNCTIONS ---

/**
 * Checks if a slug exists in the Product table.
 * Returns the Product object if found, null otherwise.
 */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('Product')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found code
    console.error('DB Error (getProductBySlug):', error.message);
    return null;
  }
  return data as Product;
}

/**
 * Checks if a specific version exists for a product ID.
 */
export async function getVersion(productId: string, version: string): Promise<ProductVersion | null> {
  const { data, error } = await supabase
    .from('ProductVersion')
    .select('*')
    .eq('productId', productId)
    .eq('versionNumber', version)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    return null;
  }
  return data as ProductVersion;
}