import * as THREE from 'three';
import { Character } from './character.js';
import { clamp, shadowify } from './utils.js';

const WALK = 3.0;
const RUN = 6.4;
const JUMP = 5.4;
const GRAVITY = 16;

const _v = new THREE.Vector3();
const _off = new THREE.Vector3();

/**
 * Third-person avatar in the spirit of Sketchbook: camera-relative movement, smoothed turning,
 * jumping, and an orbiting follow camera. Modes: walk | busy (an activity is running) |
 * ride (seated on something) | game (a mini-game owns the camera) | anim (a scripted move,
 * e.g. climbing into a vehicle: physics is off and `pos` is driven from outside).
 */
export class Player {
  constructor({ scene, camera, input, world, look }) {
    this.scene = scene;
    this.camera = camera;
    this.input = input;
    this.world = world;
    this.char = new Character(look, { ownMaterial: true });
    scene.add(this.char.root);

    this.pos = new THREE.Vector3(0, 0, 72);
    this.vel = new THREE.Vector3();
    this.heading = Math.PI;
    this.targetHeading = Math.PI;
    this.grounded = true;
    this.mode = 'walk';
    this.speed = 0;
    this.animSpeed = 0; // walking speed to animate with while in 'anim' mode
    this.held = null;
    this.buffs = {};
    this.speedMult = 1;
    this.cam = { yaw: 0, pitch: 0.22, dist: 5, targetDist: 5, target: new THREE.Vector3(0, 1.5, 72) };
  }

  setBusy(busy) {
    if (this.mode === 'walk' || this.mode === 'busy') this.mode = busy ? 'busy' : 'walk';
  }

  faceTowards(x, z) {
    this.targetHeading = Math.atan2(x - this.pos.x, z - this.pos.z);
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  headWorld(out = new THREE.Vector3()) {
    return this.char.headTop.getWorldPosition(out);
  }

  teleport(x, z, heading = this.heading) {
    this.pos.set(x, this.world.groundHeight(x, z), z);
    this.vel.set(0, 0, 0);
    this.heading = this.targetHeading = heading;
    this.char.root.position.copy(this.pos);
    this.char.root.rotation.set(0, heading, 0);
    this.cam.yaw = heading + Math.PI;
    this.cam.target.set(x, this.pos.y + 1.5, z);
  }

  sitOn(seat, local, heading = 0, pose = 'sit') {
    this.mode = 'ride';
    this.vel.set(0, 0, 0);
    seat.add(this.char.root);
    this.char.root.position.copy(local);
    this.char.root.rotation.set(0, heading, 0);
    this.char.setAction(pose);
  }

  standUp(x, z, heading) {
    this.scene.attach(this.char.root);
    this.char.root.rotation.set(0, heading, 0);
    this.char.clearAction();
    this.mode = 'walk';
    this.teleport(x, z, heading);
  }

  // ---------- buffs (sugar rush, cooled down) ----------

  buff(id, seconds, { icon = '✨', label = id } = {}) {
    this.buffs[id] = { left: seconds, icon, label };
  }

  tickBuffs(dt) {
    let mult = 1;
    for (const [id, b] of Object.entries(this.buffs)) {
      b.left -= dt;
      if (b.left <= 0) {
        delete this.buffs[id];
        this.onBuff?.(id, null);
        continue;
      }
      if (id === 'sugar') mult = 1.35;
      this.onBuff?.(id, b);
    }
    this.speedMult = mult;
  }

  // ---------- holding things ----------

  /** Holds a prop in the right hand. `update(dt, handPos)` lets a prop move itself (balloons). */
  hold(obj, kind, { pose = 'hold', offset = [0, 0.02, 0.02], attach = false, update = null, label = '' } = {}) {
    if (this.held) this.scene.remove(this.held.obj);
    this.held = { obj, kind, offset: new THREE.Vector3(...offset), attach, update, label, pose };
    shadowify(obj);
    this.char.holdR = pose;
    if (attach) {
      this.char.handR.add(obj);
      obj.position.set(...offset);
      obj.rotation.set(0, 0, 0);
    } else if (obj.parent !== this.scene) {
      this.scene.add(obj);
    }
    this.updateHeld(0);
  }

  releaseHeld() {
    const h = this.held;
    if (!h) return null;
    if (h.attach) this.scene.attach(h.obj);
    this.held = null;
    this.char.holdR = null;
    return h;
  }

  discardHeld() {
    const h = this.releaseHeld();
    if (h) h.obj.removeFromParent();
  }

  updateHeld(dt) {
    const h = this.held;
    if (!h || h.attach) return;
    this.char.handR.getWorldPosition(_v);
    if (h.update) return h.update(dt, _v);
    _off.copy(h.offset).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.heading);
    h.obj.position.copy(_v).add(_off);
    h.obj.rotation.set(0, this.heading, 0);
  }

