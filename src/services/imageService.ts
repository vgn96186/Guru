export async function fetchWikipediaImage(topicName: string): Promise<string | null> {
  const cleaned = topicName
    .replace(
      /^(Anatomy of|Physiology of|Pathology of|Mechanism of|Management of|Treatment of|Introduction to|Overview of)\s+/i,
      '',
    )
    .trim();

  async function searchWiki(query: string): Promise<string | null> {
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(query)}&prop=pageimages&format=json&pithumbsize=500&origin=*`;
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

  // 1. Try exact match & cleaned match
  let url = await searchWiki(topicName);
  if (url) return url;

  if (cleaned !== topicName) {
    url = await searchWiki(cleaned);
    if (url) return url;
  }

  // 2. Wikipedia Search Match
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topicName)}&format=json&srlimit=1&origin=*`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const firstResult = searchData?.query?.search?.[0]?.title;
    if (firstResult) {
      url = await searchWiki(firstResult);
      if (url) return url;
    }
  } catch (e) {
    if (__DEV__) console.debug('[imageService] Fallback search failed:', e);
  }

  // 3. Wikimedia Commons Media (Files directly)
  try {
    const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleaned)}&srnamespace=6&format=json&origin=*&srlimit=1`;
    const commonsRes = await fetch(commonsUrl);
    const commonsData = await commonsRes.json();
    const fileTitle = commonsData?.query?.search?.[0]?.title;

    if (fileTitle) {
      const fileInfoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(fileTitle)}&prop=imageinfo&iiprop=url&iiurlwidth=500&format=json&origin=*`;
      const fileInfoRes = await fetch(fileInfoUrl);
      const fileInfoData = await fileInfoRes.json();
      const pages = fileInfoData?.query?.pages;
      if (pages) {
        const pageId = Object.keys(pages)[0];
        if (pageId !== '-1') {
          return pages[pageId]?.imageinfo?.[0]?.thumburl || null;
        }
      }
    }
  } catch (e) {
    if (__DEV__) console.debug('[imageService] Fallback search failed:', e);
  }

  // 4. Ultimate Fallback: Return null to avoid rendering random irrelevant images.
  return null;
}
