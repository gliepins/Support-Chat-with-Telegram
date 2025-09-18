const ADJECTIVES = [
  'Blue',
  'Crimson',
  'Golden',
  'Silver',
  'Emerald',
  'Violet',
  'Azure',
  'Scarlet',
  'Amber',
  'Ivory',
];

const ANIMALS = [
  'Lion',
  'Falcon',
  'Wolf',
  'Panther',
  'Otter',
  'Badger',
  'Hawk',
  'Tiger',
  'Puma',
  'Fox',
];

function randomFrom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)] as T;
}

function randomTag(): string {
  return Math.floor((1 + Math.random()) * 0x10000)
    .toString(16)
    .toUpperCase()
    .slice(-4);
}

export function generateCodename(): string {
  return `${randomFrom(ADJECTIVES)} ${randomFrom(ANIMALS)} #${randomTag()}`;
}


