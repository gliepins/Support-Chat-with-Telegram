"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCodename = generateCodename;
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
function randomFrom(list) {
    return list[Math.floor(Math.random() * list.length)];
}
function randomTag() {
    return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .toUpperCase()
        .slice(-4);
}
function generateCodename() {
    return `${randomFrom(ADJECTIVES)} ${randomFrom(ANIMALS)} #${randomTag()}`;
}
//# sourceMappingURL=codename.js.map