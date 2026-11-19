// Safehouses: three buyable homes that make Solmar City Mara's. Each has
// a door on the street — walk up and press E to buy it, then E again to
// step inside. Inside is a small furnished room built right behind the
// door (bed, table, lamp, rug) where the street noise drops away. The
// last house Mara steps into becomes her respawn point: after a WASTED
// trip to the hospital, the next one wakes her up at home instead. Owned
// houses and the respawn choice are saved with the game.
import * as THREE from 'three';
import { VILLA_POS } from './island.js';
import { formatMoney } from './utils.js';

export const HOUSES = [
  { id: 'hut', name: 'Beach Hut', price: 1500, door: { x: -93, z: 205 }, room: { x: -77, z: 205 }, wall: 0xf2e3c9, roof: 0xc96f5a },
  { id: 'loft', name: 'Downtown Loft', price: 4000, door: { x: 93, z: -93 }, room: { x: 109, z: -93 }, wall: 0x7fb3c8, roof: 0x2e3438 },
  { id: 'villa', name: 'Island Villa', price: 8000, door: { x: VILLA_POS.x, z: VILLA_POS.z }, room: { x: VILLA_POS.x + 16, z: VILLA_POS.z }, wall: 0xe6d7b8, roof: 0x3fae6a },
  // Phase 7: the Lighthouse Cottage — the priciest roof in Solmar, a stone's throw from the lighthouse on the island's south shore.
  { id: 'cottage', name: 'Lighthouse Cottage', price: 12000, door: { x: 140, z: 420 }, room: { x: 152, z: 420 }, wall: 0xd9a441, roof: 0xd23b3b },
];

const ROOM_W = 11;
const ROOM_D = 8;

