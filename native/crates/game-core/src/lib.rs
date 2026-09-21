//! Deterministic, renderer-independent training slice for CAMPO.
//!
//! The simulation is deliberately small: one controlled player, one teammate,
//! one defender, one ball and two goals exercise the fixed-step contract
//! consumed by the Godot adapter. It is not the web game's full 22-player rule
//! set. There are no goalkeepers, fouls, offside, networking or articulated
//! body simulation here; `MotionPose` is a bounded presentation hint. The v0.3
//! training contacts are deterministic intentions and reach checks, not a full
//! tactical AI. Ball touches are discrete impulses made when an actor is
//! already nearby; the ball is never attached or magnetised to an actor. The
//! pitch is 92 by 60 metres, with goal mouths 7.32 metres wide and 2.44 metres
//! high at X = +/-46. Native training calibrates walking and sprinting at 3.2
//! and 9.775 m/s. Boundary planes rebound elastically; there are no separate
//! cylindrical post colliders.
#![forbid(unsafe_code)]

/// Simulation frequency. Call [`Simulation::step`] exactly once per tick.
pub const DT: f32 = 1.0 / 120.0;
/// State contract version for native consumers and replay/checkpoint tooling.
pub const SIMULATION_VERSION: &str = "campo-native-0.3.1";

const FIELD_HALF_X: f32 = 46.0;
const FIELD_HALF_Z: f32 = 30.0;
const GOAL_HALF_WIDTH: f32 = 3.66;
const GOAL_HEIGHT: f32 = 2.44;
const BALL_RADIUS: f32 = 0.11;
const GRAVITY: f32 = 9.81;
const BALL_RESTITUTION: f32 = 0.55;
const ROLLING_ACCELERATION: f32 = 5.8;
const ROLLING_SPEED_DRAG: f32 = 0.085;
const WALK_SPEED: f32 = 3.2;
const SPRINT_SPEED: f32 = 9.775;
const PLAYER_ACCELERATION: f32 = 24.0;
const PLAYER_FRICTION: f32 = 14.0;
const CHARGE_TIME: f32 = 0.315;
const CHARGE_HOLD_TIMEOUT_TICKS: u16 = 156; // 1.3 seconds at 120 Hz.
const CHARGE_PLANT_TICKS: u16 = 24; // Keep the committed stride short while charging.
const STRIKE_DURATION_TICKS: u16 = 24;
const TOE_RADIUS: f32 = 0.16;
const MAX_FOOT_REACH: f32 = 1.05;
const MAX_BALL_CONTACT_HEIGHT: f32 = 0.4;
const TAU: f32 = core::f32::consts::TAU;
const WALK_TOUCH_INTERVAL: f32 = 0.28;
const SPRINT_TOUCH_INTERVAL: f32 = 0.42;
const STRIKE_TOUCH_INTERVAL: f32 = 0.42;
const TRAP_TOUCH_INTERVAL: f32 = 0.18;

fn finite(value: f32) -> f32 {
    if value.is_finite() {
        value
    } else {
        0.0
    }
}

fn clamp(value: f32, low: f32, high: f32) -> f32 {
    finite(value).clamp(low, high)
}

/// A three-dimensional vector used by the simulation and adapters.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vec3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

impl Vec3 {
    pub const ZERO: Self = Self {
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };

    pub const fn new(x: f32, y: f32, z: f32) -> Self {
        Self { x, y, z }
    }

    fn clean(self) -> Self {
        Self::new(finite(self.x), finite(self.y), finite(self.z))
    }

    fn horizontal_length_squared(self) -> f32 {
        let v = self.clean();
        v.x * v.x + v.z * v.z
    }

    fn horizontal_length(self) -> f32 {
        self.horizontal_length_squared().sqrt()
    }

    fn length_squared(self) -> f32 {
        let v = self.clean();
        v.x * v.x + v.y * v.y + v.z * v.z
    }

    fn horizontal_normalized_or(self, fallback: Self) -> Self {
        let v = self.clean();
        let length = v.horizontal_length();
        if length > f32::EPSILON {
            Self::new(v.x / length, 0.0, v.z / length)
        } else {
            fallback
        }
    }

    fn scale(self, amount: f32) -> Self {
        let amount = finite(amount);
        Self::new(self.x * amount, self.y * amount, self.z * amount).clean()
    }

    fn add(self, other: Self) -> Self {
        Self::new(self.x + other.x, self.y + other.y, self.z + other.z).clean()
    }

    fn sub(self, other: Self) -> Self {
        Self::new(self.x - other.x, self.y - other.y, self.z - other.z).clean()
    }

    fn lerp(self, other: Self, amount: f32) -> Self {
        self.add(other.sub(self).scale(amount.clamp(0.0, 1.0)))
    }
}

/// Input intent consumed by one fixed simulation tick.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Input {
    pub x: f32,
    pub z: f32,
    pub sprint: bool,
    pub shoot: bool,
    /// Clears a held/released action. Hosts use this for pause and focus loss.
    pub cancel: bool,
}

/// The controllable athlete.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Player {
    pub position: Vec3,
    pub velocity: Vec3,
    pub facing: Vec3,
}

