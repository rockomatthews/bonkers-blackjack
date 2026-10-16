export const ROOMS = {
  "bonkers-room": { name:"The Bonkers Room", image: "/pokerRoom.png", label: "Orbital", description: "Orbital lounge above Earth with seven blackjack seats" },
  "midnight-lounge": { name:"Midnight Lounge", image: "/rooms/nightclub.png", label: "After hours", description: "Velvet nightclub lounge with seven blackjack seats" },
  "high-society": { name:"Carnival Club", image: "/rooms/carnival.png", label: "Carnival", description: "Crowded cartoon carnival with seven blackjack seats" },
} as const;
export function roomArt(id: string) { return ROOMS[id as keyof typeof ROOMS] ?? ROOMS["bonkers-room"]; }

export type RoomId=keyof typeof ROOMS;
