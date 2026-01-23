"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCanonicalProviderChain = getCanonicalProviderChain;
const PROVIDER_EQUIVALENCE_GROUPS = [
    ['google-mail-ynxw', 'google-mail', 'gmail'],
    ['salesforce-ybzg', 'salesforce-2', 'salesforce']
];
function getCanonicalProviderChain(provider) {
    if (!provider)
        return [];
    const normalized = provider.trim().toLowerCase();
    for (const group of PROVIDER_EQUIVALENCE_GROUPS) {
        const lowerGroup = group.map(entry => entry.toLowerCase());
        if (lowerGroup.includes(normalized)) {
            return lowerGroup;
        }
    }
    return [normalized];
}