/// The dynamic ball. `position.y` is measured from the pitch surface.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Ball {
    pub position: Vec3,
    pub velocity: Vec3,
}

/// Presentation-neutral foot pose emitted by the authoritative simulation.
/// Coordinates are in world space; `shot_phase` runs from preparation through
/// follow-through and is zero when no shot gesture is active.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MotionPose {
    pub left_foot: Vec3,
    pub right_foot: Vec3,
    pub shot_phase: f32,
    pub striking: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum ActionKind {
    #[default]
    None,
    Shot,
    Pass,
}

/// Minimal deterministic football simulation for a native training scene.
#[derive(Clone, Debug, PartialEq)]
pub struct Simulation {
    pub player: Player,
    pub teammate: Player,
    pub defender: Player,
    pub ball: Ball,
    pub tick: u64,
    pub goals: u32,
    pub possession: Option<u8>,
    pub passes_completed: u32,
    pub tackles_won: u32,
    /// Normalised held-shot charge, in the range `0..=1`.
    pub charge: f32,
    held_action: ActionKind,
    held_action_ticks: u16,
    strike_action: ActionKind,
    strike_ticks: u16,
    strike_power: f32,
    strike_aim_z: f32,
    strike_start_phase: f32,
    strike_contact_target: Vec3,
    strike_contacted: bool,
    movement_commit: Vec3,
    movement_commit_active: bool,
    last_movement: Vec3,
    action_suppressed: bool,
    gait_phase: f32,
    teammate_gait_phase: f32,
    defender_gait_phase: f32,
    pass_active: bool,
    defender_active: bool,
    teammate_return_ticks: u16,
    receiver_cooldown: u16,
    last_pass_sender: Option<u8>,
    /// True only while the current ball flight is an intentional pass.  The
    /// sender is cleared on reception so a later loose ball can be contested.
    pass_inflight: bool,
    tackle_cooldown: u16,
    tackle_prepare_ticks: u16,
    touch_timer: f32,
}

impl Default for Simulation {
    fn default() -> Self {
        Self::new()
    }
}

impl Simulation {
    /// Creates a kickoff at the centre of the field, with the ball in front of
    /// the player and the attacking goal in the positive X direction.
    pub fn new() -> Self {
        Self {
            player: Player {
                position: Vec3::new(-20.0, 0.0, 0.0),
                velocity: Vec3::ZERO,
                facing: Vec3::new(1.0, 0.0, 0.0),
            },
            teammate: Player {
                position: Vec3::new(-12.0, 0.0, -7.0),
                velocity: Vec3::ZERO,
                facing: Vec3::new(1.0, 0.0, 0.0),
            },
            defender: Player {
                position: Vec3::new(-6.0, 0.0, 7.0),
                velocity: Vec3::ZERO,
                facing: Vec3::new(-1.0, 0.0, 0.0),
            },
            ball: Ball {
                position: Vec3::new(-19.1, BALL_RADIUS, 0.0),
                velocity: Vec3::ZERO,
            },
            tick: 0,
            goals: 0,
            possession: Some(0),
            passes_completed: 0,
            tackles_won: 0,
            charge: 0.0,
            held_action: ActionKind::None,
            held_action_ticks: 0,
            strike_action: ActionKind::None,
            strike_ticks: 0,
            strike_power: 0.0,
            strike_aim_z: 0.0,
            strike_start_phase: 0.0,
            strike_contact_target: Vec3::ZERO,
            strike_contacted: false,
            movement_commit: Vec3::ZERO,
            movement_commit_active: false,
            last_movement: Vec3::ZERO,
            action_suppressed: false,
            gait_phase: 0.0,
            teammate_gait_phase: 0.0,
            defender_gait_phase: 0.0,
            pass_active: false,
            defender_active: false,
            teammate_return_ticks: 0,
            receiver_cooldown: 0,
            last_pass_sender: None,
            pass_inflight: false,
            tackle_cooldown: 0,
            tackle_prepare_ticks: 0,
            touch_timer: 0.0,
        }
    }

    /// Restores the kickoff state and clears score and pending actions.
    pub fn reset(&mut self) {
        *self = Self::new();
    }

    /// Cancels a held or scheduled shot/pass without advancing the fixed clock.
    /// Native hosts call this when focus is lost or a pause menu opens.
    pub fn cancel_action(&mut self) {
        self.charge = 0.0;
        self.held_action = ActionKind::None;
        self.held_action_ticks = 0;
        self.strike_action = ActionKind::None;
        self.strike_ticks = 0;
        self.strike_power = 0.0;
        self.strike_start_phase = 0.0;
        self.strike_contact_target = Vec3::ZERO;
        self.strike_contacted = false;
        self.movement_commit = Vec3::ZERO;
        self.movement_commit_active = false;
        self.action_suppressed = true;
        self.tackle_prepare_ticks = 0;
    }

