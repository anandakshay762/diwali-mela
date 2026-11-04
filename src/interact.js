import * as THREE from 'three';
import { hdr } from './utils.js';

const _p = new THREE.Vector3();
const _m = new THREE.Vector3();

/**
 * Sketchbook-style "press E" interactions. Anything in the mela registers a spot; the nearest one
 * the player is facing gets a floating marker and the on-screen prompt.
 */
export class Interactions {
  constructor(scene) {
    this.list = [];
    this.active = null;
    this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), new THREE.MeshBasicMaterial({ color: hdr(0xffc94a, 2.2) }));
    this.marker.scale.y = 1.5;
    this.marker.visible = false;
    scene.add(this.marker);
  }

  /** def: { pos, label, action, radius?, enabled?, markAt? (where the marker floats), markerHeight? } */
  add(def) {
    def.radius ??= 2.4;
    this.list.push(def);
    return def;
  }

  remove(def) {
    const i = this.list.indexOf(def);
    if (i >= 0) this.list.splice(i, 1);
  }

  label(def) {
    return typeof def.label === 'function' ? def.label() : def.label;
  }

  update(t, player, enabled) {
    let best = null;
    let bestScore = Infinity;
    let bestPos = null;
    if (enabled) {
      const hx = Math.sin(player.heading);
      const hz = Math.cos(player.heading);
      for (const d of this.list) {
        if (d.enabled && !d.enabled()) continue;
        const p = typeof d.pos === 'function' ? d.pos(_p) : d.pos;
        const dx = p.x - player.pos.x;
        const dz = p.z - player.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > d.radius) continue;
        const facing = dist > 0.01 ? (dx * hx + dz * hz) / dist : 1;
        const score = dist + (1 - facing) * 0.8;
        if (score < bestScore) {
          bestScore = score;
          best = d;
          bestPos = (typeof d.markAt === 'function' ? d.markAt(_m) : d.markAt ?? p).clone();
        }
      }
    }
    this.active = best;
    this.marker.visible = !!best;
    if (best) {
      this.marker.position.set(bestPos.x, bestPos.y + (best.markerHeight ?? 2.5) + Math.sin(t * 3) * 0.08, bestPos.z);
      this.marker.rotation.y = t * 2;
    }
    return best;
  }
}
