export async function fetchWikipediaImage(topicName: string): Promise<string | null> {
  async function searchWiki(query: string): Promise<string | null> {
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
        query
      )}&prop=pageimages&format=json&pithumbsize=500`;
      const response = await fetch(url);
      const data = await response.json();
      const pages = data?.query?.pages;
      if (!pages) return null;
      const pageId = Object.keys(pages)[0];
      if (pageId === '-1') return null;
      return pages[pageId]?.thumbnail?.source || null;
    } catch (e) {
      return null;
    }
  }

  // 1. Try exact match
  let url = await searchWiki(topicName);
  if (url) return url;

  // 2. Try stripping common fillers if it fails
  const cleaned = topicName
    .replace(/^(Anatomy of|Physiology of|Pathology of|Mechanism of|Management of|Treatment of|Introduction to|Overview of)\s+/i, '')
    .trim();
  
  if (cleaned !== topicName) {
    url = await searchWiki(cleaned);
    if (url) return url;
  }

  // 3. Try searching for the term if it's not a direct title match
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topicName)}&format=json&srlimit=1`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const firstResult = searchData?.query?.search?.[0]?.title;
    if (firstResult) {
      url = await searchWiki(firstResult);
      if (url) return url;
    }
  } catch (e) {
    // ignore
  }

  return null;
}