    /// Returns the current world-space foot pose for the presentation layer.
    pub fn pose(&self) -> MotionPose {
        let forward = self
            .player
            .facing
            .horizontal_normalized_or(Vec3::new(1.0, 0.0, 0.0));
        let lateral = Vec3::new(-forward.z, 0.0, forward.x);
        let left_rest = self
            .player
            .position
            .add(forward.scale(0.08))
            .sub(lateral.scale(0.16))
            .add(Vec3::new(0.0, 0.05, 0.0));
        let right_rest = self
            .player
            .position
            .add(forward.scale(0.08))
            .add(lateral.scale(0.16))
            .add(Vec3::new(0.0, 0.05, 0.0));
        let stride = (self.player.velocity.horizontal_length() / SPRINT_SPEED).clamp(0.0, 1.0);
        let gait = self.gait_phase.sin() * 0.08 * stride;
        let left_lift = self.gait_phase.sin().max(0.0) * 0.04 * stride;
        let right_lift = (-self.gait_phase.sin()).max(0.0) * 0.04 * stride;
        let left_gait = left_rest
            .add(forward.scale(gait))
            .add(Vec3::new(0.0, left_lift, 0.0));
        let right_gait = right_rest
            .sub(forward.scale(gait))
            .add(Vec3::new(0.0, right_lift, 0.0));

        if self.strike_ticks == 0 {
            let shot_phase = if self.charge > 0.0 {
                (0.1 + self.charge * 0.25).clamp(0.0, 0.35)
            } else {
                0.0
            };
            let right_foot = if self.charge > 0.0 {
                self.swing_foot(right_rest, forward, lateral, shot_phase)
            } else {
                right_gait
            };
            return MotionPose {
                left_foot: left_gait,
                right_foot,
                shot_phase,
                striking: false,
            };
        }

        let shot_phase = self.strike_start_phase
            + ((self.strike_ticks.saturating_sub(1)) as f32 / STRIKE_DURATION_TICKS as f32)
                .clamp(0.0, 1.0)
                * (1.0 - self.strike_start_phase);
        MotionPose {
            left_foot: left_rest,
            right_foot: self.swing_foot(right_rest, forward, lateral, shot_phase),
            shot_phase,
            striking: true,
        }
    }

    /// A bounded world-space pose for the supporting teammate.
    pub fn teammate_pose(&self) -> MotionPose {
        Self::simple_pose(self.teammate, self.teammate_gait_phase)
    }

    /// A bounded world-space pose for the active defender.
    pub fn defender_pose(&self) -> MotionPose {
        Self::simple_pose(self.defender, self.defender_gait_phase)
    }

    fn simple_pose(actor: Player, gait_phase: f32) -> MotionPose {
        let forward = actor
            .facing
            .horizontal_normalized_or(Vec3::new(1.0, 0.0, 0.0));
        let lateral = Vec3::new(-forward.z, 0.0, forward.x);
        let left = actor
            .position
            .add(forward.scale(0.08))
            .sub(lateral.scale(0.16))
            .add(Vec3::new(0.0, 0.05 + gait_phase.sin().max(0.0) * 0.04, 0.0));
        let right = actor
            .position
            .add(forward.scale(0.08))
            .add(lateral.scale(0.16))
            .add(Vec3::new(
                0.0,
                0.05 + (-gait_phase.sin()).max(0.0) * 0.04,
                0.0,
            ));
        MotionPose {
            left_foot: left,
            right_foot: right,
            shot_phase: 0.0,
            striking: false,
        }
    }

    fn swing_foot(&self, rest: Vec3, forward: Vec3, lateral: Vec3, phase: f32) -> Vec3 {
        let backswing = rest.sub(forward.scale(0.28)).add(lateral.scale(0.03));
        let ball_target = if self.strike_contacted {
            self.strike_contact_target
        } else {
            self.ball.position
        };
        let ball_offset = ball_target.sub(self.player.position);
        let horizontal_distance = ball_offset.horizontal_length();
        let contact_direction = ball_offset.horizontal_normalized_or(forward);
        let contact_distance = horizontal_distance.min(MAX_FOOT_REACH);
        let mut contact = self
            .player
            .position
            .add(contact_direction.scale(contact_distance));
        contact.y = clamp(ball_target.y, 0.05, MAX_BALL_CONTACT_HEIGHT);

        if phase <= 0.35 {
            let amount = (phase / 0.35).clamp(0.0, 1.0);
            return rest.lerp(backswing, amount);
        }
        let swing = ((phase - 0.35) / 0.65).clamp(0.0, 1.0);
        if swing <= 0.55 {
            return backswing.lerp(contact, swing / 0.55);
        }
        let follow_through =
            contact.add(forward.scale(((swing - 0.55) / 0.45).clamp(0.0, 1.0) * 0.35));
        self.bound_foot_reach(follow_through)
    }

    fn bound_foot_reach(&self, foot: Vec3) -> Vec3 {
        let offset = foot.sub(self.player.position);
        let distance = offset.horizontal_length();
        if distance <= MAX_FOOT_REACH {
            foot
        } else {
            let direction = offset.horizontal_normalized_or(Vec3::new(1.0, 0.0, 0.0));
            self.player
                .position
                .add(direction.scale(MAX_FOOT_REACH))
                .add(Vec3::new(0.0, foot.y, 0.0))
        }
    }

    fn ball_is_reachable(&self) -> bool {
        self.ball.position.y >= 0.0
            && self.ball.position.y <= MAX_BALL_CONTACT_HEIGHT
            && self
                .ball
                .position
                .sub(self.player.position)
                .horizontal_length()
                <= MAX_FOOT_REACH
    }

