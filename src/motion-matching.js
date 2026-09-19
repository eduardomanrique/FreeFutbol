import * as T from "three";
const clamp = T.MathUtils.clamp;
export function timeAtDistance(clip, distance) {
  const curve = clip.distance,
    total = curve.at(-1);
  if (total <= 0) return 0;
  const d = ((distance % total) + total) % total;
  let lo = 0,
    hi = curve.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (curve[mid] <= d) lo = mid;
    else hi = mid;
  }
  return (
    (lo + (d - curve[lo]) / Math.max(1e-7, curve[hi] - curve[lo])) / clip.fps
  );
}
export class MotionLibrary {
  constructor(meta, poses) {
    Object.assign(this, meta);
    this.poses = poses;
    this.stride = this.bones.length * 7;
    this.byName = Object.fromEntries(this.clips.map((c) => [c.name, c]));
  }
  sample(clip, time, out) {
    let frame = time * clip.fps;
    if (clip.loop) frame = ((frame % clip.count) + clip.count) % clip.count;
    else frame = clamp(frame, 0, clip.count - 1);
    const a = Math.floor(frame),
      b = clip.loop ? (a + 1) % clip.count : Math.min(a + 1, clip.count - 1),
      u = frame - a;
    const start = (clip.start + a) * this.stride,
      next = (clip.start + b) * this.stride,
      q1 = new T.Quaternion(),
      q2 = new T.Quaternion();
    for (let j = 0; j < this.stride; j += 7) {
      for (let k = 0; k < 3; k++)
        out[j + k] = T.MathUtils.lerp(
          this.poses[start + j + k],
          this.poses[next + j + k],
          u,
        );
      q1.fromArray(this.poses, start + j + 3);
      q2.fromArray(this.poses, next + j + 3);
      q1.slerp(q2, u).toArray(out, j + 3);
    }
    return this.features[clip.start + a];
  }
  search(query, current) {
    let best = null,
      bestCost = Infinity;
    for (const clip of this.clips) {
      if (!["idle", "walk", "jog", "sprint"].includes(clip.name)) continue;
      if (query.gait && clip.name !== query.gait) continue;
      for (let i = 0; i < clip.count; i++) {
        const f = this.features[clip.start + i];
        let cost = 0;
        for (let k = 0; k < 6; k++) {
          cost += (f.pose[k] - query.pose[k]) ** 2 * 3;
          cost += (f.velocity[k] - query.velocity[k]) ** 2 * 0.018;
          cost += (f.trajectory[k] - query.trajectory[k]) ** 2 * 1.8;
        }
        for (let k = 0; k < 2; k++)
          cost += (f.rootVelocity[k] - query.rootVelocity[k]) ** 2 * 0.65;
        if (current?.clip === clip) {
          let phase = Math.abs(i - current.time * clip.fps);
          phase = Math.min(phase, clip.count - phase);
          cost += Math.min(phase * 0.008, 0.15);
        } else cost += 0.12;
        if (cost < bestCost) {
          bestCost = cost;
          best = { clip, time: i / clip.fps, cost };
        }
      }
    }
    return best;
  }
}
function rotationVector(q, out) {
  if (q.w < 0) {
    q.x = -q.x;
    q.y = -q.y;
    q.z = -q.z;
    q.w = -q.w;
  }
  const s = Math.hypot(q.x, q.y, q.z),
    angle = 2 * Math.atan2(s, q.w);
  out.set(q.x, q.y, q.z).multiplyScalar(s > 1e-8 ? angle / s : 2);
  return out;
}
function fromRotationVector(v, q) {
  const a = v.length();
  return a < 1e-8
    ? q.identity()
    : q.setFromAxisAngle(v.clone().multiplyScalar(1 / a), a);
}
export class MotionController {
  constructor(library, id = 0) {
    this.library = library;
    this.clip = library.byName.idle;
    this.time = (id % 7) * 0.12;
    this.distance = 0;
    this.searchClock = 0.2;
    this.searches = 0;
    this.transitions = 0;
    this.cost = 0;
    this.pose = new Float32Array(library.stride);
    this.previous = this.pose.slice();
    this.offset = new Float32Array(library.bones.length * 6);
    this.offsetVelocity = this.offset.slice();
    this.transitionTime = 10;
    this.feature = library.sample(this.clip, this.time, this.pose);
    this.previous.set(this.pose);
    this.lastX = null;
    this.lastZ = null;
    this.action = "locomotion";
  }
  transition(clip, time) {
    const destination = new Float32Array(this.pose.length);
    const nextDestination = new Float32Array(this.pose.length);
    this.library.sample(clip, time, destination);
    this.library.sample(clip, time + 1 / 120, nextDestination);
    const q = new T.Quaternion(),
      q2 = new T.Quaternion(),
      v = new T.Vector3();
    for (let i = 0, j = 0; i < this.pose.length; i += 7, j += 6) {
      for (let k = 0; k < 3; k++) {
        this.offset[j + k] = this.pose[i + k] - destination[i + k];
        this.offsetVelocity[j + k] = clamp(
          (this.pose[i + k] -
            this.previous[i + k] -
            (nextDestination[i + k] - destination[i + k])) *
            120,
          -2,
          2,
        );
      }
      q.fromArray(this.pose, i + 3);
      q2.fromArray(destination, i + 3);
      rotationVector(q.multiply(q2.invert()), v).toArray(this.offset, j + 3);
      q.fromArray(this.pose, i + 3);
      q2.fromArray(this.previous, i + 3);
      const oldVelocity = rotationVector(q.multiply(q2.invert()), v).clone();
      q.fromArray(nextDestination, i + 3);
      q2.fromArray(destination, i + 3);
      oldVelocity
        .sub(rotationVector(q.multiply(q2.invert()), v))
        .multiplyScalar(120)
        .clampLength(0, 12)
        .toArray(this.offsetVelocity, j + 3);
    }
    this.clip = clip;
    this.time = time;
    this.distance =
      clip.distance[Math.min(clip.count, Math.floor(time * clip.fps))] || 0;
    this.transitionTime = 0;
    this.transitions++;
  }
  update(p, match, dt) {
    let travelled =
      this.lastX === null ? 0 : Math.hypot(p.x - this.lastX, p.z - this.lastZ);
    if (travelled > 1) travelled = 0;
    this.lastX = p.x;
    this.lastZ = p.z;
    this.searchClock += dt;
    const speed = Math.hypot(p.vx, p.vz),
      charge =
        match.charging && match.selected === p.id && match.ball.owner === p.id;
    // Hysteresis prevents gait flicker around walk/run/sprint boundaries.
    this.gait =
      speed < 0.18
        ? "idle"
        : (p.closeControl && speed < 4.2) ||
            speed < (this.gait === "walk" ? 3.33 : 2.93)
          ? "walk"
          : speed < (this.gait === "sprint" ? 6.79 : 7.3)
            ? "jog"
            : "sprint";
    this.walkBlend =
      (this.walkBlend || 0) +
      ((this.gait === "walk" ? 1 : 0) - (this.walkBlend || 0)) *
        (1 - Math.exp(-dt * 10));
    const forwardAcceleration =
      (p.locomotion?.ax || 0) * Math.sin(p.locomotion?.heading || 0) +
      (p.locomotion?.az || 0) * Math.cos(p.locomotion?.heading || 0);
    const loadingBack =
      charge &&
      speed > 1 &&
      p.strikePlant &&
      p.locomotion.feet[p.strikePlant.foot].contact;
    const leanTarget = loadingBack
      ? -0.14 * match.charge
      : clamp(
          Math.atan2(forwardAcceleration, 9.81) *
            (0.85 + 0.35 * (p.sprintLaunch || 0)) *
            (1 - 0.65 * this.walkBlend * (1 - (p.sprintLaunch || 0))),
          -0.18,
          0.42 + 0.12 * (p.sprintLaunch || 0),
        );
    this.driveLean =
      (this.driveLean || 0) +
      (leanTarget - (this.driveLean || 0)) * (1 - Math.exp(-dt * 9));
    const nominal = this.library.byName[this.gait].speed;
    const gaitAmplitude =
      this.gait === "walk" ? 0.95 : this.gait === "sprint" ? 1.15 : 0.78;
    // Quicker steps at the same ground speed: shorten their reach by the
    // reciprocal factor; distance matching automatically increases cadence.
    const cadence = this.gait === "walk" ? 1.05 : 1.38;
    const strideTarget = nominal
      ? (clamp(speed / nominal, 0.32, 1.22) * gaitAmplitude) / cadence
      : 0.5;
    this.strideScale =
      (this.strideScale ?? 0.5) +
      (strideTarget - (this.strideScale ?? 0.5)) * (1 - Math.exp(-dt * 10));
    const kicking = p.kick > 0;
    if ((charge && speed < 1.2) || kicking) {
      if (this.clip.name !== "kick")
        this.transition(this.library.byName.kick, 0);
      this.action = charge ? "windup" : "strike";
      this.time = charge
        ? 0.12 + 0.12 * match.charge
        : 0.42 + (1 - p.kick / 0.48) * 0.4;
    } else if ((p.locomotion?.impact || 0) > 0.45 && this.action !== "impact") {
      this.transition(this.library.byName.impact, 0);
      this.action = "impact";
    } else if (
      this.action === "impact" &&
      this.time < this.clip.duration - 1 / 30
    ) {
      this.time += dt;
    } else {
      this.action = "locomotion";
      if (
        this.searchClock >= 0.1 ||
        !["idle", "walk", "jog", "sprint"].includes(this.clip.name)
      ) {
        this.searchClock = 0;
        const heading = p.locomotion?.heading || 0;
        const localX = p.vx * Math.cos(heading) - p.vz * Math.sin(heading),
          localZ = p.vx * Math.sin(heading) + p.vz * Math.cos(heading);
        const query = {
          gait: this.gait,
          pose: this.feature.pose,
          velocity: this.feature.velocity,
          rootVelocity: [localX, localZ],
          trajectory: [
            localX * 0.2,
            localZ * 0.2,
            localX * 0.4,
            localZ * 0.4,
            localX * 0.6,
            localZ * 0.6,
          ],
        };
        const found = this.library.search(query, this);
        this.searches++;
        this.cost = found.cost;
        if (found.clip !== this.clip || Math.abs(found.time - this.time) > 0.2)
          this.transition(found.clip, found.time);
      }
      if (this.clip.speed > 0) {
        this.distance +=
          (travelled / Math.max(0.32, this.strideScale)) *
          (1 - (charge ? match.charge * 0.15 : 0));
        this.time = timeAtDistance(this.clip, this.distance);
      } else this.time += dt;
    }
    this.previous.set(this.pose);
    this.feature = this.library.sample(this.clip, this.time, this.pose);
    this.transitionTime += dt;
    if (this.transitionTime < 0.5) {
      const t = this.transitionTime,
        lambda = 28,
        e = Math.exp(-lambda * t),
        q = new T.Quaternion(),
        q2 = new T.Quaternion(),
        v = new T.Vector3();
      for (let i = 0, j = 0; i < this.pose.length; i += 7, j += 6) {
        for (let k = 0; k < 3; k++)
          this.pose[i + k] +=
            (this.offset[j + k] +
              (this.offsetVelocity[j + k] + lambda * this.offset[j + k]) * t) *
            e;
        v.set(
          ...[3, 4, 5].map(
            (k) =>
              (this.offset[j + k] +
                (this.offsetVelocity[j + k] + lambda * this.offset[j + k]) *
                  t) *
              e,
          ),
        );
        q.fromArray(this.pose, i + 3);
        fromRotationVector(v, q2);
        q.premultiply(q2)
          .normalize()
          .toArray(this.pose, i + 3);
      }
    }
  }
  snapshot() {
    return {
      clip: this.clip.name,
      gait: this.gait,
      walkBlend: this.walkBlend,
      strideScale: this.strideScale,
      driveLean: this.driveLean,
      time: this.time,
      action: this.action,
      searches: this.searches,
      cost: this.cost,
      transitions: this.transitions,
      distance: this.distance,
      techniques: [
        "pose-and-trajectory-search",
        "distance-matching",
        "inertialization",
      ],
    };
  }
}
// Add a bounded root-trajectory correction over the interaction window.
// The correction is differentiable at both ends; physical collision resolution
// is applied after this desired displacement, so a wall can prevent reaching it.
export class RootMotionWarp {
  constructor(start, target, duration = 0.24) {
    this.start = { ...start };
    const dx = target.x - start.x,
      dz = target.z - start.z,
      d = Math.hypot(dx, dz),
      scale = Math.min(1, 0.24 / Math.max(0.001, d));
    this.offset = { x: dx * scale, z: dz * scale };
    this.duration = duration;
    this.time = 0;
  }
  step(dt) {
    const smooth = (t) => t * t * (3 - 2 * t),
      a = smooth(clamp(this.time / this.duration, 0, 1));
    this.time += dt;
    const b = smooth(clamp(this.time / this.duration, 0, 1));
    return { x: this.offset.x * (b - a), z: this.offset.z * (b - a) };
  }
  get done() {
    return this.time >= this.duration;
  }
}
