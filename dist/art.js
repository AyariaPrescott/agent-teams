/* Generated raster assets are bundled locally; standalone HTML embeds these URLs. */
(function (root) {
  'use strict';
  const base=typeof document!=='undefined'?(document.currentScript?.src||document.baseURI):null;
  const paths={
    forest: 'assets/tree-sea-survey-v1.png',
    scene: 'assets/ashen-hall.png',
    map: 'assets/route-parchment.png',
    hero: 'assets/lantern-wanderer.png',
    sentinel: 'assets/moss-sentinel.png',
    elite: 'assets/thorn-executioner.png',
    boss: 'assets/ash-crown.png',
    cards: 'assets/card-atlas.png',
    rooms: 'assets/room-atlas.png',
    enemies: 'assets/enemy-atlas.png',
    cardsExtra: 'assets/expansion-card-atlas.png'
  };
  root.EmberArt=Object.freeze(Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,base&&!path.startsWith('data:')?new URL(path,base).href:path])));
})(typeof globalThis !== 'undefined' ? globalThis : this);