  // ---------- simulation ----------

  update(dt) {
    const inp = this.input;
    this.tickBuffs(dt);
    if (this.mode === 'walk') {
      let f = 0;
      let s = 0;
      if (inp.isDown('KeyW') || inp.isDown('ArrowUp')) f += 1;
      if (inp.isDown('KeyS') || inp.isDown('ArrowDown')) f -= 1;
      if (inp.isDown('KeyA') || inp.isDown('ArrowLeft')) s -= 1;
      if (inp.isDown('KeyD') || inp.isDown('ArrowRight')) s += 1;
      f -= inp.move.y;
      s += inp.move.x;
      const len = Math.hypot(f, s);
      if (len > 1) {
        f /= len;
        s /= len;
      }
      const yaw = this.cam.yaw;
      const dx = -Math.sin(yaw) * f + Math.cos(yaw) * s;
      const dz = -Math.cos(yaw) * f - Math.sin(yaw) * s;
      const run = inp.isAction('run') || inp.move.length() > 0.92;
      const max = (run ? RUN : WALK) * this.speedMult;
      const k = 1 - Math.exp(-dt * (this.grounded ? 12 : 2.5));
      this.vel.x += (dx * max - this.vel.x) * k;
      this.vel.z += (dz * max - this.vel.z) * k;
      if (len > 0.1) this.targetHeading = Math.atan2(dx, dz);
      if (this.grounded && inp.pressedAction('jump')) {
        this.vel.y = JUMP;
        this.grounded = false;
      }
    } else {
      const k = 1 - Math.exp(-dt * 10);
      this.vel.x -= this.vel.x * k;
      this.vel.z -= this.vel.z * k;
    }

    if (this.mode !== 'ride') {
      if (this.mode !== 'anim') {
        this.vel.y -= GRAVITY * dt;
        const ox = this.pos.x;
        const oz = this.pos.z;
        this.pos.x += this.vel.x * dt;
        this.pos.z += this.vel.z * dt;
        this.pos.y += this.vel.y * dt;
        this.world.collide(this.pos, 0.35);
        if (this.world.groundHeight(this.pos.x, this.pos.z) - this.pos.y > 0.45) {
          this.pos.x = ox;
          this.pos.z = oz;
        }
        const g = this.world.groundHeight(this.pos.x, this.pos.z);
        if (this.pos.y <= g) {
          this.pos.y = g;
          this.vel.y = 0;
          this.grounded = true;
        } else if (this.grounded && this.vel.y <= 0 && this.pos.y - g < 0.4) {
          this.pos.y = g; // follow steps down instead of hopping off them
          this.vel.y = 0;
        } else {
          this.grounded = false;
        }
      }
      let d = this.targetHeading - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * (1 - Math.exp(-dt * 12));
      this.char.root.position.copy(this.pos);
      this.char.root.rotation.y = this.heading;
    }

    this.speed = this.mode === 'ride' ? 0 : this.mode === 'anim' ? this.animSpeed : Math.hypot(this.vel.x, this.vel.z);
    this.char.update(dt, { speed: this.speed, grounded: this.grounded || this.mode === 'ride' || this.mode === 'anim' });
    this.char.root.updateMatrixWorld(true);
    this.updateHeld(dt);
  }

  updateCamera(dt) {
    const inp = this.input;
    const c = this.cam;
    if (inp.lookEnabled) {
      c.yaw -= inp.look.dx * 0.0045;
      c.pitch += inp.look.dy * 0.0035;
    }
    c.pitch = clamp(c.pitch, -0.35, 1.25);
    if (inp.wheel) c.targetDist = clamp(c.targetDist * (1 + inp.wheel * 0.0012), 1.6, 14);
    c.dist += (c.targetDist - c.dist) * (1 - Math.exp(-dt * 8));

    const riding = this.mode === 'ride';
    if (riding) this.headWorld(_v).y -= 0.15;
    else _v.set(this.pos.x, this.pos.y + 1.55 * (this.char.look.scale ?? 1), this.pos.z);
    c.target.lerp(_v, 1 - Math.exp(-dt * (riding ? 40 : 12)));

    const cp = this.camera.position;
    cp.set(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch)).multiplyScalar(c.dist).add(c.target);
    if (!riding) cp.y = Math.max(cp.y, this.world.groundHeight(cp.x, cp.z) + 0.25);
    this.camera.lookAt(c.target);
  }
}
