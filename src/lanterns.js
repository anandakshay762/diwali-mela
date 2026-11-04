import * as THREE from 'three';
import { canvasTexture, rand } from './utils.js';

const AMBIENT = 110;

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = '600 40px Poppins, sans-serif';
  ctx.font = font;
  const w = Math.ceil(Math.min(1400, ctx.measureText(text).width + 64));
  const h = 84;
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  ctx.fillStyle = 'rgba(40, 10, 30, 0.55)';
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 40);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255, 140, 30, 0.9)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#fff3d6';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xb0b0b0, transparent: true, depthWrite: false, fog: false }));
  sprite.scale.set((w / h) * 0.42, 0.42, 1);
  return sprite;
}

/** Sky lanterns: a steady stream rising beyond the river, plus the visitor's own wish lanterns. */
export class Lanterns {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    const tex = canvasTexture(64, 128, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#9b2d00');
      g.addColorStop(0.45, '#ff8a1c');
      g.addColorStop(0.85, '#ffd36b');
      g.addColorStop(1, '#fff4c2');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(120, 40, 0, 0.35)';
      ctx.lineWidth = 2;
      for (let x = 0; x < w; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
    });
    this.geo = new THREE.CylinderGeometry(0.42, 0.3, 0.95, 16, 1, true);
    this.mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(2.4, 2.1, 1.8), side: THREE.DoubleSide, fog: false });
    // the visitor's own lantern is seen up close, so it glows more gently
    this.nearMat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.15, 1.0, 0.85), side: THREE.DoubleSide });

    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, AMBIENT);
    this.mesh.frustumCulled = false;
    this.state = Array.from({ length: AMBIENT }, () => this.respawn({}, true));
    scene.add(this.mesh);

    this.mine = [];
    this.dummy = new THREE.Object3D();
  }

  respawn(s, initial) {
    s.x = rand(-170, 170);
    s.z = rand(-280, -80);
    s.y = initial ? rand(0, 150) : rand(-3, 0);
    s.speed = rand(0.9, 1.8);
    s.phase = rand(0, 100);
    s.scale = rand(0.9, 1.3);
    return s;
  }

  /** Releases a wish lantern just in front of the player's avatar. */
  releaseFrom(player, text) {
    const fwd = player.forward();
    const p = player.headWorld(new THREE.Vector3()).addScaledVector(fwd, 1.4);
    this.releaseAt(p.x, p.y, p.z, fwd.x, fwd.z, text);
    return { pos: p, dir: fwd };
  }

  /** A lantern rising from a point (used for other visitors' wishes too). */
  releaseAt(x, y, z, dx, dz, text) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.geo, this.nearMat));
    const label = makeLabel(text);
    label.position.y = 0.95;
    g.add(label);
    g.position.set(x, y, z);
    this.scene.add(g);
    this.mine.push({ g, label, age: 0, vy: 0.35, drift: new THREE.Vector3(dx, 0, dz).multiplyScalar(0.5), phase: rand(0, 10) });
  }

  update(dt, t) {
    const d = this.dummy;
    for (let i = 0; i < AMBIENT; i++) {
      const s = this.state[i];
      s.y += s.speed * dt;
      s.x += (0.5 + Math.sin(t * 0.2 + s.phase) * 0.4) * dt;
      if (s.y > 170) this.respawn(s, false);
      d.position.set(s.x, s.y, s.z);
      d.rotation.set(Math.sin(t * 0.7 + s.phase) * 0.08, s.phase, Math.cos(t * 0.6 + s.phase) * 0.08);
      d.scale.setScalar(s.scale);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    for (let i = this.mine.length - 1; i >= 0; i--) {
      const o = this.mine[i];
      o.age += dt;
      o.vy = Math.min(1.7, o.vy + dt * 0.12);
      o.g.position.y += o.vy * dt;
      o.g.position.addScaledVector(o.drift, dt);
      o.g.position.x += Math.sin(t * 0.5 + o.phase) * 0.15 * dt;
      o.g.children[0].rotation.set(Math.sin(t * 0.8 + o.phase) * 0.06, t * 0.3, Math.cos(t * 0.7 + o.phase) * 0.06);
      o.label.material.opacity = o.age < 12 ? 1 : Math.max(0, 1 - (o.age - 12) / 4);
      if (o.age > 140) {
        this.scene.remove(o.g);
        o.label.material.map.dispose();
        o.label.material.dispose();
        this.mine.splice(i, 1);
      }
    }
  }
}
