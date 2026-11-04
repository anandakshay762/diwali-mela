import * as THREE from 'three';
import { rand, pick } from './utils.js';

const MAX = 900;

/** Small solid bits with gravity: crumbs, confetti, balloon scraps, steam puffs. */
export class Debris {
  constructor(scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6 }), MAX);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(1);
    scene.add(this.mesh);
    this.p = Array.from({ length: MAX }, () => ({
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      rot: new THREE.Euler(),
      spin: new THREE.Vector3(),
      scale: new THREE.Vector3(),
      life: 0,
      max: 0,
      gravity: 9.8,
      floor: 0,
    }));
    this.next = 0;
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) {
      this.mesh.setMatrixAt(i, zero);
      this.mesh.setColorAt(i, this.color.set(0xffffff));
    }
  }

  burst(at, { count = 20, colors = [0xffffff], speed = 2.5, up = 1.5, size = 0.04, life = 1.4, gravity = 9.8, floor = 0, flat = false } = {}) {
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const q = this.p[i];
      q.pos.copy(at);
      const a = rand(0, Math.PI * 2);
      const s = rand(0.3, 1) * speed;
      q.vel.set(Math.cos(a) * s, rand(0.3, 1) * up, Math.sin(a) * s);
      q.rot.set(rand(0, 6), rand(0, 6), rand(0, 6));
      q.spin.set(rand(-12, 12), rand(-12, 12), rand(-12, 12));
      const sz = size * rand(0.7, 1.3);
      q.scale.set(sz, flat ? sz * 0.15 : sz, flat ? sz * 0.7 : sz);
      q.life = 0;
      q.max = life * rand(0.7, 1.2);
      q.gravity = gravity;
      q.floor = floor;
      this.mesh.setColorAt(i, this.color.set(pick(colors)));
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    const d = this.dummy;
    for (let i = 0; i < MAX; i++) {
      const q = this.p[i];
      if (q.max === 0) continue;
      q.life += dt;
      if (q.life >= q.max) {
        q.max = 0;
        d.scale.set(0, 0, 0);
        d.updateMatrix();
        this.mesh.setMatrixAt(i, d.matrix);
        continue;
      }
      q.vel.y -= q.gravity * dt;
      q.vel.multiplyScalar(1 - Math.min(1, dt * 0.8));
      q.pos.addScaledVector(q.vel, dt);
      if (q.pos.y < q.floor) {
        q.pos.y = q.floor;
        q.vel.set(q.vel.x * 0.4, Math.abs(q.vel.y) * 0.25, q.vel.z * 0.4);
        q.spin.multiplyScalar(0.5);
      }
      q.rot.x += q.spin.x * dt;
      q.rot.y += q.spin.y * dt;
      q.rot.z += q.spin.z * dt;
      const fade = Math.min(1, (q.max - q.life) / (q.max * 0.3));
      d.position.copy(q.pos);
      d.rotation.copy(q.rot);
      d.scale.copy(q.scale).multiplyScalar(fade);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
