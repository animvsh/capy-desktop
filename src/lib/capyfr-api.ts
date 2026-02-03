/**
 * CapyFR API Integration
 * 
 * Handles lead discovery API integration with:
 * - SSE streaming for real-time leads
 * - Lead search and filtering
 * - ICP (Ideal Customer Profile) matching
 */

import { supabase } from './supabase';

// ============================================================================
// Types
// ============================================================================

export interface Lead {
  id: string;
  name: string;
  email?: string;
  company: string;
  role: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  location?: string;
  industry?: string;
  companySize?: string;
  bio?: string;
  avatar?: string;
  score?: number;
  status: 'new' | 'contacted' | 'replied' | 'converted' | 'archived';
  tags: string[];
  source: 'linkedin' | 'twitter' | 'import' | 'capyfr';
  createdAt: number;
  updatedAt: number;
  lastContactedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface ICP {
  id: string;
  name: string;
  roles: string[];
  industries: string[];
  companySizes: string[];
  locations: string[];
  keywords: string[];
  excludeKeywords: string[];
  minScore?: number;
}

export interface LeadSearchParams {
  query?: string;
  roles?: string[];
  industries?: string[];
  companySizes?: string[];
  locations?: string[];
  minScore?: number;
  status?: Lead['status'][];
  source?: Lead['source'][];
  tags?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'score' | 'createdAt' | 'updatedAt' | 'name' | 'company';
  sortOrder?: 'asc' | 'desc';
}

export interface LeadDiscoveryParams {
  icp?: ICP;
  platform: 'linkedin' | 'twitter';
  searchQuery?: string;
  maxResults?: number;
  onLead?: (lead: Lead) => void;
  onProgress?: (progress: DiscoveryProgress) => void;
  onComplete?: (summary: DiscoverySummary) => void;
  onError?: (error: Error) => void;
}

export interface DiscoveryProgress {
  found: number;
  processed: number;
  matched: number;
  estimatedTotal?: number;
}

export interface DiscoverySummary {
  totalFound: number;
  totalMatched: number;
  duration: number;
  newLeads: number;
  duplicates: number;
}

export interface LeadImportParams {
  file?: File;
  data?: Array<Partial<Lead>>;
  source?: Lead['source'];
  tags?: string[];
  onProgress?: (progress: { current: number; total: number }) => void;
}

export interface LeadImportResult {
  success: boolean;
  imported: number;
  duplicates: number;
  errors: Array<{ row: number; error: string }>;
}

// ============================================================================
// CapyFR API Client
// ============================================================================

const CAPYFR_API_URL = import.meta.env.VITE_CAPYFR_API_URL || 'https://api.capyfr.com';

export class CapyFRClient {
  private abortController: AbortController | null = null;
  private eventSource: EventSource | null = null;

  // --------------------------------------------------------------------------
  // Lead Discovery (SSE Streaming)
  // --------------------------------------------------------------------------

