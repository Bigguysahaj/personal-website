/**
 * Forward / inverse kinematics for the site's 6-axis arm. Pure math, no three.js.
 *
 * Frame: arm-local, Y up, base on the origin. "Lean" angles are measured from vertical,
 * positive = towards the target (the arm's +X after yaw).
 *
 *   q[0] base yaw        about Y
 *   q[1] shoulder lean   about Z
 *   q[2] elbow lean      about Z (relative)
 *   q[3] wrist lean      about Z (relative)
 *   q[4] wrist tilt      about X (out of the arm plane)
 *   q[5] tool roll       about the tool axis (doesn't move the tip)
 */

export type Joints = [number, number, number, number, number, number];
export type Vec3 = { x: number; y: number; z: number };

export const H0 = 1; // base -> shoulder
export const L1 = 4; // shoulder -> elbow
export const L2 = 3.8; // elbow -> wrist
export const W1 = 0.35; // wrist pitch -> wrist tilt
export const W2 = 0.65; // wrist tilt -> tool tip
export const TOOL = W1 + W2;

const { sin, cos, atan2, acos, hypot, PI } = Math;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Joint angles -> tool tip position. */
export function forward(q: Joints): Vec3 {
  const [yaw, shoulder, elbow, wrist, tilt] = q;
  const a1 = shoulder;
  const a2 = a1 + elbow;
  const a3 = a2 + wrist;

  // Work in the arm's vertical plane: u = reach, v = height, s = sideways (from tilt).
  const u = L1 * sin(a1) + L2 * sin(a2) + (W1 + W2 * cos(tilt)) * sin(a3);
  const v = H0 + L1 * cos(a1) + L2 * cos(a2) + (W1 + W2 * cos(tilt)) * cos(a3);
  const s = W2 * sin(tilt);

  // Rotate the plane by the base yaw.
  return { x: u * cos(yaw) + s * sin(yaw), y: v, z: -u * sin(yaw) + s * cos(yaw) };
}

/**
 * Tool tip position -> joint angles. toolPitch rotates down towards world +X.
 * Closed form: remove tool offsets, then solve a 2-link triangle to the wrist
 * centre. Default is a downward tool; pitch PI/2 points the tool along world +X.
 * Out-of-reach targets are clamped: the arm stretches towards them.
 */
export function inverse(t: Vec3, roll = 0, toolPitch = 0): Joints {
  const dx = sin(toolPitch), dy = -cos(toolPitch);
  // Remove the tilted distal tool, then solve yaw and wrist orientation.
  const wx = t.x - W2 * dx, wz = t.z;
  const yaw = atan2(-wz, wx);
  // Keep the horizontal wrist branch continuous as the pull crosses the base.
  const horizontal = Math.abs(toolPitch - PI / 2) < 1e-8;
  const tilt = horizontal ? yaw : Math.asin(clamp(dx * sin(yaw), -1, 1));
  const toolLean = horizontal ? PI / 2 : toolPitch === 0 ? PI : atan2(dx * cos(yaw), dy);
  const r = hypot(wx, wz) - W1 * sin(toolLean);
  const h = t.y - W2 * dy - W1 * cos(toolLean) - H0;
  const d = clamp(hypot(r, h), 0.6, L1 + L2 - 1e-3);

  const toWrist = atan2(r, h); // lean of the shoulder->wrist line
  const atShoulder = acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const atElbow = acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));

  const shoulder = toWrist - atShoulder; // elbow-up solution
  const elbow = PI - atElbow;
  const wrist = toolLean - shoulder - elbow;

  return [yaw, shoulder, elbow, wrist, tilt, roll];
}