    fn swept_foot_reaches_ball(&self, start: Vec3, end: Vec3) -> bool {
        let segment = end.sub(start);
        let segment_length_squared =
            segment.x * segment.x + segment.y * segment.y + segment.z * segment.z;
        let amount = if segment_length_squared > f32::EPSILON {
            let to_ball = self.ball.position.sub(start);
            ((to_ball.x * segment.x + to_ball.y * segment.y + to_ball.z * segment.z)
                / segment_length_squared)
                .clamp(0.0, 1.0)
        } else {
            0.0
        };
        let closest = start.add(segment.scale(amount));
        closest.sub(self.ball.position).length_squared() <= (TOE_RADIUS + BALL_RADIUS).powi(2)
    }

    fn finish_strike(&mut self) {
        self.strike_ticks = 0;
        self.held_action_ticks = 0;
        self.strike_power = 0.0;
        self.strike_start_phase = 0.0;
        self.strike_contact_target = Vec3::ZERO;
        self.strike_contacted = false;
        self.movement_commit = Vec3::ZERO;
        self.movement_commit_active = false;
    }

    /// Advances the simulation by exactly [`DT`]. Invalid numeric input is
    /// treated as zero so a bad host value cannot poison the state with NaN.
    pub fn step(&mut self, input: Input) {
        self.step_actions(input, false, false);
    }

    /// Advances one tick with explicit training actions. `shoot` in `Input`
    /// has priority over `pass`; `tackle` is a separate defensive intent.
    pub fn step_actions(&mut self, input: Input, pass: bool, tackle: bool) {
        let input_x = clamp(input.x, -1.0, 1.0);
        let input_z = clamp(input.z, -1.0, 1.0);
        let input_vector = Vec3::new(input_x, 0.0, input_z);
        let input_length = input_vector.horizontal_length();
        let move_direction = if input_length > 1.0 {
            input_vector.scale(1.0 / input_length)
        } else {
            input_vector
        };

        let requested = if input.shoot {
            ActionKind::Shot
        } else if pass {
            ActionKind::Pass
        } else {
            ActionKind::None
        };
        let requested = if self.action_suppressed {
            if requested == ActionKind::None {
                self.action_suppressed = false;
            }
            ActionKind::None
        } else {
            requested
        };

        let previous_foot = self.pose().right_foot;
        if input.cancel {
            self.cancel_action();
        } else {
            self.update_action(requested, input_z);
        }

        let movement = if self.movement_commit_active {
            let plant_scale = if self.held_action != ActionKind::None {
                1.0 - (self.held_action_ticks as f32 / CHARGE_PLANT_TICKS as f32).min(1.0)
            } else {
                0.0
            };
            self.movement_commit.scale(plant_scale)
        } else if self.action_suppressed && (input.shoot || pass) {
            // An auto-release stays planted until the user releases the
            // button, preventing a held shot from turning into a run command.
            Vec3::ZERO
        } else {
            move_direction
        };
        self.update_player(movement, input.sprint);
        self.gait_phase =
            (self.gait_phase + self.player.velocity.horizontal_length() * DT * 4.5) % TAU;
        self.touch_timer = (self.touch_timer - DT).max(0.0);

        if self.strike_ticks > 0 {
            let strike_expired = self.strike_ticks > STRIKE_DURATION_TICKS;
            let ball_escaped = !self.strike_contacted && !self.ball_is_reachable();
            if strike_expired || ball_escaped {
                self.finish_strike();
            } else {
                self.strike_ticks = self.strike_ticks.saturating_add(1);
                let current_foot = self.pose().right_foot;
                if !self.strike_contacted
                    && self.swept_foot_reaches_ball(previous_foot, current_foot)
                {
                    if self.possession == Some(0) {
                        self.try_strike(self.strike_power);
                        self.strike_contacted = true;
                    } else {
                        self.finish_strike();
                    }
                }
            }
        } else if self.held_action == ActionKind::None && self.charge == 0.0 {
            self.try_nearby_touch(movement, input.sprint);
        }

        self.update_training_agents();
        if tackle {
            self.try_tackle();
        } else {
            // Tackle preparation is a continuous held intent, rather than a
            // counter that can be accumulated by sparse key presses.
            self.tackle_prepare_ticks = 0;
        }
        self.resolve_training_contacts();
        self.update_ball();
        if !self.movement_commit_active && self.strike_ticks == 0 {
            self.last_movement = move_direction;
        }
        self.tick = self.tick.wrapping_add(1);
    }

