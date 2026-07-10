const PALETTE = [
  '#2563eb',
  '#7c3aed',
  '#d97706',
  '#16a34a',
  '#dc2626',
  '#0891b2',
  '#db2777',
  '#4f46e5',
]

export function avatarColor(name) {
  if (!name) return PALETTE[0]
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

export function avatarInitial(name) {
  return name ? name.trim().charAt(0).toUpperCase() : '?'
}
