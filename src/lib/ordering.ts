// Tier-1 delivery-app deep links: open each app's search pre-filled with the
// restaurant. No store ID / partnership needed — opens the app if installed,
// web otherwise. (Can't pre-build a cart; that needs a gated partner API.)
export interface OrderingLink {
  label: string;
  href: string;
}

export function getOrderingLinks(name: string, city?: string | null): OrderingLink[] {
  const q = encodeURIComponent([name, city].filter(Boolean).join(' '));
  return [
    { label: 'DoorDash', href: `https://www.doordash.com/search/store/${q}` },
    { label: 'Uber Eats', href: `https://www.ubereats.com/search?q=${q}` },
    { label: 'Grubhub', href: `https://www.grubhub.com/search?queryText=${q}` },
    { label: 'Seamless', href: `https://www.seamless.com/search?queryText=${q}` },
    { label: 'Postmates', href: `https://postmates.com/search?q=${q}` },
  ];
}