    fn update_action(&mut self, requested: ActionKind, aim_z: f32) {
        if self.strike_ticks > 0 {
            if requested != ActionKind::None {
                self.action_suppressed = true;
            }
            self.charge = 0.0;
            self.held_action = ActionKind::None;
            self.held_action_ticks = 0;
            return;
        }
        if requested != ActionKind::None {
            if self.held_action == ActionKind::None {
                self.movement_commit = self.last_movement;
                self.movement_commit_active = true;
                self.strike_aim_z = aim_z;
                self.held_action = requested;
                self.held_action_ticks = 0;
            } else if aim_z.abs() > f32::EPSILON && self.held_action == requested {
                self.strike_aim_z = aim_z;
            }
            self.held_action_ticks = self.held_action_ticks.saturating_add(1);
            self.charge = (self.charge + DT / CHARGE_TIME).clamp(0.0, 1.0);
            if self.held_action_ticks >= CHARGE_HOLD_TIMEOUT_TICKS {
                self.strike_power = self.charge;
                self.strike_start_phase = self.pose().shot_phase.clamp(0.1, 0.35);
                self.strike_ticks = 1;
                self.strike_action = self.held_action;
                self.strike_contacted = false;
                self.held_action = ActionKind::None;
                self.held_action_ticks = 0;
                self.charge = 0.0;
                self.action_suppressed = true;
            }
        } else {
            if self.held_action != ActionKind::None {
                self.strike_power = self.charge.clamp(0.0, 1.0);
                self.strike_start_phase = self.pose().shot_phase.clamp(0.1, 0.35);
                self.strike_ticks = 1;
                self.strike_action = self.held_action;
                self.strike_contacted = false;
                self.held_action = ActionKind::None;
                self.held_action_ticks = 0;
                self.charge = 0.0;
            }
        }
    }

    fn update_player(&mut self, direction: Vec3, sprint: bool) {
        let speed = if sprint { SPRINT_SPEED } else { WALK_SPEED };
        let target = direction.scale(speed);
        let current = self.player.velocity.clean();
        let delta = target.sub(current);
        let max_change = if direction.horizontal_length_squared() > f32::EPSILON {
            PLAYER_ACCELERATION * DT
        } else {
            PLAYER_FRICTION * DT
        };
        let delta_length = delta.horizontal_length();
        let applied = if delta_length > max_change {
            delta.scale(max_change / delta_length)
        } else {
            delta
        };
        self.player.velocity = current.add(applied);
        self.player.velocity.y = 0.0;

        if direction.horizontal_length_squared() > f32::EPSILON {
            self.player.facing = direction.horizontal_normalized_or(self.player.facing)
        } else if self.player.velocity.horizontal_length_squared() > f32::EPSILON {
            self.player.facing = self
                .player
                .velocity
                .horizontal_normalized_or(self.player.facing)
        }
        self.player.facing = self
            .player
            .facing
            .horizontal_normalized_or(Vec3::new(1.0, 0.0, 0.0));
        self.player.position = self.player.position.add(self.player.velocity.scale(DT));
        self.player.position.x = self
            .player
            .position
            .x
            .clamp(-FIELD_HALF_X + 0.5, FIELD_HALF_X - 0.5);
        self.player.position.y = 0.0;
        self.player.position.z = self
            .player
            .position
            .z
            .clamp(-FIELD_HALF_Z + 0.5, FIELD_HALF_Z - 0.5);
    }

    fn try_nearby_touch(&mut self, direction: Vec3, sprint: bool) {
        if self.possession != Some(0) || self.touch_timer > 0.0 {
            return;
        }
        let offset = self.ball.position.sub(self.player.position);
        if offset.y.abs() > 0.45 || offset.horizontal_length() > 1.2 {
            return;
        }
        if direction.horizontal_length_squared() <= f32::EPSILON {
            // Stopping is a reachable toe contact that brakes the rolling
            // ball. It never relocates the ball and leaves a distant ball
            // untouched so its momentum remains authoritative.
            self.ball.velocity = self.ball.velocity.scale(0.18);
            if self.ball.velocity.horizontal_length() < 0.7 {
                self.ball.velocity.x = 0.0;
                self.ball.velocity.z = 0.0;
            }
            self.touch_timer = TRAP_TOUCH_INTERVAL;
            return;
        }

        // Aim for where the player and a short lead will be at the next
        // stride. Compensating the explicit ground drag avoids the old fixed
        // 8 m/s impulse that sent the ball away during a walk.
        let interval = if sprint {
            SPRINT_TOUCH_INTERVAL
        } else {
            WALK_TOUCH_INTERVAL
        };
        let lead = if sprint { 0.9 } else { 0.55 };
        let future_player = self
            .player
            .position
            .add(self.player.velocity.scale(interval));
        let target = future_player.add(direction.scale(lead));
        let displacement = target.sub(self.ball.position);
        let distance = displacement.horizontal_length();
        if distance <= f32::EPSILON {
            self.touch_timer = interval;
            return;
        }
        let mut target_speed = distance / interval;
        for _ in 0..3 {
            target_speed = distance / interval
                + 0.5 * (ROLLING_ACCELERATION + ROLLING_SPEED_DRAG * target_speed) * interval;
        }
        let along_input = displacement.x * direction.x + displacement.z * direction.z;
        let minimum_roll = if sprint { 4.0 } else { 2.5 };
        let target_speed = if along_input > 0.0 {
            target_speed.max(minimum_roll)
        } else {
            target_speed
        }
        .clamp(0.0, 14.0);
        let target_direction = displacement.horizontal_normalized_or(direction);
        self.ball.velocity = target_direction.scale(target_speed);
        self.touch_timer = interval;
    }

