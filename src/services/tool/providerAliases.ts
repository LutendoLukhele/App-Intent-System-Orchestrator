const PROVIDER_EQUIVALENCE_GROUPS: string[][] = [
  ['google-mail-ynxw', 'google-mail', 'gmail'],
  ['salesforce-ybzg', 'salesforce-2', 'salesforce']
];

export function getCanonicalProviderChain(provider?: string | null): string[] {
  if (!provider) return [];

  const normalized = provider.trim().toLowerCase();
  for (const group of PROVIDER_EQUIVALENCE_GROUPS) {
    const lowerGroup = group.map(entry => entry.toLowerCase());
    if (lowerGroup.includes(normalized)) {
      return lowerGroup;
    }
  }

  return [normalized];
}
