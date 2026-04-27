import type { WebSearchProviderId, UserProfile } from '../../types';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet?: string;
  source?: string;
  publishedAt?: string;
  provider: WebSearchProviderId;
}

export interface WebSearchParams {
  query: string;
  maxResults?: number;
  profile: UserProfile;
}

export interface ImageSearchResult {
  title: string;
  url: string;
  thumbnailUrl?: string;
  source?: string;
  provider: WebSearchProviderId;
}

export interface ImageSearchParams {
  query: string;
  maxResults?: number;
  profile: UserProfile;
}

export interface WebSearchProvider {
  id: WebSearchProviderId;
  searchText(params: WebSearchParams): Promise<WebSearchResult[]>;
  searchImages?(params: ImageSearchParams): Promise<ImageSearchResult[]>;
}