    fn try_strike(&mut self, power: f32) {
        if self.possession != Some(0) {
            return;
        }
        let distance = self
            .ball
            .position
            .sub(self.player.position)
            .horizontal_length();
        if distance > 1.35 || self.ball.position.y > 1.6 {
            return;
        }
        if self.strike_action == ActionKind::Pass {
            self.try_pass(power);
            return;
        }
        self.strike_contact_target = self.ball.position;
        let power = power.clamp(0.0, 1.0);
        let aim_z = clamp(
            self.strike_aim_z * GOAL_HALF_WIDTH,
            -GOAL_HALF_WIDTH + BALL_RADIUS,
            GOAL_HALF_WIDTH - BALL_RADIUS,
        );
        let target = Vec3::new(FIELD_HALF_X, 0.0, aim_z);
        let direction = target
            .sub(self.ball.position)
            .horizontal_normalized_or(Vec3::new(1.0, 0.0, 0.0));
        let speed = 5.4 + 21.6 * power.powf(0.75);
        self.ball.velocity = direction.scale(speed);
        self.ball.velocity.y = 2.0 + 2.0 * power;
        self.touch_timer = STRIKE_TOUCH_INTERVAL;
    }

    fn try_pass(&mut self, power: f32) {
        let target = self.teammate.position;
        let offset = target.sub(self.ball.position);
        let distance = offset.horizontal_length();
        if distance <= f32::EPSILON {
            return;
        }
        self.strike_contact_target = self.ball.position;
        let direction = offset.horizontal_normalized_or(Vec3::new(1.0, 0.0, 0.0));
        let speed = (2.8 + distance * 1.6) * (0.7 + power.clamp(0.0, 1.0) * 0.3);
        self.ball.velocity = direction.scale(speed.clamp(3.5, 14.0));
        self.ball.velocity.y = 0.0;
        self.possession = None;
        self.pass_active = true;
        self.defender_active = true;
        self.teammate_return_ticks = 0;
        self.last_pass_sender = Some(0);
        self.pass_inflight = true;
        self.touch_timer = STRIKE_TOUCH_INTERVAL;
    }

    fn update_training_agents(&mut self) {
        if !self.pass_active {
            if self.possession == Some(0) && !Self::player_can_control(self.player, self.ball) {
                self.possession = None;
            }
            return;
        }
        if self.tackle_cooldown > 0 {
            self.tackle_cooldown -= 1;
        }
        if self.receiver_cooldown > 0 {
            self.receiver_cooldown -= 1;
        }

        if self.possession == Some(0) && !Self::player_can_control(self.player, self.ball) {
            // Possession is not a magnet.  Once the ball has left the user's
            // reachable envelope it becomes a loose ball for real contacts.
            self.possession = None;
            self.last_pass_sender = None;
            self.pass_inflight = false;
        } else if self.possession == Some(1) && !Self::agent_can_touch(self.teammate, self.ball) {
            self.possession = None;
            self.teammate_return_ticks = 0;
            self.last_pass_sender = None;
            self.pass_inflight = false;
        } else if self.possession == Some(2) && !Self::agent_can_touch(self.defender, self.ball) {
            self.possession = None;
            self.last_pass_sender = None;
            self.pass_inflight = false;
        }

        if self.possession == Some(1) {
            self.teammate.velocity = Vec3::ZERO;
            if self.teammate_return_ticks > 0 {
                self.teammate_return_ticks -= 1;
            } else {
                self.launch_teammate_return_pass();
            }
        } else {
            let target = self.ball.position;
            let direction = target
                .sub(self.teammate.position)
                .horizontal_normalized_or(self.teammate.facing);
            Self::advance_agent(
                &mut self.teammate,
                direction,
                5.5,
                &mut self.teammate_gait_phase,
            );
        }

        if self.possession == Some(2) {
            self.defender.velocity = Vec3::ZERO;
        } else if self.defender_active {
            let target = self.ball.position;
            let direction = target
                .sub(self.defender.position)
                .horizontal_normalized_or(self.defender.facing);
            Self::advance_agent(
                &mut self.defender,
                direction,
                5.0,
                &mut self.defender_gait_phase,
            );
        }
    }

    fn advance_agent(actor: &mut Player, direction: Vec3, speed: f32, gait_phase: &mut f32) {
        let target_velocity = direction.scale(speed);
        let delta = target_velocity.sub(actor.velocity);
        let max_change = 18.0 * DT;
        let length = delta.horizontal_length();
        let applied = if length > max_change {
            delta.scale(max_change / length)
        } else {
            delta
        };
        actor.velocity = actor.velocity.add(applied);
        actor.velocity.y = 0.0;
        if direction.horizontal_length_squared() > f32::EPSILON {
            actor.facing = direction.horizontal_normalized_or(actor.facing);
        }
        actor.position = actor.position.add(actor.velocity.scale(DT));
        actor.position.x = actor
            .position
            .x
            .clamp(-FIELD_HALF_X + 0.5, FIELD_HALF_X - 0.5);
        actor.position.y = 0.0;
        actor.position.z = actor
            .position
            .z
            .clamp(-FIELD_HALF_Z + 0.5, FIELD_HALF_Z - 0.5);
        *gait_phase = (*gait_phase + actor.velocity.horizontal_length() * DT * 4.5) % TAU;
    }