/** One mesh, positioned and added — the house builder's shorthand. */
function box(parent, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export function createHousing(scene) {
  const housing = {
    owned: [], // house ids
    inside: null, // house id Mara is currently inside, or null
    respawn: null, // { x, z } of the last house entered
    lastBought: '',
  };

  // Build each house exterior and its furnished interior room. The room
  // sits a few metres behind the door so entering is a short step through
  // the wall gap — no loading, no teleport across the map.
  for (const house of HOUSES) {
    const wallMat = new THREE.MeshLambertMaterial({ color: house.wall });
    const roofMat = new THREE.MeshLambertMaterial({ color: house.roof });
    box(scene, new THREE.BoxGeometry(9, 5, 8), wallMat, house.door.x, 2.5, house.door.z - 8);
    const roof = box(scene, new THREE.ConeGeometry(7.2, 3, 4), roofMat, house.door.x, 6.4, house.door.z - 8);
    roof.rotation.y = Math.PI / 4;
    // The door itself: a dark slab with a gold knob, facing the street.
    box(scene, new THREE.BoxGeometry(2.2, 3.4, 0.3), new THREE.MeshLambertMaterial({ color: 0x5a4028 }), house.door.x, 1.7, house.door.z - 3.9);
    box(scene, new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd23f }), house.door.x + 0.8, 1.7, house.door.z - 3.7);
    // Price board beside the door until the house is bought.
    house._board = box(scene, new THREE.BoxGeometry(2.6, 1.4, 0.15), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }), house.door.x + 3.4, 2.2, house.door.z - 3.9);

    // The interior room: floor, three walls + a low front wall with a
    // doorway gap, a flat roof, and furniture.
    const room = new THREE.Group();
    box(room, new THREE.BoxGeometry(ROOM_W, 0.3, ROOM_D), new THREE.MeshLambertMaterial({ color: 0x8a6a45 }), 0, 0.15, 0);
    const wallH = 3.6;
    const mkWall = (w, d, x, z) => box(room, new THREE.BoxGeometry(w, wallH, d), wallMat, x, wallH / 2, z);
    mkWall(ROOM_W, 0.4, 0, -ROOM_D / 2);
    mkWall(ROOM_W, 0.4, 0, ROOM_D / 2);
    mkWall(0.4, ROOM_D, -ROOM_W / 2, 0);
    mkWall(0.4, ROOM_D, ROOM_W / 2, 0);
    box(room, new THREE.BoxGeometry(ROOM_W + 0.6, 0.3, ROOM_D + 0.6), new THREE.MeshLambertMaterial({ color: house.roof }), 0, wallH + 0.15, 0);
    // Bed, table, lamp and rug — the whole flat in four boxes.
    box(room, new THREE.BoxGeometry(2.2, 0.7, 4.4), new THREE.MeshLambertMaterial({ color: 0xd23b3b }), -ROOM_W / 2 + 1.8, 0.65, -1);
    box(room, new THREE.BoxGeometry(2.6, 0.25, 1.6), new THREE.MeshLambertMaterial({ color: 0x5a4028 }), 1.6, 1.0, 1.6);
    box(room, new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }), 1.6, 2.6, 1.6);
    box(room, new THREE.BoxGeometry(4, 0.08, 3), new THREE.MeshLambertMaterial({ color: 0x8a5fc0 }), 0, 0.34, 0);
    room.position.set(house.room.x, 0, house.room.z);
    scene.add(room);
    house._room = room;
  }

  /** The house whose door Mara stands at (within 5m), or null. */
  function doorAt(pos) {
    for (const house of HOUSES) {
      if (Math.hypot(pos.x - house.door.x, pos.z - house.door.z) < 5) return house;
    }
    return null;
  }

  function isOwned(house) {
    return housing.owned.includes(house.id);
  }

  /**
   * Buy a house. Returns the price paid, or -1 when it cannot be bought
   * (already owned, or not enough cash — the caller checks the money).
   */
  function buy(house, money) {
    if (!house || isOwned(house)) return -1;
    if (money < house.price) return -1;
    housing.owned.push(house.id);
    housing.lastBought = house.name;
    if (house._board) house._board.visible = false;
    return house.price;
  }

  /** Step inside an owned house: returns the room position, or null. */
  function enter(pos) {
    const house = doorAt(pos);
    if (!house || !isOwned(house)) return null;
    housing.inside = house.id;
    housing.respawn = { x: house.room.x, z: house.room.z };
    return { x: house.room.x, z: house.room.z, name: house.name };
  }

  /** Step back out to the door. Returns the door position, or null. */
  function exit() {
    if (!housing.inside) return null;
    const house = HOUSES.find((h) => h.id === housing.inside);
    housing.inside = null;
    if (!house) return null;
    return { x: house.door.x, z: house.door.z + 2, name: house.name };
  }

  /** Where Mara wakes up after a WASTED trip (null = the hospital). */
  function respawnPoint() {
    return housing.respawn;
  }

  function ownedCount() {
    return housing.owned.length;
  }

  function statusText() {
    if (housing.inside) {
      const house = HOUSES.find((h) => h.id === housing.inside);
      return `Home — ${house ? house.name : ''} · E to step out`;
    }
    if (housing.owned.length > 0) {
      return `Safehouses ${housing.owned.length}/${HOUSES.length} owned${housing.respawn ? ' · respawn: home' : ''}`;
    }
    return '';
  }

  function promptText(house) {
    if (!house) return '';
    if (isOwned(house)) return `E — step inside the ${house.name}`;
    return `E — buy the ${house.name} · ${formatMoney(house.price)}`;
  }

  /** Minimap markers: gold doors for owned houses, white for sale. */
  function markers() {
    return HOUSES.map((h) => ({
      x: h.door.x,
      z: h.door.z,
      color: isOwned(h) ? '#ffd23f' : '#ffffff',
      shape: 'square',
      r: 4,
    }));
  }

  function saveData() {
    return { owned: housing.owned.slice(), respawn: housing.respawn };
  }

  function restore(data) {
    if (!data) return;
    if (Array.isArray(data.owned)) {
      housing.owned = data.owned.filter((id) => HOUSES.some((h) => h.id === id));
      for (const house of HOUSES) {
        if (isOwned(house) && house._board) house._board.visible = false;
      }
    }
    if (data.respawn && typeof data.respawn.x === 'number') housing.respawn = data.respawn;
  }

  Object.assign(housing, { doorAt, isOwned, buy, enter, exit, respawnPoint, ownedCount, statusText, promptText, markers, saveData, restore });
  return housing;
}