  /**
   * Start lead discovery with real-time streaming
   */
  async startDiscovery(params: LeadDiscoveryParams): Promise<() => void> {
    // Abort any existing discovery
    this.stopDiscovery();

    this.abortController = new AbortController();
    const { icp, platform, searchQuery, maxResults = 100, onLead, onProgress, onComplete, onError } = params;

    const startTime = Date.now();
    let foundCount = 0;
    let matchedCount = 0;
    let newLeadsCount = 0;
    let duplicatesCount = 0;

    try {
      // Get auth token
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      // Build SSE URL with params
      const url = new URL(`${CAPYFR_API_URL}/v1/discover/stream`);
      url.searchParams.set('platform', platform);
      if (searchQuery) url.searchParams.set('query', searchQuery);
      if (maxResults) url.searchParams.set('limit', maxResults.toString());
      if (icp) url.searchParams.set('icp', JSON.stringify(icp));

      // Create EventSource for SSE
      // Note: EventSource doesn't support custom headers, so we use fetch with streaming
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/event-stream',
        },
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Discovery failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'lead') {
                foundCount++;
                const lead = this.transformLead(data.lead, platform);
                
                // Check ICP match
                const isMatch = icp ? this.matchesICP(lead, icp) : true;
                if (isMatch) {
                  matchedCount++;
                  
                  // Check for duplicates
                  const isDuplicate = await this.checkDuplicate(lead);
                  if (isDuplicate) {
                    duplicatesCount++;
                  } else {
                    newLeadsCount++;
                    onLead?.(lead);
                  }
                }

                onProgress?.({
                  found: foundCount,
                  processed: foundCount,
                  matched: matchedCount,
                });
              } else if (data.type === 'progress') {
                onProgress?.({
                  found: data.found || foundCount,
                  processed: data.processed || foundCount,
                  matched: matchedCount,
                  estimatedTotal: data.total,
                });
              } else if (data.type === 'complete') {
                onComplete?.({
                  totalFound: foundCount,
                  totalMatched: matchedCount,
                  duration: Date.now() - startTime,
                  newLeads: newLeadsCount,
                  duplicates: duplicatesCount,
                });
              } else if (data.type === 'error') {
                onError?.(new Error(data.message || 'Discovery error'));
              }
            } catch (e) {
              // Skip malformed JSON lines
            }
          }
        }
      }

      // If we didn't get a complete event, emit one
      onComplete?.({
        totalFound: foundCount,
        totalMatched: matchedCount,
        duration: Date.now() - startTime,
        newLeads: newLeadsCount,
        duplicates: duplicatesCount,
      });

    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        onError?.(error as Error);
      }
    }

    return () => this.stopDiscovery();
  }

  /**
   * Stop ongoing discovery
   */
  stopDiscovery(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.eventSource?.close();
    this.eventSource = null;
  }

  // --------------------------------------------------------------------------
  // Lead CRUD Operations
  // --------------------------------------------------------------------------

  /**
   * Get leads from local database
   */
  async getLeads(params: LeadSearchParams = {}): Promise<{ leads: Lead[]; total: number }> {
    const {
      query,
      roles,
      industries,
      companySizes,
      locations,
      minScore,
      status,
      source,
      tags,
      limit = 50,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params;

    let queryBuilder = supabase
      .from('leads')
      .select('*', { count: 'exact' });

    // Apply filters
    if (query) {
      queryBuilder = queryBuilder.or(`name.ilike.%${query}%,company.ilike.%${query}%,email.ilike.%${query}%`);
    }
    if (roles?.length) {
      queryBuilder = queryBuilder.in('role', roles);
    }
    if (industries?.length) {
      queryBuilder = queryBuilder.in('industry', industries);
    }
    if (companySizes?.length) {
      queryBuilder = queryBuilder.in('company_size', companySizes);
    }
    if (locations?.length) {
      queryBuilder = queryBuilder.in('location', locations);
    }
    if (minScore !== undefined) {
      queryBuilder = queryBuilder.gte('score', minScore);
    }
    if (status?.length) {
      queryBuilder = queryBuilder.in('status', status);
    }
    if (source?.length) {
      queryBuilder = queryBuilder.in('source', source);
    }
    if (tags?.length) {
      queryBuilder = queryBuilder.contains('tags', tags);
    }

    // Apply sorting
    const sortColumn = this.mapSortColumn(sortBy);
    queryBuilder = queryBuilder.order(sortColumn, { ascending: sortOrder === 'asc' });

    // Apply pagination
    queryBuilder = queryBuilder.range(offset, offset + limit - 1);

    const { data, error, count } = await queryBuilder;

    if (error) {
      throw new Error(`Failed to fetch leads: ${error.message}`);
    }

    const leads = (data || []).map(this.dbToLead);
    return { leads, total: count || 0 };
  }

  /**
   * Get a single lead by ID
   */
  async getLead(id: string): Promise<Lead | null> {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to fetch lead: ${error.message}`);
    }

    return this.dbToLead(data);
  }

  /**
   * Create a new lead
   */
  async createLead(lead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>): Promise<Lead> {
    const now = Date.now();
    const dbLead = this.leadToDb({
      ...lead,
      id: '',
      createdAt: now,
      updatedAt: now,
    });

    const { data, error } = await supabase
      .from('leads')
      .insert(dbLead)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create lead: ${error.message}`);
    }

    return this.dbToLead(data);
  }

  /**
   * Update a lead
   */
  async updateLead(id: string, updates: Partial<Lead>): Promise<Lead> {
    const dbUpdates = this.leadToDb({
      ...updates,
      updatedAt: Date.now(),
    } as Lead);

    const { data, error } = await supabase
      .from('leads')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update lead: ${error.message}`);
    }

    return this.dbToLead(data);
  }

  /**
   * Delete a lead
   */
  async deleteLead(id: string): Promise<void> {
    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete lead: ${error.message}`);
    }
  }

  /**
   * Bulk update leads
   */
  async bulkUpdateLeads(ids: string[], updates: Partial<Lead>): Promise<number> {
    const dbUpdates = this.leadToDb({
      ...updates,
      updatedAt: Date.now(),
    } as Lead);

    const { error, count } = await supabase
      .from('leads')
      .update(dbUpdates)
      .in('id', ids);

    if (error) {
      throw new Error(`Failed to bulk update leads: ${error.message}`);
    }

    return count || 0;
  }

  /**
   * Bulk delete leads
   */
  async bulkDeleteLeads(ids: string[]): Promise<number> {
    const { error, count } = await supabase
      .from('leads')
      .delete()
      .in('id', ids);

    if (error) {
      throw new Error(`Failed to bulk delete leads: ${error.message}`);
    }

    return count || 0;
  }

  // --------------------------------------------------------------------------
  // Lead Import
  // --------------------------------------------------------------------------

  /**
   * Import leads from CSV/JSON file or data array
   */
  async importLeads(params: LeadImportParams): Promise<LeadImportResult> {
    const { file, data, source = 'import', tags = [], onProgress } = params;

    let leads: Array<Partial<Lead>> = [];

    if (file) {
      leads = await this.parseFile(file);
    } else if (data) {
      leads = data;
    } else {
      return { success: false, imported: 0, duplicates: 0, errors: [{ row: 0, error: 'No data provided' }] };
    }

    const errors: Array<{ row: number; error: string }> = [];
    let imported = 0;
    let duplicates = 0;

    for (let i = 0; i < leads.length; i++) {
      const leadData = leads[i];
      onProgress?.({ current: i + 1, total: leads.length });

      try {
        // Validate required fields
        if (!leadData.name || !leadData.company) {
          errors.push({ row: i + 1, error: 'Missing required fields (name, company)' });
          continue;
        }

        // Check for duplicates
        const isDuplicate = await this.checkDuplicate(leadData as Lead);
        if (isDuplicate) {
          duplicates++;
          continue;
        }

        // Create lead
        await this.createLead({
          name: leadData.name,
          company: leadData.company,
          role: leadData.role || '',
          email: leadData.email,
          linkedinUrl: leadData.linkedinUrl,
          twitterUrl: leadData.twitterUrl,
          location: leadData.location,
          industry: leadData.industry,
          companySize: leadData.companySize,
          bio: leadData.bio,
          avatar: leadData.avatar,
          score: leadData.score,
          status: leadData.status || 'new',
          tags: [...(leadData.tags || []), ...tags],
          source,
          metadata: leadData.metadata,
        });

        imported++;
      } catch (error) {
        errors.push({ row: i + 1, error: (error as Error).message });
      }
    }

    return {
      success: errors.length === 0,
      imported,
      duplicates,
      errors,
    };
  }

  // --------------------------------------------------------------------------
  // ICP Operations
  // --------------------------------------------------------------------------

  /**
   * Get all ICPs
   */
  async getICPs(): Promise<ICP[]> {
    const { data, error } = await supabase
      .from('icps')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch ICPs: ${error.message}`);
    }

    return (data || []).map(this.dbToICP);
  }

  /**
   * Create an ICP
   */
  async createICP(icp: Omit<ICP, 'id'>): Promise<ICP> {
    const { data, error } = await supabase
      .from('icps')
      .insert(this.icpToDb(icp as ICP))
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create ICP: ${error.message}`);
    }

    return this.dbToICP(data);
  }

  /**
   * Update an ICP
   */
  async updateICP(id: string, updates: Partial<ICP>): Promise<ICP> {
    const { data, error } = await supabase
      .from('icps')
      .update(this.icpToDb(updates as ICP))
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update ICP: ${error.message}`);
    }

    return this.dbToICP(data);
  }

  /**
   * Delete an ICP
   */
  async deleteICP(id: string): Promise<void> {
    const { error } = await supabase
      .from('icps')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete ICP: ${error.message}`);
    }
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  private transformLead(rawLead: Record<string, unknown>, platform: string): Lead {
    return {
      id: `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: (rawLead.name as string) || '',
      email: rawLead.email as string,
      company: (rawLead.company as string) || '',
      role: (rawLead.title || rawLead.role) as string || '',
      linkedinUrl: platform === 'linkedin' ? (rawLead.profileUrl as string) : undefined,
      twitterUrl: platform === 'twitter' ? (rawLead.profileUrl as string) : undefined,
      location: rawLead.location as string,
      industry: rawLead.industry as string,
      companySize: rawLead.companySize as string,
      bio: rawLead.bio as string,
      avatar: rawLead.avatar as string,
      score: rawLead.score as number,
      status: 'new',
      tags: [],
      source: 'capyfr',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: rawLead.metadata as Record<string, unknown>,
    };
  }

  private matchesICP(lead: Lead, icp: ICP): boolean {
    // Check roles
    if (icp.roles.length > 0) {
      const leadRole = lead.role.toLowerCase();
      const matches = icp.roles.some(role => leadRole.includes(role.toLowerCase()));
      if (!matches) return false;
    }

    // Check industries
    if (icp.industries.length > 0 && lead.industry) {
      const leadIndustry = lead.industry.toLowerCase();
      const matches = icp.industries.some(ind => leadIndustry.includes(ind.toLowerCase()));
      if (!matches) return false;
    }

    // Check company sizes
    if (icp.companySizes.length > 0 && lead.companySize) {
      if (!icp.companySizes.includes(lead.companySize)) return false;
    }

    // Check locations
    if (icp.locations.length > 0 && lead.location) {
      const leadLocation = lead.location.toLowerCase();
      const matches = icp.locations.some(loc => leadLocation.includes(loc.toLowerCase()));
      if (!matches) return false;
    }

    // Check keywords
    if (icp.keywords.length > 0) {
      const leadText = `${lead.name} ${lead.bio || ''} ${lead.company}`.toLowerCase();
      const matches = icp.keywords.some(kw => leadText.includes(kw.toLowerCase()));
      if (!matches) return false;
    }

    // Check exclude keywords
    if (icp.excludeKeywords.length > 0) {
      const leadText = `${lead.name} ${lead.bio || ''} ${lead.company}`.toLowerCase();
      const excluded = icp.excludeKeywords.some(kw => leadText.includes(kw.toLowerCase()));
      if (excluded) return false;
    }

    // Check min score
    if (icp.minScore !== undefined && lead.score !== undefined) {
      if (lead.score < icp.minScore) return false;
    }

    return true;
  }

  private async checkDuplicate(lead: Lead): Promise<boolean> {
    // Check by email or LinkedIn URL
    let query = supabase.from('leads').select('id');

    if (lead.email) {
      query = query.eq('email', lead.email);
    } else if (lead.linkedinUrl) {
      query = query.eq('linkedin_url', lead.linkedinUrl);
    } else if (lead.twitterUrl) {
      query = query.eq('twitter_url', lead.twitterUrl);
    } else {
      // Check by name + company
      query = query.eq('name', lead.name).eq('company', lead.company);
    }

    const { data } = await query.limit(1);
    return (data?.length || 0) > 0;
  }

  private async parseFile(file: File): Promise<Array<Partial<Lead>>> {
    const text = await file.text();
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'json') {
      return JSON.parse(text);
    } else if (ext === 'csv') {
      return this.parseCSV(text);
    }

    throw new Error(`Unsupported file type: ${ext}`);
  }

  private parseCSV(text: string): Array<Partial<Lead>> {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const leads: Array<Partial<Lead>> = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const lead: Partial<Lead> = {};

      headers.forEach((header, index) => {
        const value = values[index];
        if (!value) return;

        switch (header) {
          case 'name': lead.name = value; break;
          case 'email': lead.email = value; break;
          case 'company': lead.company = value; break;
          case 'role':
          case 'title': lead.role = value; break;
          case 'linkedin':
          case 'linkedin_url':
          case 'linkedinurl': lead.linkedinUrl = value; break;
          case 'twitter':
          case 'twitter_url':
          case 'twitterurl': lead.twitterUrl = value; break;
          case 'location': lead.location = value; break;
          case 'industry': lead.industry = value; break;
          case 'company_size':
          case 'companysize': lead.companySize = value; break;
          case 'bio': lead.bio = value; break;
        }
      });

      leads.push(lead);
    }

    return leads;
  }

  private mapSortColumn(sortBy: string): string {
    const map: Record<string, string> = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      name: 'name',
      company: 'company',
      score: 'score',
    };
    return map[sortBy] || 'created_at';
  }

  // Database transformation helpers
  private dbToLead(row: Record<string, unknown>): Lead {
    return {
      id: row.id as string,
      name: row.name as string,
      email: row.email as string | undefined,
      company: row.company as string,
      role: row.role as string,
      linkedinUrl: row.linkedin_url as string | undefined,
      twitterUrl: row.twitter_url as string | undefined,
      location: row.location as string | undefined,
      industry: row.industry as string | undefined,
      companySize: row.company_size as string | undefined,
      bio: row.bio as string | undefined,
      avatar: row.avatar as string | undefined,
      score: row.score as number | undefined,
      status: row.status as Lead['status'],
      tags: (row.tags as string[]) || [],
      source: row.source as Lead['source'],
      createdAt: new Date(row.created_at as string).getTime(),
      updatedAt: new Date(row.updated_at as string).getTime(),
      lastContactedAt: row.last_contacted_at ? new Date(row.last_contacted_at as string).getTime() : undefined,
      metadata: row.metadata as Record<string, unknown> | undefined,
    };
  }

  private leadToDb(lead: Lead): Record<string, unknown> {
    return {
      name: lead.name,
      email: lead.email,
      company: lead.company,
      role: lead.role,
      linkedin_url: lead.linkedinUrl,
      twitter_url: lead.twitterUrl,
      location: lead.location,
      industry: lead.industry,
      company_size: lead.companySize,
      bio: lead.bio,
      avatar: lead.avatar,
      score: lead.score,
      status: lead.status,
      tags: lead.tags,
      source: lead.source,
      last_contacted_at: lead.lastContactedAt ? new Date(lead.lastContactedAt).toISOString() : null,
      metadata: lead.metadata,
    };
  }

  private dbToICP(row: Record<string, unknown>): ICP {
    return {
      id: row.id as string,
      name: row.name as string,
      roles: (row.roles as string[]) || [],
      industries: (row.industries as string[]) || [],
      companySizes: (row.company_sizes as string[]) || [],
      locations: (row.locations as string[]) || [],
      keywords: (row.keywords as string[]) || [],
      excludeKeywords: (row.exclude_keywords as string[]) || [],
      minScore: row.min_score as number | undefined,
    };
  }

  private icpToDb(icp: ICP): Record<string, unknown> {
    return {
      name: icp.name,
      roles: icp.roles,
      industries: icp.industries,
      company_sizes: icp.companySizes,
      locations: icp.locations,
      keywords: icp.keywords,
      exclude_keywords: icp.excludeKeywords,
      min_score: icp.minScore,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const capyfrClient = new CapyFRClient();
export default capyfrClient;