    fn agent_can_touch(actor: Player, ball: Ball) -> bool {
        ball.position.y >= 0.0
            && ball.position.y <= MAX_BALL_CONTACT_HEIGHT
            && ball.position.sub(actor.position).horizontal_length() <= MAX_FOOT_REACH
    }

    fn player_can_control(actor: Player, ball: Ball) -> bool {
        ball.position.y >= 0.0
            && ball.position.y <= MAX_BALL_CONTACT_HEIGHT
            && ball.position.sub(actor.position).horizontal_length() <= 2.25
    }

    fn resolve_training_contacts(&mut self) {
        if !self.pass_active || self.strike_ticks > 0 {
            return;
        }
        if self.possession.is_some() {
            return;
        }
        let mut winner = None;
        let mut winner_distance = f32::INFINITY;
        let teammate_distance = self
            .teammate
            .position
            .sub(self.ball.position)
            .horizontal_length();
        let intended_teammate = self.pass_inflight && self.last_pass_sender == Some(0);
        let intended_player = self.pass_inflight && self.last_pass_sender == Some(1);
        if (intended_teammate || !self.pass_inflight)
            && Self::agent_can_touch(self.teammate, self.ball)
            && teammate_distance < winner_distance
        {
            winner = Some(1);
            winner_distance = teammate_distance;
        }
        let defender_distance = self
            .defender
            .position
            .sub(self.ball.position)
            .horizontal_length();
        if self.defender_active
            && Self::agent_can_touch(self.defender, self.ball)
            && defender_distance < winner_distance
        {
            winner = Some(2);
            winner_distance = defender_distance;
        }
        let player_distance = self
            .player
            .position
            .sub(self.ball.position)
            .horizontal_length();
        if (intended_player || !self.pass_inflight)
            && self.receiver_cooldown == 0
            && Self::agent_can_touch(self.player, self.ball)
            && player_distance < winner_distance
        {
            winner = Some(0);
        }
        match winner {
            Some(1) => {
                self.ball.velocity = self.ball.velocity.scale(0.25);
                self.possession = Some(1);
                if intended_teammate {
                    self.passes_completed = self.passes_completed.saturating_add(1);
                }
                self.teammate_return_ticks = 48;
                self.teammate.velocity = Vec3::ZERO;
                self.last_pass_sender = None;
                self.pass_inflight = false;
            }
            Some(2) => {
                self.ball.velocity = self.ball.velocity.scale(0.35);
                self.possession = Some(2);
                self.defender.velocity = Vec3::ZERO;
                self.last_pass_sender = None;
                self.pass_inflight = false;
            }
            Some(0) => {
                self.ball.velocity = self.ball.velocity.scale(0.25);
                self.possession = Some(0);
                if intended_player {
                    self.passes_completed = self.passes_completed.saturating_add(1);
                }
                self.last_pass_sender = None;
                self.pass_inflight = false;
            }
            _ => {}
        }
    }

    fn launch_teammate_return_pass(&mut self) {
        if !Self::agent_can_touch(self.teammate, self.ball) {
            self.possession = None;
            self.teammate_return_ticks = 0;
            return;
        }
        let offset = self.player.position.sub(self.ball.position);
        let distance = offset.horizontal_length();
        if distance <= f32::EPSILON {
            return;
        }
        let direction = offset.horizontal_normalized_or(Vec3::new(-1.0, 0.0, 0.0));
        self.ball.velocity = direction.scale((3.5 + distance * 1.4).clamp(3.5, 12.0));
        self.ball.velocity.y = 0.0;
        self.possession = None;
        self.teammate_return_ticks = 0;
        self.receiver_cooldown = 36;
        self.last_pass_sender = Some(1);
        self.pass_inflight = true;
    }

    fn try_tackle(&mut self) {
        if !self.defender_active || self.tackle_cooldown > 0 || self.possession != Some(2) {
            return;
        }
        let to_defender = self.defender.position.sub(self.player.position);
        let distance = to_defender.horizontal_length();
        if distance > MAX_FOOT_REACH {
            self.tackle_prepare_ticks = 0;
            return;
        }
        let direction = to_defender.horizontal_normalized_or(self.player.facing);
        let facing_dot = self.player.facing.x * direction.x + self.player.facing.z * direction.z;
        if facing_dot < 0.2
            || to_defender.horizontal_length() > MAX_FOOT_REACH
            || !Self::agent_can_touch(self.defender, self.ball)
            || !Self::agent_can_touch(self.player, self.ball)
        {
            self.tackle_prepare_ticks = 0;
            return;
        }
        self.tackle_prepare_ticks = self.tackle_prepare_ticks.saturating_add(1);
        if self.tackle_prepare_ticks < 27 {
            return;
        }
        self.possession = Some(0);
        self.tackles_won = self.tackles_won.saturating_add(1);
        self.tackle_cooldown = 26;
        self.tackle_prepare_ticks = 0;
        self.ball.velocity = direction.scale(2.0);
    }

