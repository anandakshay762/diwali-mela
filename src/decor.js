import * as THREE from 'three';
import { catenary, rand, pick, setLayer } from './utils.js';

/*
  The small stuff that makes a place feel used: marigold petals on the chowk, cups and plates by
  the food stalls, puddles near the ghat, generators chugging behind the stalls with their cables,
  steam over the jalebi kadhai, agarbatti smoke at the temple and a low mist on the river.
*/
const std = (color, roughness = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildDecor(ctx) {
  const { scene, smoke, world } = ctx;
  const updaters = [];

  // ---- petals ----
  const petalGeo = new THREE.CircleGeometry(0.055, 6);
  petalGeo.rotateX(-Math.PI / 2);
  const petals = new THREE.InstancedMesh(petalGeo, std(0xffffff, 0.9, { side: THREE.DoubleSide }), 820);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const cols = [new THREE.Color(0xff7b00), new THREE.Color(0xffc300), new THREE.Color(0xff9500), new THREE.Color(0xe8e0c8)];
  let k = 0;
  const petal = (x, z) => {
    q.setFromEuler(new THREE.Euler(rand(-0.1, 0.1), rand(0, 6.28), 0));
    s.set(rand(0.7, 1.2), 1, rand(0.5, 0.8));
    petals.setMatrixAt(k, m.compose(V(x, 0.035 + rand(0, 0.01), z), q, s));
    petals.setColorAt(k, cols[k % cols.length]);
    k++;
  };
  for (let i = 0; i < 520; i++) {
    const a = rand(0, Math.PI * 2);
    const r = 5.6 + Math.pow(Math.random(), 0.6) * 6.4;
    petal(Math.cos(a) * r, Math.sin(a) * r);
  }
  for (let i = 0; i < 300; i++) petal(pick([-1, 1]) * rand(3.4, 4.7), rand(13, 52));
  petals.count = k;
  petals.computeBoundingSphere();
  petals.receiveShadow = true;
  scene.add(petals);

  // ---- litter near the food stalls ----
  const cupGeo = new THREE.CylinderGeometry(0.034, 0.026, 0.07, 10, 1, true);
  const cups = new THREE.InstancedMesh(cupGeo, std(0xf0e6d2, 0.7, { side: THREE.DoubleSide }), 34);
  const plateGeo = new THREE.CircleGeometry(0.085, 12);
  plateGeo.rotateX(-Math.PI / 2);
  const plates = new THREE.InstancedMesh(plateGeo, std(0xd9c9a3, 0.85, { side: THREE.DoubleSide }), 22);
  for (let i = 0; i < 34; i++) {
    const tipped = Math.random() < 0.4;
    q.setFromEuler(new THREE.Euler(tipped ? Math.PI / 2 : 0, rand(0, 6.28), 0));
    cups.setMatrixAt(i, m.compose(V(-rand(5.2, 7.4), tipped ? 0.035 : 0.035, rand(14, 50)), q, s.set(1, 1, 1)));
  }
  for (let i = 0; i < 22; i++) {
    q.setFromEuler(new THREE.Euler(0, rand(0, 6.28), 0));
    plates.setMatrixAt(i, m.compose(V(-rand(5.0, 7.6), 0.02, rand(14, 50)), q, s.set(1, 1, 1)));
  }
  cups.computeBoundingSphere();
  plates.computeBoundingSphere();
  setLayer(cups, 1);
  setLayer(plates, 1);
  scene.add(cups, plates);

  // ---- puddles by the ghat ----
  const puddleMat = std(0x0c141c, 0.08, { metalness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const [x, z, w, d] of [[-20, -41.5, 2.6, 1.4], [-6, -42.6, 1.8, 1.0], [4, -41.2, 2.2, 1.3], [18, -42.9, 3.0, 1.2], [30, -41.6, 1.6, 0.9]]) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(1, 24), puddleMat);
    p.rotation.x = -Math.PI / 2;
    p.scale.set(w / 2, d / 2, 1);
    p.position.set(x, 0.012, z);
    p.receiveShadow = true;
    scene.add(p);
  }

  // ---- generators behind the right-hand stalls, with cables up to the roofs ----
  const genMat = std(0x3a4a3a, 0.6, { metalness: 0.4 });
  const cablePts = [];
  for (const z of [47, 37, 27]) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 1.2), genMat);
    g.position.set(12.6, 0.4, z);
    g.castShadow = g.receiveShadow = true;
    scene.add(g);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), std(0x222222, 0.5, { metalness: 0.6 }));
    pipe.position.set(12.9, 1.0, z - 0.4);
    scene.add(pipe);
    const lamp = new THREE.PointLight(0xff4020, 1.5, 3, 2);
    lamp.position.set(12.6, 0.9, z + 0.3);
    scene.add(lamp);
    const seed = Math.random() * 10;
    updaters.push((dt, t) => (lamp.intensity = 1.2 + Math.sin(t * 9 + seed) * 0.5 + (Math.random() < 0.05 ? 1 : 0)));
    world.colliders.push({ type: 'box', minX: 12.1, maxX: 13.1, minZ: z - 0.7, maxZ: z + 0.7 });
    smoke?.emitter(V(12.9, 1.3, z - 0.4), { kind: 'smoke', rate: 2.5, size: 0.22, grow: 0.35, rise: 0.7, drift: 0.15, life: 2.2, peak: 0.16 });
    cablePts.push(...pairs(catenary(V(12.6, 0.8, z), V(9.4, 4.1, z), 0.5, 10)));
  }
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cablePts), new THREE.LineBasicMaterial({ color: 0x14100c })));

  // ---- steam, incense, river mist ----
  smoke?.emitter(V(-7.9, 1.75, 38.3), { kind: 'steam', rate: 5, size: 0.3, grow: 0.5, rise: 0.9, drift: 0.12, life: 1.6, peak: 0.26 }); // the jalebi kadhai
  smoke?.emitter(V(-6.3, 1.7, 28.4), { kind: 'steam', rate: 1.5, size: 0.2, grow: 0.3, rise: 0.6, drift: 0.1, life: 1.4, peak: 0.18 }); // pani puri matkas
  smoke?.emitter(V(-15.7, 1.1, -37), { kind: 'smoke', rate: 3, size: 0.12, grow: 0.22, rise: 0.45, drift: 0.06, life: 3.5, peak: 0.2 }); // agarbatti at the temple
  for (let x = -40; x <= 40; x += 13) smoke?.emitter(V(x, -1.2, -58), { kind: 'mist', rate: 0.6, size: 4, grow: 1.2, rise: 0.08, drift: 0.25, life: 11, peak: 0.06, spread: 4 });

  return { update: (dt, t) => updaters.forEach((u) => u(dt, t)) };
}

function pairs(pts) {
  const out = [];
  for (let i = 1; i < pts.length; i++) out.push(pts[i - 1], pts[i]);
  return out;
}
