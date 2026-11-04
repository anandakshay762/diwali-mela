import * as THREE from 'three';

/*
  Phones can't compile a lit shader for ~60 dynamic lights: their GPUs allow far fewer uniforms,
  and when the shader fails every lit object (people, stalls, the ground) silently vanishes.
  The pool hides all the scene's point and spot lights from the renderer (visible = false keeps
  them in the hierarchy, so moving ones like the boat's lantern still have a world position) and
  drives a small, fixed set of real lights from whichever originals matter most near the player.
  The light count never changes, so shaders compile once and stay valid.
*/
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();

export class LightPool {
  constructor(scene, focus, { points = 8, spots = 2 } = {}) {
    this.focus = focus; // () => Vector3, where the player is
    this.src = { point: [], spot: [] };
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (o.isPointLight) this.src.point.push(o);
      else if (o.isSpotLight) this.src.spot.push(o);
    });
    for (const o of [...this.src.point, ...this.src.spot]) o.visible = false;
    this.proxies = {
      point: Array.from({ length: points }, () => new THREE.PointLight(0xffffff, 0, 0, 2)),
      spot: Array.from({ length: spots }, () => {
        const s = new THREE.SpotLight(0xffffff, 0, 0, 0.5, 0.5, 1);
        scene.add(s.target);
        return s;
      }),
    };
    for (const l of [...this.proxies.point, ...this.proxies.spot]) scene.add(l);
    this.cand = [];
  }

  get count() {
    return this.src.point.length + this.src.spot.length;
  }

  pick(kind, f) {
    const cand = this.cand;
    cand.length = 0;
    for (const o of this.src[kind]) {
      if (!(o.intensity > 0)) continue;
      // a hidden parent (a parked car's headlight group, say) means the light is off
      let shown = true;
      for (let p = o.parent; p; p = p.parent) if (!p.visible) shown = false;
      if (!shown) continue;
      o.getWorldPosition(_p);
      const d = _p.distanceTo(f);
      if (o.distance > 0 && d > o.distance + 25) continue; // can't reach anything near us
      cand.push({ o, score: o.intensity / (1 + d * d), x: _p.x, y: _p.y, z: _p.z });
    }
    cand.sort((a, b) => b.score - a.score);
    return cand;
  }

  update() {
    const f = this.focus();
    for (const kind of ['point', 'spot']) {
      const chosen = this.pick(kind, f);
      this.proxies[kind].forEach((l, i) => {
        const c = chosen[i];
        if (!c) {
          l.intensity = 0;
          return;
        }
        const o = c.o;
        l.position.set(c.x, c.y, c.z);
        l.color.copy(o.color);
        l.intensity = o.intensity;
        l.distance = o.distance;
        l.decay = o.decay;
        if (kind === 'spot') {
          l.angle = o.angle;
          l.penumbra = o.penumbra;
          o.target.getWorldPosition(_t);
          l.target.position.copy(_t);
          l.target.updateMatrixWorld();
        }
      });
    }
  }
}