    fn update_ball(&mut self) {
        self.ball.position = self.ball.position.clean();
        self.ball.velocity = self.ball.velocity.clean();
        self.ball.velocity.y -= GRAVITY * DT;
        self.ball.position = self.ball.position.add(self.ball.velocity.scale(DT));

        if self.ball.position.y < BALL_RADIUS {
            self.ball.position.y = BALL_RADIUS;
            if self.ball.velocity.y < -0.35 {
                self.ball.velocity.y = -self.ball.velocity.y * BALL_RESTITUTION;
            } else {
                self.ball.velocity.y = 0.0;
            }
            let vertical_velocity = self.ball.velocity.y;
            let horizontal_speed = self.ball.velocity.horizontal_length();
            if horizontal_speed > 0.0 {
                let loss = (ROLLING_ACCELERATION + ROLLING_SPEED_DRAG * horizontal_speed) * DT;
                let remaining = (horizontal_speed - loss).max(0.0);
                let horizontal = self
                    .ball
                    .velocity
                    .horizontal_normalized_or(Vec3::ZERO)
                    .scale(remaining);
                self.ball.velocity.x = horizontal.x;
                self.ball.velocity.z = horizontal.z;
            }
            self.ball.velocity.y = vertical_velocity;
        } else {
            self.ball.velocity.x *= 0.999;
            self.ball.velocity.z *= 0.999;
        }

        if self.crossed_goal_line() {
            self.goals = self.goals.saturating_add(1);
            self.kickoff_after_goal();
            return;
        }
        self.resolve_bounds();
        self.ball.position = self.ball.position.clean();
        self.ball.velocity = self.ball.velocity.clean();
    }

    fn crossed_goal_line(&self) -> bool {
        let in_goal_mouth = self.ball.position.z.abs() <= GOAL_HALF_WIDTH - BALL_RADIUS
            && self.ball.position.y >= BALL_RADIUS
            && self.ball.position.y <= GOAL_HEIGHT - BALL_RADIUS;
        let crossed_positive = self.ball.position.x >= FIELD_HALF_X + BALL_RADIUS;
        let crossed_negative = self.ball.position.x <= -FIELD_HALF_X - BALL_RADIUS;
        in_goal_mouth && (crossed_positive || crossed_negative)
    }

    fn resolve_bounds(&mut self) {
        let limit_x = FIELD_HALF_X - BALL_RADIUS;
        let limit_z = FIELD_HALF_Z - BALL_RADIUS;
        let goal_corridor = self.ball.position.z.abs() <= GOAL_HALF_WIDTH - BALL_RADIUS
            && self.ball.position.y >= BALL_RADIUS
            && self.ball.position.y <= GOAL_HEIGHT - BALL_RADIUS;
        if self.ball.position.x > limit_x && !goal_corridor {
            self.ball.position.x = limit_x;
            self.ball.velocity.x = -self.ball.velocity.x.abs() * BALL_RESTITUTION;
        } else if self.ball.position.x < -limit_x && !goal_corridor {
            self.ball.position.x = -limit_x;
            self.ball.velocity.x = self.ball.velocity.x.abs() * BALL_RESTITUTION;
        }
        if self.ball.position.z > limit_z {
            self.ball.position.z = limit_z;
            self.ball.velocity.z = -self.ball.velocity.z.abs() * BALL_RESTITUTION;
        } else if self.ball.position.z < -limit_z {
            self.ball.position.z = -limit_z;
            self.ball.velocity.z = self.ball.velocity.z.abs() * BALL_RESTITUTION;
        }
    }

    fn kickoff_after_goal(&mut self) {
        self.player.position = Vec3::new(-0.9, 0.0, 0.0);
        self.player.velocity = Vec3::ZERO;
        self.player.facing = Vec3::new(1.0, 0.0, 0.0);
        self.teammate.position = Vec3::new(-12.0, 0.0, -7.0);
        self.teammate.velocity = Vec3::ZERO;
        self.teammate.facing = Vec3::new(1.0, 0.0, 0.0);
        self.defender.position = Vec3::new(-6.0, 0.0, 7.0);
        self.defender.velocity = Vec3::ZERO;
        self.defender.facing = Vec3::new(-1.0, 0.0, 0.0);
        self.ball.position = Vec3::new(0.0, BALL_RADIUS, 0.0);
        self.ball.velocity = Vec3::ZERO;
        self.charge = 0.0;
        self.held_action = ActionKind::None;
        self.held_action_ticks = 0;
        self.strike_action = ActionKind::None;
        self.strike_ticks = 0;
        self.strike_power = 0.0;
        self.strike_aim_z = 0.0;
        self.strike_start_phase = 0.0;
        self.strike_contact_target = Vec3::ZERO;
        self.strike_contacted = false;
        self.movement_commit = Vec3::ZERO;
        self.movement_commit_active = false;
        self.last_movement = Vec3::ZERO;
        self.action_suppressed = false;
        self.gait_phase = 0.0;
        self.teammate_gait_phase = 0.0;
        self.defender_gait_phase = 0.0;
        self.possession = Some(0);
        self.pass_active = false;
        self.defender_active = false;
        self.teammate_return_ticks = 0;
        self.receiver_cooldown = 0;
        self.last_pass_sender = None;
        self.pass_inflight = false;
        self.tackle_cooldown = 0;
        self.tackle_prepare_ticks = 0;
        self.touch_timer = 0.0;
    }
}
