/** Client-side framing strip for when a resolved image URL fails to load in the UI. */
export function stripImageFraming(text: string): string {
  const IMAGE_TYPES =
    'image|imaging study|photograph|micrograph|radiograph|X-ray|CT scan|MRI|ECG|histology|slide|smear|specimen|scan|film';
  return text
    .replace(
      new RegExp(
        `\\b(Based on|Referring to|Looking at|In|From|Examining) the (${IMAGE_TYPES}) (shown|displayed|provided|above|below|here|given)[.,]?\\s*`,
        'gi',
      ),
      '',
    )
    .replace(
      new RegExp(
        `\\b(Based on|Referring to|Looking at|In) the (provided|given|following) (${IMAGE_TYPES})[.,]?\\s*`,
        'gi',
      ),
      '',
    )
    .replace(
      new RegExp(
        `The following (${IMAGE_TYPES}) (demonstrates|shows|reveals|depicts|illustrates)[.:]?\\s*`,
        'gi',
      ),
      '',
    )
    .replace(
      new RegExp(
        `As (shown|seen|depicted|demonstrated|illustrated) in the (${IMAGE_TYPES})[.,]?\\s*`,
        'gi',
      ),
      '',
    )
    .replace(
      new RegExp(
        `The (${IMAGE_TYPES}) (shows|reveals|demonstrates|depicts|illustrates)[.:]?\\s*`,
        'gi',
      ),
      '',
    )
    .replace(new RegExp(`Consider the following (${IMAGE_TYPES})[.:]?\\s*`, 'gi'), '')
    .replace(
      new RegExp(
        `A (${IMAGE_TYPES}) (of this patient|of the patient)? ?(shows|reveals|demonstrates|depicts)[.:]?\\s*`,
        'gi',
      ),
      '',
    )
    .replace(/^\s*[,.:;]\s*/, '')
    .replace(/^([a-z])/, (c) => c.toUpperCase());
}
